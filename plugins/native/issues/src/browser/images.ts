import { esc, messageOf, required } from "./dom.js";
import { installPreview } from "./preview.js";
import type { IssueImage, IssuesPage, Translate } from "./types.js";

const MAX_SHOTS = 6;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_ONE_BYTES = 2 << 20; // 2 MiB
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_LONG_SIDE = 2560;
const MAX_PIXELS = 64_000_000;
const DRAFT_KEY = "issue-draft-pictures";
/** The first bytes a file of each accepted type starts with: a renamed file decodes in the browser, yet its declared type must match. */
const SIGNATURES: Record<string, string> = { "image/png": "137,80,78", "image/jpeg": "255,216,255", "image/webp": "82,73,70" };

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});
const bytes = (items: IssueImage[]) => items.reduce((sum, image) => sum + atob(image.data_url.split(",")[1] ?? "").length, 0);

async function imageInput(L: Translate, file: File): Promise<IssueImage> {
  if (!(file.type in SIGNATURES) || file.size > MAX_SOURCE_BYTES) throw new Error(L("issues.shots.type-or-size"));
  let bitmap: ImageBitmap;
  try {
    const prefix = [...new Uint8Array(await file.slice(0, 3).arrayBuffer())].join(",");
    if (prefix !== SIGNATURES[file.type]) throw new Error("type does not match");
    bitmap = await createImageBitmap(file);
  } catch { throw new Error(L("issues.shots.unreadable")); }
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new Error(L("issues.shots.too-large"));
    let blob: Blob | null = file;
    if (file.size > MAX_ONE_BYTES || Math.max(bitmap.width, bitmap.height) > MAX_LONG_SIDE) {
      const canvas = document.createElement("canvas"), scale = Math.min(1, MAX_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    }
    if (!blob || blob.size > MAX_ONE_BYTES) throw new Error(L("issues.shots.still-large"));
    return { name: file.name.slice(0, 200) || "image.png", data_url: await dataUrl(blob) };
  } finally { bitmap.close(); }
}

/** Screenshots the person took themselves: pasted, dropped or picked, into the composer or the record being edited. */
export function installImages(page: IssuesPage): void {
  const { el, state, L, scope, host, $ } = page;
  const { composer, editor, root } = el;

  // Serialize image changes: a later drop/removal must read the preceding draft, even while its disk write is pending.
  // The page draft service keeps screenshots locally within this installation; no business record is created.
  // Only a write can lose something on leaving: reading the kept draft back is neither pending nor a fault.
  page.pictures = (change) => {
    if (change) state.pictureWrites++;
    const result = state.pictureQueue.catch(() => undefined).then(async () => {
      // A change that refuses (too many, too large) says why in its own words; it is not a failed write.
      const next = change?.(state.images);
      try {
        if (next !== undefined) {
          await host.drafts.write(DRAFT_KEY, JSON.stringify(next));
          state.images = next;
          state.pictureFault = false;
        } else state.images = JSON.parse((await host.drafts.read(DRAFT_KEY)) || "[]") as IssueImage[];
      } catch {
        if (change) state.pictureFault = true;
        throw new Error(L("issues.shots.draft-unsaved"));
      }
    }).finally(() => { if (change) state.pictureWrites--; if (scope.alive) page.paint(); });
    state.pictureQueue = result;
    return result;
  };
  page.shots = (items, editable) => items.map((image, index) => '<figure><button type="button" data-preview><img src="' + esc(image.data_url) + '" alt="' + esc(image.name) + '"></button>'
    + (editable ? '<button type="button" class="mw-btn" data-remove="' + index + '" aria-label="' + esc(L("issues.shots.remove")) + '">×</button>' : "") + "</figure>").join("");
  const tip = (form: HTMLFormElement, text = "", error = false) => {
    const box = required<HTMLElement>(form, "[data-issue-tip]");
    box.textContent = text;
    box.classList.toggle("is-error", error);
  };
  const counted = (form: HTMLFormElement, items: IssueImage[]) => tip(form, items.length ? L("issues.shots.counted", { count: items.length }) : "");
  page.paint = () => {
    $("thumbs").innerHTML = page.shots(state.images, true);
    $("edit-shots").innerHTML = page.shots(state.edits, true);
    counted(composer, state.images);
    counted(editor, state.edits);
    page.ready();
  };

  let restoredPictures: Promise<void> = Promise.resolve();
  // Files land where they were dropped or pasted: the record being edited, otherwise the composer.
  const attach = async (files: File[], form: HTMLFormElement) => {
    const into = form === editor, owner = state.current;
    await restoredPictures;
    const have = into ? state.edits : state.images;
    if (have.length + files.length > MAX_SHOTS) { tip(form, L("issues.shots.max-count"), true); return; }
    state.importing++;
    page.ready();
    tip(form, L("issues.shots.reading"));
    try {
      const added = await Promise.all(files.map((file) => imageInput(L, file)));
      // Pictures decoded for a record the person has since left belong to no draft now.
      if (into && (state.current !== owner || !state.editing)) return;
      const combine = (items: IssueImage[]) => {
        const combined = [...items, ...added];
        if (combined.length > MAX_SHOTS) throw new Error(L("issues.shots.max-count"));
        if (bytes(combined) > MAX_TOTAL_BYTES) throw new Error(L("issues.shots.max-bytes"));
        return combined;
      };
      if (into) state.edits = combine(state.edits); else await page.pictures(combine);
      page.paint();
    } catch (error) { if (scope.alive) tip(form, messageOf(error), true); }
    finally { state.importing--; page.ready(); }
  };
  const files = $<HTMLInputElement>("files");
  let target = composer;
  for (const form of [composer, editor]) {
    scope.listen(form, "dragover", (event) => { if ((event as DragEvent).dataTransfer?.types.includes("Files")) event.preventDefault(); });
    globalThis.molisDropZone?.(form, (on) => form.classList.toggle("is-drop", on));
    scope.listen(form, "drop", (event) => {
      const list = [...((event as DragEvent).dataTransfer?.files ?? [])];
      if (list.length) { event.preventDefault(); void attach(list, form); }
    });
  }
  scope.listen(root, "paste", (event) => {
    const list = [...((event as ClipboardEvent).clipboardData?.files ?? [])];
    if (!list.length || (!el.detail.hidden && !state.editing)) return;
    event.preventDefault();
    void attach(list, el.detail.hidden ? composer : editor);
  });
  scope.listen(files, "change", () => {
    const list = [...(files.files ?? [])];
    files.value = "";
    if (list.length) void attach(list, target);
  });

  scope.listen(root, "click", (event) => page.run(async () => {
    const button = (event.target as Element).closest("button");
    if (!button) return;
    if (button.hasAttribute("data-issue-pick")) { target = button.closest("form") ?? composer; files.click(); }
    else if (button.dataset.remove) {
      const index = Number(button.dataset.remove), form = button.closest("form");
      if (form === editor) state.edits = state.edits.filter((_, at) => at !== index);
      else { const removed = state.images[index]; await page.pictures((items) => items.filter((image) => image !== removed)); }
      page.paint();
      form?.querySelector<HTMLElement>("[data-issue-pick]")?.focus();
    }
  }));
  restoredPictures = page.pictures().catch((error: unknown) => { if (scope.alive) tip(composer, messageOf(error), true); })
    .finally(() => { state.restoring = false; page.ready(); });
  installPreview(page);
}
