import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalAction, goalActor } from "./action-contract.js";
import { text, identifier, count, boolean, array, object, nullable, enumeration } from "./event-action-schemas.js";
import { importLegacyV3Board, type LegacyV3ImportPorts } from "./board-v3-import.js";
import type { LegacyV3ImportInput, V3ImportReport } from "./board-import-contract.js";
import type { InitializeBoardOutput } from "./board-entry-capabilities.js";

// V3 files may include fields outside the subset that is safely migrated.
const legacyObject = (fields: Record<string, ActionSchema>, required = Object.keys(fields)): ActionSchema =>
  ({ ...object(fields, required), additionalProperties: true });
const strings = array(text);
export const legacyV3ImportSchema = legacyObject({ schema_version: { const: "3.0" }, goal_id: text,
  meta: legacyObject({ title: text, source: legacyObject({ seed: text }) }, ["source"]),
  root_goal: legacyObject({ constraints: strings }),
  goals: array(legacyObject({ id: text, parent: nullable(text), one_liner: text, covers: strings, inputs: strings, outputs: strings })),
  coverage_ledger: array(legacyObject({ id: text, requirement: text, status: enumeration(["now", "later", "out"]), owner_goal: nullable(text),
    reason: nullable(text), entry_condition: nullable(text), revisit_at: nullable(text) }, ["id", "requirement", "status", "owner_goal"])) });
function management<I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> {
  return { ...definition, action: { ...definition.action, audiences: ["user"] } };
}
function requireManagement(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_kind !== "user" || !caller.actor_id.trim()
    || caller.user_action?.source !== "management" || !caller.user_action.conversation_ref.trim() || !caller.user_action.message_ref.trim()) {
    throw new ActionError("goals.management_required", "初始化和旧数据导入仅供可信本地管理入口使用");
  }
}
export const goalsBoardActions = {
  initialize: management(goalAction<{ title: string; idempotency_key: string }, InitializeBoardOutput>("goals.board.initialize", "初始化目标资料库",
    "在当前可信管理上下文中初始化尚不存在的 Board；不创建项目目录绑定，不覆盖已有 Board，重试保留原请求键", "command",
    object({ title: identifier, idempotency_key: identifier }), object({ board_id: text, replayed: boolean, observed_event_cursor: count }))),
  importV3: management(goalAction<{ legacy: LegacyV3ImportInput; idempotency_key: string }, V3ImportReport>("goals.board.import-v3", "导入旧 V3 目标资料",
    "在尚未初始化的当前 Board 中事务导入可安全映射的 V3 结构与覆盖，返回仍需重新形成的语义；拒绝覆盖，不自动重试", "command",
    object({ legacy: legacyV3ImportSchema, idempotency_key: identifier }), object({ board_id: text, migrated: strings, regenerate: strings,
      goal_id_map: { type: "object", additionalProperties: text }, observed_event_cursor: count }))),
} as const;
export function createGoalsBoardActionHandlers(boardId: string, ports: LegacyV3ImportPorts): ActionHandlerBinding[] {
  const protect = (binding: ActionHandlerBinding): ActionHandlerBinding => ({ ...binding,
    availability(caller) { try { requireManagement(caller); return { available: true }; }
      catch (error) { if (error instanceof ActionError) return { available: false, code: error.code, reason: error.message }; throw error; } },
    handle(caller, input) { requireManagement(caller); return binding.handle(caller, input); } });
  return [
    protect({ ...goalsBoardActions.initialize, handle: (caller, input) => ports.initializeBoard({
      ...input as { title: string; idempotency_key: string }, board_id: boardId, actor_id: goalActor(caller).actor_id }) }),
    protect({ ...goalsBoardActions.importV3, handle: (caller, input) => {
      const { legacy, idempotency_key } = input as { legacy: LegacyV3ImportInput; idempotency_key: string };
      return importLegacyV3Board(ports, legacy, { target_board_id: boardId, actor_id: goalActor(caller).actor_id, idempotency_key });
    } }),
  ];
}
