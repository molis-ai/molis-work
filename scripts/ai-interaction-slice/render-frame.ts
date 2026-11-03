// The workbench around the interaction, close enough to the product's geometry to judge fit: the desk, one work
// sheet, the resident bar with the Assistant rising above its composer (DESIGN.md "The bottom bar"), and Coding's
// directory · dialogue · review columns. Everything outside the interaction is decoration and says so.
import { escapeHtml, icon, renderButton, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderInteractionComposerTarget, renderInteractionNextSteps } from "../../packages/design-system/src/index.ts";
import { renderThread } from "./render-cards.ts";
import type { Layout } from "./model.ts";

const diff = (lines: Array<[number, " " | "+" | "-", string]>) => lines.map(([number, mark, code]) =>
  `<span class="cd-line${mark === "+" ? " cd-add" : mark === "-" ? " cd-del" : ""}"><span class="cd-ln">${number}</span>${mark} ${escapeHtml(code)}</span>`).join("");
const tiles = (names: PluginIconName[]) => names.map(name => `<span class="pv-tile">${icon(name)}</span>`).join("");
function bar(center: string, idle = false): string {
  return `<div class="pv-bar${idle ? " pv-bar--idle" : ""}">
    <div class="pv-tray" aria-hidden="true">${tiles(["grid", "home", "target", "file", "code"])}</div>
    <div class="pv-center">${center}</div>
    <div class="pv-tray pv-tray--own" aria-hidden="true">${tiles(["library", "idea", "message"])}<span class="pv-monogram">秋</span></div>
  </div>`;
}
/** The next steps beside the composer: one primary and at most one secondary slot, filled in by paint. */
const steps = () => renderInteractionNextSteps([{ id: "slot", label: "", source: "" }, { id: "slot", label: "", source: "", primary: false }]);
const into = renderInteractionComposerTarget("补充到问卷");
function assistantComposer(): string {
  return `<div class="pv-composer-row" data-composer-row>${steps()}
    <form class="pv-pill" data-composer-form aria-label="发给助理">
      <button type="button" class="pv-target" data-action="panel-open" hidden><span class="pv-target-mark" data-target-mark></span><span>安排试用复盘</span></button>
      ${into}<input class="pv-input" data-composer type="text" autocomplete="off" placeholder="补充要求，回车放进问卷…" aria-label="发给助理">
      ${renderButton({ label: "发送", icon: "send", iconOnly: true, type: "submit", attrs: { "data-send": true } })}
    </form></div>`;
}
function assistantScene(): string {
  return `<section class="scene scene--assistant" data-scene="assistant" data-panel="open">
    <div class="pv-sheet pv-goal" inert>
      <p class="pv-location">${icon("target")}Goals<span>›</span>内部试用</p>
      <h1>内部试用</h1><p class="pv-lede">把试用里遇到的细节，变成下一次更顺畅的体验。</p>
      <p class="pv-goal-meta"><span class="pv-status">${icon("status-progress")}进行中</span><span>秋季工作台</span><span data-object-version-page>版本 1</span></p>
      <h2>最近</h2>
      <ul class="pv-rows"><li>${icon("file")}10 月试用反馈摘录<span>今天</span></li><li>${icon("file")}交互验收清单<span>昨天</span></li><li>${icon("check")}首轮试用结束<span>10 月 9 日</span></li></ul>
      <p class="pv-decor-note">工作区内容为示意，不可操作。</p>
    </div>
    ${bar(`<section class="ap-panel" data-panel-surface aria-label="助理">
      <header class="ap-tabbar"><div class="ap-tab"><span class="ap-mark" data-tab-mark></span><span class="ap-tab-title">安排试用复盘</span></div>
        ${renderButton({ label: "最小化", icon: "chevron-down", iconOnly: true, variant: "ghost", className: "ap-minimise", attrs: { "data-action": "minimise" } })}</header>
      <div class="ap-body">
        <aside class="ap-side" aria-label="这项工作">
          <section class="ap-summary" data-summary-tone><p><span class="ap-state" data-work-state></span></p>
            <p class="ap-title">安排一次内部试用复盘</p><p class="ap-now" data-work-now></p>
            <dl class="ap-meta"><dt>作用对象</dt><dd>秋季工作台 · 内部试用 <span class="mw-ix-version" data-object-version-side></span></dd><dt>由谁来做</dt><dd>助理</dd></dl></section>
          <section class="ap-block"><h4>这次带上的材料</h4><ul class="ap-materials" data-side-materials></ul><p class="ap-empty" data-side-empty>还没有选材料。</p></section>
        </aside>
        <div class="ap-main">${renderThread("assistant")}</div>
      </div>
      <p class="ap-notice" data-notice role="status" aria-live="polite"></p>
    </section>${assistantComposer()}`)}
  </section>`;
}
function codingScene(): string {
  const session = (title: string, meta: string, current = false) =>
    `<li class="cd-session"${current ? ' aria-current="true"' : ""}>${current ? '<span class="ap-mark" data-session-mark></span>' : ""}<span class="cd-session-title">${title}</span><span class="cd-session-meta"${current ? " data-work-state" : ""}>${meta}</span></li>`;
  return `<section class="scene scene--coding" data-scene="coding" hidden>
    <div class="pv-sheet cd-layout" data-tools="closed">
      <nav class="cd-directory" aria-label="编码会话（示意）"><p class="cd-dir-head">会话</p>
        <ul>${session("交互验收准备", "等你回答", true)}${session("修复草稿被覆盖", "已完成")}${session("审查失败恢复路径", "昨天")}</ul></nav>
      <div class="cd-dialogue">
        <header class="cd-head"><div class="cd-identity"><h2>交互验收准备</h2><p class="cd-chip">${icon("folder")}molis-work · 讨论 · 只读</p></div>
          ${renderButton({ label: "结果与审查", icon: "git-compare", variant: "ghost", className: "cd-tools-toggle", attrs: { "data-action": "tools", "aria-expanded": "false", "aria-controls": "coding-tools" } })}</header>
        <div class="cd-main">${renderThread("coding")}</div>
        <p class="cd-notice" data-notice role="status" aria-live="polite"></p>
        <div class="pv-composer-row cd-composer-row" data-composer-row>${steps()}
          <form class="cd-shell" data-composer-form aria-label="发给 Coding">${into}
            <textarea class="cd-input" data-composer rows="2" placeholder="补充这一轮的要求，回车放进问卷…" aria-label="补充这一轮的要求"></textarea>
            <div class="cd-shell-bar"><span class="cd-tag">讨论</span><span class="cd-tag">示例模型</span><span class="cd-keys">Shift + 回车换行</span>
              ${renderButton({ label: "发送", type: "submit", attrs: { "data-send": true } })}</div>
          </form></div>
      </div>
      <aside class="cd-tools" id="coding-tools" data-tools-panel aria-label="结果与审查" tabindex="-1">
        <header class="cd-tools-head"><h3>结果与审查</h3><span class="mw-ix-tag cd-quiet-tag">只读示例</span>
          ${renderButton({ label: "关闭结果与审查", icon: "x", iconOnly: true, variant: "ghost", className: "cd-tools-close", attrs: { "data-action": "tools" } })}</header>
        <p class="cd-tabs"><span aria-current="true">变更</span><span>命令</span><span>报告</span></p>
        <p class="cd-file">${icon("code")}<span>interaction.ts</span><span class="cd-diffstat">+3 −1</span></p>
        <pre class="cd-diff"><code>${diff([
          [12, " ", "function updateQuestion(next) {"], [13, " ", "  keepFocus();"], [14, "-", "  form.replaceWith(render(next));"],
          [14, "+", "  mergeUntouched(form, next);"], [15, "+", "  keepDraft(form);"], [16, "+", "  markUnknownResult(next);"], [17, " ", "}"],
        ])}</code></pre>
        <p class="mw-ix-hint">只展示专业布局：没有读取仓库、运行命令或创建变更。</p>
      </aside>
    </div>
    ${bar(`<div class="pv-pill pv-pill--idle"><span>全局助理 · 这个场景不演示</span></div>`, true)}
  </section>`;
}
export function renderScene(layout: Layout): string {
  return layout === "assistant" ? assistantScene() : codingScene();
}
export function renderDemoControls(): string {
  const control = (label: string, action: string) => renderButton({ label, variant: "secondary", attrs: { "data-action": action } });
  return `<details class="demo-controls"><summary class="mw-btn mw-btn--ghost mw-btn--sm" aria-label="演示状态">${icon("tune")}<span>演示状态</span></summary>
    <div class="demo-popover" role="group" aria-label="演示状态">
      <p class="demo-title">问卷与对象</p><div class="demo-actions">${control("后台更新", "background")}${control("问题过期", "expire")}${control("替换问题", "replace")}${control("对象改版", "object")}</div>
      <p class="demo-title">下一次模拟结果</p><div class="demo-actions">${control("全部正常", "outcome-done")}${control("回答失败", "answer-failure")}${control("执行失败", "outcome-failed")}${control("执行未知", "outcome-unknown")}</div>
      <p class="demo-mode" data-demo-mode></p><p class="demo-mode" data-counts></p>
    </div></details>`;
}
