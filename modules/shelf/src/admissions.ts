import { createHash } from "node:crypto";
import path from "node:path";
import type {
  ShelfAdmitFolderInput,
  ShelfAdmitInput,
  ShelfExecutionControl,
  ShelfFolderChild,
  ShelfItemRecord,
  ShelfMaterialPorts,
} from "./contract.js";
import { clipTitleFor, isHttpUrl } from "./clipboard.js";
import { newId, now, publicItem, requireItem, saveCatalog, sha256, type ShelfCatalogAccess, type StoredItem } from "./catalog.js";
import { within } from "./copy-tree.js";
import { beforeShelfEffect } from "./effect.js";
import { shelfErrors, readShelfCopy } from "./errors.js";
import { extractionText } from "./extract.js";
import { classify, safeFilename, safeFolderName, safeRelative } from "./item-names.js";
import { SAMPLE_PDF_TEXT, createExtractablePdf } from "./pdf.js";
import { SAMPLE_NAME, shelveItem } from "./shelve.js";
import { captureWebsite, websiteFilename, WEBSITE_MIME } from "./website.js";

/** A folder comes in whole, up to the same 32 MB as one file: its copies travel to the Home instance in one request. */
export const SHELF_FOLDER_MAX_BYTES = 32 * 1024 * 1024;

/** Everything that puts a copy on the shelf: a file, a folder, pasted text, a link, the sample, a result used again as material. */
export class ShelfAdmissions {
  constructor(private readonly access: ShelfCatalogAccess, private readonly materials: ShelfMaterialPorts) {}

  private get files() { return this.access.files; }

  /** Parses only through the Host, then admits the authorized copy without an asynchronous commit gap. */
  async admitFile(input: ShelfAdmitInput, control?: ShelfExecutionControl): Promise<ShelfItemRecord> {
    if (!input.bytes.byteLength) throw shelfErrors.empty_file("没有可加入的文件内容");
    if (input.bytes.byteLength > 32 * 1024 * 1024) throw shelfErrors.too_large("文件超过 32 MB");
    await beforeShelfEffect(control);
    let preview: string | undefined;
    if (classify(input.filename, input.mime ?? "") === "pdf" && this.materials.extract) {
      try {
        const extracted = await this.materials.extract({ file_name: "preview.pdf", bytes: input.bytes },
          { signal: control?.signal, pdfMode: "text", timeoutMs: 12_000, limits: { maxBytes: 32 * 1024 * 1024, maxCharacters: 20_000 } });
        preview = extracted.text ? extractionText(extracted) : undefined;
      } catch { control?.signal?.throwIfAborted(); /* A preview failure does not reject the person's original copy. */ }
    }
    await beforeShelfEffect(control);
    return this.admit(input, preview);
  }

  /** Stores a copy whose derived preview has already been prepared. The check, the file and the catalog row land in one write. */
  async admit(input: ShelfAdmitInput, preparedPreview?: string | null): Promise<ShelfItemRecord> {
    return this.files.write((writer) => {
      const catalog = this.access.from(writer);
      // A retry returns the existing copy, preserving any user edits. Hidden copies
      // can be explicitly received again; deleted copies are new admissions.
      if (input.artifact_source) {
        const source = input.artifact_source;
        const original = catalog.items.find(item => item.artifact_source?.project_id === source.project_id
          && item.artifact_source.project_path === source.project_path
          && item.artifact_source.reference.artifact_id === source.reference.artifact_id
          && item.artifact_source.reference.version === source.reference.version);
        if (original) {
          if (original.artifact_source!.content_hash !== source.content_hash) throw shelfErrors.source_conflict("同一成果版本的内容不一致，未覆盖已有副本");
          if (!writer.stat(original.relative_path)) throw shelfErrors.missing_output("原接收副本已不可读，请先在 Shelf 核对处理");
          if (original.hidden) {
            original.hidden = false;
            saveCatalog(writer, catalog);
          }
          return publicItem({ ...original, hidden: false });
        }
      }
      const bytes = Buffer.from(input.bytes);
      if (!bytes.byteLength) throw shelfErrors.empty_file("没有可加入的文件内容");
      if (bytes.byteLength > 32 * 1024 * 1024) throw shelfErrors.too_large("文件超过 32 MB");
      return publicItem(shelveItem(writer, catalog, input, safeFilename(input.filename), bytes, preparedPreview));
    });
  }

  /**
   * A folder comes in whole: every file keeps its place under one shelf item.
   * The directory shows the children inline, never a second file browser.
   */
  async admitFolder(input: ShelfAdmitFolderInput): Promise<ShelfItemRecord> {
    const folderName = safeFolderName(input.name);
    const entries = input.entries
      .map((entry) => ({ ...entry, relative: safeRelative(entry.relative) }))
      .filter((entry) => entry.relative && entry.bytes.byteLength > 0);
    if (!entries.length) throw shelfErrors.empty_file("这个文件夹里没有可以加入的文件");
    const total = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
    if (total > SHELF_FOLDER_MAX_BYTES) throw shelfErrors.too_large("这个文件夹超过 32 MB，请把它拆成几个小一点的文件夹再放进来");
    const itemId = newId("item");
    const relative = `files/${itemId}/${folderName}`;
    return this.files.write((writer) => {
      const children: ShelfFolderChild[] = [];
      const digest = createHash("sha256");
      for (const entry of entries) {
        const bytes = Buffer.from(entry.bytes);
        writer.replaceFileAtomic(within(relative, entry.relative), bytes);
        digest.update(`${entry.relative}:${sha256(bytes)}\n`);
        children.push({
          relative: entry.relative,
          name: path.basename(entry.relative),
          kind: classify(entry.relative, entry.mime ?? ""),
          size_bytes: bytes.byteLength,
        });
      }
      const item: StoredItem = {
        item_id: itemId,
        group: "material",
        kind: "folder",
        name: folderName,
        relative_path: relative,
        mime: "inode/directory",
        size_bytes: total,
        origin_hash: digest.digest("hex"),
        hidden: false,
        created_at: now(),
        source_item_id: null,
        source_item_ids: [],
        job_id: null,
        preview_text: null,
        status: "done",
        failure_reason: null,
        children,
      };
      const catalog = this.access.from(writer);
      catalog.items.unshift(item);
      catalog.seeded_sample = true;
      saveCatalog(writer, catalog);
      return publicItem(item);
    });
  }

  /**
   * A link is captured as a page; everything else lands as text. The wheel's
   * 发给终端 asks for `capture: false`, the way DropAgent sends the link itself.
   */
  admitText(body: string, title = "粘贴文字", capture = true, control?: ShelfExecutionControl, assertCurrent?: () => void): Promise<ShelfItemRecord> {
    return this.admitCapturedText(body, title, capture, control, assertCurrent);
  }

  private async admitCapturedText(body: string, title: string, capture: boolean, control?: ShelfExecutionControl, assertCurrent?: () => void): Promise<ShelfItemRecord> {
    const text = body.trim();
    if (!text) throw shelfErrors.empty_file("剪贴板是空的");
    if (isHttpUrl(text) && capture) return this.captureUrl(text, control, assertCurrent);
    await beforeShelfEffect(control);
    assertCurrent?.();
    if (isHttpUrl(text) && !capture) {
      return this.admit({
        filename: `${safeFilename(clipTitleFor("url", text))}.url`,
        bytes: Buffer.from(text, "utf8"),
        mime: "text/uri-list",
      });
    }
    const filename = `${safeFilename(title.slice(0, 40) || "paste")}.md`;
    return this.admit({ filename, bytes: Buffer.from(text, "utf8"), mime: "text/markdown" });
  }

  /** DropAgent fetches the page itself; a failed fetch still shelves the link. */
  admitUrl(url: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord> {
    return this.captureUrl(url, control);
  }

  private async captureUrl(url: string, control?: ShelfExecutionControl, assertCurrent?: () => void): Promise<ShelfItemRecord> {
    await beforeShelfEffect(control);
    assertCurrent?.();
    const page = await captureWebsite(url, this.materials.readWebsite, { signal: control?.signal, beforeDispatch: async () => { await beforeShelfEffect(control); assertCurrent?.(); } });
    await beforeShelfEffect(control);
    assertCurrent?.();
    return this.admit({
      filename: safeFilename(websiteFilename(page.title, page.url)),
      bytes: Buffer.from(page.markdown, "utf8"),
      mime: WEBSITE_MIME,
    });
  }

  async seedSample(): Promise<ShelfItemRecord> {
    const bytes = Buffer.from(createExtractablePdf(SAMPLE_PDF_TEXT));
    return this.files.write((writer) => {
      const catalog = this.access.from(writer);
      const existing = catalog.items.find((item) => item.name === SAMPLE_NAME && item.group === "material" && !item.hidden);
      if (existing) return publicItem(existing);
      return publicItem(shelveItem(writer, catalog, { filename: SAMPLE_NAME, bytes, mime: "application/pdf" }, SAMPLE_NAME, bytes, SAMPLE_PDF_TEXT));
    });
  }

  async useAsMaterial(itemId: string): Promise<ShelfItemRecord> {
    const item = requireItem(this.access.read(), itemId);
    if (item.group !== "result") throw shelfErrors.not_result("只有生成结果可以再用作材料");
    if (!item.relative_path) throw shelfErrors.missing_output("这次没有生成文件");
    const bytes = readShelfCopy(this.files, item.relative_path);
    return this.admit({ filename: item.name, bytes, mime: item.mime }, item.preview_text);
  }
}
