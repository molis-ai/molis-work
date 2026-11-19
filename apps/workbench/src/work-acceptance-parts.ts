import type { AcceptanceCheck, AcceptanceHistoryEntry, AcceptanceRequirementState, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { escapeHtml, icon, renderButton, renderStateRing, t as uiText, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The requirement column and its summary on an event card (specs/proactive-assistant §7.3.1, PWA-144～147; approved specimen
 * docs/design/work-line-32, 「逐项审阅」 and ⑦). Drawn from `acceptance.read@1` as it is: what stands for each requirement is decided
 * by its owner (modules/acceptance), never here. That the work ran, what was verified and what the person accepted are three
 * readings, shown apart; a state is always a ring and words together, never colour alone.
 */
const say = (key: string, values?: Record<string, string | number>) => uiText.text(`workbench.acceptance.${key}`, values);
const ring = (state: StateRingState) => renderStateRing({ state, size: 14 });
const badge = (words: string, tone: "neutral" | "success" | "warning") => `<span class="mw-badge mw-badge--${tone}">${escapeHtml(words)}</span>`;

/** The one word that says how a requirement stands, with its ring. The order is the order a person needs: their own word, then rework, then gaps. */
function standing(item: AcceptanceRequirementState): { ring: StateRingState; badge: string; why: string } {
  const on = item.stands_on ?? "";
  if (item.person === "accepted") return { ring: "done", badge: badge(say(item.carried ? "carried" : "accepted", { version: on }), "success"), why: item.carried ? say("carried-why") : "" };
  if (item.recheck === "returned") return { ring: "running", badge: badge(say("returned"), "warning"), why: item.decision?.note ?? "" };
  if (item.recheck === "requirement_changed") return { ring: "approval", badge: badge(say("requirement-changed"), "warning"), why: say("requirement-changed-why") };
  if (item.stands_on === null) return { ring: "queued", badge: badge(say("not-delivered"), "neutral"), why: "" };
  if (item.gap) return { ring: "approval", badge: badge(say(`gap-${item.gap}`), "warning"), why: say(`gap-${item.gap}-why`, { version: item.check?.checked_version ?? on }) };
  if (item.person === "pending") return { ring: "approval", badge: badge(say(item.carried ? "rechecked-needs-you" : "needs-you", { version: on }), "warning"), why: "" };
  return { ring: "done", badge: badge(say(item.carried ? "carried" : "machine-checked", { version: on }), "success"), why: item.carried ? say("carried-why") : "" };
}

const checkLine = (check: AcceptanceCheck) => `<p class="work-req-note">${escapeHtml(say("check-line", { kind: say(check.kind === "hands_on" ? "hands-on" : "engineering"), method: check.method }))}<span class="work-req-observed">${escapeHtml(check.observed)}</span></p>`;
const evidence = (check: AcceptanceCheck | null) => !check?.evidence.length ? "" : `<div class="work-req-evidence">${check.evidence.map(reference =>
  `<span class="work-req-chip">${icon(reference.kind === "artifact_version" ? "file" : "terminal")}${escapeHtml(reference.kind === "artifact_version" ? say("evidence-artifact", { version: reference.version }) : say("evidence-command"))}</span>`).join("")}</div>`;

// The first requirement entry of an item is what was asked; the later ones are its changes (the history is in time order).
function historyLine(entry: AcceptanceHistoryEntry, _index: number, all: AcceptanceHistoryEntry[]): string {
  const words = entry.type === "requirement" ? say(all.find(one => one.type === "requirement") === entry ? "history-asked" : entry.by_person ? "history-changed-by-you" : "history-changed", { text: entry.statement })
    : entry.type === "delivery" ? say(entry.touched ? "history-delivered" : "history-delivered-untouched", { version: entry.version })
    : entry.type === "check" ? `${entry.checked_version} · ${say(entry.gap ? `gap-${entry.gap}` : entry.verdict === "contradicts" ? "gap-contradicted" : entry.tier === "machine_checked" ? "history-machine" : "gap-self_only")}`
    : `${entry.version} · ${say(entry.decision === "accepted" ? "history-accepted" : "history-returned", { note: entry.note ?? "" })}`;
  return `<li>${escapeHtml(words)}</li>`;
}

export interface RequirementColumnUi { readonly returning: string | null; readonly editing: string | null; readonly busy: boolean; readonly error: string }

function card(item: AcceptanceRequirementState, lead: boolean, ui: RequirementColumnUi): string {
  const at = standing(item), id = escapeHtml(item.id), disabled = ui.busy ? { disabled: "" } : {};
  const open = item.stands_on !== null && item.person !== "accepted" && item.person !== "not_needed" && item.recheck !== "returned";
  const button = (key: string, variant: "primary" | "secondary", attrs: Record<string, string>) => renderButton({ variant, size: "sm", label: say(key), attrs: { ...attrs, ...disabled } });
  const form = (key: string, name: string, value: string) => `<textarea class="work-decision-note" data-acceptance-${name} rows="2" maxlength="${name === "note" ? 2000 : 1000}" aria-label="${escapeHtml(say(key))}" placeholder="${escapeHtml(say(key))}"${ui.busy ? " disabled" : ""}>${escapeHtml(value)}</textarea>`
    + `<div class="work-card-actions">${button(name === "note" ? "send-back" : "save", "primary", { [`data-acceptance-${name}-send`]: "" })}${button("cancel", "secondary", { "data-acceptance-cancel": "" })}</div>`;
  const actions = ui.returning === item.id ? form("return-why", "note", "") : ui.editing === item.id ? form("edit-requirement", "text", item.statement)
    : open ? `<div class="work-card-actions">${button("accept", lead ? "primary" : "secondary", { "data-acceptance-accept": "" })}${button("return", "secondary", { "data-acceptance-return": "" })}</div>` : "";
  const edit = renderButton({ variant: "ghost", size: "sm", icon: "edit", iconOnly: true, label: say("edit-requirement"), attrs: { "data-acceptance-edit": "", ...disabled } });
  const facts = [item.stands_on ? say("checked-version", { version: item.stands_on }) : "", item.part ?? ""].filter(Boolean).join(" · ");
  return `<article class="work-req" data-requirement="${id}" data-requirement-version="${item.version}"${lead ? " data-lead" : ""}>`
    + `<div class="work-req-head">${ring(at.ring)}<strong>${escapeHtml(item.statement)}</strong>${edit}</div>`
    + `<div class="work-req-meta">${at.badge}<span title="${escapeHtml(facts)}">${escapeHtml(facts)}</span></div>`
    + (item.check ? checkLine(item.check) : "") + (item.hands_on ? checkLine(item.hands_on) : "")
    + (at.why ? `<p class="work-req-why">${icon("circle-alert")}<span>${escapeHtml(at.why)}</span></p>` : "")
    + evidence(item.check) + evidence(item.hands_on) + actions
    + `<details class="work-req-history"><summary>${icon("history")}${escapeHtml(say("history", { n: item.history.length }))}</summary><ol>${item.history.map(historyLine).join("")}</ol></details></article>`;
}

/** The three readings in one line: the run, what was verified, what the person accepted of what waits on them. */
export function renderAcceptanceSummary(view: AcceptanceView): string {
  const { counts } = view;
  return `<span>${escapeHtml(say(view.version === null ? "run-not-delivered" : "run-delivered"))}</span><span data-tone="${counts.verified === counts.total ? "ok" : "open"}">${escapeHtml(say("verified-n", { n: counts.verified, total: counts.total }))}</span>`
    + `<span data-tone="${counts.accepted === counts.needs_person ? "ok" : "open"}">${escapeHtml(say("accepted-n", { n: counts.accepted, total: counts.needs_person }))}</span>`;
}

/** On an event card: the summary and the way into the column. Nothing when the object has no requirements. */
export function renderAcceptanceOverview(view: AcceptanceView, key: string): string {
  if (!view.requirements.length) return "";
  const ref = view.review_reference ? ` data-review-reference="${escapeHtml(view.review_reference.id)}" data-review-version="${escapeHtml(view.review_reference.version)}"` : "";
  return `<section class="work-accept" data-acceptance-overview="${escapeHtml(key)}"${ref} aria-label="${escapeHtml(say("title"))}"><p class="work-reqs-sum">${renderAcceptanceSummary(view)}</p>`
    + `<div class="work-card-actions">${renderButton({ variant: "secondary", size: "sm", icon: "list", label: say("review-items"), attrs: { "data-acceptance-open": escapeHtml(key) } })}</div></section>`;
}

/** The column beside the deliverable: one card per requirement, exactly one primary button (the first that waits on the person). */
export function renderRequirementColumn(view: AcceptanceView, ui: RequirementColumnUi): string {
  const lead = view.requirements.find(item => item.stands_on !== null && item.person === "pending" && item.recheck !== "returned")?.id;
  const moved = view.changes ? view.requirements.filter(item => view.changes!.touched.includes(item.id)).map(item => item.part ?? item.statement) : [];
  const ref = view.review_reference ? ` data-review-reference="${escapeHtml(view.review_reference.id)}" data-review-version="${escapeHtml(view.review_reference.version)}"` : "";
  return `<div class="work-reqs-head"${ref}><strong>${escapeHtml(say("title"))}</strong><span>${escapeHtml(view.version === null ? say("not-delivered") : say("checked-version", { version: view.version }))}</span><span class="work-reqs-fill"></span>`
    + renderButton({ variant: "ghost", size: "sm", icon: "x", iconOnly: true, label: say("close"), attrs: { "data-acceptance-close": "" } }) + `</div>`
    + `<p class="work-reqs-sum">${renderAcceptanceSummary(view)}</p>`
    + (ui.error ? `<p class="mw-alert mw-alert--danger" role="alert">${escapeHtml(ui.error)}</p>` : "")
    + `<div class="work-reqs-list"${ui.busy ? ' aria-busy="true"' : ""}>${view.requirements.map(item => card(item, item.id === lead, ui)).join("")}</div>`
    + (view.changes ? `<p class="work-reqs-round"><strong>${escapeHtml(say("round-changes"))}</strong>${escapeHtml(say("round-touched", { n: moved.length, items: moved.join(uiText.text("common.list.separator")) }))}${view.changes.summary ? ` ${escapeHtml(view.changes.summary)}` : ""}</p>` : "");
}
