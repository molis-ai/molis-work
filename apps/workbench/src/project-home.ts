import type { ImmersiveShellPrimitives } from "./immersive-shell.js";

export function renderProjectHome(name: string, { L, escapeHtml: e, icon }: ImmersiveShellPrimitives): string {
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${L("项目首页")}" data-event="off" data-dock="closed" aria-label="${e(name)} · ${L("项目首页")}" hidden>
    <div class="home-flow">
      <nav class="home-dates" aria-label="${L("日期")}">
        <p class="home-dates__label" data-home-month></p>
        <div class="home-dates__list" data-home-dates></div>
      </nav>
      <section class="home-dayview" aria-label="${L("当天")}">
        <article class="home-hero" data-home-hero>
          <time data-home-date></time>
        </article>
        <div class="home-tl">
          <div class="home-tl__head">${icon("clock")}${L("当天的事件")}<span data-home-list-count></span></div>
          <div class="home-tl__rows" data-home-list></div>
        </div>
        <section class="home-launch" aria-label="${L("快捷方式")}">
          <ul class="home-shortcuts" data-home-shortcuts aria-label="${L("快捷方式")}"><li class="mw-card mw-card--tile home-shortcut home-shortcut-add" data-slot="card"><button type="button" class="home-shortcut-main" data-home-shortcut-add><span class="home-shortcut-icon">${icon("plus")}</span><span>${L("添加快捷方式")}</span></button></li></ul>
          <p class="home-shortcut-error" data-home-shortcut-error role="alert" hidden></p>
        </section>
      </section>
      <div class="home-eventcol">
        <aside class="home-detail" data-home-detail aria-label="${L("这件事")}">
          <div class="home-detail__head" data-home-detail-head></div>
          <div class="home-detail__body" data-home-detail-body></div>
          <div class="home-detail__act" data-home-detail-act></div>
        </aside>
      </div>
    </div>
    <div class="home-talk paper" data-home-talk role="dialog" aria-label="${L("对着这件事说一句")}" hidden>
      <div class="home-talk__head">
        <b>${L("说一句")}</b>
        <span data-home-talk-ctx></span>
        <button class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" type="button" data-home-close-talk aria-label="${L("收起对话")}">${icon("x")}</button>
      </div>
      <div class="home-talk__body" data-home-talk-body></div>
      <form class="home-talk__compose" data-home-talk-form>
        <textarea class="mw-textarea" name="say" rows="1" placeholder="${L("带着这件事说一句")}"></textarea>
        <button class="mw-btn mw-btn--primary mw-btn--icon-only" type="submit" aria-label="${L("打开 Session")}">${icon("send")}</button>
      </form>
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
