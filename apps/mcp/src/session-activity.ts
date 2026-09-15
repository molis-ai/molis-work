import type { RuntimeGoalSessionActivity } from "@molis-ai/molis-work-contracts/modules/private-work-context";

type RuntimeSessionLifecycle = {
  actorId: string;
  kind: "status" | "artifact" | "approval";
  label: string;
};

function runtimeSessionLifecycleEvent(name: string): RuntimeSessionLifecycle | null {
  switch (name) {
    case "molis_work_v1_goal_intent_create":
      return { actorId: "molis-work:goal-intent", kind: "status", label: "保存 Goal 意图" };
    case "molis_work_v1_event_configure":
      return { actorId: "molis-work:event-configure", kind: "status", label: "登记 Goal 事件配置" };
    case "molis_work_v1_event_report":
      return { actorId: "molis-work:event-report", kind: "status", label: "上报 Goal 工作事实" };
    case "molis_work_v1_event_note":
      return { actorId: "molis-work:event-note", kind: "status", label: "记录 Goal 笔记" };
    case "molis_work_v1_event_progress":
      return { actorId: "molis-work:event-progress", kind: "status", label: "记录 Goal 进展摘要" };
    case "molis_work_v1_event_concern":
      return { actorId: "molis-work:event-concern", kind: "status", label: "更新 Goal Concern" };
    case "molis_work_v1_event_decision_request":
      return { actorId: "molis-work:event-decision-request", kind: "approval", label: "请求 Goal 决定" };
    case "molis_work_v1_event_cite_decision":
      return { actorId: "molis-work:event-cite-decision", kind: "approval", label: "引用已有 Goal 决定" };
    case "molis_work_v1_event_agree":
      return { actorId: "molis-work:event-agree", kind: "status", label: "补充 Goal 结果约定" };
    case "molis_work_v1_event_close":
      return { actorId: "molis-work:event-close", kind: "status", label: "提交 Goal 收尾" };
    case "molis_work_v1_event_resume":
      return { actorId: "molis-work:event-resume", kind: "status", label: "继续 Goal" };
    default:
      return null;
  }
}

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
  return optionalRecordText(arguments_, "goal_id")
    ?? optionalRecordText(asRecord(arguments_.payload), "goal_id")
    ?? findLifecycleText(result, "goal_id");
}

function lifecycleResultId(result: Record<string, unknown>): string | null {
  for (const key of ["event_id", "run_id", "claim_id", "evidence_id", "review_id"]) {
    const value = findLifecycleText(result, key);
    if (value) return value;
  }
  return null;
}

function lifecycleState(
  arguments_: Record<string, unknown>,
  result: Record<string, unknown>,
): string {
  const payload = asRecord(arguments_.payload);
  const state = optionalRecordText(payload, "state")
    ?? lifecycleNestedText(result, "run", "state")
    ?? lifecycleNestedText(result, "goal", "state")
    ?? optionalRecordText(result, "status");
  return state ? ` · ${state}` : "";
}

/** Extract only the established activity fields after a successful tool call. */
export function mcpRuntimeSessionActivity(name: string, arguments_: Record<string, unknown>, response: string): RuntimeGoalSessionActivity | null {
  const lifecycle = runtimeSessionLifecycleEvent(name);
  if (!lifecycle) return null;
  let result: Record<string, unknown>;
  try { result = JSON.parse(response) as Record<string, unknown>; } catch { return null; }
  const goalId = lifecycleGoalId(arguments_, result);
  if (!goalId) return null;
  const payload = asRecord(arguments_.payload);
  const idempotencyKey = optionalRecordText(payload, "idempotency_key")
    ?? optionalRecordText(arguments_, "idempotency_key")
    ?? lifecycleResultId(result)
    ?? `${goalId}:${lifecycle.label}`;
  return {
    goal_id: goalId,
    actor_id: lifecycle.actorId,
    event: {
      source: "goalboard",
      kind: lifecycle.kind,
      source_id: `${name}:${idempotencyKey}`,
      content: `${lifecycle.label}：${goalId}${lifecycleState(arguments_, result)}`,
      metadata: {
        tool: name,
        goal_id: goalId,
        run_id: optionalRecordText(payload, "run_id") ?? lifecycleNestedText(result, "run", "run_id"),
        state: optionalRecordText(payload, "state") ?? lifecycleNestedText(result, "run", "state"),
      },
    },
  };
}
