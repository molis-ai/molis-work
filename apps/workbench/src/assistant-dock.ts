import { escapeHtml, renderButton, renderComposer, t, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";

/** The glyphs the side pane draws for kinds of things and states, rendered once from the shared icon set. */
const ASSISTANT_GLYPHS: readonly PluginIconName[] = ["file", "note", "image", "zap", "check", "circle", "clock", "flag", "undo", "edit", "alert", "circle-alert", "sparkles", "package",
  "code", "idea", "inbox", "target", "database", "workflow", "upload", "bell", "paperclip", "text", "status-waiting", "x",
  "question", "shield", "terminal", "external", "eye", "search", "list", "refresh", "folder", "git-branch", "link", "user"];

/**
 * The resident Assistant: its panel of works and the platform's composer (unified-input K3), drawn here as its first screen so
 * nothing moves when the island mounts it: who the next message goes to, the text, ＋ and send. Where to go lives at the bar's
 * left and search in the project menu (and ⌘K); the project list uses the same Dock. The bell sits on the receiver row.
 */
export function renderAssistantDock(primitives: { L(value: string): string; icon(name: PluginIconName): string }): string {
  const { L, icon } = primitives;
  // The ordinary send while a turn runs, by its stable key; the island's script reads it back from the composer's mount.
  const add = t.text("workbench.composer.next-boundary");
  return `<div class="bar-center" data-assistant-island data-system-view-owner="assistant">
      <section class="assistant-panel" data-assistant-panel aria-label="${L("助理")}" hidden>
        <template data-assistant-glyphs>${ASSISTANT_GLYPHS.map((name) => `<span data-glyph="${name}">${icon(name)}</span>`).join("")}</template>
        <header class="assistant-tabbar">
          <div class="assistant-tabs" data-assistant-tabs data-overflow-fade role="tablist" aria-label="${L("打开的工作")}"></div>
          <button class="assistant-tab-new" type="button" data-assistant-new aria-label="${L("开始一项新工作")}" title="${L("开始一项新工作")}">${icon("plus")}</button>
          <span class="assistant-tabbar-actions">
            <button class="dock-window-action" type="button" data-assistant-expand aria-label="${L("在主区展开")}" title="${L("在主区展开")}" disabled>${icon("external")}</button>
            ${renderButton({ variant: "ghost", size: "sm", icon: "chevron-down", label: L("收回底部"), attrs: { "data-assistant-retract": true, hidden: true } })}
            <button class="dock-window-action" type="button" data-assistant-works-toggle aria-expanded="false" aria-controls="assistant-works" aria-label="${L("全部工作")}" title="${L("全部工作")}">${icon("list")}</button>
            <button class="dock-window-action assistant-side-toggle" type="button" data-assistant-side-toggle aria-expanded="true" aria-controls="assistant-side" aria-label="${L("这项工作的详情")}" title="${L("这项工作的详情")}">${icon("sidebar")}<span class="assistant-side-dot" data-assistant-side-dot hidden></span></button>
            <button class="dock-window-action" type="button" data-assistant-panel-close aria-label="${L("最小化")}" title="${L("最小化")}">${icon("chevron-down")}</button>
          </span>
        </header>
        <nav class="assistant-works" id="assistant-works" data-assistant-works aria-label="${L("全部工作")}" hidden></nav>
        <div class="assistant-body">
          <aside class="assistant-side" id="assistant-side" data-assistant-side aria-label="${L("这项工作")}">
            <section class="assistant-summary" aria-label="${L("概况")}">
              <div class="assistant-summary-top">
                <p class="assistant-summary-state"><span class="assistant-state" data-assistant-work-state></span></p>
                <span class="assistant-summary-controls">
                  <a class="assistant-control" data-assistant-memory hidden>${L("本会话记忆")}</a>
                  <button class="assistant-control" type="button" data-assistant-control="pause" hidden>${L("暂停")}</button>
                  <button class="assistant-control" type="button" data-assistant-control="resume" hidden>${L("继续")}</button>
                  <button class="assistant-control assistant-control--stop" type="button" data-assistant-control="stop" hidden>${L("停止")}</button><button class="assistant-control" type="button" data-assistant-control="stop" data-keep-connections hidden>${L("停止任务，接入继续")}</button>
                </span>
              </div>
              <p class="assistant-summary-title" data-assistant-work-title>${L("新工作")}</p>
              <p class="assistant-summary-now" data-assistant-now hidden></p>
              <dl class="assistant-summary-meta" data-assistant-meta></dl>
            </section>
            <section class="assistant-block assistant-block--attention" data-assistant-block="attention" aria-label="${L("还等你处理")}" hidden></section>
            <section class="assistant-block" data-assistant-block="path" aria-label="${L("路径")}" hidden></section>
            <section class="assistant-block" data-assistant-block="agreements" aria-label="${L("AI 记下的约定")}" hidden></section>
            <section class="assistant-block" data-assistant-block="environment" aria-label="${L("工作环境")}" hidden></section>
            <section class="assistant-block" data-assistant-block="materials" aria-label="${L("上下文")}" hidden></section>
            <section class="assistant-block" data-assistant-block="tools" aria-label="${L("连接与工具")}" hidden></section>
            <section class="assistant-block" data-assistant-block="results" aria-label="${L("产出")}" hidden></section>
            <section class="assistant-block" data-assistant-block="changes" aria-label="${L("变更")}" hidden></section>
            <section class="assistant-block" data-assistant-block="background" aria-label="${L("后台任务")}" hidden></section>
            <section class="assistant-block assistant-block--usage" data-assistant-usage hidden></section>
          </aside>
          <div class="assistant-main">
            <div class="assistant-strip" data-assistant-strip hidden>
              <span class="assistant-state" data-assistant-strip-state></span>
              <span class="assistant-strip-now" data-assistant-strip-now></span>
              <span class="assistant-strip-actions">
                <button class="assistant-control" type="button" data-assistant-control="pause" hidden>${L("暂停")}</button>
                <button class="assistant-control" type="button" data-assistant-control="resume" hidden>${L("继续")}</button>
                <button class="assistant-control assistant-control--stop" type="button" data-assistant-control="stop" hidden>${L("停止")}</button><button class="assistant-control" type="button" data-assistant-control="stop" data-keep-connections hidden>${L("停止任务，接入继续")}</button>
              </span>
            </div>
            <div class="assistant-thread" data-assistant-thread role="log" aria-live="polite" aria-relevant="additions">
              <div class="assistant-empty" data-assistant-empty><strong>${L("你的个人工作助理")}</strong><p>${L("说出要做的事：整理资料、起草、查询、安排后续……它会使用你已授权的能力推进，改动数据前先请你确认。")}</p><div class="assistant-empty-list" data-assistant-empty-list></div></div>
            </div>
            <button class="assistant-jump" type="button" data-assistant-jump hidden></button>
          </div>
        </div>
      </section>
      <div class="assistant-context-strip" data-assistant-context-strip role="group" hidden></div>
      <div class="assistant-next-row" data-assistant-next-row hidden></div>
      <div class="assistant-popover assistant-notices" id="assistant-notices" data-assistant-notices role="group" aria-label="${L("需要你看看")}" hidden></div>
      <div class="assistant-composer" data-assistant-composer data-composer-next="${escapeHtml(add)}">
        <button class="assistant-answer" type="button" data-assistant-answer hidden></button>
        ${renderComposer({ kind: "ai", labels: assistantComposerLabels(L, true, add), placeholder: L("让助理做点什么…"), receiver: { label: L("助理"), open: true } })}
        <button class="assistant-attention" type="button" data-assistant-attention aria-haspopup="true" aria-expanded="false" aria-controls="assistant-notices" title="${L("需要你看看")}" hidden>${icon("bell")}<span data-assistant-attention-count></span></button>
      </div>
    </div>`;
}
