import type { FormQuestion, FormRecord } from "../contract.js";
import { FORM_ANSWER_LIMIT } from "../fillpage.js";
import { make } from "./dom.js";
import type { FormPage } from "./page.js";
import type { Translate } from "./types.js";

/** The answer fields of a form, as the preview and the fill page draw them, and the answers read back from them. */
const choiceField = (question: FormQuestion) => {
  const box = make("div", "form-preview-options");
  box.dataset.answerId = question.id;
  box.dataset.answerKind = question.type === "multiChoice" ? "multi" : "single";
  (question.options || []).forEach((option) => {
    const label = make("label", "form-preview-option");
    const input = document.createElement("input");
    input.type = question.type === "multiChoice" ? "checkbox" : "radio";
    input.className = question.type === "multiChoice" ? "mw-check" : "mw-radio";
    input.name = "q-" + question.id;
    input.value = option.label;
    label.append(input, document.createTextNode(option.label));
    box.append(label);
  });
  return box;
};

const ratingField = (question: FormQuestion) => {
  const box = make("div", "form-preview-options form-preview-rating");
  box.dataset.answerId = question.id;
  box.dataset.answerKind = "single";
  for (let score = 1; score <= 5; score += 1) {
    const label = make("label", "form-preview-option");
    const input = document.createElement("input");
    input.type = "radio";
    input.className = "mw-radio";
    input.name = "q-" + question.id;
    input.value = String(score);
    label.append(input, document.createTextNode(String(score)));
    box.append(label);
  }
  return box;
};

const answerField = (question: FormQuestion) => {
  if (question.type === "singleChoice" || question.type === "multiChoice") return choiceField(question);
  if (question.type === "rating") return ratingField(question);
  if (question.type === "dropdown") {
    const input = make("select", "mw-select");
    input.dataset.answerId = question.id;
    input.append(new Option("", ""));
    (question.options || []).forEach((option) => input.append(new Option(option.label, option.label)));
    return input;
  }
  const input = make("input", "mw-input");
  input.dataset.answerId = question.id;
  input.type = question.type === "date" ? "date" : "text";
  return input;
};

export const buildFields = (L: Translate, container: Element, questions: readonly FormQuestion[]) => {
  questions.forEach((question) => {
    const field = make("div", "form-field");
    const title = document.createElement(["singleChoice", "multiChoice", "rating"].includes(question.type) ? "span" : "label");
    title.id = "form-question-" + crypto.randomUUID(); title.textContent = question.title + (question.required ? "（" + L("form.question.required") + "）" : "");
    field.setAttribute("role", ["singleChoice", "rating"].includes(question.type) ? "radiogroup" : "group"); field.setAttribute("aria-labelledby", title.id);
    if (field.getAttribute("role") === "radiogroup") field.setAttribute("aria-required", String(question.required)); field.append(title);
    field.append(answerField(question));
    field.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input:not([type=radio]):not([type=checkbox]),select").forEach((input) => {
      input.id = title.id + "-input"; if (title instanceof HTMLLabelElement) title.htmlFor = input.id; input.setAttribute("aria-labelledby", title.id);
      input.setAttribute("aria-required", String(question.required)); if (input instanceof HTMLInputElement && input.type === "text") input.maxLength = FORM_ANSWER_LIMIT;
    });
    container.append(field);
  });
};

export const collectAnswers = (container: Element) => {
  const answers: Record<string, string> = Object.create(null);
  container.querySelectorAll<HTMLElement>("[data-answer-id]").forEach((node) => {
    const id = node.dataset.answerId!;
    if (node.dataset.answerKind === "multi") {
      answers[id] = [...node.querySelectorAll<HTMLInputElement>("input:checked")].map((input) => input.value).join("\n");
      return;
    }
    if (node.dataset.answerKind === "single") {
      answers[id] = node.querySelector<HTMLInputElement>("input:checked")?.value || "";
      return;
    }
    answers[id] = (node as HTMLInputElement | HTMLSelectElement).value;
  });
  return answers;
};

/** The first required question left empty, if any. */
export const missingRequired = (questions: readonly FormQuestion[], answers: Record<string, string>) =>
  questions.find((question) => question.required && !String(answers[question.id] || "").trim());

export const renderPreview = (page: FormPage, record: FormRecord) => {
  page.previewVersion = record.version;
  page.previewQuestions = record.questions || [];
  page.dirty = false;
  page.submitCall = null;
  page.previewEl.replaceChildren();
  const submitBtn = page.previewForm.querySelector<HTMLElement>("[data-form-submit]");
  if (submitBtn) submitBtn.hidden = !(record.questions || []).length;
  if (!(record.questions || []).length) {
    const emptyPreview = make("p", "form-preview-empty", page.L("form.preview.empty"));
    page.previewEl.append(emptyPreview);
    return;
  }
  buildFields(page.L, page.previewEl, record.questions || []);
};
