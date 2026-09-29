import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";

/**
 * The resident Assistant: its panel of works and the composer. The workbench puts the plugin switcher in front of the
 * input; the project list, which has no plugins, leaves it out and works in personal scope.
 */
export function renderAssistantDock(primitives: { L(value: string): string; icon(name: MolisWorkIcon): string }, options: { picker?: string; search?: boolean } = {}): string {
  const { L, icon } = primitives;
  const picker = options.picker ?? "";
  return `<div class="bar-center" data-assistant-island>
      <section class="assistant-panel" data-assistant-panel aria-label="${L("助理")}" hidden>
        <header class="assistant-head">
          <button class="assistant-work-switch" type="button" data-assistant-works-toggle aria-expanded="false" aria-controls="assistant-works" title="${L("切换工作")}">
            <span class="assistant-work-title" data-assistant-work-title>${L("新工作")}</span><span class="assistant-state" data-assistant-work-state></span>${icon("chevron-down")}
          </button>
          <span class="assistant-work-scope" data-assistant-work-scope></span>
          <button class="assistant-work-executor" type="button" data-assistant-open-executor hidden></button>
          <button class="assistant-work-executor" type="button" data-assistant-handover hidden></button>
          <span class="assistant-head-actions">
            <button class="dock-window-action" type="button" data-assistant-control="pause" hidden>${L("暂停")}</button>
            <button class="dock-window-action" type="button" data-assistant-control="resume" hidden>${L("继续")}</button>
            <button class="dock-window-action" type="button" data-assistant-control="stop" hidden>${L("停止")}</button>
            <button class="dock-window-action" type="button" data-assistant-new title="${L("开始一项新工作")}">${icon("plus")}<span>${L("新工作")}</span></button>
            <button class="dock-window-action" type="button" data-assistant-panel-close aria-label="${L("最小化")}" title="${L("最小化")}">${icon("chevron-down")}</button>
          </span>
        </header>
        <nav class="assistant-works" id="assistant-works" data-assistant-works aria-label="${L("我的工作")}" hidden></nav>
        <div class="assistant-objects" data-assistant-objects hidden></div>
        <div class="assistant-thread" data-assistant-thread role="log" aria-live="polite" aria-relevant="additions">
          <div class="assistant-empty" data-assistant-empty><strong>${L("你的个人工作助理")}</strong><p>${L("说出要做的事：整理资料、起草、查询、安排后续……它会使用你已授权的能力推进，改动数据前先请你确认。")}</p></div>
        </div>
      </section>
      <div class="assistant-popover" id="assistant-materials" data-assistant-materials-list role="group" aria-label="${L("本次发送带上的材料")}" hidden></div>
      <div class="assistant-popover" id="assistant-executors" data-assistant-executors role="group" aria-label="${L("由谁来做")}" hidden></div>
      <div class="assistant-popover" id="assistant-modes" data-assistant-modes role="group" aria-label="${L("下一轮的方式")}" hidden></div>
      <div class="assistant-popover" id="assistant-characters" data-assistant-characters role="group" aria-label="${L("由哪个角色负责")}" hidden></div>
      <div class="assistant-popover" data-assistant-starters role="group" aria-label="${L("可以这样开始")}" hidden></div>
      <div class="assistant-offer" data-assistant-offer role="status" aria-live="polite" hidden></div>
      <form class="assistant-composer bar-composer" id="assistant-composer" data-assistant-composer aria-label="Molis Work Assistant">
${picker}        <span class="assistant-target" data-assistant-target-wrap><button class="assistant-target-main" type="button" data-assistant-target title="${L("下一次发送给哪项工作")}"><span data-assistant-target-label>${L("新工作")}</span></button><button class="assistant-target-clear" type="button" data-assistant-target-clear aria-label="${L("改为开始新工作")}" title="${L("改为开始新工作")}" hidden>${icon("x")}</button></span>
        <button class="assistant-executor" type="button" data-assistant-executor aria-haspopup="true" aria-expanded="false" aria-controls="assistant-executors" title="${L("由谁来做")}" hidden><span data-assistant-executor-label>${L("助理")}</span>${icon("chevron-up")}</button>
        <button class="assistant-executor" type="button" data-assistant-character aria-haspopup="true" aria-expanded="false" aria-controls="assistant-characters" title="${L("由哪个角色负责")}" hidden><span data-assistant-character-label>${L("助理")}</span>${icon("chevron-up")}</button>
        <button class="assistant-executor" type="button" data-assistant-mode aria-haspopup="true" aria-expanded="false" aria-controls="assistant-modes" title="${L("下一轮的方式")}" hidden><span data-assistant-mode-label></span>${icon("chevron-up")}</button>
        <button class="assistant-materials-button" type="button" data-assistant-materials aria-expanded="false" aria-controls="assistant-materials" title="${L("本次发送带上的材料")}" hidden>${icon("paperclip")}<span data-assistant-materials-count></span></button>
        <input class="assistant-composer-input" data-assistant-input type="text" autocomplete="off" placeholder="${L("让助理做点什么…")}" aria-label="${L("发给助理")}">
        <button class="bar-composer-attach" type="button" data-assistant-attach aria-label="${L("添加文件")}" title="${L("添加文件")}">${icon("plus")}</button>
        <input type="file" data-assistant-file multiple hidden tabindex="-1" accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,.xml,.yaml,.yml,.html,.htm,text/*">
${options.search ? `        <button class="bar-composer-search" type="button" data-global-search-open aria-label="${L("打开搜索")}" title="${L("打开搜索")}">${icon("search")}<kbd>⌘K</kbd></button>\n` : ""}        <button class="mw-btn mw-btn--primary mw-btn--icon-only mw-btn--sm" type="submit" data-assistant-send aria-label="${L("发送")}" title="${L("发送")}" disabled>${icon("send")}</button>
      </form>
    </div>`;
}
