export const PAGES_AI_COMMANDS = [
  { id: "translate", label: "翻译" },
  { id: "rewrite", label: "改写", styles: ["concise", "expand", "formal", "casual"] as const },
  { id: "expand", label: "扩写" },
  { id: "continue", label: "续写" },
  { id: "outline", label: "大纲" },
  { id: "summarize", label: "总结" },
  { id: "explain", label: "解释" },
  { id: "bullets", label: "要点" },
  { id: "actions", label: "行动项" },
  { id: "reader", label: "读者视角" },
  { id: "coach", label: "写作教练" },
  { id: "translate_new", label: "整篇翻译成新文档" },
  { id: "proofread", label: "全文校对" },
] as const;

export type PagesAiCommandId = (typeof PAGES_AI_COMMANDS)[number]["id"];
export type PagesAiStyle = "concise" | "expand" | "formal" | "casual";

export interface PagesAiRequest {
  readonly command: string;
  readonly text: string;
  readonly style?: string;
}

export interface PagesAiResult {
  readonly text: string;
  readonly stub: boolean;
  readonly command: string;
  readonly style?: string;
}

const STYLE_LABEL: Record<PagesAiStyle, string> = {
  concise: "更短",
  expand: "更展开",
  formal: "更正式",
  casual: "更口语",
};

export function isPagesAiCommand(value: string): value is PagesAiCommandId {
  return PAGES_AI_COMMANDS.some((item) => item.id === value);
}

export function pagesAiCommandLabel(command: string, style?: string): string {
  const found = PAGES_AI_COMMANDS.find((item) => item.id === command);
  const base = found?.label ?? command;
  if (command === "rewrite" && isPagesAiStyle(style)) return `${base} · ${STYLE_LABEL[style]}`;
  return base;
}

export function isPagesAiStyle(value: string | undefined): value is PagesAiStyle {
  return value === "concise" || value === "expand" || value === "formal" || value === "casual";
}

export async function runPagesAi(
  request: PagesAiRequest,
  completeText?: (prompt: string) => Promise<string>,
): Promise<PagesAiResult> {
  if (!isPagesAiCommand(request.command)) {
    throw Object.assign(new Error("不认识这个写作命令"), { code: "pages.invalid" });
  }
  const text = request.text.trim();
  if (!text) throw Object.assign(new Error("没有可处理的文字"), { code: "pages.invalid" });
  const label = pagesAiCommandLabel(request.command, request.style);
  if (completeText) {
    const prompt = [
      `你是文档写作助手。命令：${label}。`,
      "只输出写回正文，不要前言。行动项输出每行一项，不要编号。",
      "",
      text,
    ].join("\n");
    const output = (await completeText(prompt)).trim();
    if (!output) throw Object.assign(new Error("模型没有返回文字"), { code: "pages.invalid" });
    return { text: output, stub: false, command: request.command, style: request.style };
  }
  return {
    text: stubPagesAi(request.command, text, request.style),
    stub: true,
    command: request.command,
    style: request.style,
  };
}

export function stubPagesAi(command: string, text: string, style?: string): string {
  const label = pagesAiCommandLabel(command, style);
  return `【未接模型 · ${label}】\n\n${localDraft(command, text, style)}`;
}

function localDraft(command: string, text: string, style?: string): string {
  const lines = splitLines(text);
  if (command === "outline") {
    return lines.slice(0, 8).map((line, index) => `${index + 1}. ${clip(line, 48)}`).join("\n");
  }
  if (command === "bullets" || command === "actions") {
    return lines.map((line) => `- ${clip(line, 80)}`).join("\n");
  }
  if (command === "summarize") {
    return clip(lines[0] ?? text, 160) + (lines.length > 1 ? `\n（原文共 ${lines.length} 句，接上模型后再做压缩。）` : "");
  }
  if (command === "continue") return `${text.trim()}\n\n（接上模型后会从这里接着写。）`;
  if (command === "expand" || (command === "rewrite" && style === "expand")) {
    return `${text.trim()}\n\n补充：这里本来要展开原因、例子和边界，但当前没有模型。`;
  }
  if (command === "rewrite" && style === "concise") return clip(text.replaceAll(/\s+/g, " "), 180);
  if (command === "rewrite" && style === "formal") return `现将原文整理如下：\n${text.trim()}`;
  if (command === "rewrite" && style === "casual") return text.trim();
  if (command === "explain" || command === "reader" || command === "coach") {
    return `${text.trim()}\n\n（${labelHint(command)}需要模型才能认真做，上面仍是原文。）`;
  }
  if (command === "translate" || command === "translate_new") {
    return `${text.trim()}\n\n（没有模型，不能翻译。上面是原文。）`;
  }
  if (command === "proofread") return text.trim();
  return text.trim();
}

function labelHint(command: string): string {
  if (command === "explain") return "解释";
  if (command === "reader") return "读者视角";
  return "写作教练";
}

function splitLines(text: string): string[] {
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + "…";
}

export function actionItemsFromText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|【未接模型[^\n]*】|\d+[.)])\s*/u, "").trim())
    .filter((line) => line && !line.startsWith("【未接模型"));
}
