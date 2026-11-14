import type { UiRequest, UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SkillAuthoredFields, SkillAuthoredSaveResult, SkillAuthoredSource, SkillCatalogEntry, SkillScope } from "@molis-ai/molis-work-contracts/services/skills";
import { renderLeaveBar, renderTextCount } from "@molis-ai/molis-work-design-system/capability-pack";
import { renderAlert, renderSpinner } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, button, esc, readText } from "./common.js";

// Writing a Skill of one's own on the 「能力包」 page (specs/prologue-strategies/skill.md §10, batch 41; 定样 docs/design/skill-authoring,
// scheme B): one sentence the assistant drafts from, or 「我自己写」, then one form for a new Skill, a change to one of the person's
// own, and a copy of any other. It is drawn where a pack's detail is; page.ts keeps it in the view and asks before unsaved work is left.

type Field = "name" | "description" | "when_not_to_use" | "argument_hint" | "body";
type Fields = Required<SkillAuthoredFields>;
export interface SkillWritingLimits { name: number; description: number; when: number; hint: number; lines: number; chars: number; intent: number }

export interface Authoring {
  step: "ask" | "form";
  origin: "new" | "edit" | "copy";
  /** The Skill a change or a copy starts from, by name. */
  from: string;
  scope: SkillScope;
  skill_id?: string;
  expected_version?: number;
  fields: Fields;
  /** The fields as they were when the form opened, to tell unsaved work. */
  clean: string;
  intent: string;
  drafted: boolean;
  busy?: "draft" | "save";
  errors: Partial<Record<Field, string>>;
  failure?: string;
  /** The person is going elsewhere with unsaved work: the bar above the form asks once. */
  leave: boolean;
}

const page = globalThis as typeof globalThis & { molisWorkRequest: UiRequest };
const FIELDS: readonly Field[] = ["name", "description", "when_not_to_use", "argument_hint", "body"];
const blank = (): Fields => ({ name: "", description: "", when_not_to_use: "", argument_hint: "", applies_to: "assistant", body: "" });
const say = (key: string, values?: Record<string, string | number>) => readText(`workbench.skill-authoring.${key}`, values);
const lineCount = (text: string) => text ? text.split("\n").length : 0;

export const isDirty = (a: Authoring) => a.step === "form" && JSON.stringify(a.fields) !== a.clean;
export const newSkill = (scope: SkillScope): Authoring =>
  ({ step: "ask", origin: "new", from: "", scope, fields: blank(), clean: JSON.stringify(blank()), intent: "", drafted: false, errors: {}, leave: false });
export function fromSource(source: SkillAuthoredSource, origin: "edit" | "copy", scope: SkillScope): Authoring {
  const fields: Fields = { ...blank(), name: source.name, description: source.description, when_not_to_use: source.when_not_to_use ?? "", argument_hint: source.argument_hint ?? "", applies_to: source.applies_to, body: source.body };
  return { step: "form", origin, from: source.name, scope: origin === "edit" ? source.scope : scope, ...(origin === "edit" ? { skill_id: source.skill_id, expected_version: source.version } : {}),
    fields, clean: JSON.stringify(fields), intent: "", drafted: false, errors: {}, leave: false };
}

const settingsPath = (project: string, path: string) => (project ? `/projects/${encodeURIComponent(project)}` : "") + `/api/skills/${path}`;
const writingPath = (project: string, path: string) => `/projects/${encodeURIComponent(project || "personal")}/api/plugin-trust/skills/authored/${path}`;
export const readSource = (project: string, skill: SkillCatalogEntry) => page.molisWorkRequest<SkillAuthoredSource>(settingsPath(project, "source"), { body: { ref: skill.ref } });
export const setState = (project: string, skill: SkillCatalogEntry, state: SkillCatalogEntry["state"]) =>
  page.molisWorkRequest<SkillCatalogEntry>(settingsPath(project, "set"), { body: { scope: skill.pack.scope, install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state, expected_revision: skill.settings_revision } });
export const removeSkill = (project: string, skill: SkillCatalogEntry) =>
  page.molisWorkRequest<{ remaining: number }>(writingPath(project, "remove"), { body: { scope: skill.pack.scope, skill_id: skill.ref.skill_id, expected_version: skill.ref.version } });
const sent = (fields: Fields): SkillAuthoredFields => ({ name: fields.name, description: fields.description, applies_to: fields.applies_to, body: fields.body,
  ...(fields.when_not_to_use.trim() ? { when_not_to_use: fields.when_not_to_use } : {}), ...(fields.argument_hint.trim() ? { argument_hint: fields.argument_hint } : {}) });
export const saveFields = (project: string, scope: SkillScope, fields: SkillAuthoredFields, at?: { skill_id: string; expected_version: number }) =>
  page.molisWorkRequest<SkillAuthoredSaveResult>(writingPath(project, "save"), { body: { ...fields, scope, ...at } });

/** A Skill's writable fields alone, to save again what was read (putting a deleted one back). */
export const fieldsOfSource = (source: SkillAuthoredSource): SkillAuthoredFields => ({ name: source.name, description: source.description, applies_to: source.applies_to, body: source.body,
  ...(source.when_not_to_use ? { when_not_to_use: source.when_not_to_use } : {}), ...(source.argument_hint ? { argument_hint: source.argument_hint } : {}) });

/** What the form itself can tell before asking the Host; `taken` are the names of the person's other Skills in the scope. */
export function check(a: Authoring, limits: SkillWritingLimits, taken: ReadonlySet<string>): boolean {
  const { name, description, when_not_to_use, argument_hint, body } = a.fields, errors: Authoring["errors"] = {};
  if (!name.trim()) errors.name = say("error-name");
  else if (name.trim().length > limits.name) errors.name = say("error-long", { n: limits.name });
  else if (taken.has(name.trim())) errors.name = say("error-name-taken");
  if (!description.trim()) errors.description = say("error-description");
  else if (description.trim().length > limits.description) errors.description = say("error-long", { n: limits.description });
  if (when_not_to_use.trim().length > limits.when) errors.when_not_to_use = say("error-long", { n: limits.when });
  if (argument_hint.trim().length > limits.hint) errors.argument_hint = say("error-long", { n: limits.hint });
  if (!body.trim()) errors.body = say("error-body");
  else if (body.length > limits.chars || lineCount(body) > limits.lines) errors.body = say("error-body-long", { ml: limits.lines, mc: limits.chars });
  a.errors = errors;
  return !Object.keys(errors).length;
}

/** Saves the form. A refusal that names a field is shown at that field; any other stays above the form with what was written. */
export async function save(a: Authoring, project: string): Promise<SkillAuthoredSaveResult | undefined> {
  a.failure = undefined;
  try {
    return await saveFields(project, a.scope, sent(a.fields), a.skill_id === undefined ? undefined : { skill_id: a.skill_id, expected_version: a.expected_version! });
  } catch (cause) {
    const failure = cause as UiRequestFailure, field = ((failure.body as { details?: { field?: string } } | null)?.details?.field ?? "") as Field;
    if (FIELDS.includes(field)) a.errors = { [field]: failure.message };
    else a.failure = failure.message || String(cause);
    return undefined;
  }
}

/** One sentence into the form: the assistant's draft fills every field and the person edits from there. */
export async function draft(a: Authoring, project: string): Promise<void> {
  a.failure = undefined;
  try {
    const drafted = await page.molisWorkRequest<SkillAuthoredFields>(writingPath(project, "draft"), { body: { intent: a.intent.trim() } });
    a.fields = { ...blank(), ...drafted, when_not_to_use: drafted.when_not_to_use ?? "", argument_hint: drafted.argument_hint ?? "" };
    a.step = "form"; a.drafted = true; a.errors = {};
  } catch (cause) { a.failure = (cause as Error)?.message || String(cause); }
}

const countOf = (a: Authoring, limits: SkillWritingLimits) => {
  const lines = lineCount(a.fields.body), chars = a.fields.body.length;
  return { text: say("count", { l: lines, ml: limits.lines, c: chars, mc: limits.chars }), over: lines > limits.lines || chars > limits.chars };
};
const saveLabel = (a: Authoring) => a.origin === "edit" ? say("save-version", { v: a.expected_version! + 1 }) : say("save-new");

function field(a: Authoring, name: Field, label: string, hint: string, control: string): string {
  const error = a.errors[name];
  return `<div class="mw-field au-field"><label class="mw-field__label" for="au-${name}">${esc(label)}</label>${control}<small class="mw-field__hint" id="au-${name}-hint">${esc(hint)}</small>${
    error ? `<p class="mw-field__error" role="alert" data-au-error="${name}">${esc(error)}</p>` : ""}</div>`;
}
const control = (a: Authoring, name: Field, rows: number, extra = "") => {
  const common = `id="au-${name}" data-au-field="${name}" aria-describedby="au-${name}-hint"${a.errors[name] ? ' aria-invalid="true"' : ""}${a.busy ? " disabled" : ""}${extra}`;
  return rows ? `<textarea class="mw-textarea${name === "body" ? " au-body" : ""}" data-slot="textarea" rows="${rows}" ${common}>${esc(a.fields[name])}</textarea>`
    : `<input class="mw-input" data-slot="input" type="text" autocomplete="off" value="${esc(a.fields[name])}" ${common}>`;
};
const toggles = (label: string, name: "applies" | "scope", current: string, items: ReadonlyArray<readonly [string, string]>, disabled: boolean) =>
  `<div class="au-field"><span class="mw-field__label" id="au-${name}-label">${esc(label)}</span><div class="mw-toggle-group" data-slot="toggle-group" role="group" aria-labelledby="au-${name}-label">${
    items.map(([value, word]) => `<button type="button" class="mw-toggle${value === current ? " is-current" : ""}" aria-pressed="${value === current}" data-kit-act="au-${name}" data-kit-v="${value}"${disabled ? " disabled" : ""}>${esc(word)}</button>`).join("")}</div></div>`;

/** The detail side while a Skill is being written. `inProject`: the page is a project's, so a new Skill may live there or in the personal space. */
export function authoringMarkup(a: Authoring, limits: SkillWritingLimits, inProject: boolean): string {
  const failed = (title: string) => a.failure ? renderAlert({ title, body: a.failure, tone: "danger", role: "alert", className: "au-failure", attrs: { tabindex: -1 } }) : "";
  if (a.step === "ask") {
    const drafting = a.busy === "draft";
    return `<div class="au-ask" data-au><h3 tabindex="-1" id="au-title">${esc(say("ask-title"))}</h3><p class="kit-note">${esc(say("ask-about"))}</p>${failed(say("draft-failed"))}
      <textarea class="mw-textarea" data-slot="textarea" rows="4" maxlength="${limits.intent}" data-au-field="intent" aria-labelledby="au-title" placeholder="${esc(say("ask-placeholder"))}"${drafting ? " disabled" : ""}>${esc(a.intent)}</textarea>
      ${drafting ? `<p class="au-drafting" role="status">${renderSpinner()}<span>${esc(say("drafting"))}</span></p>` : ""}
      <div class="au-actions">${button(say("draft"), { variant: "primary", icon: "sparkles", attrs: act("au-draft"), disabled: drafting || !a.intent.trim() })}${button(say("write-myself"), { attrs: act("au-self"), disabled: drafting })}${
        button(readText("common.control.cancel"), { variant: "ghost", attrs: act("au-drop"), disabled: drafting })}</div></div>`;
  }
  const count = countOf(a, limits), saving = a.busy === "save", dirty = isDirty(a);
  const title = a.origin === "new" ? say("new-skill") : say(a.origin === "edit" ? "edit-title" : "copy-title", { n: a.from });
  const leave = a.leave ? renderLeaveBar({ text: say("leave-title", { n: a.fields.name.trim() || title }), attrs: { "data-au-leave": true },
    actions: button(say("leave-save"), { variant: "primary", attrs: act("au-leave-save") }) + button(say("discard"), { attrs: act("au-leave-drop") }) + button(say("leave-stay"), { variant: "ghost", attrs: act("au-leave-stay") }) }) : "";
  const drafted = a.drafted ? `<p class="au-drafted">${esc(say("drafted"))}${button(say("draft-again"), { variant: "link", attrs: act("au-redraft"), disabled: saving })}</p>` : "";
  const failure = a.failure ? renderAlert({ title: say("save-failed"), body: `${say("save-failed-about")} ${a.failure}`, tone: "danger", role: "alert", className: "au-failure", attrs: { tabindex: -1 },
    actions: [{ label: readText("common.control.retry"), variant: "secondary", size: "sm", attrs: act("au-save") }] }) : "";
  const scope = a.origin !== "edit" && inProject ? toggles(say("where"), "scope", a.scope, [["project", say("scope-project")], ["home", say("scope-home")]], saving) : "";
  return `<form class="au-form" data-au novalidate>${leave}<header><h3 tabindex="-1" id="au-title">${esc(title)}</h3></header>${drafted}${failure}
    ${field(a, "name", say("name"), say("name-hint"), control(a, "name", 0))}
    ${field(a, "description", say("when"), say("when-hint"), control(a, "description", 3))}
    ${field(a, "when_not_to_use", say("when-not"), say("when-not-hint"), control(a, "when_not_to_use", 2))}
    ${toggles(say("for"), "applies", a.fields.applies_to, [["assistant", readText("workbench.common.assistant")], ["coding", readText("workbench.settings-skills.coding")], ["both", readText("workbench.settings-skills.assistant-and-coding")]], saving)}${scope}
    <div class="mw-field au-field"><label class="mw-field__label" for="au-body">${esc(say("body"))}</label>${control(a, "body", 14)}${
      renderTextCount({ hint: say("body-hint"), count: count.text, over: count.over, attrs: { "data-au-count": true } })}${a.errors.body ? `<p class="mw-field__error" role="alert" data-au-error="body">${esc(a.errors.body)}</p>` : ""}</div>
    <details class="au-more"${a.fields.argument_hint || a.errors.argument_hint ? " open" : ""}><summary>${esc(say("more"))}</summary>${field(a, "argument_hint", say("hint"), say("hint-hint"), control(a, "argument_hint", 0))}</details>
    <div class="au-foot"><span class="au-foot__state" data-au-dirty>${esc(say(dirty ? "unsaved" : "no-changes"))}</span>${button(a.origin === "edit" || dirty ? say("discard") : readText("common.control.cancel"), { variant: "ghost", attrs: act("au-drop"), disabled: saving })}${
      button(saveLabel(a), { variant: "primary", attrs: { ...act("au-save"), "data-au-save": true }, disabled: saving || (a.origin === "edit" && !dirty) })}</div></form>`;
}

/** A keystroke in the form: the state follows, the field's own error goes, and the count, the unsaved line and the save button keep up without a redraw. */
export function typed(a: Authoring, target: HTMLInputElement | HTMLTextAreaElement, root: HTMLElement, limits: SkillWritingLimits): void {
  const name = target.dataset.auField as Field | "intent";
  if (name === "intent") {
    a.intent = target.value;
    const go = root.querySelector<HTMLButtonElement>('[data-kit-act="au-draft"]');
    if (go) go.disabled = !a.intent.trim();
    return;
  }
  a.fields[name] = target.value;
  if (a.errors[name]) {
    delete a.errors[name];
    target.removeAttribute("aria-invalid");
    root.querySelector(`[data-au-error="${name}"]`)?.remove();
  }
  if (name === "body") {
    const count = countOf(a, limits), shown = root.querySelector<HTMLElement>("[data-au-count] .mw-text-count__n");
    if (shown) { shown.textContent = count.text; shown.toggleAttribute("data-over", count.over); }
  }
  const dirty = isDirty(a), state = root.querySelector<HTMLElement>("[data-au-dirty]"), saving = root.querySelector<HTMLButtonElement>("[data-au-save]");
  if (state) state.textContent = say(dirty ? "unsaved" : "no-changes");
  if (saving && a.origin === "edit") saving.disabled = !dirty;
}

/** In a Skill's detail: change or delete one of the person's own; any other says it cannot be changed and offers a copy. */
export function ownership(key: string, mine: boolean): string {
  return mine ? `<div class="au-own">${button(say("edit"), { icon: "edit", attrs: act("skill-edit", key) })}${button(readText("common.control.delete"), { variant: "ghost", icon: "trash", attrs: act("skill-delete", key) })}</div>`
    : `<div class="au-readonly"><span>${esc(say("read-only"))}</span>${button(say("copy-mine"), { icon: "copy", attrs: act("skill-copy", key) })}</div>`;
}
