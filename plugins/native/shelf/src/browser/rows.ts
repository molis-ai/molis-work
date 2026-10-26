import { escText, escapeAttr } from "./dom.js";
import { batch, clockLabel, hasFile, isFailed, tone } from "./model.js";
import type { Child, Clip, Item, ShelfPage } from "./types.js";

const CLIP_PREVIEW = 3;

const GLYPHS: Record<string, string> = {
  image: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4 16 4-4 3 3 3-4 6 5"/></svg>',
  url: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
  website: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  markdown: '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  text: '<svg viewBox="0 0 24 24"><rect x="7" y="4" width="10" height="16" rx="2"/><path d="M9 8h6M9 12h4"/></svg>',
};
const GLYPH_FILE = '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h6"/></svg>';
export const glyphSvg = (kind: string): string => GLYPHS[kind] ?? GLYPH_FILE;

const OP_ICONS: Record<string, string> = { copy: "copy", hide: "x", down: "download", trash: "trash", alert: "alert" };
export const opSvg = (name: string): string => '<svg aria-hidden="true"><use href="#icon-' + (OP_ICONS[name] || "file") + '"></use></svg>';

const op = (action: string, label: string, icon: string, extra = "", danger = false): string =>
  '<span class="shelf-op' + (danger ? " is-danger" : "") + '" role="button" tabindex="0" data-shelf-row-action="' + action + '" aria-label="' + label + '"' + (danger || action === "hide" ? ' title="' + label + '"' : "") + extra + ">" + opSvg(icon) + "</span>";

/** A name with its extension set apart, unless it is a link or has no stem to speak of. */
export function yieldName(name: string): string {
  const match = String(name).includes("://") ? null : String(name).match(/^(.+?)(\.[A-Za-z0-9]{1,8})$/);
  if (!match || match[1].length < 2) return '<span class="shelf-name">' + escText(name) + "</span>";
  return '<span class="shelf-name"><span class="shelf-name__stem">' + escText(match[1]) + '</span><span class="shelf-name__ext">' + escText(match[2]) + "</span></span>";
}

function itemHtml(page: ShelfPage, item: Item, on: boolean, locked: boolean): string {
  const { L } = page;
  const lock = locked ? ' aria-disabled="true"' : "";
  const failed = isFailed(item);
  const copyOp = hasFile(item) ? op("copy", L("shelf.rows.copy"), "copy") : "";
  return '<li class="shelf-row' + (on ? " is-on" : "") + (failed ? " is-failed" : "") + '" data-shelf-item="' + escapeAttr(item.item_id) + '" data-shelf-kind="' + escapeAttr(item.kind) + '" data-shelf-group="' + escapeAttr(item.group) + '" data-shelf-name="' + escapeAttr(item.name) + '" role="option" aria-label="' + escapeAttr(item.name) + '" aria-selected="' + String(on) + '" draggable="' + String(hasFile(item)) + '">'
    + '<span class="shelf-glyph tone-' + tone(item.kind, item.group) + '">' + glyphSvg(item.kind) + "</span>"
    + yieldName(item.name)
    + (item.group === "result" && !failed ? '<span class="shelf-when">' + escText(clockLabel(item.created_at)) + "</span>" : "")
    + (failed ? '<span class="shelf-status" role="img" data-mw-state="failed" title="' + L("shelf.rows.failed") + '" aria-label="' + L("shelf.rows.failed") + '"></span>' : "")
    + '<span class="shelf-ops">' + copyOp + op("hide", L("shelf.rows.hide-from-list-keep-the"), "hide", lock) + op("delete", L("shelf.rows.delete-copy"), "trash", lock, true) + "</span></li>";
}

function childHtml(page: ShelfPage, folder: Item, child: Child): string {
  const on = page.selectedChild?.item_id === folder.item_id && page.selectedChild.relative === child.relative;
  return '<li class="shelf-row is-child' + (on ? " is-on" : "") + '" data-shelf-item="' + escapeAttr(folder.item_id) + '" data-shelf-child="' + escapeAttr(child.relative) + '" data-shelf-kind="' + escapeAttr(child.kind) + '" data-shelf-group="material" data-shelf-name="' + escapeAttr(child.name) + '" role="option" aria-label="' + escapeAttr(child.name) + '" aria-selected="' + String(on) + '">'
    + '<span class="shelf-glyph tone-' + tone(child.kind, "material") + '">' + glyphSvg(child.kind) + "</span>" + yieldName(child.name) + "</li>";
}

function clipHtml(page: ShelfPage, clip: Clip): string {
  const { L } = page;
  const kind = clip.kind === "url" ? "url" : "text";
  const on = page.clipSelection.has(clip.clip_id);
  const current = page.snapshot.current_clip_id === clip.clip_id;
  return '<li class="shelf-row' + (on ? " is-on" : "") + '" data-shelf-clip="' + escapeAttr(clip.clip_id) + '" data-shelf-kind="' + kind + '" data-shelf-group="clipboard" data-shelf-name="' + escapeAttr(clip.title) + '" role="option" aria-label="' + escapeAttr(clip.title) + '" aria-selected="' + String(on) + '">'
    + '<span class="shelf-glyph tone-' + tone(kind, "clipboard") + '">' + glyphSvg(kind) + "</span>" + yieldName(clip.title)
    + (current ? '<span class="shelf-now" data-shelf-current>' + escText(L("shelf.rows.current")) + "</span>" : "")
    + '<span class="shelf-ops">' + op("copy", L("shelf.rows.copy"), "copy") + op("join", L("shelf.bar.add-to-materials"), "down") + op("delete", L("shelf.rows.delete-entry"), "trash", "", true) + "</span></li>";
}

type Row = { row: Item; child: Child | null };

/** Fills one group's list from its entries; `total` is what the count shows when the list shows only some. */
function fill(page: ShelfPage, group: "materials" | "results" | "clipboard", entries: readonly (Item | Clip)[], total: number): void {
  const { L, directory } = page;
  const list = directory.querySelector('[data-shelf-list="' + group + '"]');
  if (!list) return;
  const query = (page.search?.value || "").trim().toLowerCase();
  const visible = entries.filter((entry) => !query || String("name" in entry ? entry.name : entry.title || "").toLowerCase().includes(query));
  if (!visible.length) {
    const empty = group === "clipboard" ? L("shelf.rows.clipboard-is-empty") : group === "results" ? L("shelf.rows.no-results-yet") : L("shelf.rows.no-materials-yet");
    list.innerHTML = '<li class="shelf-empty-line" data-shelf-empty>' + escText(empty) + "</li>";
  } else {
    const busyId = page.selected && !page.selClip && ["is-confirm", "is-run", "is-fail"].some((name) => page.stage.classList.contains(name)) ? page.selected.item_id : "";
    const html = group === "clipboard"
      ? (visible as Clip[]).map((clip) => clipHtml(page, clip))
      : withChildren(page, visible as Item[]).map(({ row, child }) => child
        ? childHtml(page, row, child)
        : itemHtml(page, row, page.selection.has(row.item_id) && !page.selectedChild, busyId === row.item_id));
    list.replaceChildren(...html.map((markup) => {
      const node = document.createElement("template");
      node.innerHTML = markup;
      return node.content.firstElementChild as Element;
    }));
  }
  const count = directory.querySelector('[data-shelf-count="' + group + '"]');
  if (count) count.textContent = String(total);
}

/** The rows in order, with an opened folder's files after it. */
function withChildren(page: ShelfPage, visible: Item[]): Row[] {
  const rows: Row[] = [];
  for (const entry of visible) {
    rows.push({ row: entry, child: null });
    if (entry.kind === "folder" && page.openFolders.has(entry.item_id)) for (const child of entry.children || []) rows.push({ row: entry, child });
  }
  return rows;
}

export function paintLists(page: ShelfPage): void {
  const { L, directory, snapshot } = page;
  const clips = snapshot.clipboard || [];
  const shown = page.clipExpanded || clips.length <= CLIP_PREVIEW ? clips : clips.slice(0, CLIP_PREVIEW);
  fill(page, "materials", snapshot.materials || [], (snapshot.materials || []).length);
  fill(page, "results", snapshot.results || [], (snapshot.results || []).length);
  fill(page, "clipboard", shown, clips.length);
  const more = directory.querySelector<HTMLElement>("[data-shelf-clip-more]");
  if (more) {
    more.hidden = clips.length <= CLIP_PREVIEW;
    more.textContent = page.clipExpanded ? L("shelf.rows.show-last-3") : L("shelf.rows.show-all");
  }
  const hint = directory.querySelector<HTMLElement>("[data-shelf-clip-hint]");
  if (hint) hint.hidden = clips.length === 0;
  const foot = directory.querySelector("[data-shelf-foot-left]");
  if (foot) {
    const picked = batch(page).length;
    foot.textContent = picked > 1 ? L("shelf.rows.count-selected", { count: picked }) : L("shelf.rows.working-copies");
  }
}

/** DropAgent's 多选材料: plain clicks extend the selection until the mode is turned off. */
export function setMultiMode(page: ShelfPage, on: boolean): void {
  page.multiMode = on;
  const entry = page.directory.querySelector("[data-shelf-multi]");
  if (!entry) return;
  entry.textContent = on ? page.L("shelf.rows.finish-selecting") : page.L("shelf.rows.select-multiple-files");
  entry.setAttribute("aria-pressed", String(on));
}
