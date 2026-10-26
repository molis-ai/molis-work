import path from "node:path";
import type { ShelfItemRecord, ShelfMaterialPorts } from "./contract.js";
import { publicItem, requireItem, saveCatalog, type ShelfCatalogAccess } from "./catalog.js";
import { safeInside, thawTree, within } from "./copy-tree.js";
import { readShelfCopy, shelfErrors } from "./errors.js";
import { MAX_EDIT_BYTES, isEditableShelfItem, mimeFor, previewFor } from "./item-names.js";
import { assertNotBusy } from "./job-registry.js";

/** What happens to a copy already on the shelf: read it, hide it, register its original, edit it, delete it. */
export class ShelfCopies {
  constructor(private readonly access: ShelfCatalogAccess, private readonly materials: ShelfMaterialPorts) {}

  private get files() { return this.access.files; }

  /** Read one file inside a staged folder. */
  readChild(itemId: string, relative: string): { name: string; mime: string; bytes: Buffer } {
    const item = requireItem(this.access.read(), itemId);
    if (item.kind !== "folder") throw shelfErrors.item_not_found("这不是一个文件夹");
    const child = item.children.find((entry) => entry.relative === relative);
    if (!child) throw shelfErrors.item_not_found("这个文件不在这个文件夹里");
    return { name: child.name, mime: mimeFor(child.kind, child.name), bytes: readShelfCopy(this.files, within(item.relative_path, child.relative)) };
  }

  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer } {
    const item = requireItem(this.access.read(), itemId);
    if (!item.relative_path) throw shelfErrors.missing_output("这次没有生成文件");
    return { item: publicItem(item), bytes: readShelfCopy(this.files, item.relative_path) };
  }

  async hide(itemId: string): Promise<void> {
    await this.access.update((catalog) => {
      const item = requireItem(catalog, itemId);
      assertNotBusy(catalog, itemId, this.access.root);
      item.hidden = true;
    });
  }

  /**
   * Registers the file the person handed in with this copy, so a job can compare it first. Only the platform holds the path, offered
   * by the request that brought the copy; a folder or a result has no original to register.
   */
  async claimOriginal(itemId: string): Promise<void> {
    const item = requireItem(this.access.read(), itemId);
    if (item.group !== "material" || item.kind === "folder") throw shelfErrors.invalid("只有放进来的单个文件能登记原件");
    if (!this.materials.claimOriginal) throw shelfErrors.invalid("原件登记不可用，请从 Molis Work 放入文件后重试");
    await this.materials.claimOriginal(itemId);
  }

  async deleteCopy(itemId: string): Promise<void> {
    const current = this.access.read();
    assertNotBusy(current, requireItem(current, itemId).item_id, this.access.root);
    // The registration goes first: a copy whose deletion is then refused only loses its 原件已变 check, never keeps a dangling path.
    await this.materials.releaseOriginal?.(itemId);
    await this.files.write((writer) => {
      const catalog = this.access.from(writer);
      const item = requireItem(catalog, itemId);
      assertNotBusy(catalog, item.item_id, this.access.root);
      const copyDir = item.relative_path ? safeInside("files", path.posix.dirname(item.relative_path)) : null;
      const jobDir = item.job_id ? safeInside("jobs", `jobs/${item.job_id}`) : null;
      catalog.items = catalog.items.filter((entry) => entry.item_id !== itemId);
      saveCatalog(writer, catalog);
      if (copyDir) writer.removeTree(copyDir);
      if (jobDir && writer.stat(jobDir)) {
        thawTree(writer, jobDir);
        writer.removeTree(jobDir);
      }
    });
  }

  async writeCopy(itemId: string, text: string): Promise<ShelfItemRecord> {
    return this.files.write((writer) => {
      const catalog = this.access.from(writer);
      const item = requireItem(catalog, itemId);
      if (item.hidden) throw shelfErrors.item_not_found("这份材料不在架子上");
      if (!isEditableShelfItem(item)) throw shelfErrors.not_text("这份材料不能编辑");
      if (text.includes("\0")) throw shelfErrors.not_text("这份材料不能编辑");
      const bytes = Buffer.from(text, "utf8");
      if (bytes.byteLength > MAX_EDIT_BYTES) throw shelfErrors.too_large("文件超过 512 KB");
      if (!item.relative_path) throw shelfErrors.missing_output("这次没有生成文件");
      writer.replaceFileAtomic(item.relative_path, bytes);
      if (item.job_id) {
        const output = `jobs/${item.job_id}/output/${item.name}`;
        if (writer.stat(output)) writer.replaceFileAtomic(output, bytes);
      }
      item.size_bytes = bytes.byteLength;
      item.preview_text = previewFor(item.kind, bytes);
      saveCatalog(writer, catalog);
      return publicItem(item);
    });
  }
}
