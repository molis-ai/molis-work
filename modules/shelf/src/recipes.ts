import type {
  ShelfItemKind,
  ShelfRecipeAvailability,
  ShelfRecipeChoice,
  ShelfRecipeId,
  ShelfRecipeTone,
} from "@molis-ai/molis-work-contracts/modules/shelf";

/**
 * DropAgent `RecipeCatalog` in Molis wording. Accepted kinds, output names,
 * network and the option rows are DropAgent's; only `.clip` / `.web` are
 * spelled with the Molis kind names.
 */
export interface ShelfRecipeSpec {
  readonly recipe: ShelfRecipeId;
  readonly label: string;
  readonly short_title: string;
  readonly blurb: string;
  readonly tone: ShelfRecipeTone;
  readonly accepts: readonly ShelfItemKind[];
  readonly output_file: string;
  readonly needs_network: boolean;
  readonly requires_agent: boolean;
  readonly minimum_count: number;
  readonly choice_label: string;
  readonly choice_hint: string;
  readonly choices: readonly ShelfRecipeChoice[];
  readonly default_choice: string;
}

const TEXTY: readonly ShelfItemKind[] = ["markdown", "text"];

export const SHELF_RECIPES: readonly ShelfRecipeSpec[] = [
  {
    recipe: "summarize",
    label: "总结文件",
    short_title: "总结",
    blurb: "提炼重点，生成摘要",
    tone: "slate",
    accepts: ["pdf", "image", ...TEXTY, "url", "website", "folder"],
    output_file: "summary.md",
    needs_network: false,
    requires_agent: true,
    minimum_count: 1,
    choice_label: "篇幅",
    choice_hint: "",
    choices: [
      { id: "short", title: "短 · 200 字" },
      { id: "medium", title: "中 · 500 字" },
      { id: "long", title: "长 · 1000 字" },
      { id: "outline", title: "提纲" },
    ],
    default_choice: "medium",
  },
  {
    recipe: "extract_structure",
    label: "提取结构化信息",
    short_title: "提取",
    blurb: "提取要点、待办或结构化数据",
    tone: "blue",
    accepts: ["pdf", "image", ...TEXTY, "website"],
    output_file: "extracted.json",
    needs_network: false,
    requires_agent: true,
    minimum_count: 1,
    choice_label: "抽取",
    choice_hint: "",
    choices: [
      { id: "points", title: "要点" },
      { id: "todos", title: "待办" },
      { id: "quotes", title: "引用与数据" },
      { id: "json", title: "全量 JSON" },
    ],
    default_choice: "json",
  },
  {
    recipe: "extract_text",
    label: "提取文字",
    short_title: "提取文字",
    blurb: "在本机提取 PDF 中可选择的文字",
    tone: "clay",
    // DropAgent extracts from a PDF or an image; a text file is already text.
    accepts: ["pdf", "image"],
    output_file: "pdf.md",
    needs_network: false,
    requires_agent: false,
    minimum_count: 1,
    choice_label: "语言",
    choice_hint: "本机识别，不发送",
    choices: [
      { id: "zh-en", title: "中英" },
      { id: "zh", title: "中文" },
      { id: "en", title: "English" },
    ],
    default_choice: "zh-en",
  },
  {
    recipe: "translate",
    label: "翻译并保留格式",
    short_title: "翻译",
    blurb: "译为指定语言，尽量保留格式",
    tone: "blue",
    accepts: [...TEXTY, "pdf", "website"],
    output_file: "translated.md",
    needs_network: true,
    requires_agent: true,
    minimum_count: 1,
    choice_label: "译成",
    choice_hint: "源语言自动识别",
    choices: [
      { id: "zh", title: "中文" },
      { id: "en", title: "English" },
      { id: "ja", title: "日本語" },
      { id: "ko", title: "한국어" },
    ],
    default_choice: "zh",
  },
  {
    recipe: "redact",
    label: "敏感信息脱敏",
    short_title: "脱敏",
    blurb: "移除联系方式、证件等敏感信息",
    tone: "clay",
    accepts: [...TEXTY, "pdf", "website"],
    output_file: "redacted.md",
    needs_network: false,
    requires_agent: true,
    minimum_count: 1,
    choice_label: "范围",
    choice_hint: "",
    choices: [
      { id: "contact", title: "联系方式" },
      { id: "ids", title: "金额证件" },
      { id: "all", title: "全套" },
    ],
    default_choice: "all",
  },
  {
    recipe: "to_markdown",
    label: "转换为 Markdown",
    short_title: "转 MD",
    blurb: "生成可编辑的 Markdown 文件",
    tone: "plum",
    accepts: ["pdf", "image", "url", ...TEXTY, "website"],
    output_file: "converted.md",
    needs_network: false,
    requires_agent: true,
    minimum_count: 1,
    choice_label: "版式",
    choice_hint: "",
    choices: [
      { id: "structure", title: "保结构" },
      { id: "body", title: "只要正文" },
      { id: "toc", title: "带目录" },
    ],
    default_choice: "structure",
  },
  {
    recipe: "combine",
    label: "整合多份材料",
    short_title: "整合",
    blurb: "将多份材料整理为一份文档",
    tone: "ochre",
    accepts: ["pdf", "image", ...TEXTY, "url", "website", "folder", "file"],
    output_file: "brief.md",
    needs_network: false,
    requires_agent: true,
    minimum_count: 2,
    choice_label: "篇幅",
    choice_hint: "",
    choices: [
      { id: "page", title: "一页" },
      { id: "full", title: "完整一份" },
    ],
    default_choice: "full",
  },
];

/**
 * A user's own action. It is not a bar recipe of its own: the name, the kinds
 * and the one-line instruction come from settings, and the output is named
 * after the material.
 */
export const SHELF_SHORTCUT_RECIPE: ShelfRecipeSpec = {
  recipe: "shortcut",
  label: "快捷动作",
  short_title: "快捷",
  blurb: "在副本上执行自定义指令",
  tone: "ochre",
  accepts: ["pdf", "image", "text", "markdown", "url", "website", "file", "folder"],
  output_file: "output.md",
  needs_network: false,
  requires_agent: true,
  minimum_count: 1,
  choice_label: "",
  choice_hint: "",
  choices: [],
  default_choice: "",
};

/** Bar order, DropAgent `RecipeID.barRecipes`. */
export const SHELF_RECIPE_ORDER: readonly ShelfRecipeId[] = SHELF_RECIPES.map((spec) => spec.recipe);

export function shelfRecipeSpec(recipe: ShelfRecipeId): ShelfRecipeSpec {
  if (recipe === "shortcut") return SHELF_SHORTCUT_RECIPE;
  const found = SHELF_RECIPES.find((spec) => spec.recipe === recipe);
  if (!found) throw new Error(`Shelf recipe ${recipe} 不存在`);
  return found;
}

export function shelfRecipeAccepts(recipe: ShelfRecipeId, kind: ShelfItemKind): boolean {
  return shelfRecipeSpec(recipe).accepts.includes(kind);
}

export function resolvedChoiceId(recipe: ShelfRecipeId, optionId: string | null | undefined): string {
  const spec = shelfRecipeSpec(recipe);
  if (optionId && spec.choices.some((choice) => choice.id === optionId)) return optionId;
  return spec.default_choice;
}

export function shelfRecipeOutputName(recipe: ShelfRecipeId, kind: ShelfItemKind): string {
  if (recipe !== "extract_text") return shelfRecipeSpec(recipe).output_file;
  if (kind === "pdf") return "pdf.md";
  return kind === "image" ? "ocr.md" : "extract.md";
}

export function shelfRecipeTitle(recipe: ShelfRecipeId, kind: ShelfItemKind): string {
  if (recipe !== "extract_text") return shelfRecipeSpec(recipe).label;
  if (kind === "pdf") return "提取 PDF 文字";
  return kind === "image" ? "提取图片文字" : "提取文字";
}

export function recipeAvailability(
  recipe: ShelfRecipeId,
  options: { available: boolean; reason: string | null },
): ShelfRecipeAvailability {
  const spec = shelfRecipeSpec(recipe);
  return {
    recipe: spec.recipe,
    available: options.available,
    label: spec.label,
    short_title: spec.short_title,
    blurb: spec.blurb,
    tone: spec.tone,
    reason: options.reason,
    accepts: spec.accepts,
    output_file: spec.output_file,
    needs_network: spec.needs_network,
    requires_agent: spec.requires_agent,
    minimum_count: spec.minimum_count,
    choice_label: spec.choice_label,
    choice_hint: spec.choice_hint,
    choices: spec.choices,
    default_choice: spec.default_choice,
  };
}

/** DropAgent `RecipeCatalog.fileGuardrail`. Kept word for word. */
export function fileGuardrail(outputFileName: string): string {
  return [
    "阅读当前工作目录里的材料。只使用相对路径，不要访问目录之外的文件。",
    "不要修改已有材料文件。",
    `把完整结果写成文件：${outputFileName}`,
    `该文件里必须是交付正文，不要写「已完成」「已写入 ${outputFileName}」这类说明。`,
    "不要只在对话里口头回复；结果区只会收取这一份文件。",
  ].join("\n");
}

/** DropAgent `RecipeCatalog.prompt`. */
export function recipePrompt(recipe: ShelfRecipeId, optionId?: string | null): string {
  const spec = shelfRecipeSpec(recipe);
  const choice = resolvedChoiceId(recipe, optionId);
  return `${fileGuardrail(spec.output_file)}\n${instruction(recipe, choice)}\n`;
}

function instruction(recipe: ShelfRecipeId, choiceId: string): string {
  switch (recipe) {
    case "summarize":
      if (choiceId === "short") return "用中文写一份约 200 字的短总结（Markdown）。";
      if (choiceId === "long") return "用中文写一份约 1000 字的长总结（Markdown）。";
      if (choiceId === "outline") return "用中文只写提纲，不要展开成段落（Markdown）。";
      return "用中文写一份约 500 字的简洁 Markdown 总结。";
    case "extract_structure":
      if (choiceId === "points") return "提取要点列表，写成 Markdown。";
      if (choiceId === "todos") return "提取待办事项，写成 Markdown。";
      if (choiceId === "quotes") return "提取引用与数据，写成 Markdown。";
      return "提取结构化信息，写成 JSON 对象。";
    case "translate": {
      const target = choiceId === "en" ? "English" : choiceId === "ja" ? "日本語" : choiceId === "ko" ? "한국어" : "中文";
      return `源语言自动识别。翻译成 ${target} 并尽量保留原有结构，写成 Markdown。`;
    }
    case "redact":
      if (choiceId === "contact") return "把电话、邮箱、地址等联系方式替换为 [REDACTED]，写成 Markdown。";
      if (choiceId === "ids") return "把金额、证件号、账号等替换为 [REDACTED]，写成 Markdown。";
      return "把姓名、电话、邮箱、密钥、金额等敏感信息替换为 [REDACTED]，写成 Markdown。";
    case "to_markdown":
      if (choiceId === "body") return "转成只要正文的 Markdown，去掉导航和页眉页脚。";
      if (choiceId === "toc") return "转成带目录的结构清楚的 Markdown。";
      return "转成尽量保留原有结构的 Markdown。";
    case "combine": {
      const length = choiceId === "page" ? "大约一页。" : "完整一份，把各份材料里该保留的内容都写进去。";
      return [
        "用中文把这些材料写成一份合成稿（Markdown）。",
        "正文必须来自材料：保留结论、数字、日期、人名、待办和关键原话；重复的合并，说法冲突的并列并标明来源。",
        "不要只交代「已整合」或「已生成 brief.md」。",
        `篇幅：${length}`,
      ].join("\n");
    }
    default:
      return "抽出 PDF 里已经嵌着的文字，不要调用终端 Agent，不要做扫描件 OCR。";
  }
}

/** DropAgent `RecipeOutput`. Progress chatter is never a deliverable. */
const PROGRESS_LINES = new Set([
  "开始运行",
  "收尾",
  "在写结果",
  "在写文件",
  "工具调用",
  "工具调用完成",
  "联网",
  "思考中",
  "进行中",
  "失败",
  "等待授权",
  "写入 output/",
  "正在收取结果",
  "正在读取材料",
  "正在查找任务材料",
  "正在整理交付文件",
  "Agent 正在处理材料",
]);

export function looksLikeDeliverable(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (isProgress(trimmed)) return false;
  if (isCompletionReport(trimmed)) return false;
  return true;
}

function isProgress(text: string): boolean {
  if (PROGRESS_LINES.has(text)) return true;
  if (text.startsWith("任务失败")) return true;
  if (text.startsWith("识别 ")) return true;
  return false;
}

function isCompletionReport(text: string): boolean {
  const trimmed = text.trim();
  const lines = trimmed.split(/\r?\n/u).filter((line) => line.length > 0);
  if (trimmed.length > 180 || lines.length > 3) return false;
  const lower = trimmed.toLowerCase();
  const talksAboutFile = lower.includes(".md")
    || lower.includes(".json")
    || lower.includes("文件")
    || lower.includes("file");
  const zh = trimmed.includes("已把")
    || trimmed.includes("已将")
    || trimmed.includes("已写入")
    || trimmed.includes("已生成")
    || trimmed.includes("已整合");
  const zhDone = trimmed.includes("已完成") && talksAboutFile;
  const en = lower.includes("wrote ")
    || lower.includes("written ")
    || lower.includes("created ")
    || lower.includes("saved ")
    || lower.includes("combined ");
  return zh || zhDone || en;
}

/** `.json` deliverables lose a fenced wrapper, same as DropAgent `finalize`. */
export function finalizeOutput(text: string, fileName: string): string {
  if (!fileName.toLowerCase().endsWith(".json")) return text;
  return unwrapJson(text.trim());
}

function unwrapJson(text: string): string {
  if (isJson(text)) return text;
  if (!text.startsWith("```")) return text;
  const lines = text.split("\n");
  if (lines.length < 2) return text;
  lines.shift();
  if (lines.at(-1)?.startsWith("```")) lines.pop();
  const inner = lines.join("\n").trim();
  return isJson(inner) ? inner : text;
}

function isJson(text: string): boolean {
  if (!text) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
