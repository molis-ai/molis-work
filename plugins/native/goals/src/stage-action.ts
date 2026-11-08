import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalAction } from "./action-contract.js";
import { goalsCollectionAction } from "./collection-action.js";
import { goalDocumentAction } from "./document-action.js";
import type { GoalsDocumentCollectionView, GoalsMembership } from "./document-collection.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import { identifier, object, nullable } from "./contract/goal-actions.js";
import { resolveGoalsPageCollection, type GoalDocumentCollection } from "./document-routes.js";

export interface GoalsStageInput { goal_id?: string; collection?: GoalDocumentCollection }
export interface GoalsStageData {
  collection: GoalsDocumentCollectionView;
  selection: GoalDocumentCollection;
  selected: { goal_id: string; document: GoalEventDocumentView } | null;
}
const stageRead = goalAction<GoalsStageInput, GoalsStageData>("goals.stage.read", /* @version action.goals.stage.read */ 1, "读取目标舞台",
  "读取当前项目的目标集合及所选目标正文、关系和规则；不启动工作或改变目标", "query",
  object({ goal_id: identifier, collection: { type: "string", enum: ["current", "archive", "trash"] } }, []),
  object({ collection: goalsCollectionAction.action.output_schema!, selection: { type: "string", enum: ["current", "archive", "trash"] },
    selected: nullable(object({ goal_id: identifier, document: goalDocumentAction.action.output_schema! })) }));

/** The stage read is for the person opening the page; identity is the existing action context, never request input. */
export const goalsStageAction = { ...stageRead, action: { ...stageRead.action, audiences: ["user" as const] } };

/**
 * Both reads run in the same Goals database window, with the existing collection and document owners. The selection needs only which
 * list each Goal is in, so the selected document is read before the whole collection is projected from the same membership: a document
 * that asks for the person's planning methods asks before that work (the call then runs again with them), not after it.
 */
export function createGoalsStageActionHandler(ports: {
  membership(): GoalsMembership;
  collection(membership: GoalsMembership): GoalsDocumentCollectionView;
  document(goalId: string): GoalEventDocumentView;
}): ActionHandlerBinding {
  return { ...goalsStageAction, handle: (_caller, input) => {
    const { goal_id, collection: requestedCollection } = input as GoalsStageInput;
    const membership = ports.membership();
    const resolved = resolveGoalsPageCollection({ collection: requestedCollection ?? "current", ...(goal_id ? { goal_id } : {}) }, membership);
    const selection = "error" in resolved ? requestedCollection ?? "current" : resolved.route.collection;
    const visible = selection === "archive" ? membership.archived_goals : selection === "trash" ? membership.trashed_goals : membership.goals;
    // An absent selection is still a collection read; the page owner retains its existing missing-Goal response.
    const goalId = goal_id ?? (selection === "current" ? membership.active_goal_id : visible[0]?.goal.goal_id);
    const selected = goalId && visible.some(item => item.goal.goal_id === goalId)
      ? { goal_id: goalId, document: ports.document(goalId) } : null;
    return { collection: ports.collection(membership), selection, selected };
  } };
}
