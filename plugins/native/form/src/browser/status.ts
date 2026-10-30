import type { FormRecord, FormStatus } from "../contract.js";
import { type FormPage, hasUnsaved } from "./page.js";
import type { Translate } from "./types.js";

/** The editor's one note line; `scope` says which later success may clear it (save, publication, required, draft). */
export const showNote = (page: FormPage, text: string, isError: boolean, scope = "") => {
  page.noteScope = text ? scope : "";
  const { note } = page;
  if (!note) return;
  note.hidden = !text;
  note.textContent = text || "";
  note.classList.toggle("is-error", Boolean(isError && text));
  if (isError && text) note.scrollIntoView({ block: "nearest" });
};

/** The 「AI 生成题目」 words on the note line: they always show; `""` takes back only a note the draft put there, never a save's or a publication's. */
export const draftNote = (page: FormPage, text: string, isError: boolean) => (text || page.noteScope === "draft") && showNote(page, text, isError, "draft");

/** Tell the workbench what just happened, so it can say where the result is and what comes next. */
export const placed = (detail: Record<string, unknown>) => { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); };

/** The form on screen, for the placement bar and the Assistant. */
export const publishContext = (page: FormPage) => {
  const context: Record<string, unknown> = { plugin_id: page.host.pluginId, surface_title: "Forms" };
  const { sel } = page;
  if (sel) {
    context.object = { kind: "form", id: sel.id, version: sel.version, title: page.titleInput.value || sel.title };
    if (hasUnsaved(page)) context.unsaved = true;
  }
  page.bench.setAttribute("data-assistant-context", JSON.stringify(context));
};

const collectWord = (L: Translate, status: FormStatus) => status === "published" ? L("form.collect.on") : status === "closed" ? L("form.collect.stopped") : L("form.collect.off");
const paintCollect = (page: FormPage, record: FormRecord) => {
  const { L, one } = page;
  const collecting = record.status === "published";
  const state = one("[data-form-collect-state]");
  if (state) { state.dataset.mwState = collecting ? "doing" : record.status === "closed" ? "stopped" : "idle"; state.textContent = collectWord(L, record.status); state.className = "form-collect-state mw-status mw-status--" + (collecting ? "done" : "quiet"); }
  const start = one("[data-form-publish]");
  if (start) { start.hidden = collecting; start.textContent = record.status === "closed" ? L("form.collect.restart") : L("form.collect.start"); }
  const fill = one("[data-form-fill]");
  if (fill) fill.hidden = !collecting;
  const close = one("[data-form-close]");
  if (close) close.hidden = !collecting;
};

export const paintStatus = (page: FormPage, record: FormRecord) => {
  const { L, statusEl, saveError, savePromise, busy } = page;
  const unsaved = page.editRev > page.savedRevision;
  statusEl.className = "mw-status mw-status--" + (saveError ? "blocked" : "quiet"); statusEl.dataset.mwState = saveError ? "failed" : savePromise ? "saving" : unsaved ? "unsaved" : busy ? "running" : "saved";
  statusEl.textContent = saveError ? L("form.save.failed") : savePromise ? L("form.save.saving") : unsaved ? L("form.save.unsaved") : busy ? L("form.save.busy") : L("form.save.saved");
  paintCollect(page, record);
  if (page.sel && page.sel.id === record.id) publishContext(page);
  const pending = page.one("[data-form-publication-note]")!;
  pending.hidden = !record.publication_pending;
  pending.textContent = record.publication_pending ? L("form.fixed.pending-note") : "";
};

export const setBusy = (page: FormPage, value: boolean) => {
  page.busy = value;
  // Keep confirmation dialogs usable while preventing competing editor commands.
  page.workspace.inert = value;
  if (page.list) page.list.inert = value;
  page.bench.setAttribute("aria-busy", String(value));
  if (page.sel) paintStatus(page, page.sel);
};

/** The page's confirmation dialog, through the shared box; resolves true only for its OK button (and, with `run`, once that succeeded). */
export const ask = (page: FormPage, message: string, okLabel: string, run?: () => Promise<unknown>) => {
  const dialog = page.confirmDialog;
  if (!dialog) return Promise.resolve(false);
  const ok = dialog.querySelector<HTMLElement>("[data-confirm-ok]")!;
  dialog.querySelector("[data-confirm-text]")!.textContent = message; ok.textContent = okLabel;
  return page.host.confirmBox(dialog, ok, run);
};

export const setTab = (page: FormPage, next: string) => {
  page.tab = next;
  showNote(page, "", false);
  page.bench.querySelectorAll<HTMLElement>("[data-form-tab]").forEach((button) => {
    const on = button.dataset.formTab === next;
    button.classList.toggle("is-current", on);
    button.setAttribute("aria-selected", String(on));
  });
  page.bench.querySelectorAll<HTMLElement>("[data-form-pane]").forEach((pane) => {
    pane.hidden = pane.dataset.formPane !== next;
  });
};
