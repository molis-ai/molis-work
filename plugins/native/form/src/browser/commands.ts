import type { FormQuestionType } from "@molis-ai/molis-work-contracts/modules/form";
import type { Reflow } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { arrive } from "./dom.js";
import { renderPreview } from "./fields.js";
import { openFillPage } from "./fill-page.js";
import { closeEditor, fillEditor, loadList, remember } from "./list.js";
import { type FormAnswer, type FormPage, hasUnsaved } from "./page.js";
import { addOptionRow, renderQuestion, usesOptions } from "./questions.js";
import { loadResults } from "./results.js";
import { queueSave, save } from "./save.js";
import { ask, placed, setBusy, setTab, showNote } from "./status.js";
import type { FormFailure } from "./types.js";

type FormFile = { filename: string; content: string; count: number };

/** Neighbours ease to their new places when a question or an option moves or goes (the page's `molisReflow`, VUX-16/21). */
const reflow: Reflow = (list, change) => (window.molisReflow ? window.molisReflow(list, change) : change());
type Versioned = FormAnswer & { artifact: { artifact_id: string; version: number } };

/**
 * The page's buttons. Each command says which clicked element it answers (`find`, given the click target and the button);
 * the first one that answers runs, in this order, while the page is busy. A command answers only when it can act (most need
 * an open form).
 */
interface Command {
  find(page: FormPage, target: Element, button: HTMLButtonElement): HTMLElement | null;
  run(page: FormPage, found: HTMLElement, target: Element): Promise<void> | void;
}
const on = (selector: string, needsForm = true): Command["find"] => (page, target) =>
  needsForm && !page.sel ? null : target.closest<HTMLElement>(selector);
const path = (id: string, tail = "") => "/" + encodeURIComponent(id) + tail;
const open = (page: FormPage) => page.sel!;

/** Save first; if a half-filled preview would be lost, ask. False when the person stays. */
const leaveEditing = async (page: FormPage) => {
  await save(page);
  return !page.dirty || await ask(page, page.L("form.dialog.leave-confirm"), page.L("form.dialog.continue"));
};
const closeMenu = (target: Element) => target.closest("details")?.removeAttribute("open");

const reload: Command = {
  find: (page, _target, button) => page.sel ? button.closest<HTMLElement>("[data-form-reload]") : null,
  async run(page) {
    clearTimeout(page.saveTimer);
    if (page.savePromise) await page.savePromise.catch(() => {});
    if (hasUnsaved(page) && !await ask(page, page.L("form.dialog.reload-confirm"), page.L("form.action.reload"))) return;
    const payload = await page.request<FormAnswer>("GET", path(open(page).id));
    fillEditor(page, payload.form);
    await loadList(page);
    if (page.tab === "results") await loadResults(page);
  },
};

const create: Command = {
  find: on("[data-form-new]", false),
  async run(page) {
    await save(page);
    if (page.dirty && !await ask(page, page.L("form.dialog.leave-confirm"), page.L("form.dialog.continue"))) return;
    const payload = await page.request<FormAnswer>("POST", "", {});
    await loadList(page);
    setTab(page, "editor");
    fillEditor(page, payload.form);
    placed({ verb: "created", title: payload.form.title, object: { kind: "form", id: payload.form.id } });
  },
};

const version: Command = {
  find: on("[data-form-artifact]", false),
  async run(page, found) {
    const id = found.dataset.formArtifact || (page.sel && page.sel.id);
    if (!id) return;
    if (page.sel && page.sel.id === id) await save(page);
    const record = page.sel?.id === id ? page.sel : page.records.find((item) => item.id === id);
    let payload: Versioned;
    try {
      payload = await page.request<Versioned>("POST", path(id, "/promote"), { expected_version: record!.version });
    } catch (error) {
      if ((error as FormFailure).code !== "form.conflict") {
        // Publication may have reached Artifact storage before association failed.
        const fresh = await page.request<FormAnswer>("GET", path(id)).catch(() => null);
        if (fresh && page.sel?.id === id) remember(page, fresh.form, false);
        await loadList(page).catch(() => {});
      }
      throw error;
    }
    placed({ verb: "versioned", title: payload.form.title, object: { kind: "form", id: payload.form.id }, artifact: payload.artifact,
      note: page.L("form.fixed.done-note", { version: payload.artifact.version }) });
    await loadList(page);
    if (payload.form && page.sel && page.sel.id === payload.form.id) remember(page, payload.form, false);
  },
};

const pick: Command = {
  find: on("[data-form-id]", false),
  async run(page, found) {
    if (!await leaveEditing(page)) return;
    const payload = await page.request<FormAnswer>("GET", path(found.dataset.formId!));
    setTab(page, "editor"); fillEditor(page, payload.form);
  },
};

const back: Command = {
  find: on("[data-form-back]", false),
  async run(page) {
    if (!await leaveEditing(page)) return;
    closeEditor(page);
    await loadList(page);
  },
};

const switchTab: Command = {
  find: on("[data-form-tab]"),
  async run(page, found) {
    const next = found.dataset.formTab!;
    if (next === page.tab) return;
    if (!await leaveEditing(page)) return;
    page.dirty = false;
    setTab(page, next);
    if (next === "preview") renderPreview(page, open(page));
    if (next === "results") await loadResults(page);
  },
};

const addQuestion: Command = {
  find: on("[data-form-add-question]"),
  run(page, found) {
    // A type chip adds that type and remembers it; the plain button adds the last type used.
    const type = (found.dataset.formAddQuestion || page.typeSelect?.value || "text") as FormQuestionType;
    if (page.typeSelect) page.typeSelect.value = type;
    const row = renderQuestion(page, {
      id: "q-" + crypto.randomUUID(),
      type,
      title: "",
      required: false,
      ...(usesOptions(type) ? { options: [{ label: "" }, { label: "" }] } : {}),
    });
    page.questionsEl.append(row);
    arrive(row);
    row.querySelector<HTMLElement>("[data-question-title]")?.focus();
    queueSave(page);
  },
};

const addOption: Command = {
  find: on("[data-option-add]", false),
  run(page, _found, target) {
    const listEl = target.closest("[data-form-question]")!.querySelector<HTMLElement>("[data-question-options] > div")!;
    addOptionRow(page, listEl, { label: "" });
    arrive(listEl.lastElementChild as HTMLElement | null);
    queueSave(page);
  },
};

const removeOption: Command = {
  find: on("[data-option-remove]", false),
  run(page, _found, target) { const row = target.closest(".form-option-row")!; reflow(row.parentElement!, () => row.remove()); queueSave(page); },
};

const moveQuestion: Command = {
  find: on("[data-question-move]", false),
  run(page, found) {
    const { questionsEl } = page;
    const rowEl = found.closest("[data-form-question]")!;
    const delta = Number(found.dataset.questionMove);
    const siblings = [...questionsEl.children];
    const next = siblings.indexOf(rowEl) + delta;
    if (next < 0 || next >= siblings.length) return;
    reflow(questionsEl, () => {
      if (delta < 0) questionsEl.insertBefore(rowEl, siblings[next]!);
      else questionsEl.insertBefore(siblings[next]!, rowEl);
    });
    found.focus();
    queueSave(page);
  },
};

const removeQuestion: Command = {
  find: on("[data-question-remove]", false),
  run(page, _found, target) { const row = target.closest("[data-form-question]")!; reflow(page.questionsEl, () => row.remove()); queueSave(page); },
};

const draftWithModel: Command = {
  find: on("[data-form-generate-ai]"),
  async run(page) { await save(page); await page.draft!.start(); },
};

const generate: Command = {
  find: on("[data-form-generate]"),
  async run(page) {
    await save(page);
    const sel = open(page);
    const payload = await page.request<FormAnswer>("POST", path(sel.id, "/generate-questions"), { prompt: page.aiPrompt.value, expected_version: sel.version });
    await generated(page, payload.form);
  },
};

/** New questions arrived (from the model or the generator): show them and clear the request. */
export const generated = async (page: FormPage, record: FormAnswer["form"]) => { fillEditor(page, record); page.aiPrompt.value = ""; await loadList(page); };

const publish: Command = {
  find: on("[data-form-publish]"),
  async run(page) {
    await save(page);
    const sel = open(page);
    if (!(sel.questions || []).length) { showNote(page, page.L("form.note.no-questions-collect"), true); return; }
    const payload = await page.request<FormAnswer>("POST", path(sel.id, "/publish"), { expected_version: sel.version });
    remember(page, payload.form, false);
    await loadList(page);
    showNote(page, page.L("form.note.collecting"), false);
  },
};

const stopCollecting: Command = {
  find: on("[data-form-close]"),
  async run(page, _found, target) {
    closeMenu(target);
    await save(page);
    const sel = open(page);
    const payload = await page.request<FormAnswer>("POST", path(sel.id, "/close"), { expected_version: sel.version });
    remember(page, payload.form, false);
    await loadList(page);
    showNote(page, page.L("form.note.stopped"), false);
  },
};

const fill: Command = {
  find: on("[data-form-fill]"),
  async run(page) { await save(page); openFillPage(page, open(page)); },
};

/** An export from the menu: store the editor, save the form's file on this computer and say what it is. */
const exportFile = async (page: FormPage, target: Element, tail: string, type: string, format: (file: FormFile) => string) => {
  closeMenu(target);
  await save(page);
  const sel = open(page);
  const file = await page.request<FormFile>("GET", path(sel.id, tail));
  await page.host.download(new Blob([file.content], { type }), file.filename);
  placed({ verb: "exported", title: sel.title, file: { name: file.filename, format: format(file) } });
};

const exportFill: Command = {
  find: on("[data-form-export-fill]"),
  run: (page, _found, target) => exportFile(page, target, "/fill-page", "text/html;charset=utf-8",
    () => page.L("form.export.fill-file-format")),
};

const exportCsv: Command = {
  find: on("[data-form-export-csv]"),
  run: (page, _found, target) => exportFile(page, target, "/results.csv", "text/csv;charset=utf-8",
    (table) => page.L("form.export.csv-format", { count: table.count })),
};

const importFiles: Command = {
  find: (page, target) => page.sel && page.importInput ? target.closest<HTMLElement>("[data-form-import]") : null,
  run(page) { page.importInput!.value = ""; page.importInput!.click(); },
};

const toDataset: Command = {
  find: on("[data-form-to-dataset]"),
  async run(page) {
    const { L } = page;
    await save(page);
    const sel = open(page);
    const table = await page.request<FormFile>("GET", path(sel.id, "/results.csv"));
    if (!table.count) { showNote(page, L("form.note.no-responses-dataset"), true); return; }
    window.dispatchEvent(new CustomEvent("molis:placement-convert", { detail: { source: { kind: "form", id: sel.id }, station: "dataset",
      title: sel.title + " · " + L("form.result.response-word"), payload: { title: sel.title + " · " + L("form.result.response-word"), body: table.content.replace(/^﻿/, "") },
      note: L("form.note.dataset-made", { count: table.count }) } }));
  },
};

const remove: Command = {
  find: on("[data-form-delete]"),
  async run(page) {
    if (!await ask(page, page.L("form.dialog.delete-confirm"), page.L("form.action.delete"), async () => {
      await save(page);
      const sel = open(page);
      await page.request("POST", path(sel.id, "/delete"), { expected_version: sel.version });
    })) return;
    closeEditor(page);
    await loadList(page);
  },
};

const COMMANDS: readonly Command[] = [reload, create, version, pick, back, switchTab, addQuestion, addOption, removeOption, moveQuestion,
  removeQuestion, draftWithModel, generate, publish, stopCollecting, fill, exportFill, exportCsv, importFiles, toDataset, remove];

/** A click on the page: the first command that answers runs while the page is busy; a failure is said in the note. */
export const onClick = async (page: FormPage, event: MouseEvent) => {
  const target = event.target as Element;
  const button = target.closest("button");
  if (!button || button.type === "submit" || button.closest("dialog") || button.disabled || page.busy) return;
  setBusy(page, true);
  try {
    for (const command of COMMANDS) {
      const found = command.find(page, target, button);
      if (found) { await command.run(page, found, target); return; }
    }
  } catch (error) {
    const failure = error as FormFailure;
    if (failure.code === "form.conflict") page.saveError = failure;
    showNote(page, failure.message || page.L("form.error.request"), true, page.saveError ? "save" : button.matches("[data-form-artifact]") ? "publication" : "");
  } finally { setBusy(page, false); }
};
