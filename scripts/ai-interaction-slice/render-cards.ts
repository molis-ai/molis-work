// The interaction itself: one questionnaire, one operation card with its result, laid out as conversation turns.
// Both layouts render exactly this markup; only the surrounding frame differs.
import { escapeHtml as esc, icon, renderButton, renderCalendar, renderChoice, renderInput, renderTextarea } from "../../packages/design-system/src/index.ts";
import { formats, topics, references, labels, timeLimits, zone, type Field, type Layout } from "./model.ts";

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
const button = (label: string, action: string, variant: "primary" | "secondary" | "ghost" = "secondary", extra: Record<string, string | boolean> = {}) =>
  renderButton({ label, variant, attrs: { "data-action": action, ...extra } });
const ids = (layout: Layout, name: string) => ({
  control: `${layout}-${name}`, label: `${layout}-${name}-label`, hint: `${layout}-${name}-hint`, error: `${layout}-${name}-error`,
});

function row(layout: Layout, name: Field, control: string, hint: string, labelFor = true): string {
  const id = ids(layout, name);
  const label = labelFor ? `<label id="${id.label}" for="${id.control}">${labels[name]}</label>` : `<span id="${id.label}">${labels[name]}</span>`;
  return `<div class="ix-row" data-field="${name}">
    <div class="ix-label">${label}<span class="ix-refreshed" data-refreshed hidden>已按最新材料更新</span></div>
    <div class="ix-control">${control}${hint ? `<p class="ix-hint" id="${id.hint}">${hint}</p>` : ""}<p class="field-error" id="${id.error}" hidden></p></div>
  </div>`;
}
function group(layout: Layout, name: Field, body: string, className: string): string {
  const id = ids(layout, name);
  return `<div class="${className}" role="group" tabindex="-1" id="${id.control}" aria-labelledby="${id.label}" aria-describedby="${id.hint} ${id.error}" data-focus-target>${body}</div>`;
}
function formatOptions(layout: Layout): string {
  return group(layout, "format", formats.map((option, index) => `<button type="button" class="ix-option" data-choice="format" data-index="${index}" aria-pressed="false">
      <span class="ix-option-top"><span class="ix-option-title">${esc(option.label)}</span>${option.recommended ? '<span class="ix-tag">推荐</span>' : ""}<span class="ix-option-check" aria-hidden="true">${icon("check")}</span></span>
      <span class="ix-option-desc">${esc(option.description)}</span></button>`).join(""), "ix-options");
}
function topicChoices(layout: Layout): string {
  return group(layout, "topics", topics.map((label, index) => renderChoice({ label, attrs: { "data-choice": "topics", "data-index": index } })).join(""), "mw-choice-group ix-choices");
}
function textInput(layout: Layout, name: "notes" | "minutes" | "date", placeholder: string, extra: Record<string, string> = {}): string {
  const id = ids(layout, name);
  const options = { id: id.control, name, placeholder, describedBy: `${id.hint} ${id.error}`, attrs: { "data-value": name, "data-focus-target": true, autocomplete: "off", ...extra } };
  return name === "notes" ? renderTextarea({ ...options, rows: 2 }) : renderInput(options);
}
/** The design system's calendar for the demo's two months; the client steps between them and marks the chosen day. */
function calendarPopup(target: string): string {
  const months = [9, 10].map((month, index) => renderCalendar({ year: 2026, month, today: "2026-10-12", compact: true,
    attrs: { "data-calendar-page": index, ...(index ? { hidden: true } : {}) } })).join("");
  return `<div class="ix-calendar" data-calendar="${target}" role="dialog" aria-label="选择日期" hidden>${months}</div>`;
}
function dateInput(layout: Layout, name: "date" | "when", part = false): string {
  const id = ids(layout, name);
  const attrs = part ? { "data-when-part": "date", "aria-label": "开始日期" } : { "data-value": "date" };
  const control = renderInput({ id: part ? `${id.control}-date` : id.control, placeholder: "2026-10-15", describedBy: `${id.hint} ${id.error}`,
    className: "ix-date-input", attrs: { ...attrs, "data-focus-target": true, autocomplete: "off", inputmode: "numeric" } });
  return `<span class="ix-date" data-date-field="${name}">${control}<span class="ix-weekday" data-weekday aria-hidden="true"></span>${renderButton({
    label: "打开日历", icon: "calendar", iconOnly: true, variant: "ghost", className: "ix-date-open", attrs: { "data-calendar-open": name, "aria-expanded": "false" } })}
    ${calendarPopup(name)}</span>`;
}
function minutesField(layout: Layout): string {
  const step = (sign: 1 | -1) => renderButton({ label: `${sign > 0 ? "增加" : "减少"} ${timeLimits.step} 分钟`, icon: sign > 0 ? "plus" : "minus",
    iconOnly: true, variant: "ghost", attrs: { "data-minutes-step": sign * timeLimits.step } });
  return `<span class="ix-number-row"><span class="mw-number ix-number">${step(-1)}${textInput(layout, "minutes", "30", { inputmode: "numeric" })}${step(1)}</span><span class="ix-unit">分钟</span></span>`;
}
function whenField(layout: Layout): string {
  const id = ids(layout, "when");
  const time = renderInput({ id: id.control, placeholder: "10:00", describedBy: `${id.hint} ${id.error}`, className: "ix-time-input",
    attrs: { "data-when-part": "time", "aria-label": "开始时刻（24 小时制）", autocomplete: "off", inputmode: "numeric" } });
  return `<span class="ix-when">${dateInput(layout, "when", true)}${time}<span class="ix-zone">${esc(zone.label)}</span></span>`;
}
function referenceList(layout: Layout): string {
  return group(layout, "references", references.map((ref, index) => `<button type="button" class="ix-ref" data-reference="${index}" aria-pressed="false">
      <span class="ix-ref-glyph">${icon(ref.kind === "goal" ? "target" : "file")}</span>
      <span class="ix-ref-text"><span class="ix-ref-title">${esc(ref.label)}</span><span class="ix-ref-meta">${ref.kind === "goal" ? "Goal" : "文档"} · 示例候选</span></span>
      <span class="ix-ref-check" aria-hidden="true">${icon("check")}</span></button>`).join(""), "ix-refs");
}
function questionCard(layout: Layout): string {
  const title = `${layout}-question-title`;
  return `<article class="ix-card ix-question" data-question-card aria-labelledby="${title}">
    <header class="ix-card-head">
      <div class="ix-heading"><span class="ix-kicker">${icon("question")}<span data-question-kicker>需要你补充 · 7 项</span></span><h3 id="${title}">${copy[layout].question}</h3></div>
      <span class="ix-badge" data-question-badge></span>
      ${renderButton({ label: "收起问卷", icon: "chevron-up", iconOnly: true, variant: "ghost", className: "ix-collapse", attrs: { "data-action": "close" } })}
    </header>
    <div class="ix-banner" data-question-state hidden><p data-question-message></p><div class="ix-actions">${button("请助理重新问", "reopen")}${button("取消这次回答", "cancel-pending", "ghost")}</div></div>
    <form class="ix-form" novalidate data-question-form>
      <p class="ix-intro">全部必填。预填只是起点，交回前都可以改；提交只交回答案，创建安排会另请你确认。</p>
      <fieldset class="ix-fields" data-fields><legend class="mw-sr-only">${copy[layout].question}</legend>
        ${row(layout, "format", formatOptions(layout), "推荐依据：两项重点都需要现场演示。", false)}
        ${row(layout, "topics", topicChoices(layout), "可以多选。选中只是在填写参数。", false)}
        ${row(layout, "notes", `${textInput(layout, "notes", "例如：只讨论首次使用遇到的卡点")}
          <div class="ix-conflict" data-conflict hidden><p data-conflict-text></p><div class="ix-actions">${button("采用文字里的时长", "adopt")}${button("保留字段值", "keep", "ghost")}</div></div>`,
          "也可以在下方输入框里说，回车后放进这里。")}
        ${row(layout, "minutes", minutesField(layout), `${timeLimits.minMinutes}–${timeLimits.maxMinutes} 分钟，整数。`)}
        ${row(layout, "date", dateInput(layout, "date"), "需要在开始当天或之前准备好。")}
        ${row(layout, "when", whenField(layout), "时区随问题给定，不需要输入。")}
        ${row(layout, "references", referenceList(layout), `从可用材料里选 1–${timeLimits.maxReferences} 份 · <span data-reference-count>已选 0</span>`, false)}
      </fieldset>
      <footer class="ix-card-foot"><p class="ix-foot-note" data-question-status role="status">草稿只在本页保留</p><kbd class="ix-keys">⌘ / Ctrl + 回车 提交</kbd>
        <div class="ix-actions">${button("不回答", "cancel", "ghost")}${renderButton({ label: "提交回答", type: "submit", attrs: { "data-submit": true } })}</div></footer>
    </form>
    <div class="ix-answered" data-answered hidden><dl data-answered-summary></dl>${button("调整回答", "revise", "ghost")}</div>
  </article>
  <button type="button" class="ix-collapsed" data-closed data-action="open" hidden>${icon("question")}<span class="ix-collapsed-title">${copy[layout].question}</span><span class="ix-collapsed-meta">草稿已保留 · 展开</span>${icon("chevron-down")}</button>`;
}
function operationCard(layout: Layout): string {
  const title = `${layout}-operation-title`, preview = `${layout}-preview-title`;
  return `<article class="ix-card ix-operation" data-operation tabindex="-1" aria-labelledby="${title}">
    <header class="ix-card-head">
      <div class="ix-heading"><span class="ix-kicker">${icon("zap")}操作建议 · 不会自动执行</span><h3 id="${title}">${copy[layout].operation}</h3></div>
      <span class="ix-badge" data-execution-badge></span>
    </header>
    <p class="ix-target">${icon("target")}<span>作用于</span><strong>秋季工作台 · 内部试用</strong><span class="ix-version" data-version-chip></span></p>
    <p class="ix-impact">${icon("info")}<span>${copy[layout].impact}</span></p>
    <div class="ix-actions" data-op-actions>${button("调整回答", "revise", "ghost")}${button("预览参数", "preview")}</div>
    <section class="ix-preview" data-preview hidden tabindex="-1" aria-labelledby="${preview}">
      <h4 id="${preview}">将使用这些参数</h4><dl data-summary></dl>
      <p class="ix-hint">目标：秋季工作台 · 内部试用 <span data-version></span></p>
      <div class="ix-actions ix-actions--end" data-preview-actions>${button("返回调整", "revise", "ghost")}${button("执行（模拟）", "execute", "primary")}</div>
    </section>
    <p class="ix-exec" data-execution-message role="status"></p>
    <div class="ix-actions" data-recovery hidden>${button("核对结果", "reconcile")}${button("检查参数并重试", "retry")}</div>
    <section class="ix-result" data-result hidden tabindex="-1" aria-label="模拟结果">
      <span class="ix-result-mark">${icon("check")}</span>
      <div class="ix-result-body"><h4>${copy[layout].result}（模拟）</h4><p>这是一份模拟摘要：没有创建日程、修改文件或启动新任务。</p>
        <div class="ix-actions">${button("打开示例摘要", "result")}${button("继续调整", "continue", "ghost")}</div>
        <div class="ix-result-details" data-result-details hidden><h5>示例摘要</h5><p data-result-summary></p></div></div>
    </section>
  </article>`;
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
