import { defineErrorCodes, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingArtifacts, type CodingChangeSet } from "./artifacts.js";
import { codingChangeSetPreview } from "./changeset.js";
import { codingReportPreview } from "./report.js";

/** The refusal of a result that is not a fixed Coding report or change set of this project, or is no longer current. */
export const codingResultErrors = defineErrorCodes("coding", { shelf_material_invalid: "invalid" });

export interface CodingResultDocumentInput { reference: ArtifactReference }
/** One fixed Coding result as text a consumer can copy: the reader adds its own heading, source and fingerprint. */
export interface CodingResultDocument {
  reference: ArtifactReference;
  title: string;
  saved_at: string;
  /** A report's own Markdown, or a change set's files as Markdown (the original review text before and after each write). */
  markdown: string;
}

const reference: ActionSchema = { type: "object", properties: { artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } },
  required: ["artifact_id", "version"], additionalProperties: false };

/**
 * A fixed Coding report or change set as its Markdown, for a plugin that takes a copy of it (Shelf). Coding alone reads its own
 * records and says what they mean; the consumer sees only this document. Open to the plugin audience only, so it is neither an MCP
 * tool nor a step an agent or a workflow can pick.
 */
export const codingResultDocument: ActionDefinition<CodingResultDocumentInput, CodingResultDocument> = {
  capability_id: "coding.results.document", version: 1, operation: "query",
  action: {
    title: "读取 Coding 固定成果的正文", description: "把本项目一份固定的 Coding 执行报告或固定变更转成可复制的 Markdown 正文；已归档、不属于本项目或不是 Coding 固定成果的拒绝；只读",
    kind: "query", scope: "project", audiences: ["plugin"], permissions: ["artifact:read"], subject_kinds: [],
    input_schema: { type: "object", properties: { reference }, required: ["reference"], additionalProperties: false },
    output_schema: { type: "object", properties: { reference, title: { type: "string" }, saved_at: { type: "string" }, markdown: { type: "string" } },
      required: ["reference", "title", "saved_at", "markdown"], additionalProperties: false },
  },
};

/** A Markdown fence long enough that the text inside cannot close it. */
const literal = (value: string) => {
  const fence = "`".repeat(Math.max(3, ...(value.match(/`+/g) ?? []).map(item => item.length + 1)));
  return `${fence}\n${value}\n${fence}`;
};
const DECISIONS = { pending: "待审", approved: "已批准", rejected: "已拒绝", cancelled: "已取消", expired: "已过期" };
const EXECUTIONS = { applied: "已执行", failed: "执行失败", unknown: "执行结果未知", "not-applied": "未执行" };

/** The change set's files, each with the reviewed text before and after it and what became of the write. */
export function codingChangeSetMarkdown(change: CodingChangeSet): string {
  return change.files.map((file, index) => {
    const review = file.review;
    return `## 修改 ${index + 1} · ${file.path}\n\n` + (review
      ? `批准决定：${DECISIONS[review.decision]}；保存时执行状态：${EXECUTIONS[review.execution]}\n原审查：${review.review_id}\n\n修改前${review.before_text === null ? "（文件不存在）" : ""}：\n${literal(review.before_text ?? "")}\n\n修改后：\n${literal(review.after_text)}`
      : `旧版局部差异（不是完整文件）：\n${literal(file.diff)}`);
  }).join("\n\n") + (change.files.length ? "" : "这一轮没有可读取的文本审查；命令及外部操作请查看原回执。");
}

/**
 * The version is read as this plugin's own (the platform refuses another producer's), so an archived one is still found and refused
 * here in Coding's words, as is one of another project or another kind.
 */
export function readCodingResultDocument(context: PluginStartContext, ref: ArtifactReference): CodingResultDocument {
  const artifacts = codingArtifacts(context);
  if (!context.services?.processItems) throw new Error("Coding 需要项目过程项服务");
  const record = artifacts.readOwn(ref) ?? context.services.processItems.readOwn(ref);
  if (!record || record.project_id !== context.project_id || record.lifecycle_state !== "active") throw codingResultErrors.shelf_material_invalid("原成果已归档或不属于当前项目");
  const report = codingReportPreview(record), changes = codingChangeSetPreview(record);
  if (!report && !changes) throw codingResultErrors.shelf_material_invalid("这份成果不是可接收的 Coding 固定报告或固定变更");
  const value = report ?? changes!;
  return { reference: value.reference, title: value.title, saved_at: value.saved_at, markdown: report ? report.body_markdown : codingChangeSetMarkdown(changes!.change) };
}

export const codingResultDocumentHandler = (context: PluginStartContext): ActionHandlerBinding => ({
  capability_id: codingResultDocument.capability_id, version: codingResultDocument.version, execution: "sync",
  handle: (_caller, input) => readCodingResultDocument(context, (input as CodingResultDocumentInput).reference),
});
