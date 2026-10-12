// Isolated preview consumes the existing public source barrel through tsx.
// No product build/dist or running Home is needed, and no product files are modified.
import { escapeHtml as esc, icon, renderButton, renderChoice, renderInput, renderTextarea,
  renderIconSprite, renderShellTokens, renderShapeTokens, renderControlMetrics,
  PRIMITIVE_STYLES, TYPEFACE_STYLES } from "../../packages/design-system/src/index.ts";
import { formats, topics, references, labels, type Field, type Layout } from "./model.ts";
import { styles } from "./styles.ts";

const button = (label: string, action: string, primary = false) => renderButton({ label,
  variant: primary ? "primary" : "secondary", attrs: { "data-action": action } });
function field(layout: Layout, name: Field, control: string, hint = ""): string {
  const id = `${layout}-${name}`;
  return `<div class="field" data-field="${name}"><label id="${id}-label" for="${id}">${labels[name]} <span class="required">必填</span></label>
    ${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ""}${control}
    <p class="field-error" id="${id}-error" hidden></p></div>`;
}
function choices(layout: Layout, name: "format" | "topics"): string {
  const list = name === "format" ? formats : topics.map(label => ({ label, description: "", recommended: false }));
  return field(layout, name, `<div class="choices ${name}" role="group" tabindex="-1" id="${layout}-${name}" aria-labelledby="${layout}-${name}-label" aria-describedby="${layout}-${name}-error">${list.map((option, index) =>
    `<div class="choice-option">${renderChoice({ label: option.label, attrs: { "data-choice": name, "data-index": index } })}
     ${option.description ? `<p>${esc(option.description)}${option.recommended ? '<span class="recommend-mark">推荐</span>' : ""}</p>` : ""}</div>`).join("")}</div>`, name === "topics" ? "可以多选。选中只是在填写参数。" : "");
}
function textField(layout: Layout, name: "notes" | "minutes" | "date" | "when", hint: string, placeholder: string): string {
  const options = { id: `${layout}-${name}`, name, describedBy: `${layout}-${name}-hint ${layout}-${name}-error`,
    placeholder, attrs: { "data-value": name, ...(name === "minutes" ? { inputmode: "numeric" } : {}) } };
  return field(layout, name, name === "notes" ? renderTextarea({ ...options, rows: 2 }) : renderInput(options), hint);
}
function questionnaire(layout: Layout): string {
  return `<section class="question-panel" aria-labelledby="${layout}-question-title">
    <header class="panel-heading"><div><span class="eyebrow">补充信息 · 演示问卷</span><h2 id="${layout}-question-title">把这次复盘安排好</h2></div>
      ${renderButton({ label: "收起问卷", icon: "chevron-up", iconOnly: true, variant: "ghost", attrs: { "data-action": "close" } })}</header>
    <p class="question-intro">选好重点，再补充时间和材料。填写只会交回答案；创建安排会另请你确认。</p>
    <form novalidate data-question-form><fieldset data-fields><legend class="mw-sr-only">复盘安排</legend>
      ${choices(layout, "format")}${choices(layout, "topics")}
      ${textField(layout, "notes", "和下方自然补充是同一份文字，不会相互覆盖。", "例如：只讨论首次使用遇到的卡点")}
      <div class="conflict" data-conflict hidden><p data-conflict-text></p><div class="actions">${button("采用文字里的时长", "adopt")}${button("保留字段值", "keep")}</div></div>
      <div class="field-grid">${textField(layout, "minutes", "15–120 分钟，整数", "30")}${textField(layout, "date", "YYYY-MM-DD", "2026-10-15")}</div>
      ${textField(layout, "when", "日期、时间及明确时区；示例为洛杉矶 UTC−07:00。", "2026-10-16T10:00-07:00")}
      ${field(layout, "references", `<div class="reference-list" role="group" tabindex="-1" id="${layout}-references" aria-labelledby="${layout}-references-label" aria-describedby="${layout}-references-error">${references.map((ref, index) =>
        `<button type="button" data-reference="${index}" aria-pressed="false">${icon(ref.kind === "goal" ? "target" : "file-text")}<span>${esc(ref.label)}<small>${ref.kind === "goal" ? "示例 Goal" : "示例文档"}</small></span><span class="ref-check" aria-hidden="true">${icon("check")}</span></button>`).join("")}</div>`, "固定示例资料，选择 1–2 份；这里没有搜索真实对象或权限。")}
      </fieldset><footer class="question-footer"><span>草稿仅保留在本页</span><div class="actions">${button("不回答", "cancel")}${renderButton({ label: "提交回答 · 演示", type: "submit", attrs: { "data-submit": true } })}</div></footer>
    </form>
    <div class="question-state" data-question-state hidden><p data-question-message></p><div class="actions">${button("重新准备，保留草稿", "reopen")}${button("取消这次回答", "cancel-pending")}</div></div>
  </section><div class="closed-question" data-closed hidden>${button("展开问卷 · 草稿已保留", "open")}</div>`;
}
function operationCard(layout: Layout): string {
  return `<section class="operation-panel" data-operation hidden aria-labelledby="${layout}-operation-title">
    <header class="panel-heading"><div><span class="eyebrow">下一步 · 操作建议</span><h2 id="${layout}-operation-title">${layout === "coding" ? "准备一次交互验收" : "创建复盘安排"}</h2></div>${icon("arrow-up-right")}</header>
    <p>回答已接收。先核对目标与参数，再决定是否执行。</p>
    <p class="impact">${icon("info")}真实接入后，这一步会${layout === "coding" ? "创建验收安排；不会自动改动代码" : "创建日程"}。本页只做模拟。</p>
    <div class="actions">${button("预览参数", "preview")}${button("调整回答", "revise")}</div>
    <div class="parameter-preview" data-preview hidden><h3>将使用这些参数</h3><dl data-summary></dl>
      <p class="hint">目标：秋季工作台 · 内部试用 <span data-version></span></p>
      <div class="actions">${button("返回调整", "revise")}${button("模拟执行", "execute", true)}</div></div>
    <p data-execution-message role="status"></p>
    <div class="actions" data-recovery hidden>${button("核对模拟结果", "reconcile")}${button("检查参数并重试", "retry")}</div>
  </section>
  <section class="result-panel" data-result hidden tabindex="-1" aria-label="模拟结果">
    <span class="result-symbol">${icon("check")}</span><div><span class="eyebrow">演示结果</span><h2>复盘安排已准备好</h2><p>这是一份模拟摘要。没有创建日程、修改文件或启动新任务。</p>
    <div class="actions">${button("打开示例摘要", "result")}${button("继续调整", "continue")}</div>
    <div data-result-details hidden><h3>复盘安排 · 示例摘要</h3><p data-result-summary></p></div></div></section>`;
}
function composer(layout: Layout): string {
  return `<footer class="composer-dock"><div class="composer-context">${icon("paperclip")}<span>秋季工作台 / 内部试用</span><span data-draft-label>未提交草稿</span></div>
    <div class="composer-row" data-composer-row><div class="composer-input">${renderTextarea({ id: `${layout}-composer`, rows: 2,
      placeholder: "继续补充，例如：时长改为 45 分钟", attrs: { "aria-label": "自然补充", "data-composer": true } })}</div>
      ${renderButton({ label: "查看下一步", icon: "arrow-right", variant: "secondary", className: "next-step", attrs: { "data-action": "next", "data-next": true } })}</div>
    <p class="composer-help">文字与问卷共享草稿 · 推荐不会自动执行 · 所有提交均为演示</p></footer>`;
}
function scene(layout: Layout): string {
  return `<section class="scene ${layout}" data-scene="${layout}" ${layout === "coding" ? "hidden" : ""}>
    <aside class="context-panel">${layout === "assistant" ? `<span class="eyebrow">手上的工作</span><h2>秋季工作台</h2><p>把试用里遇到的细节，变成下一次更顺畅的体验。</p><div class="context-item active">${icon("message-circle")}安排一次复盘</div><div class="context-item">${icon("file-text")}10 月试用反馈</div><div class="context-item">${icon("target")}内部试用</div><p class="context-foot">示例资料<br>没有连接真实项目</p>` :
    `<span class="eyebrow">Coding · 专业内容保留</span><h2>交互细节检查</h2><div class="code-file">${icon("file-code")} interaction.ts <span>只读示例</span></div><pre class="code-preview"><code><span class="code-muted">// 只读示意，不执行代码</span>\nfunction updateQuestion(next) {\n  preserveDraft();\n  keepFocus();\n  renderStatus(next);\n}\n\n<span class="code-added">+ 保留正在填写的内容</span>\n<span class="code-added">+ 明确标出结果未知</span>\n<span class="code-muted">  专业 Diff 与问询并排</span></code></pre><p class="hint">这里仅展示布局。没有读取仓库、运行命令或创建变更。</p>`}</aside>
    <div class="conversation"><div class="conversation-header"><span>${layout === "assistant" ? "个人助理" : "Coding 对话"}</span><span class="quiet">同一套交互组件</span></div>
      <div class="thread" data-thread><div class="human-message">${layout === "assistant" ? "帮我安排一次内部试用复盘，聚焦首次使用和失败恢复。" : "先帮我准备交互验收安排，重点看草稿保留和失败恢复，暂时不要改代码。"}</div>
      <div class="assistant-message"><span class="assistant-mark">${icon("sparkles")}</span><div><p>可以。先补齐安排所需的信息。</p><p class="quiet">填完交回后，我会把待执行参数放在一起，供你确认。</p></div></div>
      <p class="status-line" data-notice role="status" aria-live="polite"></p>
      ${questionnaire(layout)}${operationCard(layout)}</div>${composer(layout)}</div></section>`;
}
function controls(): string {
  return `<details class="demo-controls"><summary>${icon("sliders-horizontal")}演示状态 · 可操作</summary><div class="control-groups">
    <div><span>问卷与对象</span><div class="actions">${button("后台更新", "background")}${button("问题过期", "expire")}${button("替换问题", "replace")}${button("对象改版", "object")}</div></div>
    <div><span>下次模拟结果</span><div class="actions">${button("正常完成", "outcome-done")}${button("回答失败", "answer-failure")}${button("执行失败", "outcome-failed")}${button("执行未知", "outcome-unknown")}</div></div>
    <p data-demo-mode>下次：回答成功 / 执行完成</p><p data-counts>演示回答 0 次 · 演示执行 0 次</p></div></details>`;
}
export function renderPreview(): string {
  const tokens = `:root{${renderShellTokens("light")}${renderShapeTokens()}${renderControlMetrics()}}:root[data-theme="dark"]{${renderShellTokens("dark")}}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AI 交互 · I0 独立演示</title>
    <link rel="icon" href="data:,"><style>${tokens}${TYPEFACE_STYLES}${PRIMITIVE_STYLES}${styles}</style></head><body>${renderIconSprite()}
    <header class="topbar"><a class="wordmark" href="/" aria-label="Molis Work 交互演示">${icon("layers")}<strong>Molis Work</strong><span>交互切片 I0</span></a>
      <div class="top-actions"><div class="layout-switch" role="group" aria-label="示例布局">${renderButton({ label: "个人助理", variant: "ghost", attrs: { "data-layout": "assistant", "aria-pressed": "true" } })}${renderButton({ label: "Coding", variant: "ghost", attrs: { "data-layout": "coding", "aria-pressed": "false" } })}</div>
      ${renderButton({ label: "切换深色", icon: "moon", variant: "ghost", attrs: { "data-theme-toggle": true } })}</div></header>
    <div class="demo-banner"><span class="demo-dot"></span><strong>独立演示</strong><span>固定示例资料 · 提交与执行均为模拟 · 不连接真实 Home</span></div>
    <main>${scene("assistant")}${scene("coding")}</main>${controls()}<script type="module" src="/slice/client.ts"></script></body></html>`;
}
