/**
 * AI interaction parts shared by the Assistant, Coding and plugins: the questionnaire (mixed fields, reasons,
 * per-field errors), option groups, the operation card (target, parameter preview, status, result) and the next
 * steps beside a composer. The cross-plugin AI interaction requirements book (§15.5, §17 P2) owns the why.
 *
 * These are presentation only. Callers turn their own records (an Agent's pending question, an action card, a
 * plugin's needs-input result) into the view types below; nothing here knows about runs, receipts or authority.
 * Every text a person reads comes from the caller, except a few control names that have overridable defaults.
 * Markup carries `data-ix-*` hooks so one client can wire behaviour without depending on class names.
 */
import type { InteractionNextStep } from "@molis-ai/molis-work-contracts/platform/ui";
import { cx, escapeHtml, icon, renderAttrs, renderButton, renderCalendar, renderChoice, renderStateRing, type AttrValue, type PluginIconName, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

export type InteractionTone = "waiting" | "progress" | "done" | "failed" | "quiet";
export interface InteractionBadge { label: string; tone: InteractionTone; /** null for descriptions that do not express a state (such as an effect). */ state?: StateRingState | null }
/** A button or internal link on an interaction part. `id` becomes `data-ix-action`; `attrs` lets the caller keep its own hooks. */
export interface InteractionAction {
  id: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  /** An internal destination; navigation does not dispatch an interaction action. */
  href?: string;
  icon?: PluginIconName;
  iconOnly?: boolean;
  attrs?: Record<string, AttrValue>;
}
export interface InteractionOption { value: string; label: string; description?: string; recommended?: boolean; selected?: boolean; disabled?: boolean }
/** An object a reference field holds or offers: `value` is the caller's own name for it, read back as the answer. */
export interface InteractionReference { value: string; label: string; meta?: string }
/** What the person reads around a reference search; each has a default. `found` takes `{n}`, `remove` is followed by the label. */
export interface InteractionReferenceLabels { remove?: string; empty?: string; failed?: string; full?: string; found?: string }
/** Months the date control's calendar may show, rendered with the design system's own calendar. */
export interface InteractionCalendar { months: Array<{ year: number; month: number }>; today?: string; label?: string }
export type InteractionControl =
  | { kind: "choice"; options: InteractionOption[]; multiple?: boolean; recommendedLabel?: string;
      /** A free "other" answer beside the options (the SDK's `allowOther`). Its text is the person's, never an option. */
      other?: { label: string; value: string; placeholder?: string } }
  | { kind: "text"; value: string; multiline?: boolean; placeholder?: string; maxLength?: number }
  | { kind: "number"; value: string; unit?: string; step?: number; min?: number; max?: number; integer?: boolean; placeholder?: string; stepLabels?: [string, string] }
  | { kind: "date"; value: string; weekday?: string; placeholder?: string; calendar?: InteractionCalendar; calendarLabel?: string }
  | { kind: "datetime"; date: string; time: string; zone: string; weekday?: string; calendar?: InteractionCalendar; calendarLabel?: string; dateLabel?: string; timeLabel?: string }
  /** Objects found by name as the person types: the shared client asks the host's `references(source, query)`, so the card never
   * lists candidates of its own. `source` is the caller's, handed back untouched; `max` caps a multiple pick. */
  | { kind: "reference"; source: string; picked: InteractionReference[]; multiple?: boolean; max?: number; placeholder?: string; labels?: InteractionReferenceLabels };
export interface InteractionField {
  /** The question's stable name; ids and hooks derive from it. */
  id: string;
  label: string;
  control: InteractionControl;
  /** Fields are required unless they say otherwise; an optional one is marked with `optionalLabel`. */
  optional?: boolean;
  hint?: string;
  error?: string;
  /** Shown beside the label when a background update changed an untouched value. */
  refreshed?: string;
  /** A question the field raises before it changes, e.g. a duration stated in the notes. */
  notice?: { text: string; actions: InteractionAction[] };
}
/** Where a card's facts come from, for a person who wants to check: rows the caller derives from its own records
 * (a request key, the earlier input a pending question is about, a call number). Shown folded under the card. */
export interface InteractionEvidence { label: string; rows: Array<[string, string]> }
export interface InteractionQuestionView {
  /** Scopes element ids; unique on the page. */
  id: string;
  kicker: string;
  state?: StateRingState;
  title: string;
  badge?: InteractionBadge;
  /** The earlier input this question is about, in the caller's words. */
  about?: string;
  /** The object and version the question was prepared against; `changed` marks a version that moved since. */
  target?: { prefix: string; label: string; version?: string; changed?: boolean };
  evidence?: InteractionEvidence;
  collapse?: InteractionAction;
  banner?: { text: string; tone: InteractionTone; actions: InteractionAction[] };
  intro?: string;
  fields: InteractionField[];
  /** When present the answer was received: the summary shows and the form stays in the page, hidden, so a live
   * client can reopen it with the draft intact. */
  answered?: { rows: Array<[string, string]>; actions?: InteractionAction[] };
  footer: { note: string; error?: boolean; keys?: string; actions: InteractionAction[] };
  optionalLabel?: string;
  /** The button that empties an optional single choice; it shows only while one is picked. */
  clearLabel?: string;
}
export interface InteractionOperationView {
  id: string;
  kicker: string;
  state?: StateRingState;
  title: string;
  badge?: InteractionBadge;
  target: { prefix: string; label: string; version?: string; changed?: boolean };
  about?: string;
  evidence?: InteractionEvidence;
  impact?: string;
  /** Values the person may still change before it runs (the card's own client reads them like a questionnaire's). */
  fields?: InteractionField[];
  optionalLabel?: string;
  clearLabel?: string;
  actions?: InteractionAction[];
  preview?: { title: string; rows: Array<[string, string]>; note?: string; actions?: InteractionAction[] };
  status?: { text: string; tone?: "failed" | "waiting"; busy?: boolean };
  recovery?: InteractionAction[];
  result?: { title: string; body: string; actions?: InteractionAction[]; details?: { title: string; body: string } };
}
/** `max`: draw that many steps in the caller's order and fold the rest into one button whose words `more(n)` gives. */
export interface InteractionNextStepsOptions { max?: number; more?: (count: number) => string }

const esc = escapeHtml;
/** Ids are raw strings here and escaped exactly once, where they are written into an attribute. */
const fieldId = (scope: string, id: string, part = "") => `${scope}-${id}${part ? `-${part}` : ""}`;

export function renderInteractionAction(action: InteractionAction): string {
  return renderButton({
    label: action.label, variant: action.variant ?? "secondary", type: action.type, disabled: action.disabled,
    icon: action.icon, iconOnly: action.iconOnly, href: action.href, attrs: { ...(!action.href ? { "data-ix-action": action.id } : {}), ...action.attrs },
  });
}
const actionRow = (actions: InteractionAction[] | undefined, hook: string, end = false) =>
  actions?.length ? `<div class="${cx("mw-ix-actions", end && "mw-ix-actions--end")}" ${hook}>${actions.map(renderInteractionAction).join("")}</div>` : "";
export function renderInteractionBadge(badge: InteractionBadge | undefined): string {
  return badge ? `<span class="mw-ix-badge" data-ix-badge data-tone="${badge.tone}">${badge.state === null ? "" : renderStateRing({ state: badge.state ?? ({ quiet: "idle", waiting: "answer", progress: "doing", done: "done", failed: "failed" } as const)[badge.tone] })}${esc(badge.label)}</span>` : `<span class="mw-ix-badge" data-ix-badge></span>`;
}
function rows(pairs: Array<[string, string]>): string {
  return pairs.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join("");
}

/**
 * An option group: options with a difference to explain render as option cards, short ones as choices.
 * One pick is a radio group (`role="radio"` + `aria-checked`, so a screen reader hears that the options exclude each
 * other); several picks are toggle buttons (`aria-pressed`) in a plain group. A client moves between radios with the
 * arrow keys (roving focus); see the interaction behaviour module.
 */
export function renderInteractionOptions(options: InteractionOption[], group: { id: string; labelledBy?: string; describedBy?: string; multiple?: boolean; recommendedLabel?: string }): string {
  const described = options.some(option => option.description || option.recommended);
  const radio = !group.multiple;
  const state = (selected: boolean | undefined) => radio ? ` role="radio" aria-checked="${selected ? "true" : "false"}"` : ` aria-pressed="${selected ? "true" : "false"}"`;
  const body = options.map(option => described
    ? `<button type="button" class="mw-ix-option" data-ix-option="${esc(option.value)}"${state(option.selected)}${option.disabled ? " disabled" : ""}>
        <span class="mw-ix-option__top"><span class="mw-ix-option__title">${esc(option.label)}</span>${option.recommended ? `<span class="mw-ix-tag">${esc(group.recommendedLabel ?? "推荐")}</span>` : ""}<span class="mw-ix-option__check" aria-hidden="true">${icon("check")}</span></span>
        ${option.description ? `<span class="mw-ix-option__desc">${esc(option.description)}</span>` : ""}</button>`
    : renderChoice({ label: option.label, selected: option.selected, attrs: { "data-ix-option": option.value, disabled: option.disabled } })
        .replace(/ aria-pressed="(true|false)"/, radio ? ' role="radio" aria-checked="$1"' : ' aria-pressed="$1"')).join("");
  return `<div class="${described ? "mw-ix-options" : "mw-choice-group mw-ix-choices"}" role="${radio ? "radiogroup" : "group"}" tabindex="-1" id="${esc(group.id)}" data-ix-options${group.multiple ? ` data-ix-multiple` : ""} data-ix-focus${
    renderAttrs({ "aria-labelledby": group.labelledBy, "aria-describedby": group.describedBy })}>${body}</div>`;
}
function calendarPopup(calendar: InteractionCalendar | undefined, selected: string): string {
  if (!calendar?.months.length) return "";
  const pages = calendar.months.map(({ year, month }, index) => renderCalendar({ year, month, today: calendar.today, selected, compact: true,
    attrs: { "data-ix-calendar-page": index, hidden: index > 0 || undefined } })).join("");
  return `<div class="mw-ix-calendar" data-ix-calendar role="dialog" aria-label="${esc(calendar.label ?? "选择日期")}" hidden>${pages}</div>`;
}
function dateControl(control: { value: string; weekday?: string; placeholder?: string; calendar?: InteractionCalendar; calendarLabel?: string }, input: Record<string, AttrValue>): string {
  return `<span class="mw-ix-date" data-ix-date><input class="mw-input mw-ix-date__input" data-slot="input"${renderAttrs({ type: "text", value: control.value, placeholder: control.placeholder ?? "YYYY-MM-DD", autocomplete: "off", inputmode: "numeric", ...input })}>
    <span class="mw-ix-weekday" data-ix-weekday aria-hidden="true">${esc(control.weekday ?? "")}</span>${control.calendar ? renderButton({
      label: control.calendarLabel ?? "打开日历", icon: "calendar", iconOnly: true, variant: "ghost", attrs: { "data-ix-calendar-open": true, "aria-expanded": "false" } }) : ""}${calendarPopup(control.calendar, control.value)}</span>`;
}
function control(scope: string, field: InteractionField): string {
  const id = fieldId(scope, field.id);
  // The error slot always exists (hidden while empty); the hint only when there is one, so nothing points at a missing id.
  const describedBy = `${field.hint ? `${fieldId(scope, field.id, "hint")} ` : ""}${fieldId(scope, field.id, "error")}`;
  const value = { "data-ix-value": field.id, "data-ix-focus": true, "aria-describedby": describedBy };
  const c = field.control;
  switch (c.kind) {
    case "choice": return renderInteractionOptions(c.options, { id, labelledBy: fieldId(scope, field.id, "label"), describedBy, multiple: c.multiple, recommendedLabel: c.recommendedLabel }) + (c.other
      ? `<label class="mw-ix-other"><span>${esc(c.other.label)}</span><input class="mw-input" data-slot="input"${renderAttrs({ type: "text", value: c.other.value, placeholder: c.other.placeholder, maxlength: 500, autocomplete: "off", "data-ix-other": field.id, "aria-describedby": describedBy })}></label>` : "");
    case "text": return c.multiline
      ? `<textarea class="mw-textarea mw-ix-text" data-slot="textarea" rows="2"${renderAttrs({ id, placeholder: c.placeholder, maxlength: c.maxLength, ...value })}>${esc(c.value)}</textarea>`
      : `<input class="mw-input mw-ix-text" data-slot="input"${renderAttrs({ id, type: "text", value: c.value, placeholder: c.placeholder, maxlength: c.maxLength, autocomplete: "off", ...value })}>`;
    case "number": {
      const step = c.step ?? 1, [less, more] = c.stepLabels ?? [`减少 ${step}`, `增加 ${step}`];
      const stepper = (sign: 1 | -1) => renderButton({ label: sign > 0 ? more : less, icon: sign > 0 ? "plus" : "minus", iconOnly: true, variant: "ghost", attrs: { "data-ix-step-by": sign * step } });
      // The unit is read with the field (after its label), so a screen reader hears "时长, 分钟", not a bare number.
      const unit = c.unit ? fieldId(scope, field.id, "unit") : "";
      return `<span class="mw-ix-number-row"><span class="mw-number mw-ix-number">${stepper(-1)}<input class="mw-input" data-slot="input"${renderAttrs({ id, type: "text", value: c.value, placeholder: c.placeholder, inputmode: c.integer ? "numeric" : "decimal", autocomplete: "off", "data-ix-min": c.min, "data-ix-max": c.max, ...value, ...(unit ? { "aria-describedby": `${unit} ${describedBy}` } : {}) })}>${stepper(1)}</span>${unit ? `<span class="mw-ix-unit" id="${esc(unit)}">${esc(c.unit!)}</span>` : ""}</span>`;
    }
    case "date": return dateControl(c, { id, ...value });
    case "datetime": return `<span class="mw-ix-when">${dateControl({ ...c, value: c.date }, { id: `${id}-date`, "data-ix-part": "date", "data-ix-focus": true, "aria-label": c.dateLabel ?? "日期", "aria-describedby": describedBy })}<span class="mw-ix-clock"><input class="mw-input mw-ix-time" data-slot="input"${
      renderAttrs({ id, type: "text", value: c.time, placeholder: "10:00", inputmode: "numeric", autocomplete: "off", "data-ix-part": "time", "aria-label": c.timeLabel ?? "时刻（24 小时制）", "aria-describedby": describedBy })}><span class="mw-ix-zone">${esc(c.zone)}</span></span></span>`;
    case "reference": return referenceControl(id, c, describedBy);
  }
}
const REFERENCE_LABELS: Required<InteractionReferenceLabels> = { remove: "去掉", empty: "没有找到", failed: "暂时搜不了，稍后再试", full: "已经选够了", found: "{n} 个结果" };
/** One picked object; the shared client draws the same when the person picks one. */
export const renderInteractionReferenceChip = (ref: InteractionReference, remove = REFERENCE_LABELS.remove): string =>
  `<li class="mw-ix-chip" data-ix-reference="${esc(ref.value)}"><span>${esc(ref.label)}</span><button type="button" data-ix-unpick aria-label="${esc(`${remove} ${ref.label}`)}">${icon("x")}</button></li>`;
/** The picked objects, then a search box whose results (a listbox the client fills) are offered as the person types. */
function referenceControl(id: string, c: Extract<InteractionControl, { kind: "reference" }>, describedBy: string): string {
  const labels = { ...REFERENCE_LABELS, ...c.labels };
  return `<div class="mw-ix-refs"${renderAttrs({ "data-ix-references": true, "data-ix-ref-source": c.source, "data-ix-multiple": c.multiple === true, "data-ix-ref-max": c.multiple ? c.max : 1, "data-ix-ref-labels": JSON.stringify(labels) })}>
    <ul class="mw-ix-picked" data-ix-picked>${c.picked.map(ref => renderInteractionReferenceChip(ref, labels.remove)).join("")}</ul><template data-ix-chip>${renderInteractionReferenceChip({ value: "", label: "" }, labels.remove)}</template>
    <span class="mw-input-group mw-ix-ref-search" data-slot="input-group">${icon("search")}<input class="mw-input" data-slot="input"${renderAttrs({ id, type: "text", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false",
      "aria-controls": `${id}-results`, autocomplete: "off", placeholder: c.placeholder, "data-ix-ref-query": true, "data-ix-focus": true, "aria-describedby": `${id}-status ${describedBy}` })}></span>
    <ul class="mw-menu mw-ix-ref-results" role="listbox" id="${esc(`${id}-results`)}" hidden></ul><template data-ix-ref-row><li class="mw-menu__item mw-ix-ref" role="option" tabindex="-1" aria-selected="false"><span></span><span class="mw-ix-ref__meta"></span></li></template><p class="mw-ix-ref-status" id="${esc(`${id}-status`)}" data-ix-ref-status aria-live="polite"></p></div>`;
}
/** An optional single choice can be emptied again before it is sent: a radio alone cannot be unpicked. */
export function renderInteractionField(scope: string, field: InteractionField, optionalLabel = "选填", clearLabel = "清除选择"): string {
  const c = field.control, group = c.kind === "choice";
  const labelId = fieldId(scope, field.id, "label");
  const label = group ? `<span id="${esc(labelId)}">${esc(field.label)}</span>` : `<label id="${esc(labelId)}" for="${esc(fieldId(scope, field.id))}">${esc(field.label)}</label>`;
  return `<div class="mw-ix-row" data-ix-field="${esc(field.id)}">
    <div class="mw-ix-label">${label}${field.optional ? `<span class="mw-ix-optional">${esc(optionalLabel)}</span>` : ""}${field.refreshed ? `<span class="mw-ix-refreshed" data-ix-refreshed>${esc(field.refreshed)}</span>` : ""}</div>
    <div class="mw-ix-control">${control(scope, field)}${group && field.optional && !c.multiple
      ? renderButton({ label: clearLabel, variant: "ghost", attrs: { "data-ix-clear": true, "aria-describedby": labelId } }) : ""}${field.notice ? `<div class="mw-ix-notice" data-ix-notice><p data-ix-notice-text>${esc(field.notice.text)}</p>${actionRow(field.notice.actions, "")}</div>` : ""}
      ${field.hint ? `<p class="mw-ix-hint" id="${esc(fieldId(scope, field.id, "hint"))}">${esc(field.hint)}</p>` : ""}<p class="mw-ix-error" id="${esc(fieldId(scope, field.id, "error"))}" data-ix-error${field.error ? "" : " hidden"}>${esc(field.error ?? "")}</p></div>
  </div>`;
}
const heading = (scope: string, view: { kicker: string; title: string; state?: StateRingState; badge?: InteractionBadge; about?: string }, glyph: PluginIconName, extra = "") =>
  `<header class="mw-ix-head"><div class="mw-ix-heading"><span class="mw-ix-kicker">${view.state ? renderStateRing({ state: view.state }) : icon(glyph)}<span data-ix-kicker>${esc(view.kicker)}</span></span><h3 id="${esc(`${scope}-title`)}">${esc(view.title)}</h3>${view.about ? `<p class="mw-ix-about" data-ix-about>${esc(view.about)}</p>` : ""}</div>${renderInteractionBadge(view.badge)}${extra}</header>`;
const targetLine = (t: { prefix: string; label: string; version?: string; changed?: boolean }) =>
  `<p class="mw-ix-target">${icon("target")}<span>${esc(t.prefix)}</span><strong>${esc(t.label)}</strong>${t.version ? `<span class="mw-ix-version" data-ix-version${t.changed ? " data-changed" : ""}>${esc(t.version)}</span>` : ""}</p>`;
const evidenceBlock = (evidence: InteractionEvidence | undefined) => evidence?.rows.length
  ? `<details class="mw-ix-evidence" data-ix-evidence><summary>${esc(evidence.label)}</summary><dl>${rows(evidence.rows)}</dl></details>` : "";

/** The questionnaire card. An answered question shows its summary; its form is kept hidden for reopening. */
export function renderInteractionQuestion(view: InteractionQuestionView): string {
  const scope = view.id;
  const banner = view.banner ? `<div class="mw-ix-banner" data-ix-banner data-tone="${view.banner.tone}"><p data-ix-banner-text>${esc(view.banner.text)}</p>${actionRow(view.banner.actions, "")}</div>` : "";
  const form = `<form class="mw-ix-form" novalidate data-ix-form${view.answered ? " hidden" : ""}>${view.intro ? `<p class="mw-ix-intro">${esc(view.intro)}</p>` : ""}
    <fieldset class="mw-ix-fields" data-ix-fields><legend class="mw-sr-only">${esc(view.title)}</legend>${view.fields.map(field => renderInteractionField(scope, field, view.optionalLabel, view.clearLabel)).join("")}</fieldset>
    <footer class="mw-ix-foot"><p class="mw-ix-note" data-ix-note role="status"${view.footer.error ? ' data-tone="error"' : ""}>${esc(view.footer.note)}</p>${view.footer.keys ? `<kbd class="mw-ix-keys">${esc(view.footer.keys)}</kbd>` : ""}${actionRow(view.footer.actions, "")}</footer></form>`;
  const answered = view.answered ? `<div class="mw-ix-answered" data-ix-answered><dl data-ix-summary>${rows(view.answered.rows)}</dl>${actionRow(view.answered.actions, "")}</div>` : "";
  return `<article class="mw-ix-card mw-ix-question" data-ix-question="${esc(scope)}" aria-labelledby="${esc(`${scope}-title`)}">${heading(scope, view, "question", view.collapse ? renderInteractionAction({ variant: "ghost", iconOnly: true, icon: "chevron-up", ...view.collapse }) : "")}${view.target ? targetLine(view.target) : ""}${banner}${form}${answered}${evidenceBlock(view.evidence)}</article>`;
}
/** The operation card: target and version first, then exactly the parameters that would run, its status and result. */
export function renderInteractionOperation(view: InteractionOperationView): string {
  const scope = view.id;
  const target = targetLine(view.target);
  const preview = view.preview ? `<section class="mw-ix-preview" data-ix-preview tabindex="-1" aria-labelledby="${esc(`${scope}-preview`)}"><h4 id="${esc(`${scope}-preview`)}">${esc(view.preview.title)}</h4><dl data-ix-summary>${rows(view.preview.rows)}</dl>${
    view.preview.note ? `<p class="mw-ix-hint" data-ix-preview-note>${esc(view.preview.note)}</p>` : ""}${actionRow(view.preview.actions, "data-ix-preview-actions", true)}</section>` : "";
  const status = view.status ? `<p class="mw-ix-status" data-ix-status role="status"${view.status.tone ? ` data-tone="${view.status.tone}"` : ""}>${view.status.busy ? '<span class="mw-spinner" aria-hidden="true"></span>' : ""}${esc(view.status.text)}</p>` : "";
  const result = view.result ? `<section class="mw-ix-result" data-ix-result tabindex="-1" aria-labelledby="${esc(`${scope}-result`)}"><span class="mw-ix-result__mark">${renderStateRing({ state: "done" })}</span><div class="mw-ix-result__body"><h4 id="${esc(`${scope}-result`)}">${esc(view.result.title)}</h4><p>${esc(view.result.body)}</p>${
    actionRow(view.result.actions, "")}${view.result.details ? `<div class="mw-ix-result__details" data-ix-result-details><h5>${esc(view.result.details.title)}</h5><p data-ix-result-text>${esc(view.result.details.body)}</p></div>` : ""}</div></section>` : "";
  return `<article class="mw-ix-card mw-ix-operation" data-ix-operation="${esc(scope)}" tabindex="-1" aria-labelledby="${esc(`${scope}-title`)}">${heading(scope, view, "zap")}${target}${
    view.impact ? `<p class="mw-ix-impact">${icon("info")}<span>${esc(view.impact)}</span></p>` : ""}${view.fields?.length ? `<div class="mw-ix-fields" data-ix-fields>${view.fields.map(field => renderInteractionField(scope, field, view.optionalLabel, view.clearLabel)).join("")}</div>` : ""}${actionRow(view.actions, "data-ix-actions")}${preview}${status}${actionRow(view.recovery, "data-ix-recovery")}${result}${evidenceBlock(view.evidence)}</article>`;
}
/** Next steps beside a composer: at most one primary and one secondary; a busy step shows its progress. */
export function renderInteractionNextSteps(steps: InteractionNextStep[], label = "下一步", options?: InteractionNextStepsOptions): string {
  const max = options?.max;
  // Without a limit: one primary and one secondary, as beside a composer with a single next step.
  const shown = max === undefined ? [...steps.filter(step => step.primary !== false).slice(0, 1), ...steps.filter(step => step.primary === false).slice(0, 1)] : steps.slice(0, Math.max(0, max));
  const rest = max === undefined ? 0 : steps.length - shown.length;
  const more = rest > 0 && options?.more ? `<button type="button" class="mw-ix-step mw-ix-steps__more" data-ix-steps-more="${rest}" data-secondary>${esc(options.more(rest))}</button>` : "";
  return `<div class="mw-ix-steps" data-ix-steps data-overflow-fade role="group" aria-label="${esc(label)}">${shown.map((step, index) => `<button type="button" class="mw-ix-step" data-ix-step="${index}" data-ix-step-id="${esc(step.id)}" title="${esc(step.source)}"${
    step.primary === false ? " data-secondary" : ""}${step.waiting ? " data-waiting" : ""}${step.busy ? ' data-busy aria-busy="true"' : ""}${step.disabled || step.busy ? " disabled" : ""}><span class="mw-ix-step__glyph" aria-hidden="true">${icon("arrow")}</span><span class="mw-spinner mw-ix-step__spin" aria-hidden="true"></span>${
    step.waiting && step.waitingLabel ? `<span class="mw-sr-only">${esc(step.waitingLabel)}</span>` : ""}<span data-ix-step-label>${esc(step.label)}</span></button>`).join("")}${more}</div>`;
}
/** The mark inside a composer saying where its words go while a question waits. */
export function renderInteractionComposerTarget(label: string): string {
  return `<span class="mw-ix-into" data-ix-into>${icon("note")}${esc(label)}</span>`;
}
