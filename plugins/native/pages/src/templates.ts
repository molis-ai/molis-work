import type { PagesBody } from "@molis-ai/molis-work-contracts/modules/pages";

export interface PagesTemplate {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly icon: "calendar" | "rows" | "flag" | "file" | "refresh" | "user" | "target" | "alert" | "code" | "eye";
  readonly body: PagesBody;
}

function text(value: string) {
  return { type: "text" as const, text: value };
}

function heading(level: 1 | 2 | 3, value: string) {
  return { type: "heading" as const, attrs: { level }, content: [text(value)] };
}

function paragraph(value = "") {
  return value
    ? { type: "paragraph" as const, content: [text(value)] }
    : { type: "paragraph" as const };
}

function bullets(items: readonly string[]) {
  return {
    type: "bullet_list" as const,
    content: items.map((item) => ({
      type: "list_item" as const,
      content: [paragraph(item)],
    })),
  };
}

function numbered(items: readonly string[]) {
  return {
    type: "ordered_list" as const,
    attrs: { order: 1 },
    content: items.map((item) => ({
      type: "list_item" as const,
      content: [paragraph(item)],
    })),
  };
}

function callout(tone: "info" | "warn" | "success" | "plain", ...blocks: unknown[]) {
  return { type: "callout" as const, attrs: { tone }, content: blocks };
}

function tasks(items: readonly string[]) {
  return {
    type: "task_list" as const,
    content: items.map((item) => ({
      type: "task_item" as const,
      attrs: { checked: false },
      content: [paragraph(item)],
    })),
  };
}

function divider() {
  return { type: "horizontal_rule" as const };
}

function toc() {
  return { type: "toc" as const };
}

function code(language: string, value: string) {
  return {
    type: "code_block" as const,
    attrs: { language },
    ...(value ? { content: [{ type: "text" as const, text: value }] } : {}),
  };
}

function table(headers: readonly string[], rows: readonly (readonly string[])[]) {
  return {
    type: "table" as const,
    content: [
      {
        type: "table_row" as const,
        content: headers.map((cell) => ({
          type: "table_header" as const,
          content: [paragraph(cell)],
        })),
      },
      ...rows.map((row) => ({
        type: "table_row" as const,
        content: row.map((cell) => ({
          type: "table_cell" as const,
          content: [paragraph(cell)],
        })),
      })),
    ],
  };
}

function fold(title: string, ...blocks: unknown[]) {
  return { type: "toggle" as const, attrs: { open: true }, content: [paragraph(title), ...blocks] };
}

function doc(content: PagesTemplate["body"]["content"]): PagesBody {
  return { type: "doc", content };
}

export const PAGES_TEMPLATES: readonly PagesTemplate[] = [
  {
    id: "meeting-notes",
    title: "会议纪要",
    summary: "信息、出席、议程、结论、行动项",
    icon: "calendar",
    body: doc([
      toc(),
      heading(2, "信息"),
      callout("info", paragraph("时间、地点、主持写在下面。")),
      bullets(["时间：", "地点 / 链接：", "主持："]),
      heading(2, "出席"),
      bullets(["出席：", "缺席："]),
      heading(2, "议程"),
      numbered(["议题一", "议题二"]),
      heading(2, "结论"),
      paragraph("写这次拍板的事。"),
      heading(2, "行动项"),
      tasks(["谁，做什么，何时"]),
    ]),
  },
  {
    id: "weekly-report",
    title: "周报",
    summary: "完成、进行中、下周、风险",
    icon: "rows",
    body: doc([
      heading(2, "完成"),
      tasks(["做成了什么"]),
      heading(2, "进行中"),
      bullets(["还在推进的"]),
      heading(2, "下周"),
      bullets(["下一周要拿住的"]),
      heading(2, "风险"),
      bullets(["会挡路的事"]),
    ]),
  },
  {
    id: "project-plan",
    title: "项目计划",
    summary: "目标、团队、里程碑、范围",
    icon: "flag",
    body: doc([
      heading(2, "目标"),
      callout("info", paragraph("做成之后，外面会看见什么。")),
      heading(2, "团队"),
      bullets(["角色与人"]),
      heading(2, "里程碑"),
      numbered(["第一段", "第二段"]),
      heading(2, "范围"),
      bullets(["做", "不做"]),
    ]),
  },
  {
    id: "prd",
    title: "PRD",
    summary: "背景、用户故事、验收",
    icon: "file",
    body: doc([
      heading(2, "背景"),
      callout("plain", paragraph("为什么现在做。")),
      heading(2, "用户故事"),
      bullets(["作为……，我想……，以便……"]),
      heading(2, "验收"),
      tasks(["可以怎样证明做成了"]),
    ]),
  },
  {
    id: "sprint-retro",
    title: "迭代回顾",
    summary: "做得好、改进、行动",
    icon: "refresh",
    body: doc([
      heading(2, "做得好"),
      bullets(["值得留下的"]),
      heading(2, "改进"),
      fold("下次要改的", bullets(["下次要改的"])),
      heading(2, "行动"),
      bullets(["谁来改，改到什么程度"]),
    ]),
  },
  {
    id: "user-interview",
    title: "用户访谈",
    summary: "问题、洞察、原话",
    icon: "user",
    body: doc([
      heading(2, "对象"),
      callout("info", paragraph("先写清对方是谁，再问。")),
      bullets(["姓名 / 角色：", "场景："]),
      heading(2, "问题"),
      numbered(["最近一次碰到这事是什么时候？", "当时怎么处理的？"]),
      heading(2, "原话"),
      paragraph("把原句记下来。"),
      heading(2, "洞察"),
      bullets(["我听到的模式"]),
    ]),
  },
  {
    id: "okr",
    title: "OKR",
    summary: "目标与关键结果",
    icon: "target",
    body: doc([
      heading(2, "目标"),
      paragraph("这周期要抵达的方向。"),
      heading(2, "关键结果"),
      tasks(["可核对的结果 1", "可核对的结果 2", "可核对的结果 3"]),
    ]),
  },
  {
    id: "postmortem",
    title: "复盘",
    summary: "经过、根因、改进",
    icon: "alert",
    body: doc([
      heading(2, "经过"),
      callout("warn", paragraph("按时间写下发生了什么。")),
      heading(2, "根因"),
      bullets(["真正导致问题的原因"]),
      heading(2, "改进"),
      bullets(["下次怎样避免同样的坑"]),
    ]),
  },
  {
    id: "tech-design",
    title: "技术方案",
    summary: "架构、取舍、计划",
    icon: "code",
    body: doc([
      heading(2, "问题"),
      paragraph("要解什么。"),
      heading(2, "方案"),
      paragraph("准备怎么做。"),
      code("ts", "// 关键接口或数据结构"),
      heading(2, "取舍"),
      bullets(["选了什么，没选什么，为什么"]),
      heading(2, "计划"),
      numbered(["先做哪一段"]),
    ]),
  },
  {
    id: "competitor",
    title: "竞品分析",
    summary: "档案、对比、SWOT",
    icon: "eye",
    body: doc([
      heading(2, "档案"),
      bullets(["产品：", "谁在用：", "他们怎么讲自己："]),
      heading(2, "对比"),
      table(["我们", "对方"], [["强在哪", "强在哪"]]),
      divider(),
      heading(2, "SWOT"),
      heading(3, "优势"),
      bullets(["我们强在哪"]),
      heading(3, "劣势"),
      bullets(["我们弱在哪"]),
      heading(3, "机会"),
      bullets(["可以抓住的"]),
      heading(3, "威胁"),
      bullets(["会挡路的"]),
    ]),
  },
];

export function pagesTemplateById(id: string): PagesTemplate | undefined {
  return PAGES_TEMPLATES.find((item) => item.id === id);
}

export function pagesTemplateSummaries(): readonly { id: string; title: string; summary: string }[] {
  return PAGES_TEMPLATES.map(({ id, title, summary }) => ({ id, title, summary }));
}
