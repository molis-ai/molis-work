import type { ActionAudience, ActionDefinition, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { CharacterDraft, CharacterState } from "@molis-ai/molis-work-contracts/modules/characters";

const text = { type: "string" };
const id = { type: "string", minLength: 1, maxLength: 200 };
const revision = { type: "integer", minimum: 1 };
const reference = { type: "object", properties: { artifact_id: id, version: { type: "integer", minimum: 1 } }, required: ["artifact_id", "version"], additionalProperties: false };
const exact = { type: "object", properties: { capability_id: id, version: { type: "integer", minimum: 1 }, provider_id: id }, required: ["capability_id", "version", "provider_id"] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
/** Local files and processes on this computer: imports read Agent configuration folders, launch starts a native Agent. */
const LOCAL: readonly ActionAudience[] = ["user"];
const SHARED: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
const draft = { type: "object", required: ["character_id", "revision", "state", "title"] };
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[] = SHARED): ActionDefinition<I, O> {
  return { capability_id: `characters.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "project", audiences, permissions, subject_kinds: ["character"], input_schema: input, output_schema: output } };
}

export interface CharacterUpdateInput { id: string; expected_revision: number; title?: string; instructions?: string; host_tools?: string[] | null; action_tools?: unknown[] | null }
/** Owner-bound: drafts and publications belong to the person who wrote them; the Runtime instance redeems each action. */
export const charactersActions = {
  list: define<Record<string, never>, { drafts: unknown[]; publications: unknown[] }>("list", "角色列表", "读取本人的角色草稿和本项目已发布的固定版本",
    "query", object({}), object({ drafts: { type: "array" }, publications: { type: "array" } }), ["artifact:read"]),
  actions: define<Record<string, never>, { actions: unknown[] }>("actions.catalog", "角色可选能力", "读取可交给内置 Agent 的授权能力目录，用于角色的能力范围",
    "query", object({}), object({ actions: { type: "array" } }), ["artifact:read"]),
  create: define<Record<string, never>, { draft: CharacterDraft }>("create", "新建角色", "新建一份本人的角色草稿", "command", object({}), object({ draft }), []),
  update: define<CharacterUpdateInput, { draft: CharacterDraft }>("update", "修改角色草稿", "按读取时的修订号保存标题、做事方式与工具范围；过期修改被拒绝",
    "command", object({ id, expected_revision: revision, title: text, instructions: text, host_tools: { anyOf: [{ type: "array", items: text }, { type: "null" }] },
      action_tools: { anyOf: [{ type: "array", items: exact }, { type: "null" }] } }, ["id", "expected_revision"]), object({ draft }), []),
  state: define<{ id: string; expected_revision: number; state: CharacterState }, { draft: CharacterDraft }>("state", "启用或停用角色",
    "启用、停用或删除角色；启用前核对所选能力仍可用", "command", object({ id, expected_revision: revision, state: { enum: ["active", "disabled", "tombstoned"] } }), object({ draft }), []),
  publish: define<{ id: string; expected_revision: number }, { reference: ArtifactReference; publication: unknown; replayed: boolean }>("publish", "发布角色",
    "把当前草稿发布为本项目的固定版本；内容未变时返回原版本", "command", object({ id, expected_revision: revision }),
    object({ reference, publication: { type: "object" }, replayed: { type: "boolean" } }), ["artifact:read", "artifact:write"]),
  runs: define<{ id: string }, { runs: unknown[] }>("runs", "角色运行记录", "读取用本机 Agent 运行此角色的记录", "query", object({ id }), object({ runs: { type: "array" } }), [], LOCAL),
  discover: define<Record<string, unknown>, { candidates: unknown[] }>("imports.discover", "查找可导入的 Agent", "在本机 Agent 配置目录中查找可导入为角色的设定",
    "query", { type: "object" }, object({ candidates: { type: "array" } }), [], LOCAL),
  importFile: define<Record<string, unknown>, unknown>("imports.file", "预览导入文件", "预览一个可导入设定中的文件", "query",
    { type: "object", required: ["candidate_id"] }, { type: "object" }, [], LOCAL),
  import: define<Record<string, unknown>, { draft: unknown; replayed: boolean }>("imports.import", "导入为角色", "把本机 Agent 设定导入为新草稿或更新已有草稿",
    "command", { type: "object", required: ["candidate_id", "selection"] }, { type: "object", required: ["draft", "replayed"] }, [], LOCAL),
  draftFile: define<Record<string, unknown>, unknown>("drafts.file", "预览草稿来源文件", "预览草稿导入快照中的文件", "query", { type: "object", required: ["id"] }, { type: "object" }, [], LOCAL),
  publicationFile: define<Record<string, unknown>, unknown>("publications.file", "预览发布来源文件", "预览已发布版本导入快照中的文件", "query",
    { type: "object", required: ["reference"] }, { type: "object" }, ["artifact:read"], LOCAL),
  execution: define<{ reference: ArtifactReference }, unknown>("execution", "角色运行准备", "读取用本机 Agent 运行此发布版本所需的程序与工作目录",
    "query", object({ reference }), { type: "object" }, ["artifact:read"], LOCAL),
  launch: define<Record<string, unknown>, unknown>("launch", "用本机 Agent 运行角色", "在所选工作目录启动本机 Agent 执行任务", "command",
    { type: "object", required: ["reference", "workspace_id", "task", "request_id"] }, { type: "object" }, ["artifact:read"], LOCAL),
};
export const CHARACTERS_ACTIONS: readonly ActionDefinition[] = Object.values(charactersActions);
