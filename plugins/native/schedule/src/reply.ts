/** The output contract the round's task ends with (below): the reply's first line on its own, read here and cut before the person sees the reply. */
const MARKER = /^IMPORTANT:\s*(yes|no)\s*$/iu;

export function parseScheduledAgentReply(raw: string): { text: string; important: boolean; marked: boolean } {
  const lines = raw.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  const match = MARKER.exec(lines[0]?.trim() ?? "");
  if (!match) return { text: raw.trim(), important: false, marked: false };
  return {
    text: lines.slice(1).join("\n").trim(),
    important: match[1]!.toLowerCase() === "yes",
    marked: true,
  };
}

/**
 * The round's task: the person's title and instructions and what happened so far, then the one line the code reads back (MARKER).
 * When to answer yes is the reader role's (roles.ts), not repeated here. The format sits at the end of the task because the model
 * follows it there and not from the role alone (specs/ai-development-handbook §9.5 B5; the user chose this on 2026-10-16).
 */
export function composeScheduledTaskPrompt(input: {
  title: string;
  instructions: string;
  history: readonly { kind: string; text: string }[];
}): string {
  const history = input.history.length === 0
    ? "（还没有历史回合）"
    : input.history.map((turn) => `${turn.kind}: ${turn.text}`).join("\n\n");
  return [
    `任务标题：${input.title}`,
    "任务说明：",
    input.instructions,
    "历史对话：",
    history,
    "",
    "输出格式：回复第一行单独写 IMPORTANT: yes 或 IMPORTANT: no，第二行起是正文。",
  ].join("\n");
}
