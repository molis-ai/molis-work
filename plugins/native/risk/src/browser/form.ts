import { escapeHtml as esc, renderButton, renderField, renderFrame, renderInput, renderTextarea } from "@molis-ai/molis-work-plugin-sdk/ui";
import { RISK_LIMITS } from "../model.js";
import { choices, text } from "./parts.js";
import type { RiskDraft, RiskLevel, RiskPage, RiskRecord } from "./types.js";

/** Recording a risk and editing one: the same fields, the same form (design: 记一条风险 / 编辑). */

const LEVELS: RiskLevel[] = ["high", "medium", "low"];

export const blankDraft = (): RiskDraft => ({ title: "", statement: "", impact: "medium", likelihood: "medium", treatment: "", owner_name: "" });
export const draftOf = (risk: RiskRecord): RiskDraft => ({ title: risk.title, statement: risk.statement, impact: risk.impact, likelihood: risk.likelihood,
  treatment: risk.treatment, owner_name: risk.owner_name ?? "" });

/** The draft being written, kept across renders (a re-render would otherwise drop what the person typed). */
let draft: RiskDraft = blankDraft();
export const currentDraft = () => draft;
export const setDraft = (next: RiskDraft) => { draft = next; };

/** Reads the form's fields into the draft; the level choices are kept as they are pressed. */
export function readDraft(form: HTMLFormElement): RiskDraft {
  const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";
  draft = { ...draft, title: value("title"), statement: value("statement"), treatment: value("treatment"), owner_name: value("owner_name") };
  return draft;
}

export function renderDraftForm(page: RiskPage, mode: "new" | "edit"): string {
  const level = (axis: "impact" | "likelihood") => `<div class="mw-field" data-slot="field"><span class="mw-field__label">${esc(text(`field.${axis}`))}</span>${
    choices(text(`field.${axis}`), `draft-${axis}`, LEVELS.map(value => ({ value, label: text(`level.${value}`) })), draft[axis])}</div>`;
  const body = `<form class="rk-form" data-rk-form="${mode}" novalidate>
    ${renderField({ label: text("field.title"), required: true, control: renderInput({ name: "title", value: draft.title, placeholder: text("form.title-hint"),
      attrs: { maxlength: RISK_LIMITS.title, autocomplete: "off" } }) })}
    <div class="rk-form__row">${level("impact")}${level("likelihood")}${renderField({ label: text("field.owner"), hint: text("form.optional"),
      control: renderInput({ name: "owner_name", value: draft.owner_name, attrs: { maxlength: RISK_LIMITS.owner_name, autocomplete: "off" } }) })}</div>
    ${renderField({ label: text("field.statement"), required: true, control: renderTextarea({ name: "statement", value: draft.statement, rows: 3,
      placeholder: text("form.statement-hint"), attrs: { maxlength: RISK_LIMITS.statement } }) })}
    ${renderField({ label: text("field.treatment"), hint: text("form.optional"), control: renderTextarea({ name: "treatment", value: draft.treatment, rows: 3,
      placeholder: text("form.treatment-hint"), attrs: { maxlength: RISK_LIMITS.treatment } }) })}
    <div class="rk-actions rk-actions--end">${renderButton({ label: text("action.cancel"), variant: "secondary", size: "sm", attrs: { "data-rk-act": mode === "new" ? "back" : "cancel-edit" } })}${
      renderButton({ label: text(mode === "new" ? "action.record" : "action.save"), variant: "primary", size: "sm", type: "submit", loading: page.state.busy, disabled: page.state.busy })}</div>
  </form>`;
  if (mode === "edit") return body;
  const back = page.side ? "" : `<div class="rk-back">${renderButton({ label: text("overview.title"), variant: "link", size: "sm", icon: "chevron-left", attrs: { "data-rk-act": "back" } })}</div>`;
  return back + renderFrame({ title: text("action.new"), description: page.host.projectTitle(), panel: body, className: "rk-frame" });
}

/** What changed against the risk as read; an edit sends only those fields. */
export function changes(risk: RiskRecord, next: RiskDraft): Partial<Record<keyof RiskDraft, string | null>> {
  const out: Partial<Record<keyof RiskDraft, string | null>> = {};
  const was = draftOf(risk);
  for (const key of Object.keys(next) as (keyof RiskDraft)[]) {
    if (next[key].trim() === was[key].trim()) continue;
    out[key] = key === "owner_name" && !next[key].trim() ? null : next[key];
  }
  return out;
}
