import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { originalTask } from "./continuation.js";
import { fileDiff } from "./materials.js";

/** How many of the latest rounds that changed files a commit message is drafted from. */
export const COMMIT_DRAFT_ROUNDS = 6;
const LIMIT = 58_000, PER_FILE = 4_000;

/** How the model writes the message. The person still reads and edits it before the reviewed commit. */
export const COMMIT_DRAFT_INSTRUCTIONS = [
  "你为一组代码改动写 git 提交说明。",
  "第一行是标题：不超过 60 个字符，概括这次提交做了什么；用和材料相同的语言。",
  "空一行后写 2–6 条要点，每条一行、以「- 」开头，说明主要改动和原因。",
  "只写材料里真实出现的改动，不编造；不要写「全部完成」「已验证」这类套话，不复述过程，不列出你没看到的测试结果。",
  "只返回提交说明本身，不要代码围栏，不要其他文字。",
].join("\n");

/**
 * What the model reads: the plan the rounds served, then each round that changed files — the person's request, the
 * round's conclusion, and the applied diff of each file. The oldest rounds are dropped first when it runs long.
 */
export function commitDraftMaterial(input: { planTitle?: string; rounds: ReadonlyArray<{ number: number; run: AgentRunView; change: CodingChangeSet }> }): string {
  const clip = (text: string, max: number) => text.length > max ? text.slice(0, max) + "\n…（其余略）" : text;
  const round = ({ number, run, change }: { number: number; run: AgentRunView; change: CodingChangeSet }) => {
    const answer = run.turns.filter(turn => turn.kind === "assistant").at(-1)?.text.trim() ?? "";
    const files = change.files.filter(file => file.review?.execution === "applied").map(file =>
      `#### ${file.path}（${file.kind === "added" ? "新增" : "修改"}，+${file.added_lines} −${file.removed_lines}）\n${clip(fileDiff(file), PER_FILE)}`);
    return [`### 第 ${number} 轮`, `要求：${clip(originalTask(run).trim(), 600)}`, `结论：${clip(answer, 500)}`, "改动：", ...files].join("\n");
  };
  const head = input.planTitle ? `这些改动服务的计划：${input.planTitle}` : "";
  let parts = input.rounds.map(round);
  while (parts.length > 1 && [head, ...parts].join("\n\n").length > LIMIT) parts = parts.slice(1);
  return clip([head, ...parts].filter(Boolean).join("\n\n"), LIMIT);
}

/** The model's reply as a commit message: without a code fence it may have added anyway. */
export function commitMessageFrom(text: string): string {
  return text.trim().replace(/^```[\w-]*\n([\s\S]*?)\n```$/, "$1").trim();
}
