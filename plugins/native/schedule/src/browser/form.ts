import { messageOf, required, showMessage } from "./dom.js";
import type { SchedulePage } from "./page.js";
import { post, read } from "./request.js";
import { refreshStage } from "./stage.js";
import type { Readiness, TaskAnswer } from "./types.js";

const field = (form: HTMLFormElement, name: string) => required<HTMLInputElement | HTMLTextAreaElement>(form, `[name=${name}]`);

/** The dialog while a write is on its way: nothing in it can be changed, opened again or closed. */
function setCreating(page: SchedulePage, busy: boolean): void {
  const { L, form, workbench } = page;
  page.creating = busy;
  form.setAttribute("aria-busy", String(busy));
  required(form, ".mw-form__body").inert = busy;
  workbench.querySelectorAll<HTMLButtonElement>("[data-schedule-new], [data-schedule-create-close]").forEach(button => { button.disabled = busy; });
  const submit = required<HTMLButtonElement>(form, "[type=submit]");
  submit.disabled = busy;
  submit.textContent = busy ? L("schedule.form.saving") : page.editingTaskId ? L("schedule.form.save") : L("schedule.action.create");
}

const showHints = (page: SchedulePage, ready?: Readiness) =>
  page.workbench.querySelectorAll<HTMLElement>("[data-schedule-hint]").forEach(node => { node.hidden = !ready || ready[node.dataset.scheduleHint as keyof Readiness] !== false; });

/** The hints belong to one opening of the dialog: opening it again hides them and numbers the opening. */
function hint(page: SchedulePage): number {
  showHints(page);
  return ++page.hinting;
}

/** Asks what is not set up yet and says it in the dialog, unless a later opening has taken its place. A failed read says nothing. */
function readHints(page: SchedulePage, opening: number): Promise<void> {
  return read<Readiness>(page.host, "/readiness").then(ready => { if (opening === page.hinting) showHints(page, ready); }).catch(() => undefined);
}

/** Opens the dialog to edit the task whose detail the button is in. */
export function openEdit(page: SchedulePage, button: HTMLElement): void {
  const { L, form, workbench } = page, detail = button.closest<HTMLElement>("[data-schedule-detail]");
  if (!detail) return;
  page.editingTaskId = button.dataset.scheduleTaskEdit ?? "";
  field(form, "title").value = detail.querySelector("h1")?.textContent ?? "";
  field(form, "instructions").value = required<HTMLTextAreaElement>(detail, "[data-schedule-task-instructions]").value;
  field(form, "time").value = required<HTMLInputElement>(detail, "[data-schedule-task-time]").value;
  required<HTMLInputElement>(form, "[name=notify_important]").checked = required<HTMLInputElement>(detail, "[data-schedule-task-notify]").value === "true";
  const heading = workbench.querySelector("[data-schedule-form-title]");
  if (heading) heading.textContent = L("schedule.form.edit-title");
  setCreating(page, false);
  showMessage(page.errorEl, "");
  hint(page);
  page.dialog.showModal();
}

function openNew(page: SchedulePage): void {
  const { L, form, workbench } = page;
  if (page.creating) return;
  page.editingTaskId = "";
  form.reset();
  const heading = workbench.querySelector("[data-schedule-form-title]");
  if (heading) heading.textContent = L("schedule.action.new");
  setCreating(page, false);
  showMessage(page.errorEl, "");
  page.dialog.showModal();
  void readHints(page, hint(page));
  field(form, "title").focus();
}

async function submit(page: SchedulePage): Promise<void> {
  const { L, form, dialog, host } = page;
  if (page.creating || !form.reportValidity()) return;
  const data = new FormData(form);
  setCreating(page, true);
  showMessage(page.errorEl, "");
  try {
    const result = await post<TaskAnswer>(host, page.editingTaskId ? "/tasks/" + encodeURIComponent(page.editingTaskId) + "/update" : "/tasks", {
      title: String(data.get("title") ?? ""),
      instructions: String(data.get("instructions") ?? ""),
      time: String(data.get("time") ?? ""),
      notify_important: data.get("notify_important") === "on",
    }, L("schedule.error.save"));
    dialog.close();
    form.reset();
    await refreshStage(page, result.task.task_id, "task");
  } catch (error) {
    showMessage(page.errorEl, messageOf(error) || L("schedule.error.create"));
  } finally {
    setCreating(page, false);
  }
}

export function wireForm(page: SchedulePage): void {
  const { form, dialog, workbench } = page;
  // A model set up meanwhile (another pane or tab) takes its hint away from a new-task dialog that is open; the answer is numbered like an opening.
  document.addEventListener("molis-work:model-ready", () => { if (dialog.open && !page.editingTaskId) void readHints(page, ++page.hinting); });
  // The settings cover the page, and a modal dialog would sit over them: the links in the hints leave it first.
  workbench.querySelectorAll<HTMLElement>("[data-schedule-hint]").forEach(node => node.addEventListener("click", event => {
    if ((event.target as Element).closest("a") && !page.creating) dialog.close();
  }));
  workbench.querySelector("[data-schedule-new]")?.addEventListener("click", () => openNew(page));
  workbench.querySelectorAll("[data-schedule-create-close]").forEach(button => button.addEventListener("click", () => { if (!page.creating) dialog.close(); }));
  dialog.addEventListener("cancel", event => { if (page.creating) event.preventDefault(); });
  form.addEventListener("submit", event => { event.preventDefault(); void submit(page); });
}
