import type { FormQuestionType } from "@molis-ai/molis-work-contracts/modules/form";
import { arrive, download } from "./dom.js";
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
  return !page.dirty || await ask(page, page.L("离开会丢弃未提交的填写内容。继续吗？"), page.L("继续"));
};
const closeMenu = (target: Element) => target.closest("details")?.removeAttribute("open");

const reload: Command = {
  find: (page, _target, button) => page.sel ? button.closest<HTMLElement>("[data-form-reload]") : null,
  async run(page) {
    clearTimeout(page.saveTimer);
    if (page.savePromise) await page.savePromise.catch(() => {});
    if (hasUnsaved(page) && !await ask(page, page.L("重新读取会丢弃未保存的编辑和填写内容。继续吗？"), page.L("重新读取"))) return;
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
    if (page.dirty && !await ask(page, page.L("离开会丢弃未提交的填写内容。继续吗？"), page.L("继续"))) return;
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
      note: page.L("第 {version} 版题目 · 放在这个位置的成果里；不含答卷", { version: payload.artifact.version }) });
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
  run(page, _found, target) { target.closest(".form-option-row")!.remove(); queueSave(page); },
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
    if (delta < 0) questionsEl.insertBefore(rowEl, siblings[next]!);
    else questionsEl.insertBefore(siblings[next]!, rowEl);
    queueSave(page);
  },
};

const removeQuestion: Command = {
  find: on("[data-question-remove]", false),
  run(page, _found, target) { target.closest("[data-form-question]")!.remove(); queueSave(page); },
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
    if (!(sel.questions || []).length) { showNote(page, page.L("还没有题目，先加题再开始收集"), true); return; }
    const payload = await page.request<FormAnswer>("POST", path(sel.id, "/publish"), { expected_version: sel.version });
    remember(page, payload.form, false);
    await loadList(page);
    showNote(page, page.L("正在收集答卷：可以在这台电脑上打开填写页，或导出填写页文件发给别人。不会生成外网链接。"), false);
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
    showNote(page, page.L("已停止收集。已有答卷都保留；填写页不再接受提交，导入答卷文件仍然可以。"), false);
  },
};

const fill: Command = {
  find: on("[data-form-fill]"),
  async run(page) { await save(page); openFillPage(page, open(page)); },
};

const exportFill: Command = {
  find: on("[data-form-export-fill]"),
  async run(page, _found, target) {
    closeMenu(target);
    await save(page);
    const sel = open(page);
    const file = await page.request<FormFile>("GET", path(sel.id, "/fill-page"));
    download(file.filename, new Blob([file.content], { type: "text/html;charset=utf-8" }));
    placed({ verb: "exported", title: sel.title, file: { name: file.filename, format: page.L("填写页 · 发给对方在自己的浏览器里填，填完得到答卷文件发回，在“结果”里导入") } });
  },
};

const exportCsv: Command = {
  find: on("[data-form-export-csv]"),
  async run(page, _found, target) {
    closeMenu(target);
    await save(page);
    const sel = open(page);
    const table = await page.request<FormFile>("GET", path(sel.id, "/results.csv"));
    download(table.filename, new Blob([table.content], { type: "text/csv;charset=utf-8" }));
    placed({ verb: "exported", title: sel.title, file: { name: table.filename, format: page.L("{count} 份答卷 · Excel、Numbers 可以打开", { count: table.count }) } });
  },
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
    if (!table.count) { showNote(page, L("还没有答卷，收到答卷后再存成数据表"), true); return; }
    window.dispatchEvent(new CustomEvent("molis:placement-convert", { detail: { source: { kind: "form", id: sel.id }, station: "dataset",
      title: sel.title + " · " + L("答卷"), payload: { title: sel.title + " · " + L("答卷"), body: table.content.replace(/^﻿/, "") },
      note: L("{count} 份答卷做成的表 · 之后的新答卷不会自动加入", { count: table.count }) } }));
  },
};

const remove: Command = {
  find: on("[data-form-delete]"),
  async run(page) {
    if (!await ask(page, page.L("删除这份问卷？答卷也会一起删掉。"), page.L("删除"))) return;
    await save(page);
    const sel = open(page);
    await page.request("POST", path(sel.id, "/delete"), { expected_version: sel.version });
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
    showNote(page, failure.message || page.L("问卷请求失败"), true, page.saveError ? "save" : button.matches("[data-form-artifact]") ? "publication" : "");
  } finally { setBusy(page, false); }
};
