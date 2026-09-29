import type { ImmersiveShellPrimitives } from "./immersive-shell.js";

/**
 * Project home, as in the Soft Workbench design: today's heading, a horizontal day strip, the Goal in progress,
 * the day's events that open in place, and a margin with a local note and the things at hand.
 * The event detail keeps one node (`data-home-detail`) that the client moves into the open row.
 */
export function renderProjectHome(name: string, { L, escapeHtml: e, icon }: ImmersiveShellPrimitives): string {
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${L("项目首页")}" data-event="off" data-dock="closed" aria-label="${e(name)} · ${L("项目首页")}" hidden>
    <div class="home-scroll" data-home-scroll>
      <header class="home-heading home-hero" data-home-hero>
        <time data-home-date></time>
      </header>
      <div class="home-layout">
        <nav class="home-dates" aria-label="${L("日期")}">
          <div class="home-dates__list" data-home-dates></div>
          <span class="home-dates__line" aria-hidden="true"></span>
          <button class="mw-btn mw-btn--ghost mw-btn--icon-only home-today" type="button" data-home-today aria-label="${L("回到今天")}" title="${L("回到今天")}">${icon("calendar")}</button>
        </nav>
        <section class="home-focus" data-home-focus aria-labelledby="home-focus-title" hidden></section>
        <aside class="home-margin" aria-label="${L("手边")}">
          <section class="home-note" aria-labelledby="home-note-title">
            <div class="home-note__head"><h2 id="home-note-title">${icon("edit")}${L("随手记")}</h2><span data-home-note-state>${L("只在此浏览器保存")}</span></div>
            <textarea class="home-note__text" data-home-note maxlength="20000" aria-labelledby="home-note-title" placeholder="${L("一个想法，一个下一步。")}&#10;${L("先放在这里。")}"></textarea>
            <div class="home-note__foot"><span>${L("不必现在就整理好")}</span>${icon("note")}</div>
          </section>
          <section class="home-launch" aria-labelledby="home-launch-title">
            <h2 id="home-launch-title">${L("回到手边的内容")}</h2>
            <ul class="home-quick" data-home-quick></ul>
            <ul class="home-shortcuts" data-home-shortcuts aria-label="${L("快捷方式")}"><li class="home-shortcut home-shortcut-add"><button type="button" class="home-shortcut-main" data-home-shortcut-add><span class="home-shortcut-icon">${icon("plus")}</span><span>${L("添加快捷方式")}</span></button></li></ul>
            <p class="home-shortcut-error" data-home-shortcut-error role="alert" hidden></p>
          </section>
          <section class="placement-related" data-placement-related aria-label="${L("关联资料")}" hidden></section>
          <p class="home-margin-note">${icon("shield")}${L("你的节奏，你的工作空间。")}</p>
        </aside>
        <section class="home-tl" aria-label="${L("当天的事件")}">
          <div class="home-tl__head"><h2>${L("当天的事件")}<small data-home-list-count></small></h2><span data-home-list-stats></span></div>
          <div class="home-tl__rows" data-home-list></div>
        </section>
      </div>
    </div>
    <div class="home-detail-holder" data-home-detail-holder hidden>
      <aside class="home-detail" data-home-detail aria-label="${L("这件事")}">
        <div class="home-detail__head" data-home-detail-head></div>
        <div class="home-detail__body" data-home-detail-body></div>
        <div class="home-detail__act" data-home-detail-act></div>
      </aside>
    </div>
    <div class="home-talk paper" data-home-talk role="dialog" aria-label="${L("对着这件事说一句")}" hidden>
      <div class="home-talk__head">
        <b>${L("说一句")}</b>
        <span data-home-talk-ctx></span>
        <button class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" type="button" data-home-close-talk aria-label="${L("收起对话")}">${icon("x")}</button>
      </div>
      <div class="home-talk__body" data-home-talk-body></div>
      <form class="home-talk__compose" data-home-talk-form>
        <textarea class="mw-textarea" name="say" rows="2" maxlength="20000" aria-label="${L("消息文本")}" placeholder="${L("带着这件事说一句")}"></textarea>
        <button class="mw-btn mw-btn--primary mw-btn--icon-only" type="submit" aria-label="${L("发送消息")}" disabled>${icon("send")}</button>
      </form>
    </div>
    <template data-home-shortcut-template><li class="home-shortcut"><a class="home-shortcut-main" target="_blank" rel="noopener noreferrer" data-home-shortcut-link data-home-external><span class="home-shortcut-icon">${icon("link")}</span><span data-home-shortcut-name></span></a><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only home-shortcut-edit" data-home-shortcut-edit>${icon("more")}</button></li></template>
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
