import type { FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { arrive, firstLine, icon, make, textCell, whenOf } from "./dom.js";
import { renderPreview } from "./fields.js";
import type { FormList, FormPage } from "./page.js";
import { renderQuestions } from "./questions.js";
import { paintStatus, publishContext, showNote } from "./status.js";
import type { Translate } from "./types.js";

/** The list of forms and which one is open in the editor. */
// A row's only label is its state: a fixed version exists, or one is still being saved. Nothing repeats the plugin's name.
const fixedCell = (L: Translate, record: FormRecord) => {
  const node = make("span", "mw-status mw-status--plain feed-entry-status");
  if (record.publication_pending) { node.dataset.mwState = "unsaved"; node.classList.add("mw-status--attention"); node.textContent = L("form.fixed.unfinished"); }
  else if (record.artifact_version > 0) { node.dataset.mwState = "saved"; node.classList.add("mw-status--done"); node.textContent = L("form.fixed.label") + " v" + record.artifact_version; }
  else node.setAttribute("aria-hidden", "true");
  return node;
};

const artifactLabel = (L: Translate, record: FormRecord | null) => record?.publication_pending ? L("form.fixed.resume") : record && record.artifact_version > 0 ? L("form.fixed.again") : L("form.fixed.save");

const listRow = (page: FormPage, record: FormRecord) => {
  const { L, sel } = page;
  const item = make("article", "feed-stage-item creative-artifact-row");
  const row = document.createElement("button");
  row.type = "button";
  row.className = "feed-stage-entry directory-list-row" + (sel?.id === record.id ? " is-selected" : "");
  row.dataset.formId = record.id;
  row.setAttribute("aria-selected", String(sel?.id === record.id));
  const leading = make("span", "feed-stage-leading");
  const title = make("strong", "", record.title);
  title.title = record.title;
  leading.append(title);
  const published = record.status === "published";
  const status = document.createElement("span");
  status.className = "mw-status mw-status--plain mw-status--" + (published ? "progress" : "quiet") + " feed-entry-status";
  status.dataset.mwState = published ? "doing" : record.status === "closed" ? "stopped" : "idle"; status.textContent = published ? L("form.list.collecting") : record.status === "closed" ? L("form.collect.stopped") : L("form.collect.off");
  row.append(
    leading,
    textCell("plugin-stage-fact", L("form.list.question-count", { count: (record.questions || []).length })),
    textCell("plugin-stage-meta", firstLine(record.description, whenOf(record.updated_at))),
    status,
    fixedCell(L, record),
  );
  item.append(row);
  return item;
};

/** Repaints the rows, keeping the list where it was scrolled to. */
const renderList = (page: FormPage) => {
  const top = page.list?.scrollTop || 0;
  if (page.empty) page.empty.hidden = page.records.length > 0;
  page.rowsEl.replaceChildren();
  page.records.forEach((record) => page.rowsEl.append(listRow(page, record)));
  const bar = page.one("[data-form-artifact-bar]");
  if (bar) bar.textContent = artifactLabel(page.L, page.sel);
  if (page.list) page.list.scrollTop = top;
};

const markSelected = (page: FormPage, id: string) => {
  page.list?.querySelectorAll<HTMLElement>("[data-form-id]").forEach((row) => {
    const on = row.dataset.formId === id;
    row.classList.toggle("is-selected", on);
    row.setAttribute("aria-selected", String(on));
  });
};

/** Forget the open form's edit state (a new form is opening, or none is). */
const resetEditing = (page: FormPage) => {
  clearTimeout(page.saveTimer);
  page.editRev = page.savedRevision = 0;
  page.saveError = null;
  page.dirty = false;
  page.submitCall = null;
  page.resultsSeq += 1;
};

export const fillEditor = (page: FormPage, record: FormRecord) => {
  resetEditing(page);
  if (page.sel?.id !== record.id) page.draft?.close(); page.sel = record;
  showNote(page, "", false);
  const opening = page.workspace.hidden;
  page.bench.setAttribute("data-expanded", "true");
  page.workspace.hidden = false;
  if (opening) arrive(page.workspace);
  page.titleEl.textContent = record.title;
  paintStatus(page, record);
  page.titleInput.value = record.title;
  page.descriptionInput.value = record.description || "";
  renderQuestions(page, record.questions);
  renderPreview(page, record);
  markSelected(page, record.id);
};

export const closeEditor = (page: FormPage) => {
  resetEditing(page);
  page.sel = null;
  page.bench.setAttribute("data-expanded", "false");
  page.workspace.hidden = true;
  publishContext(page);
};

/** The open form changed (saved, published, versioned): keep it in the list and repaint; `redraw` refills the editor too. */
export const remember = (page: FormPage, record: FormRecord, redraw: boolean) => {
  page.sel = record;
  const index = page.records.findIndex((item) => item.id === record.id);
  if (index >= 0) page.records[index] = record;
  else page.records.unshift(record);
  renderList(page);
  page.titleEl.textContent = record.title;
  paintStatus(page, record);
  markSelected(page, record.id);
  if (redraw) fillEditor(page, record);
};

export const loadList = async (page: FormPage) => {
  const { L, one } = page;
  const seq = ++page.listSeq;
  const payload = await page.request<FormList>("GET", "");
  if (seq !== page.listSeq) return;
  page.records = payload.forms || [];
  renderList(page);
  page.aiAvailable = payload.ai_available === true;
  page.aiUnavailableReason = payload.ai_unavailable_reason || "";
  const button = one<HTMLButtonElement>("[data-form-generate-ai]")!;
  button.disabled = !page.aiAvailable;
  const reason = one("[data-form-ai-reason]")!;
  reason.hidden = page.aiAvailable;
  reason.replaceChildren(document.createTextNode(page.aiUnavailableReason || L("form.ai.no-model")));
  if (!page.aiAvailable) {
    const link = make("a", "", L("form.ai.open-settings"));
    link.href = "/settings/models";
    reason.append(document.createTextNode(" "), link);
  }
};

// A list that cannot be read says so where the list is, with a way to try again (the note lives in the editor).
export const listFailed = (page: FormPage, error: Error | undefined) => {
  const { L } = page;
  if (page.empty) page.empty.hidden = true;
  const box = make("div", "mw-empty mw-empty--error");
  box.setAttribute("role", "alert");
  box.innerHTML = '<span class="mw-empty__mark">' + icon("icon-circle-alert") + '</span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
  box.querySelector("strong")!.textContent = L("form.list.failed-title");
  const text = box.querySelector("p")!;
  text.textContent = error?.message || L("form.list.failed-hint");
  const retry = box.querySelector("button")!;
  retry.textContent = L("form.list.retry");
  retry.addEventListener("click", () => { retry.disabled = true; void loadList(page).then(() => box.remove(), (next: Error | undefined) => { retry.disabled = false; text.textContent = next?.message || L("form.list.failed-hint"); }); });
  page.rowsEl.replaceChildren(box);
};
