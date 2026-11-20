import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { GoalRecord } from "./contract/goals.js";
import { goalAction } from "./action-contract.js";
import { text, identifier, count, object, array, boolean, enumeration, nullable, goalStateSchema, goalHistoryPageSchema, eventType } from "./contract/goal-actions.js";
import { goalRelationSchema } from "./configuration-actions.js";
import { createGoalEventDocumentView, type GoalEventDocumentView, type GoalEventDocumentPorts } from "./event-document-model.js";
import type { GoalHistoryQueryPorts } from "./history-query.js";

const strings = array(text);
const acceptance = nullable(object({ subject: object({ provider_id: text, subject: object({ kind: text, id: text }) }), round: count, complete: boolean,
  requirements: array(object({ id: text, statement: text, requires_person: boolean, person: enumeration(["accepted", "returned", "pending", "not_needed"]), satisfied: boolean })),
  counts: object({ total: count, verified: count, needs_person: count, accepted: count, satisfied: count }), unhung: strings,
  outcome_changed_after_acceptance: boolean, changed_after_completion: boolean }));
export const goalDocumentAction = goalAction<{ goal_id: string }, GoalEventDocumentView>("goals.document.read", /* @version action.goals.document.read */ 1, "读取目标正文",
  "读取指定目标的当前状态、完整历史首屏及游标、原始说明和关系；保留归档及回收站历史，不启动工作或变更已采用要求", "query",
  object({ goal_id: identifier }), object({ state: goalStateSchema, timeline: goalHistoryPageSchema,
    description: object({ title: text, outcome: text, why: text, business_logic: text, in_scope: strings, out_of_scope: strings,
      constraints: strings, required_inputs: strings, promised_outputs: strings }),
    relations: array(goalRelationSchema),
    transfer: object({ available: boolean, kind: enumeration(["resume_cancelled", "reopen_event_completed", null]) }), types: array(eventType), acceptance }));

interface GoalDocumentPorts {
  goal(goalId: string): GoalRecord;
  events: GoalEventDocumentPorts;
  history: GoalHistoryQueryPorts;
}

/** The platform's acceptance views Goals read before the call's window opened, by Goal (the plugin's wrapper alone supplies them). */
export type GoalAcceptanceViews = ReadonlyMap<string, AcceptanceView>;

export function readGoalDocument(projectId: string, ports: GoalDocumentPorts, goalId: string, acceptanceViews?: GoalAcceptanceViews): GoalEventDocumentView {
    const goal = ports.goal(goalId);
    const snapshot = ports.history.snapshot();
    return createGoalEventDocumentView({ projectId, goal, ports: ports.events, snapshot,
      relations: snapshot.relations.filter(r => r.from_goal_id === goalId || r.to_goal_id === goalId),
      events: ports.history.journalEvents(), acceptance: acceptanceViews?.get(goalId) ?? null });
}

export function createGoalDocumentActionHandler(projectId: string, ports: GoalDocumentPorts): ActionHandlerBinding {
  return { ...goalDocumentAction, handle: (_caller, input, views?: GoalAcceptanceViews) => readGoalDocument(projectId, ports, (input as { goal_id: string }).goal_id, views) };
}
