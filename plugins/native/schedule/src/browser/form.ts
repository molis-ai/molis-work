import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { required, showMessage } from "./dom.js";
import type { SchedulePage } from "./page.js";
import { post, read } from "./request.js";
import { closeForm, refreshStage, showForm } from "./stage.js";
import type { Readiness, TaskAnswer } from "./types.js";

const uiText = globalThis.t;

const field = (form: HTMLFormElement, name: string) => required<HTMLInputElement | HTMLTextAreaElement>(form, `[name=${name}]`);

/** The form while a write is on its way: nothing in it can be changed, opened again or left. */
function setCreating(page: SchedulePage, busy: boolean): void {
  const { form, workbench } = page;
  page.creating = busy;
  form.setAttribute("aria-busy", String(busy));
  required(form, ".mw-form__body").inert = busy;
  workbench.querySelectorAll<HTMLButtonElement>("[data-schedule-new], [data-schedule-create-close]").forEach(button => { button.disabled = busy; });
  const submit = required<HTMLButtonElement>(form, "[type=submit]");
  submit.disabled = busy;
  submit.textContent = busy ? uiText.text("schedule.form.saving") : page.editingTaskId ? uiText.text("schedule.form.save") : uiText.text("schedule.action.create");
}

const showHints = (page: SchedulePage, ready?: Readiness) =>
  page.workbench.querySelectorAll<HTMLElement>("[data-schedule-hint]").forEach(node => { node.hidden = !ready || ready[node.dataset.scheduleHint as keyof Readiness] !== false; });

/** The hints belong to one opening of the form: opening it again hides them and numbers the opening. */
function hint(page: SchedulePage): number {
  showHints(page);
  return ++page.hinting;
}

/** Asks what is not set up yet and says it in the form, unless a later opening has taken its place. A failed read says nothing. */
function readHints(page: SchedulePage, opening: number): Promise<void> {
  return read<Readiness>(page.host, "/readiness").then(ready => { if (opening === page.hinting) showHints(page, ready); }).catch(() => undefined);
}

/** The form for a new task or an edit; only a new one says that what it reads is chosen once it exists. */
function open(page: SchedulePage, editing: string): void {
  const { form, workbench } = page;
  page.editingTaskId = editing;
  const heading = workbench.querySelector("[data-schedule-form-title]");
  if (heading) heading.textContent = editing ? uiText.text("schedule.form.edit-title") : uiText.text("schedule.action.new");
  required(form, "[data-schedule-form-reads]").hidden = Boolean(editing);
  setCreating(page, false);
  showMessage(page.errorEl, "");
  showForm(page);
}

/** Opens the form, in the detail pane, to edit the task whose detail the button is in. */
export function openEdit(page: SchedulePage, button: HTMLElement): void {
  const { form } = page, detail = button.closest<HTMLElement>("[data-schedule-detail]");
  if (!detail || page.creating) return;
  field(form, "title").value = detail.querySelector("h1")?.textContent ?? "";
  field(form, "instructions").value = required<HTMLTextAreaElement>(detail, "[data-schedule-task-instructions]").value;
  field(form, "time").value = required<HTMLInputElement>(detail, "[data-schedule-task-time]").value;
  required<HTMLInputElement>(form, "[name=notify_important]").checked = required<HTMLInputElement>(detail, "[data-schedule-task-notify]").value === "true";
  hint(page);
  open(page, button.dataset.scheduleTaskEdit ?? "");
  field(form, "title").focus();
}

function openNew(page: SchedulePage): void {
  if (page.creating) return;
  page.form.reset();
  open(page, "");
  void readHints(page, hint(page));
  field(page.form, "title").focus();
}

async function submit(page: SchedulePage): Promise<void> {
  const { form, host } = page;
  if (page.creating || !form.reportValidity()) return;
  const data = new FormData(form), editing = page.editingTaskId;
  setCreating(page, true);
  showMessage(page.errorEl, "");
  try {
    const result = await post<TaskAnswer>(host, editing ? "/tasks/" + encodeURIComponent(editing) + "/update" : "/tasks", {
      title: String(data.get("title") ?? ""),
      instructions: String(data.get("instructions") ?? ""),
      time: String(data.get("time") ?? ""),
      notify_important: data.get("notify_important") === "on",
    }, uiText.text("schedule.error.save"));
    form.reset();
    if (!editing) page.created = result.task.task_id;
    await refreshStage(page, result.task.task_id, "task");
  } catch (error) {
    showMessage(page.errorEl, messageOf(error) || uiText.text("schedule.error.create"));
  } finally {
    setCreating(page, false);
  }
}

/** Leaves the form for what was on show before it: the task being edited, or nothing. */
function leave(page: SchedulePage): void {
  if (!page.creating) closeForm(page, page.editingTaskId || null);
}

export function wireForm(page: SchedulePage): void {
  const { form, pane, workbench } = page;
  // A model set up meanwhile (another pane or tab) takes its hint away from a new-task form that is open; the answer is numbered like an opening.
  document.addEventListener("molis-work:model-ready", () => { if (!pane.hidden && !page.editingTaskId) void readHints(page, ++page.hinting); });
  workbench.querySelector("[data-schedule-new]")?.addEventListener("click", () => openNew(page));
  workbench.querySelectorAll("[data-schedule-create-close]").forEach(button => button.addEventListener("click", () => leave(page)));
  form.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); leave(page); } });
  form.addEventListener("submit", event => { event.preventDefault(); void submit(page); });
}
