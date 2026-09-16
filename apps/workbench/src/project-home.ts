import type { ImmersiveShellPrimitives } from "./immersive-shell.js";

/** Three sourced classical passages, followed by the complete Adeptify BrandPanel collection.
 * Adeptify wording and attribution are preserved; no new source claim is added. */
const quotes: { text: string; by: string; source?: string }[] = [
  { text: "千里之行，始于足下。", by: "老子 ·《道德经》第六十四章", source: "https://ctext.org/dao-de-jing/zh" },
  { text: "工欲善其事，必先利其器。", by: "孔子 ·《论语·卫灵公》", source: "https://ctext.org/text.pl?if=gb&node=1491&remap=gb&show=parallel" },
  { text: "不积跬步，无以至千里。", by: "荀子 ·《劝学》", source: "https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/resources/primary/lang/jileiwen/jilei_wen_007.pdf" },
  // Migrated from Adeptify pc/shell/src/pages/login/BrandPanel.tsx.
  {"text": "Intelligence is the ability to adapt to change.", "by": "Stephen Hawking"},
  {"text": "The question of whether a computer can think is no more interesting than the question of whether a submarine can swim.", "by": "Edsger Dijkstra"},
  {"text": "AI will likely continue to amplify human ingenuity, not replace it.", "by": "Satya Nadella"},
  {"text": "The real danger is not that machines will begin to think like humans, but that humans will begin to think like machines.", "by": "David Chalmers"},
  {"text": "Prediction is not just about seeing the future, it's about creating it.", "by": "Peter Drucker"},
  {"text": "Simplicity is the ultimate sophistication.", "by": "Leonardo da Vinci"},
  {"text": "The best way to predict the future is to invent it.", "by": "Alan Kay"},
  {"text": "We are the only species that can rewrite our own code.", "by": "Anonymous"},
  {"text": "Knowledge is not power. Knowledge applied is power.", "by": "Bruce Lee"},
  {"text": "The measure of intelligence is the ability to change.", "by": "Aristotle"},
];

export function renderProjectHome(name: string, { L, escapeHtml: e, icon }: ImmersiveShellPrimitives): string {
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${L("项目首页")}" aria-label="${e(name)} · ${L("项目首页")}" hidden>
    <div class="project-home-content">
      <section class="home-context" aria-label="${L("今天与日历")}">
        <div class="home-date-panel">
          <p class="home-date-year" data-home-year></p>
          <h1 class="home-today"><time data-home-date></time><span data-home-weekday></span></h1>
          <section class="home-reflection" aria-label="${L("工作间隙的一句话")}" data-home-quotes>
            <div class="home-quote-pages">${quotes.map((quote, i) => `<figure data-home-quote="${i}" aria-hidden="${i ? "true" : "false"}"${i ? " inert" : ""}><blockquote>${e(L(quote.text))}</blockquote><figcaption>${quote.source ? `<a href="${e(quote.source)}" target="_blank" rel="noopener noreferrer" data-home-external>${e(L(quote.by))}</a>` : e(L(quote.by))}</figcaption></figure>`).join("")}</div>
          </section>
        </div>
        <section class="home-calendar" aria-label="${L("月历")}">
          <header><span data-home-month></span><div class="home-month-actions"><button type="button" data-home-month-step="-1" aria-label="${L("上个月")}">${icon("back")}</button><button type="button" data-home-month-step="1" aria-label="${L("下个月")}">${icon("chevron-right")}</button></div></header>
          <table><thead><tr data-home-weekdays></tr></thead><tbody data-home-calendar></tbody></table>
        </section>
      </section>
      <section class="home-launch" aria-label="${L("快捷方式与 Agent 输入")}">
        <ul class="home-shortcuts" data-home-shortcuts aria-label="${L("快捷方式")}"><li class="home-shortcut home-shortcut-add"><button type="button" class="home-shortcut-main" data-home-shortcut-add><span class="home-shortcut-icon">${icon("plus")}</span><span>${L("添加快捷方式")}</span></button></li></ul>
        <div class="home-composer"><span class="home-agent-icon" aria-hidden="true">${icon("sparkles")}</span><input type="text" data-home-agent-input placeholder="${L("你想推进什么？")}" aria-label="${L("Agent 尚未开放，暂不可输入")}" aria-describedby="home-agent-status" disabled><button type="button" class="home-send" disabled aria-label="${L("Agent 即将接入，暂不可发送")}">${icon("arrow")}</button></div>
        <p class="home-agent-note" id="home-agent-status">${icon("lock")}<span>${L("Agent 尚未开放")}</span></p>
        <p class="home-shortcut-error" data-home-shortcut-error role="alert" hidden></p>
      </section>
    </div>
    <template data-home-shortcut-template><li class="home-shortcut"><a class="home-shortcut-main" target="_blank" rel="noopener noreferrer" data-home-shortcut-link data-home-external><span class="home-shortcut-icon">${icon("link")}</span><span data-home-shortcut-name></span></a><button type="button" class="home-shortcut-edit" data-home-shortcut-edit>${icon("more")}</button></li></template>
    <dialog class="home-shortcut-dialog" data-home-shortcut-dialog aria-labelledby="home-shortcut-title">
      <form data-home-shortcut-form novalidate>
        <header><h2 id="home-shortcut-title">${L("添加快捷方式")}</h2><button type="button" data-home-shortcut-cancel aria-label="${L("关闭")}">${icon("x")}</button></header>
        <label>${L("名称")}<input name="shortcut_name" maxlength="32" autocomplete="off" required placeholder="${L("例如：项目文档")}"></label>
        <label>${L("网址")}<input name="shortcut_url" type="url" maxlength="4096" autocomplete="off" required placeholder="https://"></label>
        <p class="home-shortcut-form-error" data-home-shortcut-form-error role="alert"></p>
        <footer><button type="button" class="home-shortcut-remove" data-home-shortcut-remove hidden>${L("移除")}</button><button type="button" data-home-shortcut-cancel>${L("取消")}</button><button type="submit" class="home-shortcut-save">${L("保存")}</button></footer>
      </form>
    </dialog>
  </section>`;
}
