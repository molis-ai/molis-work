import { closingBlank } from "./blank.js";
import { docText } from "./dom.js";
import { fillGoalSelect } from "./menus.js";
import { showNote } from "./notes.js";
import type { PagesPage } from "./page.js";
import type { SurfaceDetail } from "./types.js";

/** What the Assistant sees when the person turns to it: the open document, its version, and edits not yet saved. */
export function publishContext(page: PagesPage) {
  const { sel, bench, titleInput, editor, Editor } = page;
  const unsaved = Boolean(sel && (page.saveTimer || page.dirty));
  const context: Record<string, unknown> = { plugin_id: page.host.pluginId, surface_title: "Pages" };
  if (sel) {
    context.object = { kind: "pages_document", id: sel.id, version: sel.version, title: titleInput.value || sel.title };
    if (unsaved) {
      context.unsaved = true;
      const text = docText(editor ? Editor.getDoc(editor) : sel.body);
      if (text) context.draft_text = text.slice(0, 20000);
    }
  }
  bench.setAttribute("data-assistant-context", JSON.stringify(context)); page.landing.report(); closingBlank(page);
}

/** What the list (a listbox that picks several) says is selected: the picked documents, else the open one. */
export const chosen = (page: PagesPage, id: string) => (page.picked.size ? page.picked.has(id) : page.sel?.id === id);

/**
 * What the person has in hand here, for the bar and the Assistant (specs/archive/contextual-interaction §4): the editor's
 * focus around this document, nothing for one it cannot show. Pages reports its own focus, so a list row's selection is not part of it.
 */
function surfaceFocus(page: PagesPage): SurfaceDetail | null {
  const { sel, focusNow, editor, titleInput } = page;
  if (!focusNow || !sel || page.unshowable) return null;
  const goal = page.goals.find((item) => item.id === sel.goal_id);
  const rect = editor && editor.screen();
  return { context_id: "pages:" + sel.id + ":" + focusNow.local_id, plugin_id: page.host.pluginId,
    ...(rect ? { screen: { rect } } : {}),
    activity: focusNow.activity, granularity: focusNow.granularity,
    object: { kind: "pages_document", id: sel.id, version: sel.version, title: titleInput.value || sel.title },
    targets: focusNow.targets, surroundings: focusNow.surroundings,
    ...(page.saveTimer || page.dirty ? { unsaved: true } : {}), ...(goal ? { goal: { id: goal.id, title: goal.title } } : {}) };
}

function pickedRect(page: PagesPage) {
  const boxes = [...page.rowsEl.querySelectorAll<HTMLElement>(".pages-doc-row[data-page-id]")].filter((row) => page.picked.has(row.dataset.pageId!)).map((row) => row.getBoundingClientRect());
  const edge = (side: "left" | "right" | "top" | "bottom", pick: (...values: number[]) => number) => pick(...boxes.map((box) => box[side]));
  return boxes.length ? { left: edge("left", Math.min), right: edge("right", Math.max), top: edge("top", Math.min), bottom: edge("bottom", Math.max) } : null;
}

function objectsFocus(page: PagesPage): SurfaceDetail | null {
  const picked = page.records.filter((record) => page.picked.has(record.id));
  if (picked.length < 2) return null;
  const rect = pickedRect(page);
  return { context_id: "pages-objects:" + picked.map((record) => record.id + "@" + record.version).sort().join(","),
    plugin_id: page.host.pluginId, activity: "selecting", granularity: "objects", ...(rect ? { screen: { rect, placement: "below" } } : {}),
    object: { kind: "pages_document", id: picked[0]!.id, version: picked[0]!.version, title: picked[0]!.title },
    targets: picked.slice(0, 8).map((record) => {
      const text = record.title + "\n" + docText(record.body);
      return { kind: "object", role: "object", text: text.slice(0, 1500), ...(text.length > 1500 ? { truncated: true } : {}),
        ref: { kind: "pages_document", id: record.id, version: record.version, title: record.title } };
    }) };
}

export function paintPicked(page: PagesPage) {
  page.rowsEl.querySelectorAll<HTMLElement>(".pages-doc-row[data-page-id]").forEach((row) => {
    const id = row.dataset.pageId!;
    row.classList.toggle("is-picked", page.picked.has(id));
    row.querySelector("button[data-page-id]")?.setAttribute("aria-selected", String(chosen(page, id)));
  });
}

export function clearPicked(page: PagesPage) {
  if (!page.picked.size) return;
  page.picked.clear();
  paintPicked(page);
  reportFocus(page);
}

const placeOf = (detail: SurfaceDetail | null) => (detail ? detail.context_id + (detail.screen ? Object.values(detail.screen.rect).map(Math.round).join() : "") : "");

export function reportFocus(page: PagesPage) {
  page.landing.report();
  const detail = objectsFocus(page) || surfaceFocus(page);
  if (placeOf(detail) === placeOf(page.focusShown)) return;
  page.focusShown = detail;
  page.bench.dispatchEvent?.(new CustomEvent("molis:surface-focus", { bubbles: true, detail }));
  if (detail) publishTools(page);
}

export function publishTools(page: PagesPage) {
  const { editor, focusShown } = page;
  if (!editor || !editor.tools || !focusShown || focusShown.granularity === "objects") return;
  const groups = editor.tools(), key = focusShown.context_id + JSON.stringify(groups);
  if (key === page.toolsKey) return;
  page.toolsKey = key;
  page.bench.dispatchEvent(new CustomEvent("molis:context-tools", { bubbles: true, detail: { context_id: focusShown.context_id, groups } }));
}

/** Hands the toolbar a small form to draw (or takes it down); true when it took it. */
export function sendPanel(page: PagesPage, detail: { node: HTMLElement | null; label?: string; onClose?: () => void; keep?: boolean }): boolean {
  const event = new CustomEvent("molis:context-panel-open", { bubbles: true, cancelable: true, detail: { context_id: page.focusShown ? page.focusShown.context_id : "", ...detail } });
  page.bench.dispatchEvent?.(event);
  return event.defaultPrevented;
}

/** The chrome around the open document: the context the Assistant reads, the focus, the star, the goal and the fixed-version button. */
export function syncEditorChrome(page: PagesPage) {
  const { sel, starEditor, L } = page;
  publishContext(page);
  reportFocus(page);
  if (!sel) return;
  if (starEditor) {
    starEditor.classList.toggle("is-on", Boolean(sel.starred));
    starEditor.setAttribute("aria-label", sel.starred ? L("pages.star.remove") : L("pages.star.add"));
    starEditor.title = sel.starred ? L("pages.star.remove") : L("pages.star.add");
  }
  fillGoalSelect(page);
  const artifactBar = page.el("[data-pages-artifact-bar]");
  if (artifactBar) artifactBar.textContent = sel.publication_pending ? L("pages.version.continue") : sel.artifact_version > 0 ? L("pages.version.again") : L("pages.version.save");
  if (sel.publication_pending) showNote(page, "", false);
}

export function markSelected(page: PagesPage, id: string) {
  page.rowsEl.querySelectorAll<HTMLElement>("[data-page-id]").forEach((row) => {
    row.classList.toggle("is-selected", row.dataset.pageId === id);
  });
  paintPicked(page);
}

/** Listeners that keep the Pages context in step: Escape clears picks, a scroll moves the picked documents' place, a tool the bar chose runs. */
export function bindContext(page: PagesPage) {
  const { bench } = page;
  bench.setAttribute("data-surface-focus", "own");
  bench.addEventListener("keydown", (event) => { if (event.key === "Escape" && page.picked.size) clearPicked(page); });
  document.addEventListener?.("scroll", () => { if (page.picked.size) reportFocus(page); }, true);
  bench.addEventListener("molis:context-tool-invoke", (event) => {
    const picked = (event as CustomEvent<{ context_id: string; id: string }>).detail;
    if (page.editor && picked && page.focusShown && picked.context_id === page.focusShown.context_id) page.editor.runTool(picked.id);
  });
}
