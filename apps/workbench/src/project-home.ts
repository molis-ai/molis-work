import type { ImmersiveShellPrimitives } from "./immersive-shell.js";

export function renderProjectHome(name: string, { L, escapeHtml: e, icon }: ImmersiveShellPrimitives): string {
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${L("项目首页")}" aria-label="${e(name)} · ${L("项目首页")}" hidden>
    <div class="project-home-content">
      <section class="home-context" aria-label="${L("今天与日历")}">
        <div class="home-date-panel">
          <p class="home-date-year" data-home-year></p>
          <h1 class="home-today"><time data-home-date></time><span data-home-weekday></span></h1>
        </div>
        <section class="home-calendar mw-calendar mw-calendar--compact" data-slot="calendar" aria-label="${L("月历")}">
          <header class="mw-calendar__header"><span data-home-month data-calendar-title></span><div class="mw-group home-month-actions"><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-home-month-step="-1" aria-label="${L("上个月")}">${icon("back")}</button><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-home-month-step="1" aria-label="${L("下个月")}">${icon("chevron-right")}</button></div></header>
          <table class="mw-calendar__grid"><thead><tr data-home-weekdays></tr></thead><tbody data-home-calendar></tbody></table>
        </section>
      </section>
      <section class="home-launch" aria-label="${L("快捷方式与 Agent 输入")}">
        <ul class="home-shortcuts" data-home-shortcuts aria-label="${L("快捷方式")}"><li class="mw-card mw-card--tile home-shortcut home-shortcut-add" data-slot="card"><button type="button" class="home-shortcut-main" data-home-shortcut-add><span class="home-shortcut-icon">${icon("plus")}</span><span>${L("添加快捷方式")}</span></button></li></ul>
        <div class="home-composer"><span class="home-agent-icon" aria-hidden="true">${icon("sparkles")}</span><input class="mw-input" type="text" data-home-agent-input placeholder="${L("你想推进什么？")}" aria-label="${L("Agent 尚未开放，暂不可输入")}" aria-describedby="home-agent-status" disabled><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only home-send" disabled aria-label="${L("Agent 即将接入，暂不可发送")}">${icon("arrow")}</button></div>
        <p class="home-agent-note" id="home-agent-status">${icon("lock")}<span>${L("Agent 尚未开放")}</span></p>
        <p class="home-shortcut-error" data-home-shortcut-error role="alert" hidden></p>
      </section>
    </div>
    <template data-home-shortcut-template><li class="mw-card mw-card--tile home-shortcut" data-slot="card"><a class="home-shortcut-main" target="_blank" rel="noopener noreferrer" data-home-shortcut-link data-home-external><span class="home-shortcut-icon">${icon("link")}</span><span data-home-shortcut-name></span></a><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only home-shortcut-edit" data-home-shortcut-edit>${icon("more")}</button></li></template>
    <dialog class="mw-dialog home-shortcut-dialog" data-slot="dialog" data-home-shortcut-dialog aria-labelledby="home-shortcut-title">
      <form data-home-shortcut-form novalidate>
        <header><h2 id="home-shortcut-title">${L("添加快捷方式")}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-home-shortcut-cancel aria-label="${L("关闭")}">${icon("x")}</button></header>
        <label class="mw-field"><span class="mw-field__label">${L("名称")}</span><input class="mw-input" name="shortcut_name" maxlength="32" autocomplete="off" required placeholder="${L("例如：项目文档")}"></label>
        <label class="mw-field"><span class="mw-field__label">${L("网址")}</span><input class="mw-input" name="shortcut_url" type="url" maxlength="4096" autocomplete="off" required placeholder="https://"></label>
        <p class="home-shortcut-form-error" data-home-shortcut-form-error role="alert"></p>
        <footer><button class="mw-btn mw-btn--danger-outline home-shortcut-remove" type="button" data-home-shortcut-remove hidden>${L("移除")}</button><button class="mw-btn mw-btn--secondary" type="button" data-home-shortcut-cancel>${L("取消")}</button><button class="mw-btn mw-btn--primary home-shortcut-save" type="submit">${L("保存")}</button></footer>
      </form>
    </dialog>
  </section>`;
}
