import type { CardNode } from "../actions.js";
import type { Page } from "./page.js";

/** The id of the question a form was drawn for (its key is `[run, question, revision]`). */
const questionOf = (form: HTMLElement): string => String(JSON.parse(form.dataset.questionKey || "[]")[1]);

/** The control a next step names: an option and its question's submit, a round card's run button, or a control by selector. */
function stepControl(page: Page, id: string) {
  const { turns } = page;
  const form = [...turns.querySelectorAll<HTMLElement>("[data-coding-question]")].find(node => (id + ":").startsWith("question:" + questionOf(node) + ":"));
  const rest = form ? id.slice(10 + questionOf(form).length) : "", cut = rest.indexOf(":");
  const option = cut > 0 && form ? form.querySelector<HTMLButtonElement>('[data-ix-field="' + rest.slice(0, cut) + '"] [data-ix-option="' + CSS.escape(rest.slice(cut + 1)) + '"]') : null;
  const card = id.startsWith("card:") ? turns.querySelector<CardNode>('[data-card="' + CSS.escape(id.split(":")[1] || "") + '"]') : null;
  let control: HTMLButtonElement | null = null;
  if (form) control = option && !option.disabled ? form.querySelector<HTMLButtonElement>("[type=submit]") : null;
  else if (card) control = id.endsWith(":run") && card.ixBase === JSON.stringify(card.ix?.read()) ? card.querySelector<HTMLButtonElement>('[data-ix-action="run"]') : null;
  else if (id.startsWith("[")) control = turns.querySelector<HTMLButtonElement>(id);
  return { form, card, option, control, first: form?.querySelector<HTMLElement>("[data-ix-focus]") };
}

/** A next step presses the control it names on screen (FLOW-01); when it cannot, it takes the person to it. */
export function pressNextStep(page: Page, id: string) {
  const { form, card, option, control, first } = stepControl(page, id);
  (form || card)?.scrollIntoView({ block: "nearest" });
  if (!control) (card || first?.querySelector<HTMLElement>("[aria-checked=true]") || first?.querySelector<HTMLElement>("button:not(:disabled)") || first)?.focus();
  if (control && !control.disabled) {
    option?.click();
    control.click();
  }
}
