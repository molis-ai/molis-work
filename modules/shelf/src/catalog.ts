import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import type { PluginOwnerFilesClient, PluginOwnerFilesReader, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import type {
  ShelfClipboardRecord,
  ShelfDeviceSettings,
  ShelfItemRecord,
  ShelfJobRecord,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { shelfErrors } from "./errors.js";
import { defaultShelfDeviceSettings } from "./settings.js";

export const CATALOG_VERSION = 2;
export const CATALOG_FILE = "catalog.json";

export interface StoredItem extends Omit<ShelfItemRecord, "hidden" | "size_bytes" | "preview_text"> {
  hidden: boolean;
  size_bytes: number;
  preview_text: string | null;
}

export interface CatalogFile {
  version: number;
  seeded_sample: boolean;
  items: StoredItem[];
  jobs: ShelfJobRecord[];
  clipboard: ShelfClipboardRecord[];
  current_clip_id: string | null;
  settings: ShelfDeviceSettings;
}

export function emptyCatalog(): CatalogFile {
  return {
    version: CATALOG_VERSION,
    seeded_sample: false,
    items: [],
    jobs: [],
    clipboard: [],
    current_clip_id: null,
    settings: defaultShelfDeviceSettings(),
  };
}

export function readCurrentCatalog(value: unknown, filename: string): CatalogFile {
  const raw = value as Partial<CatalogFile> | null;
  if (!raw || raw.version !== CATALOG_VERSION || typeof raw.seeded_sample !== "boolean"
    || !Array.isArray(raw.items) || !Array.isArray(raw.jobs) || !Array.isArray(raw.clipboard)
    || !(raw.current_clip_id === null || typeof raw.current_clip_id === "string") || !raw.settings
    || raw.items.some(item => !item || !Array.isArray(item.source_item_ids) || !Array.isArray(item.children)
      || !["done", "failed"].includes(item.status) || !(item.failure_reason === null || typeof item.failure_reason === "string"))
    || raw.jobs.some(job => !job || !Array.isArray(job.item_ids) || !(job.option_id === null || typeof job.option_id === "string") || typeof job.runtime !== "string")
    || raw.clipboard.some(clip => !clip || typeof clip.clip_id !== "string" || !["url", "text"].includes(clip.kind)
      || typeof clip.body !== "string" || typeof clip.title !== "string" || typeof clip.created_at !== "string" || typeof clip.fingerprint !== "string")) {
    throw shelfErrors.invalid_file(`Shelf 目录格式不符：${filename}；期望版本 ${CATALOG_VERSION} 的现行格式。原文件已保留，请恢复当前格式的目录。`);
  }
  return raw as CatalogFile;
}

export function saveCatalog(writer: PluginOwnerFilesWriter, catalog: CatalogFile): void {
  writer.replaceFileAtomic(CATALOG_FILE, Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`));
}

export function publicItem(item: StoredItem): ShelfItemRecord {
  return { ...item };
}

export function requireItem(catalog: CatalogFile, itemId: string): StoredItem {
  const item = catalog.items.find((entry) => entry.item_id === itemId);
  if (!item) throw shelfErrors.item_not_found("这份材料不在架子上");
  return item;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function now(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

/**
 * The one reader and writer of the shelf's catalog. Shelf's own data is read and written only through `files`; `root` is the real
 * folder behind it, named in the snapshot and nowhere else. The folders are created by the first write that needs them.
 */
export class ShelfCatalogAccess {
  constructor(readonly root: string, readonly files: PluginOwnerFilesClient) {}

  /** The catalog as the reader sees it now; a missing file is an empty shelf. */
  from(reader: PluginOwnerFilesReader): CatalogFile {
    const bytes = reader.read(CATALOG_FILE);
    if (!bytes) return emptyCatalog();
    return readCurrentCatalog(JSON.parse(Buffer.from(bytes).toString("utf8")), path.join(this.root, CATALOG_FILE));
  }

  read(): CatalogFile {
    return this.from(this.files);
  }

  /** Reads the catalog inside the write, changes it, and saves it: the change is made on what is there now. */
  async update(mutate: (catalog: CatalogFile) => void): Promise<void> {
    await this.files.write((writer) => {
      const catalog = this.from(writer);
      mutate(catalog);
      saveCatalog(writer, catalog);
    });
  }
}
