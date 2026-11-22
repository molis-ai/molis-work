import { bothWord, sceneWord, skillScenes } from "./scenes.js";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SkillAuthoredFields, SkillAuthoredSource, SkillCatalogEntry, SkillScope } from "@molis-ai/molis-work-contracts/services/skills";
import { renderTextCount } from "@molis-ai/molis-work-design-system/capability-pack";
import { renderToggleGroup } from "@molis-ai/molis-work-design-system/navigation";
import { renderAlert, renderSpinner } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, button, esc, readText } from "./common.js";
import type { Fields } from "./drafts.js";

// Writing a Skill of one's own on the 「能力包」 page (specs/prologue-strategies/skill.md §10, batch 41; 定样 docs/design/skill-authoring,
// scheme B): one sentence the assistant drafts from, or 「我自己写」, then the form. Since batch 42 the form is a draft's (workshop.ts):
// this keeps the sentence before a new draft, the form's fields, what the form itself can tell, and whose a Skill is.

type Field = keyof SkillAuthoredFields;
export interface SkillWritingLimits { name: number; description: number; when: number; hint: number; lines: number; chars: number; intent: number }

/** A new Skill before its draft: the one sentence, and where it will live. */
export interface Asking { scope: SkillScope; intent: string; busy?: boolean; failure?: string }

const page = globalThis as typeof globalThis & { molisWorkRequest: UiRequest };
const say = (key: string, values?: Record<string, string | number>) => readText(`workbench.skill-authoring.${key}`, values);
const lineCount = (text: string) => text ? text.split("\n").length : 0;

const settingsPath = (project: string, path: string) => (project ? `/projects/${encodeURIComponent(project)}` : "") + `/api/skills/${path}`;
const writingPath = (project: string, path: string) => `/projects/${encodeURIComponent(project || "personal")}/api/plugin-trust/skills/authored/${path}`;
export const readSource = (project: string, skill: SkillCatalogEntry) => page.molisWorkRequest<SkillAuthoredSource>(settingsPath(project, "source"), { body: { ref: skill.ref } });
/** A Skill's state is kept per place it is used in: `scope` is that place (by default where its pack is installed). */
export const setState = (project: string, skill: SkillCatalogEntry, state: SkillCatalogEntry["state"], scope: SkillCatalogEntry["pack"]["scope"] = skill.pack.scope) =>
  page.molisWorkRequest<SkillCatalogEntry>(settingsPath(project, "set"), { body: { scope, install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state, expected_revision: skill.settings_revision } });
export const removeSkill = (project: string, skill: SkillCatalogEntry) =>
  page.molisWorkRequest<{ remaining: number }>(writingPath(project, "remove"), { body: { scope: skill.pack.scope, skill_id: skill.ref.skill_id, expected_version: skill.ref.version } });
/** One sentence into a form's fields: the assistant's first draft, which the person edits from there. */
export const draftFromSentence = (project: string, intent: string) => page.molisWorkRequest<SkillAuthoredFields>(writingPath(project, "draft"), { body: { intent: intent.trim() } });

/** A Skill's writable fields alone, to start a draft from what was read (putting a deleted one back). */
export const fieldsOfSource = (source: SkillAuthoredSource): SkillAuthoredFields => ({ name: source.name, description: source.description, applies_to: source.applies_to, body: source.body,
  ...(source.when_not_to_use ? { when_not_to_use: source.when_not_to_use } : {}), ...(source.argument_hint ? { argument_hint: source.argument_hint } : {}) });

/** What the form itself can tell before adopting; `taken` are the names of the person's other Skills in the scope. */
export function check(fields: Fields, limits: SkillWritingLimits, taken: ReadonlySet<string>): Partial<Record<Field, string>> {
  const { name, description, when_not_to_use, argument_hint, body } = fields, errors: Partial<Record<Field, string>> = {};
  if (!name.trim()) errors.name = say("error-name");
  else if (name.trim().length > limits.name) errors.name = say("error-long", { n: limits.name });
  else if (taken.has(name.trim())) errors.name = say("error-name-taken");
  if (!description.trim()) errors.description = say("error-description");
  else if (description.trim().length > limits.description) errors.description = say("error-long", { n: limits.description });
  if (when_not_to_use.trim().length > limits.when) errors.when_not_to_use = say("error-long", { n: limits.when });
  if (argument_hint.trim().length > limits.hint) errors.argument_hint = say("error-long", { n: limits.hint });
  if (!body.trim()) errors.body = say("error-body");
  else if (body.length > limits.chars || lineCount(body) > limits.lines) errors.body = say("error-body-long", { ml: limits.lines, mc: limits.chars });
  return errors;
}

export const countOf = (body: string, limits: SkillWritingLimits) => {
  const lines = lineCount(body), chars = body.length;
  return { text: say("count", { l: lines, ml: limits.lines, c: chars, mc: limits.chars }), over: lines > limits.lines || chars > limits.chars };
};

/** The sentence before a new Skill's draft: the assistant drafts from it, or the person writes it themself. */
export function askingMarkup(a: Asking, limits: SkillWritingLimits, inProject: boolean): string {
  const failed = a.failure ? renderAlert({ title: say("draft-failed"), body: a.failure, tone: "danger", role: "alert", className: "au-failure", attrs: { tabindex: -1 } }) : "";
  const scope = inProject ? toggles(say("where"), "scope", a.scope, [["project", say("scope-project")], ["home", say("scope-home")]], Boolean(a.busy)) : "";
  return `<div class="au-ask" data-au><h3 tabindex="-1" id="au-title">${esc(say("ask-title"))}</h3><p class="kit-note">${esc(say("ask-about"))}</p>${failed}
    <textarea class="mw-textarea" data-slot="textarea" rows="4" maxlength="${limits.intent}" data-au-field="intent" aria-labelledby="au-title" placeholder="${esc(say("ask-placeholder"))}"${a.busy ? " disabled" : ""}>${esc(a.intent)}</textarea>
    ${a.busy ? `<p class="au-drafting" role="status">${renderSpinner()}<span>${esc(say("drafting"))}</span></p>` : ""}${scope}
    <div class="au-actions">${button(say("draft"), { variant: "primary", icon: "sparkles", attrs: act("au-draft"), disabled: a.busy || !a.intent.trim() })}${button(say("write-myself"), { attrs: act("au-self"), disabled: a.busy })}${
      button(readText("common.control.cancel"), { variant: "ghost", attrs: act("au-drop"), disabled: a.busy })}</div></div>`;
}

function field(errors: Partial<Record<Field, string>>, name: Field, label: string, hint: string, control: string): string {
  const error = errors[name];
  return `<div class="mw-field au-field"><label class="mw-field__label" for="au-${name}">${esc(label)}</label>${control}<small class="mw-field__hint" id="au-${name}-hint">${esc(hint)}</small>${
    error ? `<p class="mw-field__error" id="au-${name}-error" data-au-error="${name}">${esc(error)}</p>` : ""}</div>`;
}
const control = (fields: Fields, errors: Partial<Record<Field, string>>, name: Exclude<Field, "applies_to">, rows: number, disabled: boolean) => {
  const common = `id="au-${name}" data-au-field="${name}" aria-describedby="au-${name}-hint${errors[name] ? ` au-${name}-error" aria-invalid="true` : ""}"${disabled ? " disabled" : ""}`;
  return rows ? `<textarea class="mw-textarea${name === "body" ? " au-body" : ""}" data-slot="textarea" rows="${rows}" ${common}>${esc(fields[name])}</textarea>`
    : `<input class="mw-input" data-slot="input" type="text" autocomplete="off" value="${esc(fields[name])}" ${common}>`;
};
const toggles = (label: string, name: "applies" | "scope", current: string, items: ReadonlyArray<readonly [string, string]>, disabled: boolean) =>
  `<div class="au-field"><span class="mw-field__label">${esc(label)}</span>${renderToggleGroup({
    label, items: items.map(([value, word]) => ({ value, label: word, current: value === current, attrs: { ...act(`au-${name}`, value), disabled } })),
  })}</div>`;

/** A draft's form: the same fields a Skill has, with the body's count. */
export function fieldsMarkup(fields: Fields, errors: Partial<Record<Field, string>>, limits: SkillWritingLimits, disabled: boolean): string {
  const count = countOf(fields.body, limits);
  return `${field(errors, "name", say("name"), say("name-hint"), control(fields, errors, "name", 0, disabled))}
    ${field(errors, "description", say("when"), say("when-hint"), control(fields, errors, "description", 3, disabled))}
    ${field(errors, "when_not_to_use", say("when-not"), say("when-not-hint"), control(fields, errors, "when_not_to_use", 2, disabled))}
    ${toggles(say("for"), "applies", fields.applies_to, [["assistant", sceneWord("assistant")], ...skillScenes().map(row => [row.scene, row.name] as [string, string]), ["both", bothWord()]], disabled)}
    <div class="mw-field au-field"><label class="mw-field__label" for="au-body">${esc(say("body"))}</label>${control(fields, errors, "body", 16, disabled)}${
      renderTextCount({ hint: say("body-hint"), hintId: "au-body-hint", count: count.text, over: count.over, attrs: { "data-au-count": true } })}${errors.body ? `<p class="mw-field__error" id="au-body-error" data-au-error="body">${esc(errors.body)}</p>` : ""}</div>
    <details class="au-more"${fields.argument_hint || errors.argument_hint ? " open" : ""}><summary>${esc(say("more"))}</summary>${field(errors, "argument_hint", say("hint"), say("hint-hint"), control(fields, errors, "argument_hint", 0, disabled))}</details>`;
}

/** In a Skill's detail: change or delete one's own (a change opens its draft), or start a copy of any other. */
export function ownership(key: string, mine: boolean, hasDraft: boolean): string {
  const improve = (k: string) => readText(`workbench.skill-improve.${k}`);
  return mine ? `<div class="au-own">${button(hasDraft ? improve("open-draft") : say("edit"), { variant: hasDraft ? "primary" : "secondary", icon: "edit", attrs: act("skill-edit", key) })}${button(readText("common.control.delete"), { variant: "ghost", icon: "trash", attrs: act("skill-delete", key) })}</div>`
    : `<div class="au-readonly"><span>${esc(say("read-only"))}</span>${button(hasDraft ? improve("open-draft") : say("copy-mine"), { icon: hasDraft ? "edit" : "copy", attrs: act("skill-copy", key) })}</div>`;
}
