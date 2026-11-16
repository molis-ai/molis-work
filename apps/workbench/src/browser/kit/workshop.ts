import type { SkillDraft, SkillDraftSummary, SkillTrialCell, SkillTrialConsumer, SkillVersion } from "@molis-ai/molis-work-contracts/services/skills";
import { renderAdoptBar, renderAskRow, renderPlaceholderList, renderReplayGrid, type ReplayCell } from "@molis-ai/molis-work-design-system/capability-pack";
import { compareChange, renderDiff } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { dateArg, icon, renderAlert, renderAttrs, renderBadge, renderCheckbox, renderStatusMark, type AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";
import { fieldsMarkup, type SkillWritingLimits } from "./authoring.js";
import { act, button, esc, readText } from "./common.js";
import { consumersOf, nextUntried, placeholdersOf, replayCalls, replayedNow, type Fields, type Workshop } from "./drafts.js";

// One open draft on the 「能力包」 page, scheme B (docs/design/skill-improvement): the form on the left, trying and comparing on the
// right, the adopt bar under both. Below the workspace's own 860px the two columns become three tabs. The page (writing.ts) holds
// the state; this only draws it.

export const improve = (key: string, values?: Record<string, unknown>) => readText(`workbench.skill-improve.${key}`, values as Record<string, string | number>);
type Choice = { id: string; label: string; selected: boolean; attrs: Record<string, AttrValue> };
/** The board's tabs and toggle group, written here so the page does not load the whole design system for two small parts. */
const tabs = (label: string, className: string, items: readonly Choice[]) => `<div class="mw-tabs ${className}" data-slot="tabs"><div class="mw-tabs__list" role="tablist" aria-label="${esc(label)}">${
  items.map(item => `<button type="button" class="mw-tabs__tab${item.selected ? " is-active" : ""}" role="tab" aria-selected="${item.selected}" id="${esc(item.id)}"${renderAttrs(item.attrs)}>${esc(item.label)}</button>`).join("")}</div></div>`;
const toggles = (label: string, items: readonly Choice[]) => `<div class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${esc(label)}">${
  items.map(item => `<button type="button" class="mw-toggle${item.selected ? " is-current" : ""}" aria-pressed="${item.selected}"${renderAttrs(item.attrs)}>${esc(item.label)}</button>`).join("")}</div>`;
const DIFF_WORDS = { insert: "workbench.settings-web-service.add", delete: "common.control.delete", same: "workbench.kit.diff-same", reveal: "workbench.kit.diff-reveal", identical: "workbench.kit.diff-identical", coarse: "workbench.kit.diff-coarse", partial: "workbench.kit.diff-partial",
  mismatch: "workbench.kit.diff-mismatch", created: "workbench.kit.diff-created", removed: "workbench.kit.diff-removed", comment_before: "workbench.kit.diff-comment-line", comment_after: "workbench.kit.diff-comment-line" };
const SIDE = { workspace_id: "skill", workspace_name: "", path: "SKILL.md", source_plugin_id: "", content_version: 0 };
/** Two texts compared line by line with the platform's comparison. */
export const diffOf = (before: string, after: string) => `<div class="sk-diff">${renderDiff({ view: compareChange(null, { before: SIDE, after: SIDE }, { before, after }), sides: false, fold_context: 3, labels: DIFF_WORDS,
  primitives: { escape: esc, icon: name => icon(name as Parameters<typeof icon>[0]), text: (text, values) => readText(String(text), values as Record<string, string | number>) } })}</div>`;
/** A Skill's fields as one text, so a comparison shows every field that changed, the body last. */
export const textOf = (fields: Pick<Fields, "name" | "description" | "body"> & { when_not_to_use?: string }) =>
  [fields.name, fields.description, fields.when_not_to_use ?? "", "", fields.body].join("\n");

const entryWord = (consumer: SkillTrialConsumer) => improve(consumer === "coding" ? "entry-coding" : "entry-assistant");
const sideWord = (w: Workshop, side: "base" | "draft") => side === "draft" ? improve("col-draft")
  : improve(w.draft.target.kind === "custom" ? "col-source" : "col-current", { v: w.draft.base?.version ?? 0 });
const origin = (draft: SkillDraft) => improve(draft.origin.by === "assistant" ? "from-assistant" : "from-person");

function head(w: Workshop): string {
  const draft = w.draft, title = draft.target.kind === "new" ? (w.fields.name.trim() || improve("title-new")) : improve("title-of", { n: w.name });
  const live = draft.target.kind === "new" ? improve("not-live-new") : draft.target.kind === "custom" ? improve("not-live-copy", { n: w.name }) : improve("not-live", { v: draft.base?.version ?? 0 });
  const based = draft.target.kind === "own" ? renderBadge({ label: improve("based-on", { v: draft.target.base_version }), tone: "neutral" }) : "";
  return `<header class="sk-work__head">${button(readText("workbench.kit.all-kits"), { variant: "ghost", icon: "chevron-left", attrs: act("sk-close") })}
    <div class="sk-work__title"><h3 tabindex="-1" id="sk-title">${esc(title)}</h3>${renderBadge({ label: improve("draft-badge"), tone: "info" })}${based}</div>
    <p class="sk-work__live">${icon("shield")}<span>${esc(live)}</span><span class="kit-dot">·</span><span>${esc(origin(draft))}</span></p></header>`;
}

function askRow(w: Workshop): string {
  const after = w.changed !== undefined ? renderBadge({ label: improve("ask-changed", { n: w.changed }), tone: "info" }) + button(improve("see-change"), { variant: "link", attrs: act("sk-side", "compare") }) : "";
  const failed = w.askFailure ? renderAlert({ title: improve("ask-failed"), body: w.askFailure, tone: "danger", role: "alert" }) : "";
  return renderAskRow({ id: "sk-ask", label: improve("ask-label"), placeholder: improve("ask-placeholder"), value: w.ask, go: button(improve("ask-go"), { attrs: { type: "submit" } }),
    ...(w.asking ? { busy: renderStatusMark({ label: improve("ask-busy"), tone: "progress", state: "running" }) } : {}), ...(after ? { after } : {}),
    attrs: { "data-sk-ask": true }, inputAttrs: { "data-sk-ask-input": true, maxlength: 1000 } }) + failed;
}

function placeholders(w: Workshop): string {
  const found = placeholdersOf(w), source = w.draft.target.kind === "custom" && w.turnOffSource !== undefined ? w.draft.target.source : undefined;
  // A copy with nothing to replace still offers to turn the original off when it is adopted.
  if (!found.length) return source ? `<div class="sk-turn-off">${renderCheckbox({ label: improve("turn-off-source-named", { n: source.name }), checked: w.turnOffSource, attrs: { "data-sk-turn-off": true } })}</div>` : "";
  const left = found.filter(placeholder => !w.replacements[placeholder]).length;
  return renderPlaceholderList({ id: "sk-ph", title: improve("placeholders-title"), lead: improve("placeholders-lead"),
    ...(left ? { badge: renderBadge({ label: improve("placeholders-left", { n: left }), tone: "neutral" }) } : {}),
    rows: found.map(placeholder => ({ placeholder, label: improve("placeholder-name", { p: placeholder }), value: w.replacements[placeholder] ?? "", hint: improve("placeholder-hint"), attrs: { "data-sk-placeholder": placeholder } })),
    ...(source ? { after: renderCheckbox({ label: improve("turn-off-source-named", { n: source.name }), checked: w.turnOffSource, attrs: { "data-sk-turn-off": true } }) } : {}) });
}

function editor(w: Workshop, limits: SkillWritingLimits): string {
  return `<div class="sk-editor" data-au>${askRow(w)}${placeholders(w)}${fieldsMarkup(w.fields, w.errors, limits, Boolean(w.asking || w.adopting))}</div>`;
}

function verdictMark(cell: SkillTrialCell | undefined): string {
  if (!cell) return renderStatusMark({ label: improve("verdict-none"), tone: "quiet", state: "idle" });
  if (cell.verdict === "match") return renderStatusMark({ label: improve("verdict-match"), tone: "done", state: "done" });
  if (cell.verdict === "differs") return renderStatusMark({ label: improve("verdict-differs", { n: Math.max(1, cell.differences.length) }), tone: "attention", state: "verify" });
  return renderStatusMark({ label: improve("verdict-unknown"), tone: "quiet", icon: "question" });
}

function grid(w: Workshop): string {
  const trial = w.draft.trial;
  if (!trial) return "";
  const sides = [...(trial.cells.some(cell => cell.side === "base") ? ["base" as const] : []), "draft" as const];
  const consumers = [...new Set(trial.cells.map(cell => cell.consumer))];
  const known = w.draft.cases.find(item => item.case_id === trial.case_id);
  const stale = replayedNow(w) ? "" : `<p class="sk-note">${icon("refresh")}<span>${esc(improve("replay-stale"))}</span></p>`;
  const rows = consumers.map(consumer => ({ entry: entryWord(consumer), icon: consumer === "coding" ? "code" as const : "message" as const, cells: sides.map((side): ReplayCell => {
    const cell = trial.cells.find(item => item.consumer === consumer && item.side === side);
    return { column: sideWord(w, side), verdict: cell?.verdict ?? "none", mark: verdictMark(cell), differences: cell?.differences ?? [],
      ...(cell ? { action: button(improve("see-result"), { variant: "link", attrs: act("sk-out", `${consumer}:${side}`) }) } : {}) };
  }) }));
  return `<div class="sk-replay" data-sk-replay>${stale}${renderReplayGrid({ label: improve("replay-of", { c: known?.title ?? improve("replay-results") }), columns: sides.map(side => sideWord(w, side)), rows })}</div>`;
}

function caseForm(w: Workshop): string {
  const form = w.caseForm!, errors = w.caseErrors;
  const row = (name: "title" | "task" | "material" | "expected", rows: number, max: number) => {
    const id = `sk-case-${name}`, error = errors[name];
    const common = `id="${id}" data-sk-case="${name}" maxlength="${max}"${error ? ` aria-invalid="true" aria-describedby="${id}-error"` : ""}`;
    return `<div class="mw-field au-field"><label class="mw-field__label" for="${id}">${esc(improve(`case-${name}`))}</label>${rows ? `<textarea class="mw-textarea" data-slot="textarea" rows="${rows}" ${common}>${esc(form[name] ?? "")}</textarea>`
      : `<input class="mw-input" data-slot="input" type="text" autocomplete="off" value="${esc(form[name] ?? "")}" ${common}>`}${error ? `<p class="mw-field__error" id="${id}-error">${esc(error)}</p>` : ""}</div>`;
  };
  return `<form class="sk-case-form" data-sk-case-form>${row("title", 0, 80)}${row("task", 3, 4000)}${row("material", 3, 8000)}${row("expected", 5, 8000)}
    <div class="au-actions">${button(improve("case-save"), { variant: "primary", attrs: { ...act("sk-case-save"), type: "submit" } })}${button(readText("common.control.cancel"), { variant: "ghost", attrs: act("sk-case-cancel") })}</div></form>`;
}

function tryPanel(w: Workshop): string {
  const draft = w.draft, busy = Boolean(w.running || w.adopting);
  const cases = draft.cases.map(known => {
    const current = draft.trial?.case_id === known.case_id && replayedNow(w);
    return `<li class="mw-item sk-case">${icon(current ? "check" : "file")}<div class="sk-case__text"><strong>${esc(known.title)}</strong><small>${esc(improve(known.origin === "conversation" ? "case-from-conversation" : "case-from-person"))}</small><small class="sk-case__task">${esc(known.task)}</small></div>
      <span class="mw-item__end">${w.running === known.case_id ? renderStatusMark({ label: improve("replaying"), tone: "progress", state: "running" })
        : button(improve(current ? "replay-again" : "replay"), { variant: current ? "ghost" : "primary", icon: "play", attrs: act("sk-run", known.case_id), disabled: busy })}${
        button(improve("case-edit"), { variant: "ghost", attrs: act("sk-case-edit", known.case_id), disabled: busy })}${button(readText("common.control.delete"), { variant: "ghost", attrs: act("sk-case-remove", known.case_id), disabled: busy })}</span></li>`;
  }).join("");
  const list = cases ? `<ul class="mw-items sk-cases">${cases}</ul>` : `<p class="kit-inline-empty">${esc(improve("cases-none"))}</p>`;
  const add = w.caseForm ? caseForm(w) : draft.cases.length < 5 ? `<div class="au-actions">${button(improve("case-add"), { icon: "plus", attrs: act("sk-case-add"), disabled: busy })}</div>` : "";
  const failed = w.runFailure ? renderAlert({ title: improve("replay-failed"), body: `${w.runFailure} ${improve("keep-draft")}`, tone: "warning", role: "alert",
    actions: [{ label: improve("model-settings"), variant: "secondary", size: "sm", attrs: act("sk-models") }] }) : "";
  const cost = draft.cases.length ? `<p class="sk-note">${icon("info")}<span>${esc(improve("replay-cost", { n: replayCalls(w) }))}</span></p>` : "";
  return `<div class="sk-try"><p class="sk-lead">${icon("shield")}<span>${esc(improve("try-lead"))}</span></p>
    <section class="kit-sec"><h4>${esc(improve("cases"))}</h4>${list}${add}</section>${failed}${cost}${grid(w)}</div>`;
}

function comparePanel(w: Workshop): string {
  const pick = toggles(improve("compare-pick"), (["how", "out"] as const).map(value => ({ id: `sk-compare-${value}`, label: improve(`compare-${value}`), selected: w.compare === value, attrs: act("sk-compare", value) })));
  const draft = w.draft;
  if (w.compare === "out") {
    const trial = draft.trial, chosen = w.out ?? { consumer: consumersOf(w.fields)[0]!, side: "draft" as const };
    const cell = trial?.cells.find(item => item.consumer === chosen.consumer && item.side === chosen.side), known = trial && draft.cases.find(item => item.case_id === trial.case_id);
    if (!cell || !known) return `<div class="sk-compare">${pick}<p class="sk-note">${icon("info")}<span>${esc(improve("compare-out-none"))}</span></p></div>`;
    return `<div class="sk-compare">${pick}<p class="sk-what">${esc(improve("compare-out-what", { who: `${sideWord(w, chosen.side)} · ${entryWord(chosen.consumer)}` }))}</p>${diffOf(cell.output, known.expected)}</div>`;
  }
  if (!draft.base) return `<div class="sk-compare">${pick}<p class="sk-note">${icon("info")}<span>${esc(improve("compare-new"))}</span></p></div>`;
  return `<div class="sk-compare">${pick}<p class="sk-what">${esc(improve(draft.target.kind === "custom" ? "compare-source-draft" : "compare-base-draft", { v: draft.base.version }))}</p>${
    diffOf(textOf({ ...draft.base.fields, when_not_to_use: draft.base.fields.when_not_to_use ?? "" }), textOf(w.fields))}</div>`;
}

/** The adopt bar: its state sentence is updated in place while typing (`statusOf`), the whole bar only when what it offers changes. */
export function statusOf(w: Workshop): { text: string; state?: "owed" | "saving" | "failed" } {
  if (w.save === "saving") return { text: improve("saving"), state: "saving" };
  if (w.save === "failed") return { text: improve("save-failed", { m: w.saveFailure ?? "" }), state: "failed" };
  if (owed(w)) return { text: improve("not-replayed"), state: "owed" };
  return { text: improve("saved-at", { at: w.savedAt ? dateArg(w.savedAt, "time") : "" }) };
}
/** Adopting needs a replay of this revision first: the draft has known answers and none was replayed since the last change. */
export const owed = (w: Workshop) => nextUntried(w) !== undefined;

export function adoptBar(w: Workshop): string {
  const status = statusOf(w), busy = Boolean(w.adopting || w.asking || w.running), label = w.next ? improve("adopt-version", { v: w.next }) : improve("adopt-new");
  const primary = owed(w) ? button(improve("replay-first"), { variant: "primary", icon: "play", attrs: act("sk-run", nextUntried(w)!), disabled: busy || w.save !== "saved" })
    : button(label, { variant: w.confirm ? "secondary" : "primary", icon: "check", attrs: act("sk-adopt"), disabled: busy || w.save !== "saved" });
  const failed = w.adoptFailure ? renderAlert({ title: improve("adopt-failed"), body: `${w.adoptFailure} ${improve("keep-draft")}`, tone: "danger", role: "alert", className: "au-failure", attrs: { tabindex: -1 },
    actions: [{ label: readText("common.control.retry"), variant: "secondary", size: "sm", attrs: act("sk-adopt") }] }) : "";
  const differs = (draft: SkillDraft) => draft.trial?.cells.filter(cell => cell.side === "draft" && cell.verdict === "differs").reduce((sum, cell) => sum + Math.max(1, cell.differences.length), 0) ?? 0;
  return `<div class="sk-work__bar" data-sk-bar>${failed}${renderAdoptBar({ primary, actions: button(improve("discard"), { variant: "ghost", attrs: act("sk-discard"), disabled: busy }), status: status.text,
    ...(status.state ? { state: status.state } : {}),
    ...(w.confirm ? { confirm: { id: "sk-confirm", text: improve("confirm-differs", { n: Math.max(1, differs(w.draft)) }),
      actions: button(improve("go-back"), { variant: "ghost", attrs: act("sk-confirm-back") }) + button(improve("adopt-anyway"), { variant: "primary", attrs: act("sk-adopt-anyway") }) } } : {}) })}</div>`;
}

/** The side column (trying and comparing), drawn again on its own when a replay or a case changes. */
export function sideMarkup(w: Workshop): string {
  const side = tabs(improve("side-label"), "sk-side-tabs", (["try", "compare"] as const).map(value => ({ id: `sk-side-${value}`, label: improve(`tab-${value}`), selected: w.side === value, attrs: act("sk-side", value) })));
  return `${side}<div class="sk-panel" role="tabpanel" aria-labelledby="sk-side-${w.side}">${w.side === "try" ? tryPanel(w) : comparePanel(w)}</div>`;
}

export function workshopMarkup(w: Workshop, limits: SkillWritingLimits): string {
  const narrow = tabs(improve("work-label"), "sk-narrow-tabs", (["edit", "try", "compare"] as const).map(tab => ({ id: `sk-tab-${tab}`, label: improve(`tab-${tab}`), selected: w.tab === tab, attrs: act("sk-tab", tab) })));
  return `<div class="sk-work" data-sk-work data-tab="${w.tab}">${head(w)}${narrow}<div class="sk-work__cols"><div class="sk-col sk-col--edit">${editor(w, limits)}</div>
    <aside class="sk-col sk-col--side" data-sk-side aria-label="${esc(improve("side-label"))}">${sideMarkup(w)}</aside></div>${adoptBar(w)}</div>`;
}

/** New Skills not adopted yet, above the list: each opens its draft. A change to an existing Skill is found at that Skill. */
export function draftsStrip(drafts: readonly SkillDraftSummary[]): string {
  const fresh = drafts.filter(draft => draft.target.kind === "new");
  if (!fresh.length) return "";
  const verdict = (draft: SkillDraftSummary) => draft.verdict === "match" ? renderStatusMark({ label: improve("verdict-match"), tone: "done", state: "done" })
    : draft.verdict === "differs" ? renderStatusMark({ label: improve("verdict-differs-short"), tone: "attention", state: "verify" }) : "";
  return `<section class="kit-sec sk-drafts"><h4>${esc(improve("drafts-title"))}</h4><ul class="mw-items">${fresh.map(draft => `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick" data-kit-act="sk-open" data-kit-v="${esc(draft.draft_id)}"><span class="mw-mark" aria-hidden="true">${icon("sparkles")}</span><span><strong>${
    esc(draft.name.trim() || improve("draft-untitled"))}</strong><small>${esc(improve(draft.origin.by === "assistant" ? "from-assistant" : "from-person"))} · ${esc(improve("updated-at", { at: dateArg(draft.updated_at, "date") }))}</small></span><span class="mw-item__end">${verdict(draft)}${renderBadge({ label: improve("draft-badge"), tone: "info" })}</span></button></li>`).join("")}</ul></section>`;
}

/** In an own Skill's detail: its versions from the signed releases, each but the one in use comparable and restorable. */
export function versionsMarkup(versions: readonly SkillVersion[] | "failed" | undefined, live: number, open?: number): string {
  if (versions === undefined) return `<section class="kit-sec sk-versions" data-sk-versions><h4>${esc(improve("versions"))}</h4><p class="kit-note" role="status">${esc(improve("versions-reading"))}</p></section>`;
  if (versions === "failed") return `<section class="kit-sec sk-versions" data-sk-versions><h4>${esc(improve("versions"))}</h4><p class="kit-inline-empty">${esc(improve("versions-failed"))}${button(readText("common.control.retry"), { variant: "link", attrs: act("sk-versions-retry") })}</p></section>`;
  const current = versions.find(item => item.version === live);
  const rows = [...versions].sort((a, b) => b.version - a.version).map(item => {
    const isLive = item.version === live, when = item.adopted_at ? improve("version-at", { at: dateArg(item.adopted_at, "date") }) : "";
    const acts = isLive ? "" : `${button(improve(open === item.version ? "version-hide" : "version-compare"), { variant: "ghost", attrs: { ...act("sk-version-diff", String(item.version)), "aria-expanded": open === item.version } })}${button(improve("version-restore"), { icon: "undo", attrs: act("sk-version-restore", String(item.version)) })}`;
    const diff = open === item.version && current ? `<div class="sk-version-diff">${diffOf(textOf(fieldsLike(item.fields)), textOf(fieldsLike(current.fields)))}</div>` : "";
    return `<li class="mw-item sk-version"${isLive ? " data-live" : ""}>${icon(isLive ? "check" : "history")}<span class="sk-version__text"><strong>${esc(improve(isLive ? "version-live" : "version", { v: item.version }))}</strong>${when ? `<small>${esc(when)}</small>` : ""}</span><span class="mw-item__end">${acts}</span>${diff}</li>`;
  }).join("");
  return `<section class="kit-sec sk-versions" data-sk-versions><h4>${esc(improve("versions"))}</h4><ul class="mw-items">${rows}</ul></section>`;
}
const fieldsLike = (fields: SkillVersion["fields"]) => ({ ...fields, when_not_to_use: fields.when_not_to_use ?? "" });

/** At the top of a copy's detail when its source has a newer version: the copy stays in use; see, bring in, or leave it. */
export function upstreamMarkup(source: string, version: number, seeing?: string): string {
  return `<div class="sk-upstream">${renderAlert({ title: improve("upstream-title", { n: source, v: version }), body: improve("upstream-body"), tone: "info", role: "status",
    actions: [{ label: improve(seeing === undefined ? "upstream-see" : "upstream-hide"), variant: "secondary", size: "sm", attrs: act("sk-up-see") }, { label: improve("upstream-take"), variant: "secondary", size: "sm", attrs: act("sk-up-take") },
      { label: improve("upstream-later"), variant: "ghost", size: "sm", attrs: act("sk-up-later") }] })}${seeing ?? ""}</div>`;
}

/** At the top of a Skill's detail when a draft of it is open: not in use until adopted. */
export const draftBand = (version: number) => `<p class="sk-band">${icon("sparkles")}<span><strong>${esc(improve("draft-badge"))}</strong> · ${esc(improve("draft-band", { v: version }))}</span></p>`;

