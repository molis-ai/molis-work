import { createHash, randomBytes } from "node:crypto";
import type { PluginOwnerFilesClient, PluginOwnerFilesReader, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import type {
  ShelfItemRecord,
} from "./contract.js";
import { shelfErrors } from "./errors.js";

export { CATALOG_VERSION } from "./catalog-shape.js";
export const CATALOG_FILE = "catalog.json";

export type { StoredItem, CatalogFile } from './catalog-shape.js';
import { emptyShelfCatalog as emptyCatalog, readCurrentCatalog, type StoredItem, type CatalogFile } from './catalog-shape.js';
export { emptyCatalog, readCurrentCatalog };
import { createShelfFilesCatalog } from './files-catalog.js';
import type { ShelfSyncOptions } from './sync-catalog.js';
const catalogWriters = new WeakMap<CatalogFile, (writer: PluginOwnerFilesWriter, catalog: CatalogFile) => void>();

export function saveCatalog(writer: PluginOwnerFilesWriter, catalog: CatalogFile): void {
  const save = catalogWriters.get(catalog);
  if (save) { save(writer, catalog); return; }
  writer.replaceFileAtomic(CATALOG_FILE, Buffer.from(`${JSON.stringify({...catalog, replication:null}, null, 2)}\n`));
}

export function publicItem(item: StoredItem): ShelfItemRecord {
  const { origin_realpath: _origin, copy_hash: _hash, ...visible } = item;
  return visible;
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
  private readonly document: ReturnType<typeof createShelfFilesCatalog>;
  constructor(readonly root: string, readonly files: PluginOwnerFilesClient, sync?: ShelfSyncOptions, idle?: (catalog: CatalogFile, key: string) => void) {
    this.document = createShelfFilesCatalog(root, files, sync, idle);
  }
  replica() { return this.document.replica; }
  collect() { return this.document.collect; }

  /** The catalog as the reader sees it now; a missing file is an empty shelf. */
  from(reader: PluginOwnerFilesReader): CatalogFile {
    const value = this.document.read(reader);
    catalogWriters.set(value, this.document.save);
    return value;
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
