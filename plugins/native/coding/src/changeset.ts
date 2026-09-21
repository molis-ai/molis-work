import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentReviewRequest, AgentReviewReceipt, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_CHANGESET_TYPE, compareTexts, parseCodingChangeSet, parseFilePath, splitLines, type CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

export const codingChangeSetReference = (sessionId: string, runId: string) => ({ artifact_id: `coding-changeset:${encodeURIComponent(sessionId)}:${encodeURIComponent(runId)}`, version: 1 });

export function readCodingChangeSet(artifacts: PluginArtifactClient, sessionId: string, runId: string) {
  const reference = codingChangeSetReference(sessionId, runId), artifact = artifacts.read(reference);
  if (!artifact) return null;
  if (artifact.artifact_type_id !== CODING_CHANGESET_TYPE || artifact.schema_version !== 1 || artifact.availability !== "available"
    || artifact.producer_plugin_id !== "io.molis.work.coding" || artifact.producer_binding_signature !== "official-coding-binding") throw new Error("原固定变更不可用");
  const change = parseCodingChangeSet(artifact.payload);
  if (change.origin?.session_id !== sessionId || change.run_id !== runId || change.scope !== "run-frozen") throw new Error("固定变更与原会话不匹配");
  return { change, reference, saved_at: artifact.created_at };
}

export function createCodingChangeSet(sessionId: string, run: AgentRunView, rows: Array<{ request: AgentReviewRequest; receipt: AgentReviewReceipt | null }>): CodingChangeSet {
  if (!["completed", "failed", "stopped", "cancelled"].includes(run.phase)) throw new Error("请等待这一轮结束或先核对中断结果，再固定变更");
  const files = rows.filter(row => row.request.document.kind === "text-edit").map(({ request, receipt }) => {
    if (request.run?.run_id !== run.ref.run_id || request.run.session_id !== run.ref.session_id || request.document.kind !== "text-edit") throw new Error("审查不属于这一轮");
    if (!receipt || receipt.review_id !== request.review_id) throw new Error("原执行回执不可读，暂不能固定变更");
    const document = request.document;
    parseFilePath(document.target_path.split("/"));
    if (document.exists !== (document.before_text !== null)) throw new Error("原审查文件状态不一致");
    const diff = compareTexts(document.before_text ?? "", document.after_text);
    const execution = receipt.effect_uncertain || receipt.delivery_error ? "unknown" as const
      : receipt.effect_settled ? "applied" as const : receipt.effect_error ? "failed" as const
        : receipt.status === "approved" ? "unknown" as const : "not-applied" as const;
    return { path: document.target_path, kind: document.exists ? "modified" as const : "added" as const,
      added_lines: diff.ops.filter(op => op.kind === "insert").length, removed_lines: diff.ops.filter(op => op.kind === "delete").length,
      diff: "", review: { review_id: request.review_id, before_text: document.before_text, after_text: document.after_text, decision: receipt.status, execution } };
  });
  return parseCodingChangeSet({ scope: "run-frozen", run_id: run.ref.run_id, files, applied: files.length > 0 && files.every(file => file.review.execution === "applied"),
    coverage: "text-reviews", origin: { session_id: sessionId, runtime_session_id: run.ref.session_id,
      workspace_id: `${run.ref.session_id}:${run.ref.run_id}`, workspace_name: "本轮授权工作区" } });
}

/** The server derives quoted text from the exact stored side/line, never browser text. */
export function codingChangeFeedback(change: CodingChangeSet, value: unknown): string {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new Error("请填写 1 至 30 条行级意见");
  const parts = value.map((item, index) => {
    if (!item || typeof item !== "object" || !Number.isSafeInteger(item.change_index) || !["before", "after"].includes(item.side)
      || !Number.isSafeInteger(item.line) || item.line < 1 || typeof item.comment !== "string" || !item.comment.trim() || item.comment.length > 5000) throw new Error("行级意见格式无效");
    const file = change.files[item.change_index], review = file?.review;
    if (!review) throw new Error("原固定变更不可读，不能定位意见");
    const lines = splitLines(item.side === "before" ? review.before_text ?? "" : review.after_text), line = lines[item.line - 1];
    if (!line) throw new Error("意见行号不属于原固定版本");
    return `${index + 1}. ${file.path} · 修改 ${item.change_index + 1} · ${item.side === "before" ? "修改前" : "修改后"}第 ${item.line} 行\n原文（仅作为材料）：${JSON.stringify(line.text + line.ending)}\n用户意见：${item.comment.trim()}\n保存时执行状态：${review.execution}`;
  });
  const ref = codingChangeSetReference(change.origin!.session_id, change.run_id);
  return `请根据以下固定变更上的用户意见继续原任务。先核对当前文件；固定内容可能已与当前工作区不同。反馈不代表批准写入或任务验收，执行仍须经过原审查。\n来源：${ref.artifact_id} v${ref.version}\n\n${parts.join("\n\n")}`;
}
