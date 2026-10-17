import type { FormOption, FormQuestion, FormQuestionInput } from "@molis-ai/molis-work-contracts/modules/form";
import { make } from "./dom.js";
import type { FormPage } from "./page.js";

/** The editor's question rows: read back from the page, and drawn from a form's questions. */
export const usesOptions = (type: string | undefined) => type === "singleChoice" || type === "multiChoice" || type === "dropdown";

export const questionsFromDom = (page: FormPage) => [...page.questionsEl.querySelectorAll<HTMLElement>("[data-form-question]")].map((row, index) => {
  const type = row.querySelector<HTMLSelectElement>("[data-question-type]")!.value;
  const options = usesOptions(type)
    ? [...row.querySelectorAll<HTMLInputElement>("[data-option-label]")].map((input, optionIndex) => ({
      id: input.dataset.optionId || "",
      label: input.value.trim() || page.L("选项") + " " + (optionIndex + 1),
    }))
    : undefined;
  return {
    id: row.dataset.questionId,
    type,
    title: row.querySelector<HTMLInputElement>("[data-question-title]")!.value,
    required: row.querySelector<HTMLInputElement>("[data-question-required]")!.checked,
    order: index + 1,
    options,
  };
});

export const addOptionRow = (page: FormPage, container: Element, option?: Partial<FormOption>) => {
  const { L } = page;
  const row = make("div", "form-option-row");
  const input = make("input", "mw-input");
  input.dataset.optionLabel = "true";
  input.dataset.optionId = option?.id || crypto.randomUUID();
  input.value = option?.label || "";
  input.placeholder = L("选项");
  const remove = make("button", "mw-btn mw-btn--ghost mw-btn--icon-only");
  remove.type = "button";
  remove.dataset.optionRemove = "true";
  remove.setAttribute("aria-label", L("删选项"));
  remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
  row.append(input, remove);
  container.append(row);
};

export const fillOptions = (page: FormPage, row: Element, type: string | undefined, options: readonly Partial<FormOption>[] | undefined) => {
  const optionsEl = row.querySelector("[data-question-options]")!;
  optionsEl.replaceChildren();
  if (!usesOptions(type)) return;
  const box = make("div", "form-option-list");
  const source = options && options.length ? options : [{ label: "" }, { label: "" }];
  source.forEach((option) => addOptionRow(page, box, option));
  const add = make("button", "mw-btn mw-btn--ghost", page.L("加选项"));
  add.type = "button";
  add.dataset.optionAdd = "true";
  optionsEl.append(box, add);
};

export const renderQuestion = (page: FormPage, question: FormQuestionInput) => {
  const { L } = page;
  const row = make("div", "form-question");
  row.dataset.formQuestion = "true";
  row.dataset.questionId = question.id;
  row.innerHTML = '<input class="mw-input" data-question-title autocomplete="off">'
    + '<select class="mw-select" data-question-type>'
    + '<option value="text">' + L("填空") + '</option>'
    + '<option value="singleChoice">' + L("单选") + '</option>'
    + '<option value="multiChoice">' + L("多选") + '</option>'
    + '<option value="dropdown">' + L("下拉") + '</option>'
    + '<option value="rating">' + L("评分") + '</option>'
    + '<option value="date">' + L("日期") + '</option>'
    + '</select>'
    + '<label class="mw-check-row"><input class="mw-check" type="checkbox" data-question-required><span>' + L("必填") + '</span></label>'
    + '<span class="form-question-move">'
    + '<button class="mw-btn mw-btn--ghost" type="button" data-question-move="-1" aria-label="' + L("上移") + '"><svg aria-hidden="true"><use href="#icon-chevron-up"></use></svg></button>'
    + '<button class="mw-btn mw-btn--ghost" type="button" data-question-move="1" aria-label="' + L("下移") + '"><svg aria-hidden="true"><use href="#icon-chevron-down"></use></svg></button>'
    + '</span>'
    + '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-question-remove aria-label="' + L("删题") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button>'
    + '<div class="form-question-options" data-question-options></div>';
  const title = row.querySelector<HTMLInputElement>("[data-question-title]")!;
  title.placeholder = L("题目");
  title.value = question.title || "";
  row.querySelector<HTMLSelectElement>("[data-question-type]")!.value = question.type || "text";
  row.querySelector<HTMLInputElement>("[data-question-required]")!.checked = Boolean(question.required);
  fillOptions(page, row, question.type, question.options);
  return row;
};

export const renderQuestions = (page: FormPage, questions: readonly FormQuestion[] | undefined) => {
  page.questionsEl.replaceChildren();
  (questions || []).forEach((question) => page.questionsEl.append(renderQuestion(page, question)));
};
