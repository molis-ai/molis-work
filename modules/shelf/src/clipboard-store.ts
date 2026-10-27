import type { ShelfClipboardRecord, ShelfExecutionControl, ShelfItemRecord } from "./contract.js";
import type { ShelfAdmissions } from "./admissions.js";
import { newId, now, type ShelfCatalogAccess } from "./catalog.js";
import { clipFingerprint, clipTitleFor, isConcealedClipboard, isHttpUrl } from "./clipboard.js";
import { shelfErrors } from "./errors.js";

export const CLIPBOARD_LIMIT = 10;
const MAX_CLIP_TEXT_BYTES = 256 * 1024;

function clipText(body: string): string {
  const trimmed = body.trim();
  const bytes = Buffer.from(trimmed, "utf8");
  if (bytes.byteLength <= MAX_CLIP_TEXT_BYTES) return trimmed;
  return bytes.subarray(0, MAX_CLIP_TEXT_BYTES).toString("utf8");
}

function isFileUrl(text: string): boolean {
  return /^file:/iu.test(text);
}

/** The clipboard history kept in the catalog, and the step that turns one entry into a material. */
export class ShelfClipboard {
  constructor(private readonly access: ShelfCatalogAccess, private readonly admissions: ShelfAdmissions) {}

  async add(
    body: string,
    options: { concealed?: boolean; types?: readonly string[] } = {},
  ): Promise<ShelfClipboardRecord | null> {
    if (options.concealed || isConcealedClipboard(options.types ?? [])) {
      await this.access.update((catalog) => {
        catalog.current_clip_id = null;
      });
      return null;
    }
    const text = clipText(body);
    if (!text || isFileUrl(text)) {
      await this.access.update((catalog) => {
        catalog.current_clip_id = null;
      });
      return null;
    }
    const kind = isHttpUrl(text) ? "url" : "text";
    const fingerprint = clipFingerprint(kind, text);
    const title = clipTitleFor(kind, text);
    let recorded: ShelfClipboardRecord | null = null;
    await this.access.update((catalog) => {
      const existing = catalog.clipboard.find((entry) => entry.fingerprint === fingerprint);
      if (existing) {
        const moved: ShelfClipboardRecord = {
          ...existing,
          kind,
          title,
          body: text,
          created_at: now(),
          fingerprint,
        };
        catalog.clipboard = [moved, ...catalog.clipboard.filter((entry) => entry.clip_id !== existing.clip_id)];
        catalog.current_clip_id = moved.clip_id;
        recorded = moved;
        return;
      }
      const clip: ShelfClipboardRecord = {
        clip_id: newId("clip"),
        kind,
        title,
        body: text,
        created_at: now(),
        fingerprint,
      };
      catalog.clipboard = [clip, ...catalog.clipboard].slice(0, CLIPBOARD_LIMIT);
      catalog.current_clip_id = clip.clip_id;
      recorded = clip;
    });
    if (!recorded) throw shelfErrors.empty_file("剪贴板是空的");
    return recorded;
  }

  async remove(clipId: string): Promise<void> {
    await this.access.update((catalog) => {
      const exists = catalog.clipboard.some((entry) => entry.clip_id === clipId);
      if (!exists) throw shelfErrors.item_not_found("这条剪贴板不存在");
      catalog.clipboard = catalog.clipboard.filter((entry) => entry.clip_id !== clipId);
      if (catalog.current_clip_id === clipId) catalog.current_clip_id = null;
    });
  }

  async toMaterial(clipId: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord> {
    const clip = this.access.read().clipboard.find((entry) => entry.clip_id === clipId);
    if (!clip) throw shelfErrors.item_not_found("这条剪贴板不存在");
    const assertCurrent = () => {
      const latest = this.access.read().clipboard.find(entry => entry.clip_id === clipId);
      if (!latest || latest.fingerprint !== clip.fingerprint) throw shelfErrors.item_not_found("这条剪贴板已删除或改变，未保存材料");
    };
    return this.admissions.admitText(clip.body, clip.title, true, control, assertCurrent);
  }
}
