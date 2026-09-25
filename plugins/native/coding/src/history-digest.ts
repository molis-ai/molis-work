import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { HISTORY_DIGEST_MARKER, HISTORY_DIGEST_TASK_HEAD, originalTask } from "./continuation.js";

/**
 * Carrying a long session forward once its history no longer fits.
 *
 * The runtime replays every earlier round verbatim, tool output included, and refuses to start once that no longer
 * fits the model's window. A digest round starts without the replay: its task opens with an account of each earlier
 * round and says plainly that tool output was not carried, so the model rereads a file instead of recalling it.
 *
 * The account is written by the model from the rounds' own records (the person approved the cost): what the session is
 * for, what was done and decided, what was rejected, what is left. It builds on the summary the latest digest round
 * already carried rather than rereading every round, and the Host's own facts — which files changed, how the latest
 * round ended — travel beside it, so a slip in the summary cannot hide them. When the model cannot write it, the
 * Host's record-based digest stands in and the page says so. Nothing is stored beside the rounds themselves.
 */

export { HISTORY_DIGEST_MARKER, digestTask } from "./continuation.js";
/** Past this share of the window, replaying the session leaves a round too little room for its own work. */
export const HISTORY_DIGEST_RATIO = 0.6;
const LIMIT = 24_000;
/** What the summary is written from; the model call takes at most 60 000 characters. */
const MATERIAL_LIMIT = 58_000;
const SUMMARY_LIMIT = 12_000;
const PHASE: Record<string, string> = { completed: "已完成", failed: "出错结束", stopped: "已停止", cancelled: "已取消", "reconcile-required": "中断待核对" };

/** How the model writes the summary. It reads the Host's records of each round, never tool output. */
export const HISTORY_SUMMARY_INSTRUCTIONS = [
  "你为一个编码会话写「接续摘要」：下一轮的模型只看得到这份摘要和当前工作区，看不到前面的对话。",
  "按下面六个小节写，用和材料相同的语言；某一节没有内容就写「无」：",
  "1. 目标与要求：这个会话要做成什么；用户提过的要求、约束和后来的更正（以后来的说法为准）。",
  "2. 已完成：做成了什么，关键结论和依据。",
  "3. 改动过的文件：路径，各自改了什么、为什么。",
  "4. 决定与否决：做过的取舍；被用户拒绝、要求返工的方案和原因。",
  "5. 未完成与问题：没做完的、出错或中断的，已知的问题和风险。",
  "6. 下一步：只写记录里用户要求了、还没做完的事；都做完了就写「无」，不要自己提议新方向。",
  "材料里如有「此前的摘要」，它概括了更早的轮次：把它和之后各轮合成一份新的完整摘要，不要只写新增部分。",
  "保留具体名称：文件路径、函数、命令、错误信息、数字。只写材料里有的，不编造，不推测没看到的结果；材料没说测试通过就不要写通过。",
  "总长不超过 6000 字。只返回摘要本身，不要代码围栏，不要其他文字。",
].join("\n");

const clip = (text: string, size: number) => {
  const flat = text.trim();
  return flat.length > size ? flat.slice(0, size) + "…" : flat;
};
const changedFiles = (run: AgentRunView) =>
  [...new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target!))];

function round(run: AgentRunView, number: number, detailed: boolean): string {
  const asked = originalTask(run), answer = [...run.turns].reverse().find(turn => turn.kind === "assistant")?.text ?? "";
  const files = changedFiles(run);
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

/** The account a digest round carried ahead of its own request, if it carried one. */
function carriedDigest(run: AgentRunView): string | null {
  const text = run.turns.find(turn => turn.kind === "user")?.text ?? "";
  if (!text.startsWith(HISTORY_DIGEST_MARKER)) return null;
  const end = text.indexOf(HISTORY_DIGEST_TASK_HEAD);
  return end < 0 ? null : text.slice(HISTORY_DIGEST_MARKER.length, end).trim();
}

/**
 * What the summary is written from: the summary the latest digest round carried (it covers every round before that
 * one), then each round from there on — the request, what the person added while it ran, the conclusion, the files it
 * changed and how it ended. Oldest rounds are shortened, then left out with a count, when it runs long.
 */
export function historySummaryMaterial(runs: readonly AgentRunView[]): string {
  let from = 0, previous: string | null = null;
  for (let index = runs.length - 1; index > 0; index--) {
    const carried = carriedDigest(runs[index]!);
    if (carried) { from = index; previous = carried; break; }
  }
  const detail = (run: AgentRunView, number: number, detailed: boolean) => {
    const added = run.turns.filter(turn => turn.kind === "user").slice(1).map(turn => turn.text.trim()).filter(Boolean);
    const lines = [round(run, number, detailed)];
    if (added.length) lines.push(`- 执行中用户补充：${added.slice(-5).map(text => clip(text, detailed ? 600 : 200)).join(" / ")}`);
    return lines.join("\n");
  };
  const later = runs.slice(from);
  let parts = later.map((run, index) => detail(run, from + index + 1, true));
  let omitted = 0;
  const head = previous ? `此前的摘要（概括第 1–${from} 轮）：\n${clip(previous, 24_000)}` : "";
  const size = () => head.length + parts.reduce((sum, part) => sum + part.length + 2, 0);
  for (let index = 0; size() > MATERIAL_LIMIT && index < parts.length - 3; index++) parts[index] = detail(later[index]!, from + index + 1, false);
  while (size() > MATERIAL_LIMIT && parts.length > 3) { parts = parts.slice(1); omitted++; }
  return [head, ...(omitted ? [`之后又有 ${omitted} 轮从略。`] : []), ...parts].filter(Boolean).join("\n\n").slice(0, MATERIAL_LIMIT);
}

/** The model's summary as the digest a round carries, with the Host's own facts beside it. */
export function summaryDigest(runs: readonly AgentRunView[], summary: string, task: string): string {
  const text = clip(summary.replace(/^```[\w-]*\n([\s\S]*?)\n```$/, "$1"), SUMMARY_LIMIT);
  const head = `${HISTORY_DIGEST_MARKER}本会话前 ${runs.length} 轮的摘要由模型根据执行记录整理，宿主核实的事实附在后面，两者不一致时以宿主的为准。工具输出的原文没有带入这一轮：需要文件内容时请重新读取，不要凭记忆。已改动的文件以工作区当前内容为准。`;
  const files = [...new Set(runs.flatMap(changedFiles))];
  const facts = [
    `宿主核实的事实：`,
    files.length ? `- 前 ${runs.length} 轮改动过的文件：${files.slice(0, 60).join("、")}${files.length > 60 ? ` 等 ${files.length} 个` : ""}` : `- 前 ${runs.length} 轮没有改动文件`,
    `- 最近一轮：\n${round(runs.at(-1)!, runs.length, true)}`,
  ].join("\n");
  return [head, text, facts].join("\n\n") + HISTORY_DIGEST_TASK_HEAD + task;
}

/** Whether a round's digest was written by the model (it says so in its opening line). */
export const MODEL_DIGEST_HEAD = "的摘要由模型根据执行记录整理";

/** Whether the next round should start from a digest, and why, from what the latest round left in the window. */
export function nextHistoryMode(latest: AgentRunView | undefined, requested: boolean): { history: "session" | "digest"; reason?: string } {
  if (!latest) return { history: "session" };
  if (requested) return { history: "digest", reason: "你要求整理上下文" };
  // The verbatim history only grows, so once a round needed the digest, replaying it can never fit again.
  if (latest.frozen.history === "digest") return { history: "digest", reason: "前面的对话已经整理过" };
  // Replaying the same history would ask for the same compaction again; the digest does not need one.
  if (latest.phase === "failed" && /CONTEXT_COMPACTION/.test(latest.stop_reason ?? "")) return { history: "digest", reason: "上一轮整理上下文失败" };
  const window = latest.frozen.model_context?.window_tokens, used = latest.usage.context?.tokens;
  if (window && used !== undefined && used > window * HISTORY_DIGEST_RATIO) return { history: "digest", reason: `上一轮结束时上下文已用 ${Math.round(used / window * 100)}%` };
  return { history: "session" };
}
