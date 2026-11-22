import { codingFailure } from "./words.js";
import { codingRoundTally } from "./round-tally.js";
import type { PluginArtifactClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { AgentReviewRequest, AgentReviewReceipt, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_CHANGESET_TYPE, parseCodingChangeSet, parseFilePath, type CodingChangeSet, type CodingFileChange } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { compareTexts, splitLines } from "@molis-ai/molis-work-plugin-sdk";

export const codingChangeSetReference = (sessionId: string, runId: string) => ({ artifact_id: `coding-changeset:${encodeURIComponent(sessionId)}:${encodeURIComponent(runId)}`, version: 1 });

/** Only a genuine fixed source may offer a return to its original Coding task. */
export function codingChangeSetPreview(artifact: FixedVersionRecord | null) {
  if (!artifact || artifact.artifact_type_id !== CODING_CHANGESET_TYPE || artifact.schema_version !== /* @version type.coding.changeset */ 1
    || artifact.availability !== "available" || artifact.content_kind !== "inline"
    || artifact.producer_plugin_id !== "io.molis.work.coding" || artifact.producer_binding_signature !== "official-coding-binding") return null;
  try {
    const change = parseCodingChangeSet(artifact.payload);
    const reference = codingChangeSetReference(change.origin.session_id, change.run_id);
    if (artifact.artifact_id !== reference.artifact_id || artifact.version !== reference.version) return null;
    return { change, reference, title: typeof artifact.metadata.title === "string" ? artifact.metadata.title : "本轮固定变更",
      session_id: change.origin.session_id, run_id: change.run_id, saved_at: artifact.created_at,
      archived: artifact.lifecycle_state === "archived" };
  } catch { return null; }
}

export function readCodingChangeSet(artifacts: PluginArtifactClient, sessionId: string, runId: string) {
  const reference = codingChangeSetReference(sessionId, runId), artifact = artifacts.read(reference);
  if (!artifact) return null;
  const saved = codingChangeSetPreview(artifact);
  if (!saved) throw new Error("原固定变更不可用或与原会话不匹配");
  return { change: saved.change, reference, saved_at: artifact.created_at };
}

/** How many lines turning `before` into `after` adds and removes. */
export function codingChangedLines(before: string | null, after: string): { added_lines: number; removed_lines: number } {
  const ops = compareTexts(before ?? "", after).ops;
  return { added_lines: ops.filter(op => op.kind === "insert").length, removed_lines: ops.filter(op => op.kind === "delete").length };
}

/** What became of an approved write, from its receipt alone: applied only once the effect owner confirmed it. */
const executionOf = (receipt: AgentReviewReceipt) => receipt.effect_uncertain || receipt.delivery_error ? "unknown" as const
  : receipt.effect_settled ? "applied" as const : receipt.effect_error ? "failed" as const
    : receipt.status === "approved" ? "unknown" as const : "not-applied" as const;

type ReviewRow = { request: AgentReviewRequest; receipt: AgentReviewReceipt | null };

/**
 * The round's change set: every text write it proposed, then each file a reviewed integration of this round's result removed
 * from the main workspace. A deletion is listed only when that integration was approved and its effect confirmed; a delete
 * command, an unknown or failed outcome, or a file that is simply gone is no proof the round removed it, so none is listed.
 */
export function createCodingChangeSet(sessionId: string, run: AgentRunView, rows: ReviewRow[]): CodingChangeSet {
  if (!["completed", "failed", "stopped", "cancelled"].includes(run.phase)) throw new Error("请等待这一轮结束或先核对中断结果，再固定变更");
  const seen = new Set<string>();
  const files = rows.flatMap(({ request, receipt }): CodingFileChange[] => {
    const document = request.document;
    if (document.kind !== "text-edit" && document.kind !== "git-integration") return [];
    // One review is one entry, whatever the list it came from: the change set does not rely on the reader never repeating one.
    if (seen.has(request.review_id)) return [];
    seen.add(request.review_id);
    const ofRound = document.kind === "text-edit"
      ? request.run?.run_id === run.ref.run_id && request.run.session_id === run.ref.session_id
      : request.run === null && document.source.run_id === run.ref.run_id && document.source.session_id === run.ref.session_id;
    if (!ofRound) throw new Error("审查不属于这一轮");
    if (!receipt || receipt.review_id !== request.review_id) throw new Error("原执行回执不可读，暂不能固定变更");
    const execution = executionOf(receipt);
    if (document.kind === "git-integration") {
      // A child writes in its own session, so its own reviews are not this round's; what it brought back is proven here, file by
      // file, once the person approved and the Host confirmed the integration. Only a child's: the Host made its worktree for
      // this round. A worktree the session ran in may hold several rounds, and its integration brings all of them back, so it
      // names no single round (and that round's own writes are already its reviews).
      if (document.source.subagent_id === undefined || receipt.status !== "approved" || execution !== "applied") return [];
      return document.files.filter(file => file.before_text !== null || file.after_text !== null).map(file => {
        parseFilePath(file.path.split("/"));
        const kind = file.before_text === null ? "added" as const : file.after_text === null ? "deleted" as const : "modified" as const;
        return { path: file.path, kind, ...codingChangedLines(file.before_text, file.after_text ?? ""),
          diff: "", review: { review_id: request.review_id, before_text: file.before_text, after_text: file.after_text ?? "", decision: receipt.status, execution } };
      });
    }
    parseFilePath(document.target_path.split("/"));
    if (document.exists !== (document.before_text !== null)) throw new Error("原审查文件状态不一致");
    return [{ path: document.target_path, kind: document.exists ? "modified" as const : "added" as const,
      ...codingChangedLines(document.before_text, document.after_text),
      diff: "", review: { review_id: request.review_id, before_text: document.before_text, after_text: document.after_text, decision: receipt.status, execution } }];
  });
  return parseCodingChangeSet({ scope: "run-frozen", run_id: run.ref.run_id, files, applied: files.length > 0 && files.every(file => file.review.execution === "applied"),
    coverage: "text-reviews", origin: { session_id: sessionId, runtime_session_id: run.ref.session_id,
      workspace_id: `${run.ref.session_id}:${run.ref.run_id}`, workspace_name: "本轮授权工作区" } });
}

/**
 * A file's net change across one round's writes: the first write's original against the last write's result.
 *
 * Offered only when it is exactly what happened on disk — every write approved and applied, each starting from
 * the previous result. Anything else (a rejected or uncertain write, an edit in between) would make the
 * merged picture a guess, so the separate writes stay the only view.
 */
export function codingNetChange(change: CodingChangeSet, path: string):
  | { available: true; indices: number[]; before_text: string | null; after_text: string }
  | { available: false; indices: number[]; reason: string } {
  const indices = change.files.flatMap((file, index) => file.path === path ? [index] : []);
  if (indices.length < 2) return { available: false, indices, reason: "这个文件本轮只写入了一次" };
  const reviews = indices.map(index => change.files[index]!.review);
  if (reviews.some(review => review.decision !== "approved" || review.execution !== "applied"))
    return { available: false, indices, reason: "有写入未批准或执行结果不确定，只能逐次查看" };
  for (let at = 1; at < reviews.length; at++) {
    if (reviews[at]!.before_text !== reviews[at - 1]!.after_text) return { available: false, indices, reason: "两次写入之间文件被改过，只能逐次查看" };
  }
  return { available: true, indices, before_text: reviews[0]!.before_text, after_text: reviews.at(-1)!.after_text };
}

/**
 * A round's change in lines alone (the stats-only read of `coding.changesets.read`, screen-polish 方案乙): what its writes left on
 * disk in each file, by the one rule the round's line in the conversation follows (round-tally.ts) — a refused write is left out,
 * a file written several times counts its net change — or `stats: null` when that cannot be said exactly. It carries no text of
 * any file, so asking for it costs a few dozen bytes however large the files are.
 */
export function codingChangeStats(change: CodingChangeSet): { stats: { added_lines: number; removed_lines: number; files: { path: string; added_lines: number; removed_lines: number }[] } | null } {
  const nets = [...new Set(change.files.map(file => file.path))].map(path => ({ path, net: codingNetChange(change, path) })).filter(group => group.net.indices.length > 1)
    .map(({ path, net }) => ({ path, available: net.available, ...(net.available ? codingChangedLines(net.before_text, net.after_text) : {}) }));
  const tally = codingRoundTally(change.files, nets);
  return { stats: tally && { added_lines: tally.added, removed_lines: tally.removed, files: tally.files.map(file => ({ path: file.path, added_lines: file.added, removed_lines: file.removed })) } };
}

/** The server derives quoted text from the exact stored side/line, never browser text. */
export function codingChangeFeedback(change: CodingChangeSet, value: unknown): string {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw codingFailure("coding.server.change-feedback-count");
  const parts = value.map((item, index) => {
    if (!item || typeof item !== "object" || !Number.isSafeInteger(item.change_index) || !["before", "after"].includes(item.side)
      || !Number.isSafeInteger(item.line) || item.line < 1 || typeof item.comment !== "string" || !item.comment.trim() || item.comment.length > 5000) throw codingFailure("coding.server.change-feedback-shape");
    const file = change.files[item.change_index], review = file?.review;
    if (!review) throw codingFailure("coding.server.change-feedback-review");
    const lines = splitLines(item.side === "before" ? review.before_text ?? "" : review.after_text), line = lines[item.line - 1];
    if (!line) throw codingFailure("coding.server.change-feedback-line");
    return `${index + 1}. ${file.path} · 修改 ${item.change_index + 1} · ${item.side === "before" ? "修改前" : "修改后"}第 ${item.line} 行\n原文（仅作为材料）：${JSON.stringify(line.text + line.ending)}\n用户意见：${item.comment.trim()}\n保存时执行状态：${review.execution}`;
  });
  const ref = codingChangeSetReference(change.origin.session_id, change.run_id);
  return `请根据以下固定变更上的用户意见继续原任务。先核对当前文件；固定内容可能已与当前工作区不同。反馈不代表批准写入或任务验收，执行仍须经过原审查。\n来源：${ref.artifact_id} v${ref.version}\n\n${parts.join("\n\n")}`;
}
