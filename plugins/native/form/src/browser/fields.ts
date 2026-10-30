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

/** The limit said in the page's words: "每题回答最多 4000 个字：<题>" / "Keep each answer within 4000 characters: <题>", the same
 * sentence and number the offline fill page uses (fillpage.ts), translated through the plugin's own dictionary (messages.ts). */
const tooLongText = (L: Translate, title: string) => L("form.fill.too-long", { count: FORM_ANSWER_LIMIT, title });

/** Where this page says a field's problem: the full-screen fill page's error line or the preview's note line. */
const problemSlot = (container: Element) =>
  container.closest(".form-fill-sheet")?.querySelector<HTMLElement>(".form-fill-error")
  ?? container.closest("[data-form=workbench]")?.querySelector<HTMLElement>("[data-form-note]")
  ?? null;

/** The action schema and the store take FORM_ANSWER_LIMIT characters; a maxlength attribute takes UTF-16 units and stopped a
 * two-unit character at half the limit. This cuts the box to whole characters at the same limit and says it in the page's words. */
const capAnswer = (L: Translate, input: HTMLInputElement, title: string, container: Element) => {
  const slot = problemSlot(container);
  const over = input.value.length > FORM_ANSWER_LIMIT && [...input.value].length > FORM_ANSWER_LIMIT;
  if (over) input.value = [...input.value].slice(0, FORM_ANSWER_LIMIT).join("");
  if (!slot) return;
  if (over) { slot.hidden = false; slot.textContent = tooLongText(L, title); slot.classList.add("is-error"); }
  else if (slot.textContent === tooLongText(L, title)) { slot.textContent = ""; slot.hidden = true; slot.classList.remove("is-error"); }
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
      input.setAttribute("aria-required", String(question.required));
      if (input instanceof HTMLInputElement && input.type === "text") input.addEventListener("input", () => capAnswer(L, input, question.title, container));
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
