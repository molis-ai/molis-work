import type {
  AttentionEntryRecord,
  AttentionReason,
  AttentionStatus,
  AttentionSubjectType,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";

export type InboxUiFilter = "active" | "history";

export type InboxOpenTarget =
  | { readonly kind: "feed"; readonly item_id: string }
  | { readonly kind: "source"; readonly source_id: string }
  | { readonly kind: "goal"; readonly href: string };

export interface InboxSubjectRef {
  readonly available: boolean;
  readonly title: string;
  readonly source_label: string;
  readonly open: InboxOpenTarget | null;
}

export interface InboxUiEntry {
  readonly next_judgment?: JudgmentRecord | null;
  readonly entry_id: string;
  readonly revision: number;
  readonly subject_type: AttentionSubjectType;
  readonly subject_id: string;
  readonly reason: AttentionReason;
  readonly status: AttentionStatus;
  readonly kind_label: string;
  readonly source_label: string;
  readonly title: string;
  readonly reason_label: string;
  readonly relation_label: string;
  readonly next_action: string;
  readonly status_label: string;
  readonly updated_at: string;
  readonly available: boolean;
  readonly open: InboxOpenTarget | null;
  readonly attention_rank: number;
  readonly suggested_behavior_ids: readonly string[];
}

export function isActiveInboxStatus(status: AttentionStatus): boolean {
  return status === "open" || status === "in_progress";
}

export function inboxReasonLabel(
  reason: AttentionReason,
  text: (value: string, values?: Record<string, string | number>) => string,
): string {
  return ({
    manual: text("你手工加入"),
    source_rule: text("来源规则命中"),
    goal_decision: text("Molis Work 等待决定"),
    source_fault: text("来源需要人工恢复"),
    artifact_out_failed: text("出 Artifact 失败"),
  } as const)[reason];
}

export function inboxStatusLabel(
  status: AttentionStatus,
  text: (value: string, values?: Record<string, string | number>) => string,
): string {
  return ({
    open: text("待处理"),
    in_progress: text("处理中"),
    done: text("已完成"),
    dismissed: text("已忽略"),
  } as const)[status];
}

export function inboxKindLabel(
  subjectType: AttentionSubjectType,
  reason: AttentionReason,
  text: (value: string, values?: Record<string, string | number>) => string,
): string {
  if (subjectType === "source_fault") return text("Inbox · 来源故障");
  if (subjectType === "goal_decision") return text("Inbox · Goal 决定");
  if (reason === "artifact_out_failed") return text("Inbox · 出 Artifact 失败");
  return reason === "manual" ? text("Inbox · 手工加入") : text("Inbox · 来源规则");
}

/** A workflow hands content over as a manual entry; say so instead of claiming the person added it. */
function fromWorkflow(entry: AttentionEntryRecord): boolean {
  return entry.reason === "manual" && entry.detail.added_by === "workflow";
}

export type InboxEntryProjectionRecord = AttentionEntryRecord & {
  next_judgment?: JudgmentRecord | null;
  suggested_behavior_ids?: readonly string[];
};

export function buildInboxUiEntries(
  records: readonly InboxEntryProjectionRecord[],
  resolve: (entry: AttentionEntryRecord) => InboxSubjectRef,
  text: (value: string, values?: Record<string, string | number>) => string,
): InboxUiEntry[] {
  return [...records]
    .map((entry) => {
      const subject = resolve(entry);
      const active = isActiveInboxStatus(entry.status);
      return {
        entry_id: entry.entry_id,
        revision: entry.revision,
        subject_type: entry.subject_type,
        subject_id: entry.subject_id,
        reason: entry.reason,
        status: entry.status,
        kind_label: fromWorkflow(entry) ? text("Inbox · 工作流程") : inboxKindLabel(entry.subject_type, entry.reason, text),
        source_label: subject.source_label,
        title: subject.title,
        reason_label: entry.reason === "source_rule" && typeof entry.detail.rule_name === "string"
          ? text(entry.detail.needs_review ? "规则「{rule}」需要人工复核" : "规则「{rule}」筛选进入", { rule: entry.detail.rule_name })
          : fromWorkflow(entry)
            ? text("工作流程交过来")
            : inboxReasonLabel(entry.reason, text),
        relation_label: subject.source_label,
        next_action: nextAction(entry, text),
        status_label: inboxStatusLabel(entry.status, text),
        updated_at: entry.updated_at,
        available: subject.available,
        open: subject.open,
        attention_rank: active
          ? entry.subject_type === "source_fault"
            || entry.subject_type === "goal_decision"
            || entry.reason === "artifact_out_failed"
            ? 3
            : 2
          : 1,
        suggested_behavior_ids: [...(entry.suggested_behavior_ids ?? [])],
        next_judgment: entry.next_judgment,
      };
    })
    .sort((left, right) => right.attention_rank - left.attention_rank || right.updated_at.localeCompare(left.updated_at));
}

function nextAction(
  entry: AttentionEntryRecord,
  text: (value: string, values?: Record<string, string | number>) => string,
): string {
  if (!isActiveInboxStatus(entry.status)) return text("可以重新打开，原对象仍保留。");
  if (entry.subject_type === "source_fault") {
    return typeof entry.detail.user_action === "string" && entry.detail.user_action.trim()
      ? entry.detail.user_action
      : text("检查来源配置、授权或拉取范围后重新同步。");
  }
  if (entry.subject_type === "goal_decision") {
    return text("到 Goals 完成判断，Inbox 不内嵌决定表单。");
  }
  if (entry.reason === "artifact_out_failed") {
    return text("出 Artifact 失败，原消息仍在 Feed。可重试同步或完成这条注意力。");
  }
  return text("查看原消息并处理，或直接完成 / 忽略这条注意力引用。");
}
