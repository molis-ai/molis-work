import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { HISTORY_DIGEST_MARKER, HISTORY_DIGEST_TASK_HEAD, originalTask } from "./continuation.js";

/**
 * Carrying a long session forward once its history no longer fits.
 *
 * The runtime replays every earlier round verbatim, tool output included, and refuses to start once that no longer
 * fits the model's window. A digest round starts without the replay: its task opens with the Host's account of each
 * earlier round — what was asked, how it ended, what it concluded and which files it changed — and says plainly that
 * tool output was not carried, so the model rereads a file instead of recalling it. The facts come from the rounds'
 * own records; nothing is summarised by a model and nothing is stored beside them.
 */

export { HISTORY_DIGEST_MARKER, digestTask } from "./continuation.js";
/** Past this share of the window, replaying the session leaves a round too little room for its own work. */
export const HISTORY_DIGEST_RATIO = 0.6;
const LIMIT = 24_000;
const PHASE: Record<string, string> = { completed: "已完成", failed: "出错结束", stopped: "已停止", cancelled: "已取消", "reconcile-required": "中断待核对" };

const clip = (text: string, size: number) => {
  const flat = text.trim();
  return flat.length > size ? flat.slice(0, size) + "…" : flat;
};

function round(run: AgentRunView, number: number, detailed: boolean): string {
  const asked = originalTask(run), answer = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text ?? "";
  const files = [...new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target!))];
  const lines = [`第 ${number} 轮（${PHASE[run.phase] ?? run.phase}）`, `- 要求：${clip(asked, detailed ? 1500 : 300)}`];
  if (answer.trim()) lines.push(`- 结论：${clip(answer, detailed ? 3000 : 600)}`);
  if (files.length) lines.push(`- 改动文件：${files.slice(0, 20).join("、")}${files.length > 20 ? ` 等 ${files.length} 个` : ""}`);
  if (run.phase !== "completed" && run.stop_reason) lines.push(`- 结束原因：${clip(run.stop_reason, 200)}`);
  return lines.join("\n");
}

/** The digest of every earlier round, newest in most detail, fitted to a fixed size by shortening the oldest first. */
export function codingHistoryDigest(runs: readonly AgentRunView[], task: string): string {
  const head = `${HISTORY_DIGEST_MARKER}本会话前 ${runs.length} 轮的记录由宿主根据执行记录整理。工具输出的原文没有带入这一轮：需要文件内容时请重新读取，不要凭记忆。已改动的文件以工作区当前内容为准。`;
  const detailed = new Set(runs.slice(-3));
  let parts = runs.map((run, index) => round(run, index + 1, detailed.has(run)));
  let omitted = 0;
  const size = () => head.length + parts.reduce((sum, part) => sum + part.length + 2, 0);
  // Oldest rounds give way first: shortened to their request, then left out with a count, never silently.
  for (let index = 0; size() > LIMIT && index < parts.length - 3; index++) parts[index] = `第 ${index + 1} 轮（${PHASE[runs[index]!.phase] ?? runs[index]!.phase}）要求：${clip(originalTask(runs[index]!), 80)}`;
  while (size() > LIMIT && parts.length > 3) { parts = parts.slice(1); omitted++; }
  const body = [head, ...(omitted ? [`更早的 ${omitted} 轮从略。`] : []), ...parts].join("\n\n");
  return body + HISTORY_DIGEST_TASK_HEAD + task;
}

/** Whether the next round should start from a digest, and why, from what the latest round left in the window. */
export function nextHistoryMode(latest: AgentRunView | undefined, requested: boolean): { history: "session" | "digest"; reason?: string } {
  if (!latest) return { history: "session" };
  if (requested) return { history: "digest", reason: "你要求整理上下文" };
  // The verbatim history only grows, so once a round needed the digest, replaying it can never fit again.
  if (latest.frozen.history === "digest") return { history: "digest", reason: "前面的对话已经整理过" };
  const window = latest.frozen.model_context?.window_tokens, used = latest.usage.context?.tokens;
  if (window && used !== undefined && used > window * HISTORY_DIGEST_RATIO) return { history: "digest", reason: `上一轮结束时上下文已用 ${Math.round(used / window * 100)}%` };
  return { history: "session" };
}
