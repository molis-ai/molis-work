import { toneOf, esc, glyph, civil } from "./util.js";
import { makeRequest, makeStream } from "./request.js";
import type { JellyHost, JellyPage, JellyWorkspace } from "./types.js";
import { required } from "./dom.js";

const noticeAfter = 4500;

/** The browser owns the open view; the workspace itself belongs to the local host and is read through its commands. */
export function createPage(host: JellyHost, root: HTMLElement): JellyPage {
  const L = host.translate ?? ((s: string) => s);
  const $ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = root): T => required<T>(scope, selector);
  const page: JellyPage = {
    host, root, L, request: makeRequest(host, L), stream: makeStream(L),
    list: $("[data-jelly=\"directory\"]"), content: $("[data-jelly-content]"), workspace: $("[data-jelly-stage-workspace]"), documentEl: $("[data-jelly-document]"),
    state: null, view: "calendar", mode: "month", anchor: civil(), query: "", filterCategory: "", archived: false, hideCompleted: false,
    occurrences: [], calendarSeq: 0, selected: null, dirty: false, saveTimer: 0, savePending: Promise.resolve(), mutationQueue: Promise.resolve(),
    dialog: { submit: null, cleanup: null, version: 0 }, noticeTimer: 0,
    editingItem: null, itemOptions: { kind: "task", category_id: "uncategorized", priority: "none", weekdays: [], scope: "onlyThis" },
    linkedTask: null, relationRole: "reference", relationScope: "instance", calendarSelected: new Set(), reviewTab: "completed", reviewPeriod: "month",
    itemContextBefore: null, editorRevision: 0, editorVersion: 0, composing: false, focusedBlock: "", lastRange: null, draftBlocks: [], savingEditor: false,
    currentPlan: null, currentPlanSource: null, planUi: new Map(), leftForSettings: false,
    ws(): JellyWorkspace {
      if (!page.state) throw new Error(L("jelly.error.not-loaded"));
      return page.state;
    },
    $,
    $$: <T extends Element = HTMLElement>(selector: string, scope: ParentNode = root): T[] => [...scope.querySelectorAll<T>(selector)],
    tx: (key) => esc(L(key)),
    btn(label, attrs = "", glyphName = "", primary = false) {
      const extra = /\bclass="([^"]*)"/.exec(attrs);
      return `<button type="button" aria-label="${page.tx(label)}" class="mw-btn mw-btn--${primary ? "primary" : "ghost"}${extra ? ` ${extra[1]}` : ""}" ${attrs.replace(/\bclass="[^"]*"/g, "")}>${glyphName ? glyph(glyphName) : ""}<span>${page.tx(label)}</span></button>`;
    },
    categoryDot(id) {
      const category = page.state?.categories.find((entry) => entry.id === id);
      const color = category?.color;
      return `<span class="jelly-color" ${/^#[0-9a-f]{6}$/i.test(color || "") ? `style="background:${color}"` : `data-tone="${toneOf(color)}"`}></span>`;
    },
    // The fixed, not renameable category is shown in the page's language (VUX-40).
    catName: (entry) => (entry.id === "uncategorized" ? page.tx("jelly.category.uncategorized") : esc(entry.name)),
  };
  return page;
}

export function showNote(page: JellyPage, message: string, error = false): void {
  const note = page.$("[data-jelly-notice]");
  clearTimeout(page.noticeTimer);
  note.textContent = message || "";
  note.hidden = !message;
  note.classList.toggle("is-error", error);
  if (message && !error) page.noticeTimer = window.setTimeout(() => { note.hidden = true; }, noticeAfter);
}

/** Runs one page action; a failure is said in the notice instead of escaping. */
export const run = (page: JellyPage, fn: () => unknown): Promise<void> =>
  Promise.resolve().then(fn).then(() => undefined, (error: unknown) => showNote(page, (error instanceof Error && error.message) || page.L("jelly.error.action-failed"), true));

export const keepListScroll = (page: JellyPage, paint: () => void): void => {
  const top = page.list.scrollTop;
  paint();
  page.list.scrollTop = top;
};

const EMPTY_GLYPH = { calendar: "calendar", notes: "note", progress: "idea" } as const;
export const empty = (page: JellyPage, title: string, message: string, label = ""): string =>
  `<div class="jelly-empty">${glyph(EMPTY_GLYPH[page.view])}<h2>${page.tx(title)}</h2><p>${page.tx(message)}</p>${label ? page.btn(label, "data-jelly-new", "plus") : ""}</div>`;

const STATUS: Record<string, string> = { "jelly.save.saved": "saved", "jelly.save.editing": "unsaved", "jelly.save.saving": "saving", "jelly.save.failed": "failed" };
export function setStatus(page: JellyPage, value: string): void {
  const status = page.$("[data-jelly-save-status]");
  status.textContent = page.L(value);
  status.dataset.mwState = STATUS[value] || "verify";
}

export function closeWorkspace(page: JellyPage): void {
  page.selected = null;
  page.dirty = false;
  page.root.dataset.expanded = "false";
  page.workspace.hidden = true;
  page.documentEl.replaceChildren();
  page.root.removeAttribute("data-assistant-context");
}

/** The search box and the category filter apply to every list the page shows. */
export const matches = (page: JellyPage, record: { title: string; category_id: string }, body = ""): boolean =>
  (!page.filterCategory || record.category_id === page.filterCategory) && (!page.query || `${record.title} ${body}`.toLowerCase().includes(page.query.toLowerCase()));

export const download = (page: JellyPage, filename: string, body: string, type: string): void | Promise<void> => page.host.download(new Blob([body], { type }), filename);
