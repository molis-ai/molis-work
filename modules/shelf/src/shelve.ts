import type { PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ShelfAdmitInput } from "./contract.js";
import { CATALOG_FILE, emptyCatalog, newId, now, readCurrentCatalog, saveCatalog, sha256, type CatalogFile, type StoredItem } from "./catalog.js";
import { classify, mimeFor, previewFor } from "./item-names.js";
import { SAMPLE_PDF_TEXT, createExtractablePdf } from "./pdf.js";

export const SAMPLE_NAME = "试用示例.pdf";

/** Writes the copy and puts its row first in the catalog, saved by the same write. */
export function shelveItem(writer: PluginOwnerFilesWriter, catalog: CatalogFile, input: ShelfAdmitInput, filename: string, bytes: Buffer, preparedPreview?: string | null): StoredItem {
  const kind = classify(filename, input.mime ?? "");
  const itemId = newId("item");
  const relative = `files/${itemId}/${filename}`;
  writer.writeFile(relative, bytes, "create");
  const item: StoredItem = {
    item_id: itemId,
    ...(input.artifact_source ? { artifact_source: structuredClone(input.artifact_source) } : {}),
    group: "material",
    kind,
    name: filename,
    relative_path: relative,
    mime: input.mime || mimeFor(kind, filename),
    size_bytes: bytes.byteLength,
    origin_hash: sha256(bytes),
    hidden: false,
    created_at: now(),
    source_item_id: null,
    source_item_ids: [],
    job_id: null,
    preview_text: preparedPreview ?? previewFor(kind, bytes),
    status: "done",
    failure_reason: null,
    children: [],
  };
  catalog.items.unshift(item);
  catalog.seeded_sample = true;
  saveCatalog(writer, catalog);
  return item;
}

/** Creates the initial personal example before queries run, preserving every existing item. */
export function initializeShelfFiles(writer: PluginOwnerFilesWriter): void {
  const existing = writer.read(CATALOG_FILE);
  const catalog = existing ? readCurrentCatalog(JSON.parse(Buffer.from(existing).toString("utf8")), CATALOG_FILE) : emptyCatalog();
  if (catalog.seeded_sample || catalog.items.length) return;
  const bytes = Buffer.from(createExtractablePdf(SAMPLE_PDF_TEXT));
  shelveItem(writer, catalog, { filename: SAMPLE_NAME, bytes, mime: "application/pdf" }, SAMPLE_NAME, bytes, SAMPLE_PDF_TEXT);
}
