// The interaction itself, rendered with the design system's shared parts (packages/design-system/src/interaction.ts):
// the preview is their first live consumer. Both layouts render exactly this markup; only the frame differs.
// Every optional part is rendered up front and shown or hidden by paint.ts, so fields are never re-rendered.
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderInteractionOperation, renderInteractionQuestion, type InteractionField } from "../../packages/design-system/src/index.ts";
import { formats, topics, labels, timeLimits, zone, type Layout } from "./model.ts";

const copy = {
  assistant: {
    ask: "帮我安排一次内部试用复盘，聚焦首次使用和失败恢复。",
    question: "把这次复盘安排好", operation: "创建复盘安排", result: "复盘安排已准备好",
    impact: "真实接入后会在日程里创建一项。本页只模拟，不会创建。",
  },
  coding: {
    ask: "先帮我准备交互验收安排，重点看草稿保留和失败恢复，暂时不要改代码。",
    question: "把这次验收安排好", operation: "创建验收安排", result: "验收安排已准备好",
    impact: "真实接入后会创建验收安排，不会改动代码。本页只模拟。",
  },
} as const;
const calendar = { months: [{ year: 2026, month: 9 }, { year: 2026, month: 10 }], today: "2026-10-12" };
const fields: InteractionField[] = [
  { id: "format", label: labels.format, hint: "推荐依据：两项重点都需要现场演示。", control: { kind: "choice",
    options: formats.map((option, index) => ({ value: String(index), label: option.label, description: option.description, recommended: option.recommended })) } },
  { id: "topics", label: labels.topics, hint: "可以多选。选中只是在填写参数。", control: { kind: "choice", multiple: true,
    options: topics.map((label, index) => ({ value: String(index), label })) } },
  { id: "notes", label: labels.notes, hint: "也可以在下方输入框里说，回车后放进这里。",
    control: { kind: "text", multiline: true, value: "", placeholder: "例如：只讨论首次使用遇到的卡点", maxLength: 2000 },
    notice: { text: "", actions: [{ id: "adopt", label: "采用文字里的时长" }, { id: "keep", label: "保留字段值", variant: "ghost" }] } },
  { id: "minutes", label: labels.minutes, hint: `${timeLimits.minMinutes}–${timeLimits.maxMinutes} 分钟，整数。`, refreshed: "已按最新材料更新",
    control: { kind: "number", value: "", unit: "分钟", step: timeLimits.step, placeholder: "30", stepLabels: [`减少 ${timeLimits.step} 分钟`, `增加 ${timeLimits.step} 分钟`] } },
  { id: "date", label: labels.date, hint: "需要在开始当天或之前准备好。", control: { kind: "date", value: "", placeholder: "2026-10-15", calendar } },
  { id: "when", label: labels.when, hint: "时区随问题给定，不需要输入。", control: { kind: "datetime", date: "", time: "", zone: zone.label, calendar, dateLabel: "开始日期" } },
  { id: "references", label: labels.references, hint: `输入名称搜索，选 1–${timeLimits.maxReferences} 份 · 已选 0`, control: { kind: "reference",
    source: "goal,document", multiple: true, max: timeLimits.maxReferences, placeholder: "搜索材料，例如「试用」", picked: [] } },
];
function questionCard(layout: Layout): string {
  return renderInteractionQuestion({
    id: layout, kicker: "需要你补充 · 7 项", title: copy[layout].question, collapse: { id: "close", label: "收起问卷" },
    banner: { text: "", tone: "waiting", actions: [{ id: "reopen", label: "请助理重新问" }, { id: "cancel-pending", label: "取消这次回答", variant: "ghost" }] },
    intro: "全部必填。预填只是起点，交回前都可以改；提交只交回答案，创建安排会另请你确认。", fields,
    answered: { rows: [], actions: [{ id: "revise", label: "调整回答", variant: "ghost" }] },
    footer: { note: "草稿只在本页保留", keys: "⌘ / Ctrl + 回车 提交", actions: [{ id: "cancel", label: "不回答", variant: "ghost" }, { id: "submit", label: "提交回答", variant: "primary", type: "submit" }] },
  }) + `<button type="button" class="ix-collapsed" data-closed data-action="open" hidden>${icon("question")}<span class="ix-collapsed-title">${copy[layout].question}</span><span class="ix-collapsed-meta">草稿已保留 · 展开</span>${icon("chevron-down")}</button>`;
}
function operationCard(layout: Layout): string {
  return renderInteractionOperation({
    id: `${layout}-op`, kicker: "操作建议 · 不会自动执行", title: copy[layout].operation,
    target: { prefix: "作用于", label: "秋季工作台 · 内部试用", version: "版本 1" }, impact: copy[layout].impact,
    actions: [{ id: "revise", label: "调整回答", variant: "ghost" }, { id: "preview", label: "预览参数" }],
    preview: { title: "将使用这些参数", rows: [], note: "目标：秋季工作台 · 内部试用", actions: [{ id: "revise", label: "返回调整", variant: "ghost" }, { id: "execute", label: "执行（模拟）", variant: "primary" }] },
    status: { text: "" }, recovery: [{ id: "reconcile", label: "核对结果" }, { id: "retry", label: "检查参数并重试" }],
    result: { title: `${copy[layout].result}（模拟）`, body: "这是一份模拟摘要：没有创建日程、修改文件或启动新任务。",
      actions: [{ id: "result", label: "打开示例摘要" }, { id: "continue", label: "继续调整", variant: "ghost" }], details: { title: "示例摘要", body: "" } },
  });
}
/** The conversation: the person's ask, the AI's question, and — once an answer arrives — the operation it proposes. */
export function renderThread(layout: Layout): string {
  const mark = `<span class="ix-ai-mark" aria-hidden="true">${icon("sparkles")}</span>`;
  return `<div class="ix-thread" data-thread role="log" aria-label="对话" tabindex="0">
    <div class="ix-turn ix-turn--person"><p>${copy[layout].ask}</p></div>
    <div class="ix-turn ix-turn--ai">${mark}<div class="ix-turn-body"><p>可以。先补齐安排需要的信息，交回后我把待执行的参数放在一起，供你确认。</p>${questionCard(layout)}</div></div>
    <div class="ix-turn ix-turn--ai" data-op-turn hidden>${mark}<div class="ix-turn-body"><p>收到回答。参数整理好了：先核对，再决定是否执行。</p>${operationCard(layout)}</div></div>
  </div>
  <button type="button" class="ix-jump" data-jump hidden>${icon("chevron-down")}<span>回到最新</span></button>`;
}
