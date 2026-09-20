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

export function composeScheduledTaskPrompt(input: {
  title: string;
  instructions: string;
  history: readonly { kind: string; text: string }[];
}): string {
  const history = input.history.length === 0
    ? "（还没有历史回合）"
    : input.history.map((turn) => `${turn.kind}: ${turn.text}`).join("\n\n");
  return [
    "你正在执行一条无人值守的定时任务，这一轮只读。",
    `任务标题：${input.title}`,
    "任务说明：",
    input.instructions,
    "历史对话：",
    history,
    "规则：",
    "- 先给结论，再给必要依据。",
    "- 回复的第一行必须是单独一行：IMPORTANT: yes 或 IMPORTANT: no。",
    "- 只有出现需要人马上看的变化、风险或结论时才写 yes。",
    "- 第一行之后才是给用户看的正文。",
  ].join("\n");
}
