import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalProgressArtifactSource, GoalEventScope, GoalEventSystemPayload, GoalWorkEventRecord } from "./contract/goals.js";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { renderAcknowledgementBody, type AcknowledgementContext } from "./event-acknowledgement-body.js";
import { JOURNAL_TYPE_LABELS, SYSTEM_TYPE_LABELS, type GoalHistoryIndexItem } from "./event-history-map.js";

export function renderProgressSource(source: GoalProgressArtifactSource | undefined, escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"]): string {
  if (!source) return "";
  return `<p>${escapeHtml(source.title)} · v${source.version}</p><p><button type="button" class="mw-btn mw-btn--secondary" aria-label="${uiText("goals.event-history-body.open-fixed-artifact")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(source.title)} · v${source.version}" data-workbench-item-plugin="${escapeHtml(source.origin.plugin_id)}" data-workbench-item-id="${escapeHtml(source.origin.item_id)}" data-workbench-item-title="${escapeHtml(source.title)}">${uiText("goals.event-history-body.open-fixed-artifact")} · v${source.version}</button></p>`;
}

interface GoalHistoryBodyLookups {
  workEvent?: GoalWorkEventRecord | null;
  journal?: GoalsDecisionEvent | null;
  requirementNames?: Readonly<Record<string, string>>;
  /** Who wrote the record an acknowledgement answers, so the card can say 「你的」 only for the person's own. */
  acknowledgedActorKind?: AcknowledgementContext["acknowledgedActorKind"];
}

export function renderHistoryItemBody(
  item: GoalHistoryIndexItem,
  lookups: GoalHistoryBodyLookups,
  primitives: Pick<GoalsDocumentUiPrimitives, "translate" | "escapeHtml">,
): string {
  const { translate: readText, escapeHtml } = primitives;
  if (item.source === "event_work" && lookups.workEvent) return renderWorkEventBody(lookups.workEvent, readText, escapeHtml, lookups.requirementNames, lookups.acknowledgedActorKind);
  if (item.source === "journal" && lookups.journal) return renderJournal(lookups.journal, readText, escapeHtml, item.relation);
  return `<article class="event"><h2>${escapeHtml(item.title)}</h2><p class="event-meta">${escapeHtml(item.type_label)} · ${escapeHtml(item.actor_id)}</p><p>${uiText("goals.event-history-body.original-text-currently-unreadable-record-still-keeps-original")}</p></article>`;
}

export function renderWorkEventBody(
  event: GoalWorkEventRecord,
  readText: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  requirementNames: Readonly<Record<string, string>> = {},
  acknowledgedActorKind: AcknowledgementContext["acknowledgedActorKind"] = null,
): string {
  const typeName = event.kind === "report"
    ? (event.type?.name || uiText.text("goals.event-history-body.work-record"))
    : event.kind === "configuration"
      ? uiText.text("goals.event-history-body.config")
      : (SYSTEM_TYPE_LABELS[event.payload.operation] ?? uiText.text("goals.event-history-body.system-record"));
  const meta = `${typeName} · ${event.actor_id} · ${formatEventTime(event.received_at)}`;
  if (event.kind === "report") {
    const fields = (event.type?.fields ?? []).map((field) => {
      const value = event.payload[field.field_id];
      const text = value == null || String(value).trim() === "" ? uiText.text("goals.event-history-body.not-filled") : String(value);
      return `<p><strong>${escapeHtml(field.name)}</strong><br>${escapeHtml(text)}</p>`;
    }).join("");
    const judgments = event.judgments.length
      ? `<div class="proof">${event.judgments.map((item) => {
        const name = requirementNames[item.requirement_id] || item.requirement_id;
        return `<p><button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(event.event_id)}">${escapeHtml(name)}</button>${uiText.text("common.punctuation.label-separator")}${escapeHtml(verdictLabel(item.verdict, readText))}</p>`;
      }).join("")}</div>`
      : "";
    return `<article class="event"><h2>${escapeHtml(event.title)}</h2><p class="event-meta">${escapeHtml(meta)}</p>${fields}${judgments}</article>`;
  }
  if (event.kind === "configuration") {
    const types = event.payload.types.map((type) => `<li>${escapeHtml(type.name)} v${type.version}<small> · ${escapeHtml(type.type_id)}</small></li>`).join("");
    const adopted = event.payload.adopted_planning.map((item) => `${item.source} · ${item.method_id} v${item.version}`).join(uiText.text("common.punctuation.semicolon"));
    const extras = event.payload.extra_requirements.map((item) => `<li>${escapeHtml(item.statement)}</li>`).join("");
    return `<article class="event"><h2>${escapeHtml(event.title)}</h2><p class="event-meta">${escapeHtml(meta)}</p>
      <p>${uiText("goals.event-history-body.configuration-version")} ${event.payload.config_version}</p>
      ${adopted ? `<p>${uiText("goals.event-history-body.adopt-plan")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(adopted)}</p>` : `<p>${uiText("goals.event-history-body.no-template-used")}</p>`}
      ${types ? `<h3>${uiText("goals.event-history-body.register-type")}</h3><ul>${types}</ul>` : ""}
      ${extras ? `<h3>${uiText("goals.event-history-body.new-completion-requirement")}</h3><ul>${extras}</ul>` : ""}
    </article>`;
  }
  return renderSystemPayload(event.title, meta, event.payload, readText, escapeHtml, requirementNames, { actorId: event.actor_id, acknowledgedActorKind });
}

function verdictLabel(verdict: string, _L: GoalsDocumentUiPrimitives["translate"]): string {
  if (verdict === "supports") return uiText.text("goals.event-history-body.report-supports-not-independently-checked");
  if (verdict === "contradicts") return uiText.text("goals.event-history-body.not-yet-met");
  return uiText.text("goals.event-history-body.still-cannot-decide");
}

function renderSystemPayload(
  title: string,
  meta: string,
  payload: GoalEventSystemPayload,
  readText: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  requirementNames: Readonly<Record<string, string>> = {},
  acknowledgement: AcknowledgementContext = { actorId: "", acknowledgedActorKind: null },
): string {
  const heading = `<article class="event"><h2>${escapeHtml(title)}</h2><p class="event-meta">${escapeHtml(meta)}</p>`;
  switch (payload.operation) {
    case "progress_summary":
      return `${heading}${renderProgressSource(payload.source, escapeHtml)}<p>${escapeHtml(payload.summary)}</p>${payload.next_step ? `<p>${uiText("goals.event-history-body.next")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(payload.next_step)}</p>` : ""}${payload.next_actor ? `<p>${uiText("goals.event-history-body.who-will-do")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(payload.next_actor)}</p>` : ""}</article>`;
    case "concern_opened":
      return `${heading}<p>${escapeHtml(payload.statement)}</p>${renderScope(payload.scope, readText, escapeHtml, requirementNames)}${renderCited(payload.cited_subjects ?? [], escapeHtml)}${payload.blocks_closure ? `<p>${uiText("goals.event-history-body.blocks-completion")}</p>` : ""}</article>`;
    case "concern_resolved":
    case "concern_accepted":
    case "concern_overturned":
      return `${heading}<p>${escapeHtml(payload.reason)}</p>${payload.cited_decision_id ? `<p>${uiText("goals.event-history-body.referenced-decision")} ${escapeHtml(payload.cited_decision_id)}</p>` : ""}${payload.supporting_event_ids.length ? `<p>${uiText("goals.event-history-body.based-event")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(payload.supporting_event_ids.join(uiText.text("common.list.separator")))}</p>` : ""}</article>`;
    case "decision_requested":
      return `${heading}<p>${escapeHtml(payload.question)}</p><ul>${payload.options.map((option) => `<li><strong>${escapeHtml(option.label)}</strong> · ${escapeHtml(option.impact)}</li>`).join("")}</ul>${renderScope(payload.scope, readText, escapeHtml, requirementNames)}</article>`;
    case "user_decision": {
      const effects = payload.effects.map((item) => effectLabel(item.kind, readText) + (item.action ? uiText.text("common.punctuation.in-parens", { value: escapeHtml(item.action) }) : "")).join(uiText.text("common.list.separator"));
      const option = payload.selected_option_id ? `<p>${uiText("goals.event-history-body.selected-option")} ${escapeHtml(payload.selected_option_id)}</p>` : "";
      return `${heading}<p>${escapeHtml(payload.conclusion)}</p>${option}<p>${uiText("goals.event-history-body.effect")}${uiText.text("common.punctuation.label-separator")}${escapeHtml(effects)}</p>${renderScope(payload.scope, readText, escapeHtml, requirementNames)}</article>`;
    }
    case "decision_cited":
      return `${heading}<p>${uiText("goals.event-history-body.referenced-decision")} ${escapeHtml(payload.decision_id)}</p>${renderScope(payload.scope, readText, escapeHtml, requirementNames)}</article>`;
    case "agreement_set":
      return `${heading}<p>${escapeHtml(payload.outcome)}</p><p>${uiText("goals.event-history-body.agreement-version")} ${payload.version} · ${uiText("goals.event-history-body.configuration-version")} ${payload.config_version}</p></article>`;
    case "closure_submitted": {
      const unmet = payload.unmet_reasons.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("");
      return `${heading}<p>${escapeHtml(payload.kind === "cancel" ? uiText.text("goals.event-history-body.cancel") : uiText.text("goals.event-history-body.done"))}${payload.result ? ` · ${escapeHtml(payload.result)}` : ""}</p><p>${escapeHtml(payload.reason)}</p>${payload.completion_applied ? `<p>${uiText("goals.event-history-body.completion-effect")}</p>` : unmet ? `<p>${uiText("goals.event-history-body.close-out-did-not-take-effect")}</p><ul>${unmet}</ul>` : ""}</article>`;
    }
    case "completion_reopened":
    case "work_resumed":
      return `${heading}<p>${escapeHtml(payload.reason)}</p></article>`;
    case "event_owner_continued":
      return `${heading}<p>${payload.reopened ? uiText("goals.event-history-body.original-completion-facts-stay-new-round-work-starts") : uiText("goals.event-history-body.ordinary-new-writes-enter-event-service")}</p></article>`;
    case "observation_note":
      return `${heading}<p>${escapeHtml(payload.body)}</p></article>`;
    case "input_acknowledged":
      return renderAcknowledgementBody(heading, payload, acknowledgement, readText, escapeHtml);
    default:
      return `${heading}<p>${uiText("goals.event-history-body.system-record")}</p></article>`;
  }
}

function effectLabel(kind: string, _L: GoalsDocumentUiPrimitives["translate"]): string {
  if (kind === "accept_requirements") return uiText.text("goals.event-history-body.accept-requirement");
  if (kind === "reject_requirements") return uiText.text("goals.event-history-body.reject-requirement");
  if (kind === "accept_concerns") return uiText.text("goals.event-history-body.accept-concern");
  if (kind === "reject_concerns") return uiText.text("goals.event-history-body.reject-concern");
  if (kind === "authorize_action") return uiText.text("goals.event-history-body.authorize-action");
  if (kind === "deny_action") return uiText.text("goals.event-history-body.reject-action");
  return kind;
}

function renderScope(
  scope: GoalEventScope,
  _readText: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  requirementNames: Readonly<Record<string, string>> = {},
): string {
  const requirements = scope.requirement_ids.map((id) => escapeHtml(requirementNames[id] || id)).join(uiText.text("common.list.separator"));
  const events = scope.event_ids.map((id) => `<button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(id)}">${uiText("goals.event-history-body.related-event")}</button>`).join(" ");
  const parts = [
    requirements ? `${uiText.text("goals.event-history-body.requirement")} ${requirements}` : "",
    events ? `${uiText.text("goals.event-history-body.event")} ${events}` : "",
    scope.concern_ids.length ? `${"Concern"} ${escapeHtml(scope.concern_ids.join(uiText.text("common.list.separator")))}` : "",
    scope.action ? `${uiText.text("goals.event-history-body.action")} ${escapeHtml(scope.action)}` : "",
  ].filter(Boolean);
  return parts.length ? `<p>${uiText("goals.event-history-body.scope")}${uiText.text("common.punctuation.label-separator")}${parts.join(" · ")}</p>` : "";
}

function renderJournal(event: GoalsDecisionEvent, _readText: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"], relationInfo?: GoalHistoryIndexItem["relation"]): string {
  if (relationInfo) {
    const relation = relationInfo;
    const status = relation.removed ? uiText.text("goals.event-history-body.removed") : uiText.text("goals.event-history-body.established");
    return `<article class="event event-relation"><header><span class="history-state" data-tone="${relation.removed ? "muted" : "positive"}">${relation.removed ? "−" : "+"} ${status}</span><h2>${uiText("goals.event-history-body.goal-relationship-change")}</h2></header>
      <p class="event-meta">${escapeHtml(event.actor_id)} · ${escapeHtml(formatEventTime(event.at))}</p>
      <div class="history-relation-flow"><button type="button" data-select-goal="${escapeHtml(relation.from_id)}">${escapeHtml(relation.from_title)}</button><span class="history-relation-link">${escapeHtml(relation.label)}<span aria-hidden="true">↓</span></span><button type="button" data-select-goal="${escapeHtml(relation.to_id)}">${escapeHtml(relation.to_title)}</button></div>
      ${relation.type === "depends_on" ? `<p class="form-note">${uiText("goals.event-history-body.goal-above-needs-goal-below-finish-before-can")}</p>` : ""}
      <h3>${uiText("goals.event-history-body.change-reason")}</h3><p>${escapeHtml(event.reason || uiText.text("goals.event-history-body.no-reason-given"))}</p>
      <details class="form-disclosure"><summary>${uiText("goals.event-history-body.show-original-record-identifier")}</summary><code>${escapeHtml(event.object_id)}</code></details></article>`;
  }
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
  const relation = typeof payload.type === "string" && payload.from_goal_id && payload.to_goal_id
    ? uiText.text("goals.event-history-body.relation-between-type", { from: String(payload.from_goal_id), to: String(payload.to_goal_id), type: String(payload.type) })
    : "";
  const sentence = event.reason?.trim() || relation || uiText.text("goals.event-history-body.record-keeps-what-happened-time");
  const typeName = JOURNAL_TYPE_LABELS[event.type] ?? uiText.text("goals.event-history-body.capture");
  return `<article class="event"><h2>${escapeHtml(sentence)}</h2><p class="event-meta">${escapeHtml(typeName)} · ${escapeHtml(event.actor_id)} · ${escapeHtml(formatEventTime(event.at))}</p>
    <details class="form-disclosure"><summary>${uiText("goals.event-history-body.show-original-record-identifier")}</summary><code>${escapeHtml(event.object_id)}</code></details>
  </article>`;
}

export function formatEventTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The objects a concern cites (a risk, say): Goals keeps only kind and id, so each is an 「打开」 that the workbench resolves to the
 * owner's surface (an item side view first, §4.3 of specs/risk-plugin/implementation.md); the owner's label is filled in on the page.
 */
function renderCited(subjects: readonly { kind: string; id: string }[], escapeHtml: (value: string) => string): string {
  if (!subjects.length) return "";
  return `<p class="goal-cited">${uiText("goals.event-history-body.cited")}${uiText.text("common.punctuation.label-separator")}${subjects.map((subject) =>
    `<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-goal-cited data-kind="${escapeHtml(subject.kind)}" data-id="${escapeHtml(subject.id)}"><span data-goal-cited-label>${escapeHtml(subject.kind)}</span> · ${uiText("goals.event-history-body.open-cited")}</button>`).join(" ")}</p>`;
}
