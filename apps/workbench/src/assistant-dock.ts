import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";

/** The glyphs the side pane draws for kinds of things and states, rendered once from the shared icon set. */
const ASSISTANT_GLYPHS: readonly MolisWorkIcon[] = ["file", "note", "image", "zap", "check", "circle", "clock", "flag", "undo", "edit", "alert", "circle-alert", "sparkles", "package",
  "code", "idea", "inbox", "target", "database", "workflow", "upload", "bell", "paperclip", "text", "status-waiting", "x",
  "question", "shield", "terminal", "external", "eye", "search", "list", "refresh"];

/**
 * The resident Assistant: its panel of works and the composer, which at rest is only the input, “+” and send. Where to
 * go lives at the bar's left and search in the project menu (and ⌘K); the project list uses the same composer.
 */
export function renderAssistantDock(primitives: { L(value: string): string; icon(name: MolisWorkIcon): string }): string {
  const { L, icon } = primitives;
  return `<div class="bar-center" data-assistant-island>
      <section class="assistant-panel" data-assistant-panel aria-label="${L("助理")}" hidden>
        <template data-assistant-glyphs>${ASSISTANT_GLYPHS.map((name) => `<span data-glyph="${name}">${icon(name)}</span>`).join("")}</template>
        <header class="assistant-tabbar">
          <div class="assistant-tabs" data-assistant-tabs role="tablist" aria-label="${L("打开的工作")}"></div>
          <button class="assistant-tab-new" type="button" data-assistant-new aria-label="${L("开始一项新工作")}" title="${L("开始一项新工作")}">${icon("plus")}</button>
          <span class="assistant-tabbar-actions">
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
                  <button class="assistant-control" type="button" data-assistant-control="pause" hidden>${L("暂停")}</button>
                  <button class="assistant-control" type="button" data-assistant-control="resume" hidden>${L("继续")}</button>
                  <button class="assistant-control assistant-control--stop" type="button" data-assistant-control="stop" hidden>${L("停止")}</button>
                </span>
              </div>
              <p class="assistant-summary-title" data-assistant-work-title>${L("新工作")}</p>
              <p class="assistant-summary-now" data-assistant-now hidden></p>
              <button class="mw-btn mw-btn--primary mw-btn--sm assistant-next" type="button" data-assistant-next hidden></button>
              <dl class="assistant-summary-meta" data-assistant-meta></dl>
            </section>
            <section class="assistant-block assistant-block--attention" data-assistant-block="attention" aria-label="${L("还等你处理")}" hidden></section>
            <section class="assistant-block" data-assistant-block="path" aria-label="${L("路径")}" hidden></section>
            <section class="assistant-block" data-assistant-block="materials" aria-label="${L("材料")}" hidden></section>
            <section class="assistant-block" data-assistant-block="results" aria-label="${L("成果")}" hidden></section>
            <section class="assistant-block assistant-block--usage" data-assistant-usage hidden></section>
          </aside>
          <div class="assistant-main">
            <div class="assistant-strip" data-assistant-strip hidden>
              <span class="assistant-state" data-assistant-strip-state></span>
              <span class="assistant-strip-now" data-assistant-strip-now></span>
              <span class="assistant-strip-actions">
                <button class="mw-btn mw-btn--primary mw-btn--sm" type="button" data-assistant-strip-next hidden></button>
                <button class="assistant-control" type="button" data-assistant-control="pause" hidden>${L("暂停")}</button>
                <button class="assistant-control" type="button" data-assistant-control="resume" hidden>${L("继续")}</button>
                <button class="assistant-control assistant-control--stop" type="button" data-assistant-control="stop" hidden>${L("停止")}</button>
              </span>
            </div>
            <div class="assistant-thread" data-assistant-thread role="log" aria-live="polite" aria-relevant="additions">
              <div class="assistant-empty" data-assistant-empty><strong>${L("你的个人工作助理")}</strong><p>${L("说出要做的事：整理资料、起草、查询、安排后续……它会使用你已授权的能力推进，改动数据前先请你确认。")}</p><div class="assistant-empty-list" data-assistant-empty-list></div></div>
            </div>
            <button class="assistant-jump" type="button" data-assistant-jump hidden></button>
          </div>
        </div>
      </section>
      <div class="assistant-popover" id="assistant-materials" data-assistant-materials-list role="group" aria-label="${L("本次发送带上的材料")}" hidden></div>
      <div class="assistant-popover" id="assistant-executors" data-assistant-executors role="group" aria-label="${L("由谁来做")}" hidden></div>
      <div class="assistant-popover" id="assistant-modes" data-assistant-modes role="group" aria-label="${L("下一轮的方式")}" hidden></div>
      <div class="assistant-popover" id="assistant-characters" data-assistant-characters role="group" aria-label="${L("由哪个角色负责")}" hidden></div>
      <div class="assistant-popover" data-assistant-starters role="group" aria-label="${L("可以这样开始")}" hidden></div>
      <div class="assistant-context-actions" data-assistant-context-actions data-state="idle" role="toolbar" aria-label="${L("当前内容的动作")}"></div>
      <div class="assistant-offer" data-assistant-offer role="status" aria-live="polite" hidden></div>
      <div class="assistant-popover assistant-notices" id="assistant-notices" data-assistant-notices role="group" aria-label="${L("需要你看看")}" hidden></div>
      <div class="assistant-popover assistant-more" id="assistant-more" data-assistant-more role="group" aria-label="${L("添加")}" hidden></div>
      <form class="assistant-composer bar-composer" id="assistant-composer" data-assistant-composer aria-label="Molis Work Assistant">
        <span class="assistant-target" data-assistant-target-wrap><button class="assistant-target-main" type="button" data-assistant-target title="${L("下一次发送给哪项工作")}"><span data-assistant-target-label>${L("新工作")}</span></button><button class="assistant-target-clear" type="button" data-assistant-target-clear aria-label="${L("改为开始新工作")}" title="${L("改为开始新工作")}" hidden>${icon("x")}</button></span>
        <button class="assistant-materials-button" type="button" data-assistant-materials aria-expanded="false" aria-controls="assistant-materials" title="${L("本次发送带上的材料")}" hidden>${icon("file")}<span class="assistant-materials-label" data-assistant-materials-label></span><span data-assistant-materials-count></span></button>
        <button class="assistant-executor" type="button" data-assistant-executor aria-haspopup="true" aria-expanded="false" aria-controls="assistant-executors" title="${L("由谁来做")}" hidden><span data-assistant-executor-label>${L("助理")}</span>${icon("chevron-up")}</button>
        <button class="assistant-attention" type="button" data-assistant-attention aria-haspopup="true" aria-expanded="false" aria-controls="assistant-notices" title="${L("需要你看看")}" hidden>${icon("bell")}<span data-assistant-attention-count></span></button>
        <button class="assistant-executor" type="button" data-assistant-character aria-haspopup="true" aria-expanded="false" aria-controls="assistant-characters" title="${L("由哪个角色负责")}" hidden><span data-assistant-character-label>${L("助理")}</span>${icon("chevron-up")}</button>
        <button class="assistant-executor" type="button" data-assistant-mode aria-haspopup="true" aria-expanded="false" aria-controls="assistant-modes" title="${L("下一轮的方式")}" hidden><span data-assistant-mode-label></span>${icon("chevron-up")}</button>
        <input class="assistant-composer-input" data-assistant-input type="text" autocomplete="off" placeholder="${L("让助理做点什么…")}" aria-label="${L("发给助理")}">
        <button class="bar-composer-attach" type="button" data-assistant-attach aria-haspopup="true" aria-expanded="false" aria-controls="assistant-more" aria-label="${L("添加文件、引用或能力")}" title="${L("添加文件、引用或能力")}">${icon("plus")}</button>
        <input type="file" data-assistant-file multiple hidden tabindex="-1" accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,.xml,.yaml,.yml,.html,.htm,.pdf,application/pdf,text/*,image/png,image/jpeg,image/gif,image/webp">
        <button class="mw-btn mw-btn--primary mw-btn--icon-only mw-btn--sm" type="submit" data-assistant-send aria-label="${L("发送")}" title="${L("发送")}" disabled>${icon("send")}</button>
      </form>
    </div>`;
}
