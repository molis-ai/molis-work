import { guidanceKindSchema, projectGuidanceEntrySchema, projectGuidanceRevisionSchema, goalEntryActions } from "./contract/goal-actions.js";
export { projectGuidanceEntrySchema } from "./contract/goal-actions.js";
import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AddProjectGuidanceInput, AddProjectGuidanceResult, UpdateProjectGuidanceInput, UpdateProjectGuidanceResult,
  ProjectGuidanceView, GoalsCommandApi } from "./contract/goals.js";
import { goalAction, goalActor } from "./action-contract.js";
import { text, identifier, count, boolean, object, array, enumeration } from "./contract/goal-actions.js";

type AddInput = Omit<AddProjectGuidanceInput, "project_id" | "actor_id">;
type UpdateInput = Omit<UpdateProjectGuidanceInput, "project_id" | "actor_id">;
export interface GoalsGuidanceActionPorts {
  commands: Pick<GoalsCommandApi, "addProjectGuidance" | "updateProjectGuidance">;
  read(projectId: string): ProjectGuidanceView;
}
const kind = guidanceKindSchema;
const entry = projectGuidanceEntrySchema;
const revision = projectGuidanceRevisionSchema;
const write = { reason: identifier, confirmation_summary: identifier, user_confirmed: boolean, idempotency_key: identifier };
function withGuidanceResult<Input, Output>(definition: ActionDefinition<Input, Output>, summary: string): ActionDefinition<Input, Output> {
  return { ...definition, action: { ...definition.action, result_view: { summary, text_pointer: "/entry/content",
    link: { label: "查看项目说明", href_template: "/projects/{project_id}/settings/guidance" } } } };
}
export const goalsGuidanceActions = {
  guidanceRead: goalEntryActions.guidanceRead,
  guidanceAdd: withGuidanceResult(goalAction<AddInput, AddProjectGuidanceResult>("goals.guidance.add", /* @version action.goals.guidance.add */ 1, "新增项目长期说明", "先向用户展示精确分类和原文，说明长期保存原因并获得明确同意，再保存说明。保留去重及原幂等回执，不创建 Goal 或用户决定", "command",
    object({ ...write, kind, content: identifier, source_refs: array(text) }, [...Object.keys(write), "kind", "content"]),
    object({ entry, created: boolean, observed_event_cursor: count, replayed: boolean })), "项目长期说明已保存"),
  guidanceUpdate: withGuidanceResult(goalAction<UpdateInput, UpdateProjectGuidanceResult>("goals.guidance.update", /* @version action.goals.guidance.update */ 1, "修改项目长期说明", "用户明确同意精确变更后编辑、停用或恢复说明，保留修订历史。edit 必须提供 kind 和 content；重试保留原幂等键", "command",
    object({ ...write, guidance_id: identifier, action: enumeration(["edit", "deactivate", "restore"]), kind, content: text, source_refs: array(text) }, [...Object.keys(write), "guidance_id", "action"]),
    object({ entry, revision, observed_event_cursor: count, replayed: boolean })), "项目长期说明变更已保存"),
} as const;

export function createGoalsGuidanceActionHandlers(ports: GoalsGuidanceActionPorts, projectId: string): ActionHandlerBinding[] {
  return [
    { ...goalsGuidanceActions.guidanceRead, handle: () => ports.read(projectId) },
    { ...goalsGuidanceActions.guidanceAdd, handle: (caller, input) => ports.commands.addProjectGuidance({ ...input as AddInput, project_id: projectId, actor_id: goalActor(caller).actor_id }) },
    { ...goalsGuidanceActions.guidanceUpdate, handle: (caller, input) => ports.commands.updateProjectGuidance({ ...input as UpdateInput, project_id: projectId, actor_id: goalActor(caller).actor_id }) },
  ];
}
