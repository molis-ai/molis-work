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
  { id: "counter", label: "提出反例与反驳" },
  { id: "compare", label: "比较异同（相同点、不同点、冲突）" },
  { id: "merge", label: "合并成一段连贯的文字" },
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

export function actionItemsFromText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/u, "").trim())
    .filter(Boolean);
}
