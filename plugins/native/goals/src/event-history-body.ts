import type { GoalProgressArtifactSource, GoalEventScope, GoalEventSystemPayload, GoalWorkEventRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ExecutionRunRecord } from "@molis-ai/molis-work-contracts/modules/execution";
import type { EvidenceRecord } from "@molis-ai/molis-work-contracts/modules/evidence-verification";
import type { ReviewRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GoalsDecisionEvent } from "./decision-view.js";
import type { GoalsDocumentUiPrimitives } from "./document-ui-model.js";
import { RUN_STATE_LABELS, EVIDENCE_RESULT_LABELS, EVIDENCE_LIFECYCLE_LABELS, EVIDENCE_KIND_LABELS, JOURNAL_TYPE_LABELS, SYSTEM_TYPE_LABELS, reviewVerdictLabel, type GoalHistoryIndexItem } from "./event-history-map.js";

export function renderProgressSource(source: GoalProgressArtifactSource | undefined, escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"]): string {
  if (!source) return "";
  return `<p>${escapeHtml(source.title)} · v${source.version}</p><p><button type="button" class="mw-btn mw-btn--secondary" aria-label="打开固定成果：${escapeHtml(source.title)} · v${source.version}" data-workbench-item-plugin="${escapeHtml(source.origin.plugin_id)}" data-workbench-item-id="${escapeHtml(source.origin.item_id)}" data-workbench-item-title="${escapeHtml(source.title)}">打开固定成果 · v${source.version}</button></p>`;
}

export interface GoalHistoryBodyLookups {
  workEvent?: GoalWorkEventRecord | null;
  run?: ExecutionRunRecord | null;
  evidence?: EvidenceRecord | null;
  review?: ReviewRecord | null;
  journal?: GoalsDecisionEvent | null;
  requirementNames?: Readonly<Record<string, string>>;
}

export function renderHistoryItemBody(
  item: GoalHistoryIndexItem,
  lookups: GoalHistoryBodyLookups,
  primitives: Pick<GoalsDocumentUiPrimitives, "translate" | "escapeHtml">,
): string {
  const { translate: L, escapeHtml } = primitives;
  if (item.source === "event_work" && lookups.workEvent) return renderWorkEventBody(lookups.workEvent, L, escapeHtml, lookups.requirementNames);
  if (item.source === "legacy_run" && lookups.run) return renderLegacyRun(lookups.run, L, escapeHtml);
  if (item.source === "legacy_evidence" && lookups.evidence) return renderLegacyEvidence(lookups.evidence, L, escapeHtml);
  if (item.source === "legacy_review" && lookups.review) return renderLegacyReview(lookups.review, L, escapeHtml);
  if (item.source === "legacy_record" && lookups.journal) return renderJournal(lookups.journal, L, escapeHtml, item.relation);
  return `<article class="event"><h2>${escapeHtml(item.title)}</h2><p class="event-meta">${escapeHtml(item.type_label)} · ${escapeHtml(item.actor_id)}</p><p>${L("原文当前不可读。记录仍保留原 ID 和来源。")}</p></article>`;
}

export function renderWorkEventBody(
  event: GoalWorkEventRecord,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  requirementNames: Readonly<Record<string, string>> = {},
): string {
  const typeName = event.kind === "report"
    ? (event.type?.name || L("工作记录"))
    : event.kind === "configuration"
      ? L("配置")
      : (SYSTEM_TYPE_LABELS[event.payload.operation] ?? L("系统记录"));
  const meta = `${typeName} · ${event.actor_id} · ${formatEventTime(event.received_at)}`;
  if (event.kind === "report") {
    const fields = (event.type?.fields ?? []).map((field) => {
      const value = event.payload[field.field_id];
      const text = value == null || String(value).trim() === "" ? L("未填写") : String(value);
      return `<p><strong>${escapeHtml(field.name)}</strong><br>${escapeHtml(text)}</p>`;
    }).join("");
    const judgments = event.judgments.length
      ? `<div class="proof">${event.judgments.map((item) => {
        const name = requirementNames[item.requirement_id] || item.requirement_id;
        return `<p><button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(event.event_id)}">${escapeHtml(name)}</button>：${escapeHtml(verdictLabel(item.verdict, L))}</p>`;
      }).join("")}</div>`
      : "";
    return `<article class="event"><h2>${escapeHtml(event.title)}</h2><p class="event-meta">${escapeHtml(meta)}</p>${fields}${judgments}</article>`;
  }
  if (event.kind === "configuration") {
    const types = event.payload.types.map((type) => `<li>${escapeHtml(type.name)} v${type.version}<small> · ${escapeHtml(type.type_id)}</small></li>`).join("");
    const adopted = event.payload.adopted_planning.map((item) => `${item.source} · ${item.method_id} v${item.version}`).join("；");
    const extras = event.payload.extra_requirements.map((item) => `<li>${escapeHtml(item.statement)}</li>`).join("");
    return `<article class="event"><h2>${escapeHtml(event.title)}</h2><p class="event-meta">${escapeHtml(meta)}</p>
      <p>${L("配置版本")} ${event.payload.config_version}</p>
      ${adopted ? `<p>${L("采用规划")}：${escapeHtml(adopted)}</p>` : `<p>${L("未采用模板")}</p>`}
      ${types ? `<h3>${L("登记类型")}</h3><ul>${types}</ul>` : ""}
      ${extras ? `<h3>${L("新增完成要求")}</h3><ul>${extras}</ul>` : ""}
    </article>`;
  }
  return renderSystemPayload(event.title, meta, event.payload, L, escapeHtml, requirementNames);
}

function verdictLabel(verdict: string, L: GoalsDocumentUiPrimitives["translate"]): string {
  if (verdict === "supports") return L("报告支持，未独立核对");
  if (verdict === "contradicts") return L("尚未达到");
  return L("仍无法判断");
}

function renderSystemPayload(
  title: string,
  meta: string,
  payload: GoalEventSystemPayload,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  requirementNames: Readonly<Record<string, string>> = {},
): string {
  const heading = `<article class="event"><h2>${escapeHtml(title)}</h2><p class="event-meta">${escapeHtml(meta)}</p>`;
  switch (payload.operation) {
    case "progress_summary":
      return `${heading}${renderProgressSource(payload.source, escapeHtml)}<p>${escapeHtml(payload.summary)}</p>${payload.next_step ? `<p>${L("下一步")}：${escapeHtml(payload.next_step)}</p>` : ""}${payload.next_actor ? `<p>${L("谁来做")}：${escapeHtml(payload.next_actor)}</p>` : ""}</article>`;
    case "concern_opened":
      return `${heading}<p>${escapeHtml(payload.statement)}</p>${renderScope(payload.scope, L, escapeHtml, requirementNames)}${payload.blocks_closure ? `<p>${L("会挡住完成")}</p>` : ""}</article>`;
    case "concern_resolved":
    case "concern_accepted":
    case "concern_overturned":
      return `${heading}<p>${escapeHtml(payload.reason)}</p>${payload.cited_decision_id ? `<p>${L("引用决定")} ${escapeHtml(payload.cited_decision_id)}</p>` : ""}${payload.supporting_event_ids.length ? `<p>${L("依据事件")}：${escapeHtml(payload.supporting_event_ids.join("、"))}</p>` : ""}</article>`;
    case "decision_requested":
      return `${heading}<p>${escapeHtml(payload.question)}</p><ul>${payload.options.map((option) => `<li><strong>${escapeHtml(option.label)}</strong> · ${escapeHtml(option.impact)}</li>`).join("")}</ul>${renderScope(payload.scope, L, escapeHtml, requirementNames)}</article>`;
    case "user_decision": {
      const effects = payload.effects.map((item) => effectLabel(item.kind, L) + (item.action ? `（${item.action}）` : "")).join("、");
      const option = payload.selected_option_id ? `<p>${L("所选选项")} ${escapeHtml(payload.selected_option_id)}</p>` : "";
      return `${heading}<p>${escapeHtml(payload.conclusion)}</p>${option}<p>${L("效果")}：${escapeHtml(effects)}</p>${renderScope(payload.scope, L, escapeHtml, requirementNames)}</article>`;
    }
    case "decision_cited":
      return `${heading}<p>${L("引用决定")} ${escapeHtml(payload.decision_id)}</p>${renderScope(payload.scope, L, escapeHtml, requirementNames)}</article>`;
    case "agreement_set":
      return `${heading}<p>${escapeHtml(payload.outcome)}</p><p>${L("约定版本")} ${payload.version} · ${L("配置版本")} ${payload.config_version}</p></article>`;
    case "closure_submitted": {
      const unmet = payload.unmet_reasons.map((item) => `<li>${escapeHtml(item.message)}</li>`).join("");
      return `${heading}<p>${escapeHtml(payload.kind === "cancel" ? L("取消") : L("完成"))}${payload.result ? ` · ${escapeHtml(payload.result)}` : ""}</p><p>${escapeHtml(payload.reason)}</p>${payload.completion_applied ? `<p>${L("完成已生效")}</p>` : unmet ? `<p>${L("收尾未生效")}</p><ul>${unmet}</ul>` : ""}</article>`;
    }
    case "completion_reopened":
    case "work_resumed":
      return `${heading}<p>${escapeHtml(payload.reason)}</p></article>`;
    case "event_owner_continued":
      return `${heading}<p>${payload.reopened ? L("原完成事实保留，并开启新一轮工作。") : L("普通新写入进入事件服务。")}</p></article>`;
    case "observation_note":
      return `${heading}<p>${escapeHtml(payload.body)}</p></article>`;
    default:
      return `${heading}<p>${L("系统记录")}</p></article>`;
  }
}

function effectLabel(kind: string, L: GoalsDocumentUiPrimitives["translate"]): string {
  if (kind === "accept_requirements") return L("接受要求");
  if (kind === "reject_requirements") return L("拒绝要求");
  if (kind === "accept_concerns") return L("接受 Concern");
  if (kind === "reject_concerns") return L("驳回 Concern");
  if (kind === "authorize_action") return L("授权动作");
  if (kind === "deny_action") return L("拒绝动作");
  return kind;
}

function renderScope(
  scope: GoalEventScope,
  L: GoalsDocumentUiPrimitives["translate"],
  escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"],
  requirementNames: Readonly<Record<string, string>> = {},
): string {
  const requirements = scope.requirement_ids.map((id) => escapeHtml(requirementNames[id] || id)).join("、");
  const events = scope.event_ids.map((id) => `<button type="button" class="mw-btn mw-btn--link" data-locate-event="${escapeHtml(id)}">${L("相关事件")}</button>`).join(" ");
  const parts = [
    requirements ? `${L("要求")} ${requirements}` : "",
    events ? `${L("事件")} ${events}` : "",
    scope.concern_ids.length ? `${L("Concern")} ${escapeHtml(scope.concern_ids.join("、"))}` : "",
    scope.action ? `${L("动作")} ${escapeHtml(scope.action)}` : "",
  ].filter(Boolean);
  return parts.length ? `<p>${L("范围")}：${parts.join(" · ")}</p>` : "";
}

function renderLegacyRun(run: ExecutionRunRecord, L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"]): string {
  const refs = run.output_refs.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<article class="event"><h2>${escapeHtml(L(RUN_STATE_LABELS[run.state]))}</h2><p class="event-meta">${L("推进记录")} · ${escapeHtml(run.actor_id)} · ${escapeHtml(formatEventTime(run.ended_at ?? run.started_at))}</p>
    <p><small>${L("原 Run")} ${escapeHtml(run.run_id)} · ${escapeHtml(run.role)}</small></p>
    ${run.block_reason ? `<p>${escapeHtml(run.block_reason)}</p>` : ""}
    ${refs ? `<h3>${L("产物")}</h3><ul>${refs}</ul>` : ""}
  </article>`;
}

function renderLegacyEvidence(item: EvidenceRecord, L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"]): string {
  const access = item.locator_status === "verified" ? L("可访问") : L("当前不可访问");
  const copy = `<button class="inline-ref" type="button" data-copy-value="${escapeHtml(item.locator)}" title="${L("复制引用")}">${escapeHtml(item.locator)}</button>`;
  const reason = item.locator_validation_reason ? ` · ${escapeHtml(item.locator_validation_reason)}` : "";
  const locator = item.locator_status === "verified"
    ? `<p class="attachment"><a class="inline-ref" href="/api/project-references/${encodeURIComponent(item.locator)}?evidence_id=${encodeURIComponent(item.evidence_id)}" target="_blank" rel="noreferrer" data-project-reference>${escapeHtml(item.locator)}</a>${copy}<small>${escapeHtml(access)}</small></p>`
    : /^https?:\/\//i.test(item.locator)
      ? `<p class="attachment"><a class="inline-ref" href="${escapeHtml(item.locator)}" target="_blank" rel="noreferrer">${escapeHtml(item.locator)}</a>${copy}<small>${escapeHtml(access)}${reason}</small></p>`
      : `<p class="attachment">${copy}<small>${escapeHtml(access)}${reason}</small></p>`;
  return `<article class="event"><h2>${escapeHtml(L(EVIDENCE_KIND_LABELS[item.kind]))} · ${escapeHtml(L(EVIDENCE_RESULT_LABELS[item.result]))}</h2><p class="event-meta">${L("完成依据")} · ${escapeHtml(item.producer_actor_id)} · ${escapeHtml(formatEventTime(item.captured_at))}</p>
    <p><small>${L("原 Evidence")} ${escapeHtml(item.evidence_id)} · ${escapeHtml(L(EVIDENCE_LIFECYCLE_LABELS[item.lifecycle_state]))}</small></p>
    ${locator}
    ${item.digest ? `<p>${escapeHtml(item.digest)}</p>` : ""}
  </article>`;
}

function renderLegacyReview(item: ReviewRecord, L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"]): string {
  return `<article class="event"><h2>${L("检查结论")}：${escapeHtml(reviewVerdictLabel(item.verdict))}</h2><p class="event-meta">${L("检查记录")} · ${escapeHtml(item.actor_id)} · ${escapeHtml(formatEventTime(item.submitted_at))}</p>
    <p><small>${L("原 Review")} ${escapeHtml(item.review_id)}</small></p>
    <p>${escapeHtml(item.reasoning || L("未填写"))}</p>
    ${item.evidence_refs.length ? `<p>${L("关联依据")}：${escapeHtml(item.evidence_refs.join("、"))}</p>` : ""}
  </article>`;
}

function renderJournal(event: GoalsDecisionEvent, L: GoalsDocumentUiPrimitives["translate"], escapeHtml: GoalsDocumentUiPrimitives["escapeHtml"], relationInfo?: GoalHistoryIndexItem["relation"]): string {
  if (relationInfo) {
    const relation = relationInfo;
    const status = relation.removed ? L("已解除") : L("已建立");
    return `<article class="event event-relation"><header><span class="history-state" data-tone="${relation.removed ? "muted" : "positive"}">${relation.removed ? "−" : "+"} ${status}</span><h2>${L("Goal 关系变更")}</h2></header>
      <p class="event-meta">${escapeHtml(event.actor_id)} · ${escapeHtml(formatEventTime(event.at))}</p>
      <div class="history-relation-flow"><button type="button" data-select-goal="${escapeHtml(relation.from_id)}">${escapeHtml(relation.from_title)}</button><span class="history-relation-link">${escapeHtml(L(relation.label))}<span aria-hidden="true">↓</span></span><button type="button" data-select-goal="${escapeHtml(relation.to_id)}">${escapeHtml(relation.to_title)}</button></div>
      ${relation.type === "depends_on" ? `<p class="form-note">${L("上方 Goal 收尾前，需要下方 Goal 先完成。")}</p>` : ""}
      <h3>${L("变更原因")}</h3><p>${escapeHtml(event.reason || L("未补充原因"))}</p>
      <details class="form-disclosure"><summary>${L("查看原始记录标识")}</summary><code>${escapeHtml(event.object_id)}</code></details></article>`;
  }
  const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? event.payload as Record<string, unknown>
    : {};
  const relation = typeof payload.type === "string" && payload.from_goal_id && payload.to_goal_id
    ? L("{from} 与 {to} 的关系：{type}", { from: String(payload.from_goal_id), to: String(payload.to_goal_id), type: String(payload.type) })
    : "";
  const sentence = event.reason?.trim() || relation || L("这条记录保留了当时发生的事。");
  const typeName = JOURNAL_TYPE_LABELS[event.type] ?? L("记录");
  return `<article class="event"><h2>${escapeHtml(sentence)}</h2><p class="event-meta">${escapeHtml(typeName)} · ${escapeHtml(event.actor_id)} · ${escapeHtml(formatEventTime(event.at))}</p>
    <details class="form-disclosure"><summary>${L("查看原始记录标识")}</summary><code>${escapeHtml(event.object_id)}</code></details>
  </article>`;
}

export function formatEventTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
