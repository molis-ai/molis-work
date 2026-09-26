import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction } from "./action-contract.js";
import { text, identifier, object, array, boolean, enumeration, goalStateSchema, goalHistoryPageSchema, eventType } from "./event-action-schemas.js";
import { goalRelationSchema } from "./configuration-actions.js";
import { planningMethodSchema } from "./planning-action-schemas.js";
import { createGoalEventDocumentView, type GoalEventDocumentView, type GoalEventDocumentPorts } from "./event-document-model.js";
import type { GoalsPlanningActionPorts } from "./planning-actions.js";
import type { GoalHistoryQueryPorts } from "./history-query.js";
import { goalRiskSchema } from "./goal-record-schema.js";

const strings = array(text);
const risk = object({ ...goalRiskSchema.properties as Record<string, object>, goal_ids: strings });
export const goalDocumentAction = goalAction<{ goal_id: string }, GoalEventDocumentView>("goals.document.read", "读取目标正文",
  "读取指定目标的当前状态、完整历史首屏及游标、原始说明、关系、风险和可选规划方法；保留归档及回收站历史，不启动工作或变更已采用要求", "query",
  object({ goal_id: identifier }), object({ state: goalStateSchema, timeline: goalHistoryPageSchema,
    description: object({ title: text, outcome: text, why: text, business_logic: text, in_scope: strings, out_of_scope: strings,
      constraints: strings, required_inputs: strings, promised_outputs: strings }),
    relations: array(goalRelationSchema), risks: array(risk), planning_methods: array(planningMethodSchema),
    transfer: object({ available: boolean, kind: enumeration(["resume_cancelled", "reopen_event_completed", null]) }), types: array(eventType) }));

export function createGoalDocumentActionHandler(boardId: string, ports: {
  goal(goalId: string): GoalRecord;
  events: GoalEventDocumentPorts;
  history: GoalHistoryQueryPorts;
  planning: GoalsPlanningActionPorts["planning"];
}): ActionHandlerBinding {
  return { ...goalDocumentAction, handle: (_caller, input) => {
    const { goal_id } = input as { goal_id: string };
    const goal = ports.goal(goal_id);
    const snapshot = ports.history.snapshot();
    const riskIds = new Set(snapshot.goal_risks.filter(link => link.goal_id === goal_id).map(link => link.risk_id));
    return createGoalEventDocumentView({ boardId, goal, ports: ports.events, snapshot,
      relations: snapshot.relations.filter(r => r.from_goal_id === goal_id || r.to_goal_id === goal_id),
      risks: snapshot.risks.filter(r => riskIds.has(r.risk_id)).map(r => ({ ...r,
        goal_ids: snapshot.goal_risks.filter(link => link.risk_id === r.risk_id).map(link => link.goal_id) })),
      events: ports.history.journalEvents(), planning_methods: ports.planning.effectiveMethods(boardId) });
  } };
}
