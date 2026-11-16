import { createActionDefinition, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";
import { defineActionUsagesAction, defineSearchEntriesAction, defineSubjectContextAction, type ActionAudience, type ActionDefinition, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineKitReportAction } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { characterArtifactPreviewAction, characterRoleActions, type CharacterDraft, type CharacterState } from "@molis-ai/molis-work-contracts/modules/characters";
import type { CharacterCreateInput, CharacterLaunchInput, CharacterUpdateInput } from "./action-handlers.js";
import type { CharacterNativeRun } from "./runs.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1, maxLength: 200 };
const revision = { type: "integer", minimum: 1 };
const reference = { type: "object", properties: { artifact_id: id, version: { type: "integer", minimum: 1 } }, required: ["artifact_id", "version"], additionalProperties: false };
const exact = { type: "object", properties: { capability_id: id, version: { type: "integer", minimum: 1 }, provider_id: id }, required: ["capability_id", "version", "provider_id"] };
/** Local files and processes on this computer: imports read Agent configuration folders, launch starts a native Agent. */
const LOCAL: readonly ActionAudience[] = ["user"];
const SHARED: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
const draft = { type: "object", required: ["character_id", "revision", "state", "title"] };
/** A native run as Characters records it (`CharacterNativeRun`); the terminal's output is not part of it. */
const run = object({ run_id: id, panel_id: id, title: text, created_at: text, reference, workspace_path: text,
  status: { enum: ["starting", "dispatched", "failed"] }, status_message: { anyOf: [text, { type: "null" }] } });
function define<I, O>(name: string, version: number, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[] = SHARED): ActionDefinition<I, O> {
  return createActionDefinition<I, O>(`characters.${name}`, operation, {
    title, description, audiences, permissions, subject_kinds: ["character"], input_schema: input, output_schema: output,
  }, version);
}

/** Owner-bound: drafts and publications belong to the person who wrote them; the Host's provider redeems each action (action-bindings.ts). */
export const charactersActions = {
  /** A published character as the 成果库 and side panel show it (artifact-positioning A4): Markdown of its instructions and tools. */
  artifactPreview: characterArtifactPreviewAction,
  /** The roles (role-service-design §3), defined in the contracts where the Assistant, Coding and plugins find them. */
  fromTemplate: characterRoleActions.fromTemplate,
  rolesRead: characterRoleActions.read,
  rolesList: characterRoleActions.list,
  resolve: characterRoleActions.resolve,
  versions: characterRoleActions.versions,
  memberAdd: characterRoleActions.memberAdd,
  memberSave: characterRoleActions.memberSave,
  memberSection: characterRoleActions.memberSection,
  memberState: characterRoleActions.memberState,
  restore: characterRoleActions.restore,
  defaults: characterRoleActions.defaults,
  actions: define<Record<string, never>, { actions: unknown[] }>("actions.catalog", /* @version action.characters.actions.catalog */ 1, "角色可选能力", "读取可交给内置 Agent 的授权能力目录，用于角色的能力范围",
    "query", object({}), object({ actions: { type: "array" } }), ["artifact:read"]),
  create: define<CharacterCreateInput, { draft: CharacterDraft; version: number }>("create", /* @version action.characters.create */ 1, "新建角色",
    "按给出的名称、做事方式与工具范围新建我的一个角色，并保存成第 1 版；保存后就能选来做任务", "command",
    object({ title: text, instructions: text, host_tools: { anyOf: [{ type: "array", items: text }, { type: "null" }] }, action_tools: { anyOf: [{ type: "array", items: exact }, { type: "null" }] } },
      ["title", "instructions", "host_tools"]), object({ draft, version: revision }), []),
  update: define<CharacterUpdateInput, { draft: CharacterDraft; version: number }>("update", /* @version action.characters.update */ 1, "保存角色", "按读取时的修订号保存标题、做事方式与工具范围；内容有变就存成下一版，过期修改被拒绝",
    "command", object({ id, expected_revision: revision, title: text, instructions: text, host_tools: { anyOf: [{ type: "array", items: text }, { type: "null" }] },
      action_tools: { anyOf: [{ type: "array", items: exact }, { type: "null" }] } }, ["id", "expected_revision"]), object({ draft, version: revision }), []),
  state: define<{ id: string; expected_revision: number; state: CharacterState }, { draft: CharacterDraft }>("state", /* @version action.characters.state */ 1, "启用或停用角色",
    "启用、停用或删除角色；启用前核对所选能力仍可用", "command", object({ id, expected_revision: revision, state: { enum: ["active", "disabled", "tombstoned"] } }), object({ draft }), []),
  publish: define<{ id: string; expected_revision: number }, { reference: ArtifactReference; publication: unknown; replayed: boolean }>("publish", /* @version action.characters.publish */ 1, "存进成果库",
    "把当前角色存进本项目的成果库，作为可引用的固定成果；选角色做任务不需要这一步。内容未变时返回原版本", "command", object({ id, expected_revision: revision }),
    object({ reference, publication: { type: "object" }, replayed: { type: "boolean" } }), ["artifact:read", "artifact:write"]),
  /** Sessions cleanup SC-2: Characters' own records, without the terminal output. */
  runs: define<{ id: string }, { runs: CharacterNativeRun[] }>("runs", /* @version action.characters.runs */ 1, "角色运行记录", "读取用本机 Agent 运行此角色的记录：何时、哪个版本、在哪个目录、是否派发成功；不含终端输出",
    "query", object({ id }), object({ runs: { type: "array", items: run } }), [], LOCAL),
  discover: define<Record<string, unknown>, { candidates: unknown[] }>("imports.discover", /* @version action.characters.imports.discover */ 1, "查找可导入的 Agent", "在本机 Agent 配置目录中查找可导入为角色的设定",
    "query", { type: "object" }, object({ candidates: { type: "array" } }), [], LOCAL),
  importFile: define<Record<string, unknown>, unknown>("imports.file", /* @version action.characters.imports.file */ 1, "预览导入文件", "预览一个可导入设定中的文件", "query",
    { type: "object", required: ["candidate_id"] }, { type: "object" }, [], LOCAL),
  import: define<Record<string, unknown>, { draft: unknown; replayed: boolean }>("imports.import", /* @version action.characters.imports.import */ 1, "导入为角色", "把本机 Agent 设定导入为新草稿或更新已有草稿",
    "command", { type: "object", required: ["candidate_id", "selection"] }, { type: "object", required: ["draft", "replayed"] }, [], LOCAL),
  draftFile: define<Record<string, unknown>, unknown>("drafts.file", /* @version action.characters.drafts.file */ 1, "预览草稿来源文件", "预览草稿导入快照中的文件", "query", { type: "object", required: ["id"] }, { type: "object" }, [], LOCAL),
  publicationFile: define<Record<string, unknown>, unknown>("publications.file", /* @version action.characters.publications.file */ 1, "预览发布来源文件", "预览已发布版本导入快照中的文件", "query",
    { type: "object", required: ["reference"] }, { type: "object" }, ["artifact:read"], LOCAL),
  execution: define<{ reference: ArtifactReference }, unknown>("execution", /* @version action.characters.execution */ 1, "角色运行准备", "读取用本机 Agent 运行此发布版本所需的程序与工作目录",
    "query", object({ reference }), { type: "object" }, ["artifact:read"], LOCAL),
  /** Where a capability sits in this person's Character scopes; the capability library reads it next to other owners' references. */
  usages: defineActionUsagesAction("characters.usages", /* @version action.characters.usages */ 1, "角色里的使用位置", []),
  /** The person's Characters as AI kit roles, in the 「你的角色」 pack (specs/capability-pack/contract-design.md §4.8). */
  kitReport: defineKitReportAction("characters.kit.report", /* @version action.characters.kit.report */ 1, "角色的能力包条目", [], { scope: "project" }),
  /** Sessions cleanup SC-2: the run is Characters' own record and the terminal is reached by its panel alone, without a Session. */
  launch: define<CharacterLaunchInput, { run: CharacterNativeRun; spawn: { panelId: string; attachOnly: boolean } }>("launch", /* @version action.characters.launch */ 1, "用本机 Agent 运行角色", "在所选工作目录启动本机 Agent 执行任务", "command",
    { type: "object", properties: { reference, workspace_id: { type: "string" }, task: { type: "string" }, request_id: { type: "string" } },
      required: ["reference", "workspace_id", "task", "request_id"] }, object({ run, spawn: object({ panelId: id, attachOnly: { type: "boolean" } }) }), ["artifact:read"], LOCAL),
  /** System search: the person's Characters (not deleted) by title and how they work. */
  searchEntries: defineSearchEntriesAction("characters.search.entries", /* @version action.characters.search.entries */ 1, [{ kind: "character", title: "角色", surface: "characters" }], "角色", []),
  subject: defineSubjectContextAction("characters.subject.read", /* @version action.characters.subject.read */ 1, "character", "角色", []),
};
export const CHARACTERS_ACTIONS: readonly ActionDefinition[] = Object.values(charactersActions);
/** What the person must hold to reach every Characters action (the Host adds them to the local owner's permissions). */
export const CHARACTER_ACTION_PERMISSIONS: readonly string[] = [...new Set(CHARACTERS_ACTIONS.flatMap(definition => definition.action.permissions))];
