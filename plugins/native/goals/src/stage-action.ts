import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalAction } from "./action-contract.js";
import { goalsCollectionAction } from "./collection-action.js";
import { goalDocumentAction, type GoalAcceptanceViews } from "./document-action.js";
import { emptyGoalsDocumentCollection, type GoalsDocumentCollectionView, type GoalsMembership } from "./document-collection.js";
import type { GoalEventDocumentView } from "./event-document-model.js";
import { identifier, object, nullable, array, enumeration } from "./contract/goal-actions.js";
import { GOAL_NOT_FOUND, resolveGoalsPageCollection, type GoalDocumentCollection } from "./document-routes.js";
import { goalAcceptanceStatus, goalPresentationStates, type CaptureGoalPresentationStatus, type GoalPresentationStatus } from "./presentation.js";

export interface GoalsStageInput {
  goal_id?: string;
  collection?: GoalDocumentCollection;
  view?: string;
  projection?: string;
  route_kind?: "refresh" | "momentum" | "document";
}
export interface GoalsStageArtifactContext {
  readonly subject_id: string;
  readonly html?: string;
  readonly outputs?: number;
  readonly inputs?: Array<{ artifact_id: string; version: number; title: string; state: "available" | "unavailable" | "archived" | "missing"; reason: string | null }>;
}
export interface GoalsStageData {
  collection: GoalsDocumentCollectionView;
  presentation_states: Array<{ goal_id: string; status: GoalPresentationStatus }>;
  selection: GoalDocumentCollection;
  selected: { goal_id: string; document: GoalEventDocumentView } | null;
  artifact_subject_id: string | null;
  body_attributes: { readonly "data-board-view": GoalDocumentCollection };
  route_error?: { status: 400 | 404; error: string; code?: string };
  artifact_context?: GoalsStageArtifactContext;
}

const stageRead = goalAction<GoalsStageInput, GoalsStageData>("goals.stage.read", /* @version action.goals.stage.read */ 1, "读取目标舞台",
  "读取当前项目的目标集合及所选目标正文、关系和规则；不启动工作或改变目标", "query",
  object({
    goal_id: { type: "string" },
    collection: { type: "string", enum: ["current", "archive", "trash"] },
    view: { type: "string" },
    projection: { type: "string" },
    route_kind: enumeration(["refresh", "momentum", "document"]),
  }, []),
  object({
    collection: goalsCollectionAction.action.output_schema!,
    selection: { type: "string", enum: ["current", "archive", "trash"] },
    presentation_states: array(object({ goal_id: identifier, status: enumeration(goalPresentationStates) })),
    selected: nullable(object({ goal_id: identifier, document: goalDocumentAction.action.output_schema! })),
    artifact_subject_id: nullable(identifier),
    body_attributes: object({ "data-board-view": { type: "string", enum: ["current", "archive", "trash"] } }),
    route_error: object({ status: { type: "number" }, error: { type: "string" }, code: { type: "string" } }, ["status", "error"]),
  }, ["collection", "selection", "presentation_states", "selected", "artifact_subject_id", "body_attributes"]));

/** The stage read is for the person opening the page; identity is the existing action context, never request input. */
export const goalsStageAction = { ...stageRead, action: { ...stageRead.action, audiences: ["user" as const] } };

function stageError(projectId: string, error: { status: 400 | 404; error: string; code?: string }, selection: GoalDocumentCollection = "current"): GoalsStageData {
  return {
    collection: emptyGoalsDocumentCollection(projectId),
    presentation_states: [],
    selection,
    selected: null,
    artifact_subject_id: null,
    body_attributes: { "data-board-view": selection },
    route_error: error,
  };
}

function isCollection(value: string): value is GoalDocumentCollection {
  return value === "current" || value === "archive" || value === "trash";
}

function visibleList(membership: GoalsMembership, selection: GoalDocumentCollection) {
  return selection === "trash" ? membership.trashed_goals : selection === "archive" ? membership.archived_goals : membership.goals;
}

/**
 * Both reads run in the same Goals database window, with the existing collection and document owners. The selection needs only which
 * list each Goal is in, so the selected document is read before the whole collection is projected from the same membership.
 */
export function createGoalsStageActionHandler(ports: {
  membership(): GoalsMembership;
  collection(membership: GoalsMembership, capturePresentation: CaptureGoalPresentationStatus): GoalsDocumentCollectionView;
  document(goalId: string, acceptance?: GoalAcceptanceViews): GoalEventDocumentView;
}): ActionHandlerBinding {
  return { ...goalsStageAction, handle: (_caller, rawInput, acceptance?: GoalAcceptanceViews) => {
    const input = rawInput as GoalsStageInput;
    const membership = ports.membership();
    const projectId = membership.snapshot.board.project_id;
    let selection: GoalDocumentCollection;
    let goalId: string | undefined;
    let loadDocument = input.projection !== "collection";
    if (input.route_kind === "momentum") {
      const requested = input.view ?? input.collection ?? "current";
      if (requested !== "current" && requested !== "archive") return stageError(projectId, { status: 400, error: "Goal 推进态势集合无效" });
      selection = requested;
      goalId = input.goal_id?.trim() || "";
      if (!goalId || !visibleList(membership, selection).some(item => item.goal.goal_id === goalId)) {
        return stageError(projectId, { status: 404, error: "Goal 推进态势不存在" }, selection);
      }
      loadDocument = false;
    } else if (input.route_kind === "refresh" || input.route_kind === "document") {
      const requested = input.view ?? input.collection ?? "current";
      if (!isCollection(requested)) return stageError(projectId, { status: 400, error: "Goal 正文集合无效" });
      if (input.route_kind === "refresh" && input.projection !== undefined && input.projection !== "collection") {
        return stageError(projectId, { status: 400, error: "Goal 请求参数无效" }, requested);
      }
      selection = requested;
      const visible = visibleList(membership, selection);
      if (input.route_kind === "document") {
        goalId = input.goal_id ?? "";
        if (!goalId || !visible.some(item => item.goal.goal_id === goalId)) {
          return stageError(projectId, { status: 404, error: `找不到这个 Goal: ${goalId}`, code: GOAL_NOT_FOUND }, selection);
        }
      } else {
        goalId = input.goal_id?.trim() || (selection === "current" ? membership.active_goal_id ?? undefined : visible[0]?.goal.goal_id);
      }
    } else {
      const requested = input.collection ?? "current";
      const resolved = resolveGoalsPageCollection({ collection: requested, ...(input.goal_id ? { goal_id: input.goal_id } : {}) }, membership);
      if ("error" in resolved) return stageError(projectId, { status: resolved.status, error: resolved.error }, requested);
      selection = resolved.route.collection;
      const visible = visibleList(membership, selection);
      goalId = input.goal_id ?? (selection === "current" ? membership.active_goal_id ?? undefined : visible[0]?.goal.goal_id);
    }
    const visible = visibleList(membership, selection);
    const selected = loadDocument && goalId && visible.some(item => item.goal.goal_id === goalId)
      ? { goal_id: goalId, document: ports.document(goalId, acceptance) } : null;
    const presentation_states: GoalsStageData["presentation_states"] = [];
    const collection = ports.collection(membership, (id, status) => presentation_states.push({ goal_id: id, status: goalAcceptanceStatus(status, acceptance?.get(id)) }));
    return {
      collection,
      presentation_states,
      selection,
      selected,
      artifact_subject_id: selection !== "trash" ? (selected?.goal_id ?? null) : null,
      body_attributes: { "data-board-view": selection },
    };
  } };
}
