import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AddProjectGuidanceInput, AddProjectGuidanceResult, UpdateProjectGuidanceInput, UpdateProjectGuidanceResult,
  ProjectGuidanceView, GoalsCommandApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { goalAction, goalActor } from "./action-contract.js";
import { text, identifier, count, boolean, object, array, enumeration } from "./event-action-schemas.js";

type AddInput = Omit<AddProjectGuidanceInput, "board_id" | "actor_id">;
type UpdateInput = Omit<UpdateProjectGuidanceInput, "board_id" | "actor_id">;
export interface GoalsGuidanceActionPorts {
  commands: Pick<GoalsCommandApi, "addProjectGuidance" | "updateProjectGuidance">;
  read(boardId: string): ProjectGuidanceView;
}
const kind = enumeration(["context", "requirement", "constraint", "convention", "workflow", "quality_bar"]);
const common = { guidance_id: text, board_id: text, revision: count, active: boolean, kind, content: text,
  content_hash: text, source_refs: array(text), confirmation_summary: text, reason: text, created_at: text };
export const projectGuidanceEntrySchema = object({ ...common, position: count, created_by: text, updated_by: text, updated_at: text });
const entry = projectGuidanceEntrySchema;
const revision = object({ ...common, revision_id: text, changed_by: text, change_kind: enumeration(["created", "edited", "deactivated", "restored"]) });
const write = { reason: identifier, confirmation_summary: identifier, user_confirmed: boolean, idempotency_key: identifier };
export const goalsGuidanceActions = {
  guidanceRead: goalAction<Record<string, never>, ProjectGuidanceView>("goals.guidance.read", "读取项目长期说明", "读取已确认的长期说明、停用项、完整修订和当前 Runtime Prompt 前缀", "query",
    object({}), object({ entries: array(entry), inactive_entries: array(entry), revisions: array(revision), virtual_document: text, runtime_prompt_prefix: text })),
  guidanceAdd: goalAction<AddInput, AddProjectGuidanceResult>("goals.guidance.add", "新增项目长期说明", "先向用户展示精确分类和原文，说明长期保存原因并获得明确同意，再保存说明。保留去重及原幂等回执，不创建 Goal 或用户决定", "command",
    object({ ...write, kind, content: identifier, source_refs: array(text) }, [...Object.keys(write), "kind", "content"]),
    object({ entry, created: boolean, observed_event_cursor: count, replayed: boolean })),
  guidanceUpdate: goalAction<UpdateInput, UpdateProjectGuidanceResult>("goals.guidance.update", "修改项目长期说明", "用户明确同意精确变更后编辑、停用或恢复说明，保留修订历史。edit 必须提供 kind 和 content；重试保留原幂等键", "command",
    object({ ...write, guidance_id: identifier, action: enumeration(["edit", "deactivate", "restore"]), kind, content: text, source_refs: array(text) }, [...Object.keys(write), "guidance_id", "action"]),
    object({ entry, revision, observed_event_cursor: count, replayed: boolean })),
} as const;

export function createGoalsGuidanceActionHandlers(ports: GoalsGuidanceActionPorts, boardId: string): ActionHandlerBinding[] {
  return [
    { ...goalsGuidanceActions.guidanceRead, handle: () => ports.read(boardId) },
    { ...goalsGuidanceActions.guidanceAdd, handle: (caller, input) => ports.commands.addProjectGuidance({ ...input as AddInput, board_id: boardId, actor_id: goalActor(caller).actor_id }) },
    { ...goalsGuidanceActions.guidanceUpdate, handle: (caller, input) => ports.commands.updateProjectGuidance({ ...input as UpdateInput, board_id: boardId, actor_id: goalActor(caller).actor_id }) },
  ];
}
