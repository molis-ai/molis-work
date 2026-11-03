import { object, identifier, count, boolean, text, enumeration } from "./contract/goal-actions.js";
import type { ActionCallContext, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  goalEventAcknowledgementTreatments,
  type AcknowledgeGoalEventInput,
  type GoalEventAcknowledgementsApi,
  type GoalEventAcknowledgementBy,
  type GoalEventMutationResult,
} from "./contract/goals.js";
import { goalAction as action, goalActor } from "./action-contract.js";

type GoalAcknowledgeActionInput = Omit<AcknowledgeGoalEventInput, "project_id" | "actor_id" | "actor_kind" | "by">;

const acknowledge = action<GoalAcknowledgeActionInput, GoalEventMutationResult>("goals.events.acknowledge", "说明如何处理目标上的笔记、要求或决定",
  "外部 AI 会话读到本人写在目标上的笔记、要求或决定后，说明读到了什么、打算怎么处理；记在目标时间线上。这是 AI 自己的说法，不代表已经照做，也不改变目标的状态、要求或决定。重试须保留相同 idempotency_key", "command",
  object({ goal_id: identifier, event_id: identifier, treatment: enumeration(goalEventAcknowledgementTreatments),
    note: { ...identifier, maxLength: 300 }, read_cursor: { type: "number" }, idempotency_key: identifier }),
  object({ event_id: text, observed_event_cursor: count, replayed: boolean, recorded: { const: true } }));

/** Only the AI sessions that read the Goal may say how they treat it: not a page, a workflow, or an installed plugin (nothing in Goals confirms a plugin's identity). */
export const goalsAcknowledgeActions = {
  acknowledge: { ...acknowledge, action: { ...acknowledge.action, audiences: ["agent", "mcp"], plugin: false } },
} as const;

const RUNTIME_PREFIX = "runtime:";

/** Who said it, from the call alone: the transport, the Runtime that owns the session and the session itself. Nothing here is read from the input. */
function acknowledgementOrigin(caller: ActionCallContext): GoalEventAcknowledgementBy {
  if (caller.audience === "mcp") {
    return { channel: "mcp", runtime_id: caller.actor_id.startsWith(RUNTIME_PREFIX) ? caller.actor_id.slice(RUNTIME_PREFIX.length) : null, session_id: caller.runtime_session_id ?? null };
  }
  if (caller.audit_actor_id?.startsWith("assistant:")) return { channel: "assistant", runtime_id: null, session_id: caller.runtime_session_id ?? null };
  return { channel: "agent", runtime_id: null, session_id: null };
}

export function createGoalsAcknowledgeActionHandlers(acknowledgements: GoalEventAcknowledgementsApi, projectId: string): ActionHandlerBinding[] {
  return [
    { ...goalsAcknowledgeActions.acknowledge, handle: (caller, input) => acknowledgements.acknowledge({
      ...input as GoalAcknowledgeActionInput, project_id: projectId, ...goalActor(caller), by: acknowledgementOrigin(caller) }) },
  ];
}
