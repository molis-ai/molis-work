import type { RuntimeGoalSessionActivity } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";

type RuntimeSessionLifecycle = {
  actorId: string;
  kind: "status" | "artifact" | "approval";
  label: string;
};

/** Goal writes a Runtime's session records as it works, by the Goals action they went through. */
const SESSION_LIFECYCLE: ReadonlyMap<string, RuntimeSessionLifecycle> = new Map([
  [goalsActions.create.capability_id, { actorId: "molis-work:goal-intent", kind: "status", label: "保存 Goal 意图" }],
  [goalsActions.configure.capability_id, { actorId: "molis-work:event-configure", kind: "status", label: "登记 Goal 事件配置" }],
  [goalsActions.report.capability_id, { actorId: "molis-work:event-report", kind: "status", label: "上报 Goal 工作事实" }],
  [goalsActions.note.capability_id, { actorId: "molis-work:event-note", kind: "status", label: "记录 Goal 笔记" }],
  [goalsActions.progress.capability_id, { actorId: "molis-work:event-progress", kind: "status", label: "记录 Goal 进展摘要" }],
  [goalsActions.concern.capability_id, { actorId: "molis-work:event-concern", kind: "status", label: "更新 Goal Concern" }],
  [goalsActions.requestDecision.capability_id, { actorId: "molis-work:event-decision-request", kind: "approval", label: "请求 Goal 决定" }],
  [goalsActions.citeDecision.capability_id, { actorId: "molis-work:event-cite-decision", kind: "approval", label: "引用已有 Goal 决定" }],
  [goalsActions.agree.capability_id, { actorId: "molis-work:event-agree", kind: "status", label: "补充 Goal 结果约定" }],
  [goalsActions.close.capability_id, { actorId: "molis-work:event-close", kind: "status", label: "提交 Goal 收尾" }],
  [goalsActions.resume.capability_id, { actorId: "molis-work:event-resume", kind: "status", label: "继续 Goal" }],
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalRecordText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function lifecycleNestedText(
  record: Record<string, unknown>,
  parent: string,
  key: string,
): string | null {
  return optionalRecordText(asRecord(record[parent]), key);
}

function findLifecycleText(value: unknown, key: string, depth: number = 0): string | null {
  if (depth > 4 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findLifecycleText(entry, key, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  const direct = optionalRecordText(record, key);
  if (direct) return direct;
  for (const nested of Object.values(record)) {
    const found = findLifecycleText(nested, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function lifecycleGoalId(
  arguments_: Record<string, unknown>,
  result: Record<string, unknown>,
): string | null {
  return optionalRecordText(arguments_, "goal_id") ?? findLifecycleText(result, "goal_id");
}

function lifecycleResultId(result: Record<string, unknown>): string | null {
  return findLifecycleText(result, "event_id");
}

function lifecycleState(result: Record<string, unknown>): string {
  const state = lifecycleNestedText(result, "goal", "state")
    ?? optionalRecordText(result, "work_status")
    ?? optionalRecordText(result, "status");
  return state ? ` · ${state}` : "";
}

/** Extract only the established activity fields after a successful Goals action called under the tool `name`. */
export function mcpRuntimeSessionActivity(capabilityId: string, name: string, arguments_: Record<string, unknown>,
  result: Record<string, unknown>): RuntimeGoalSessionActivity | null {
  const lifecycle = SESSION_LIFECYCLE.get(capabilityId);
  if (!lifecycle) return null;
  const goalId = lifecycleGoalId(arguments_, result);
  if (!goalId) return null;
  const idempotencyKey = optionalRecordText(arguments_, "idempotency_key")
    ?? lifecycleResultId(result)
    ?? `${goalId}:${lifecycle.label}`;
  return {
    goal_id: goalId,
    actor_id: lifecycle.actorId,
    event: {
      source: "molis_work",
      kind: lifecycle.kind,
      source_id: `${name}:${idempotencyKey}`,
      content: `${lifecycle.label}：${goalId}${lifecycleState(result)}`,
      metadata: {
        tool: name,
        goal_id: goalId,
        state: optionalRecordText(result, "work_status"),
      },
    },
  };
}
