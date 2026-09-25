import type { ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DIFF_CHANGESET_TYPE, CODING_CHANGESET_TYPE, parseCodingChangeSet, type TextDiff } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { compareSnapshots, compareChangeSet, compareRunChangeSet, emptyDiff, type DiffView } from "./comparison.js";
import { compareTexts } from "./text-diff.js";

const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string" }, version = { type: "integer", minimum: 1 }, count = { type: "integer", minimum: 0 }, boolean = { type: "boolean" };
const reference = object({ artifact_id: { type: "string", minLength: 1 }, version });
const side = object({ workspace_id: text, workspace_name: text, path: text, source_plugin_id: text, content_version: version });
const row = object({ kind: { enum: ["equal", "delete", "insert"] }, before_number: version, after_number: version, text, ending: text }, ["kind", "text", "ending"]);
const view = object({ phase: { enum: ["waiting", "unavailable", "ready"] }, mode: { enum: ["unified", "split"] },
  group: { enum: [null, "snapshots", "change-set", "git-change-set"] }, message: text, recovery: text,
  coarse: boolean, identical: boolean, metadata_changes: { type: "array", items: text }, empty: boolean, created: boolean, removed: boolean,
  mismatch: boolean, partial: boolean, before: side, after: side, rows: { type: "array", items: row },
  files: { type: "array", items: object({ path: text, kind: { enum: ["added", "modified", "deleted"] }, added_lines: count, removed_lines: count }) } },
  ["phase", "mode", "group", "message", "coarse", "identical", "empty", "created", "removed", "mismatch", "partial", "rows", "files"]);
const base = { kind: "query" as const, scope: "project" as const, audiences: ["user", "agent", "workflow", "mcp"] as const, subject_kinds: ["text", "artifact"] };
export interface DiffStateInput { reference?: { artifact_id: string; version: number }; change_index?: number }
export const diffActions = {
  state: { capability_id: "diff.state", version: 1, operation: "query", action: { ...base,
    title: "读取固定差异", description: "读取明确指定的固定成果或当前已选输入组，保留原版本、来源和失效状态，不读取当前磁盘", permissions: ["artifact:read"],
    input_schema: object({ reference, change_index: count }, []), output_schema: object({ view }) } } as ActionDefinition<DiffStateInput, { view: DiffView }>,
  compare: { capability_id: "diff.compare", version: 1, operation: "query", action: { ...base,
    title: "比较两段文本", description: "比较提供的两段文本，保留原行尾；超出计算预算时返回完整删除与新增，不改文件或保存成果", permissions: [],
    input_schema: object({ before: { type: "string", maxLength: 2_000_000 }, after: { type: "string", maxLength: 2_000_000 } }),
    output_schema: object({ identical: boolean, empty: boolean, coarse: boolean,
      ops: { type: "array", items: { oneOf: [
        object({ kind: { const: "equal" }, line: object({ text, ending: text }), before: version, after: version }),
        object({ kind: { const: "delete" }, line: object({ text, ending: text }), before: version }),
        object({ kind: { const: "insert" }, line: object({ text, ending: text }), after: version }),
      ] } } }) } } as ActionDefinition<{ before: string; after: string }, TextDiff>,
};
export const DIFF_ACTIONS = Object.values(diffActions);
export function diffActionHandlers(context: PluginStartContext): ActionHandlerBinding[] {
  return [{ ...diffActions.state, handle: (_caller, input) => ({ view: readState(context, input as DiffStateInput) }) },
    { ...diffActions.compare, handle: (_caller, input) => { const value = input as { before: string; after: string }; return compareTexts(value.before, value.after); } }];
}
function readState(context: PluginStartContext, input: DiffStateInput): DiffView {
  if (input.reference) {
    try {
      const record = context.services?.artifacts.read(input.reference);
      if (!record || ![DIFF_CHANGESET_TYPE, CODING_CHANGESET_TYPE].includes(record.artifact_type_id) || record.schema_version !== 1
        || record.availability !== "available" || record.lifecycle_state !== "active") throw new Error("固定差异不可用");
      if (record.artifact_type_id === CODING_CHANGESET_TYPE) return compareRunChangeSet({ content: parseCodingChangeSet(record.payload),
        source_plugin_id: record.producer_plugin_id, content_version: record.version }, undefined, input.change_index ?? 0);
      return compareChangeSet({ content: record.payload, source_plugin_id: record.producer_plugin_id, content_version: record.version });
    } catch { throw new Error("固定差异不可用，请重新选择原变更"); }
  }
  const inputs = context.services?.inputs;
  if (inputs?.selectedGroup() === "change-set") {
    try {
      const record = inputs.read("changeset");
      if (!record || record.availability !== "available") return emptyDiff("change-set");
      return compareRunChangeSet({ content: parseCodingChangeSet(record.payload), source_plugin_id: record.producer_plugin_id, content_version: record.version });
    } catch { throw new Error("Coding 固定变更当前不可读，请保留原会话后重试"); }
  }
  if (inputs?.selectedGroup() === "git-change-set") {
    try {
      const record = inputs.read("git-changeset");
      if (!record || record.availability !== "available" || record.lifecycle_state !== "active") return emptyDiff("git-change-set");
      return compareChangeSet({ content: record.payload, source_plugin_id: record.producer_plugin_id, content_version: record.version });
    } catch { throw new Error("Git 固定变更当前不可读，请重新选择原变更"); }
  }
  if (inputs?.selectedGroup() !== "snapshots") return emptyDiff("snapshots", "请选择两份文件快照进行对比");
  const records = [inputs.read("before"), inputs.read("after")];
  return compareSnapshots(records.filter(record => record?.availability === "available").map(record => ({
    content: record!.payload, source_plugin_id: record!.producer_plugin_id, content_version: record!.version,
  })));
}
