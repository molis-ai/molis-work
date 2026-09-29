import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { originalTask } from "./continuation.js";
import { fileDiff } from "./materials.js";

/** How many of the latest rounds that changed files a commit message is drafted from. */
export const COMMIT_DRAFT_ROUNDS = 6;
const LIMIT = 58_000, PER_FILE = 4_000;

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
