import { escapeHtml, renderBadge, renderReturnBar, renderResumePrompt, type ReturnBarState } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The component board's 回到原处 section (specs/draft-and-return/spec.md §9, U2 and U4): the settings' return bar in each of its
 * states, after the service-connections prototype's plan B top bar (docs/design/service-connections/), and the shared 接着做 prompt
 * a page shows after a reload, whose look follows the connections page's 接着改／放弃改动. Both are new parts of this batch and are
 * marked for the D track's joint review (`data-board-review="d-track"`). The places and drafts are sample data; nothing goes anywhere.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

function figure(L: Say, caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen" data-board-review="d-track"><figcaption>${escapeHtml(caption)} ${renderBadge({ label: L("待 D 轨合审"), tone: "info" })}</figcaption>${body}</figure>`;
}

function bar(L: Say, name: string, state: ReturnBarState, body: string, back: string): string {
  return renderReturnBar({ title: L("从「{name}」来", { name }), body: L(body), back: L(back), label: L("从哪里来"), state });
}

function barsSpecimen(L: Say): string {
  const row = (label: string, body: string) => `<li><span>${escapeHtml(L(label))}</span>${body}</li>`;
  return `<ul class="mw-return-board__states">
    ${row("在等配好", bar(L, "Cognia", "waiting", "配好模型后自动回去，你写的都还在。", "现在回去"))}
    ${row("连接在等", bar(L, "Feed", "waiting", "连好后自动回去，你写的都还在。", "现在回去"))}
    ${row("本来就好", bar(L, "Feed", "look", "看完点「回去」，回到原来的地方。", "回去"))}
    ${row("已经好了", bar(L, "Coding", "ready", "已经好了，可以回去了。", "回去"))}
    ${row("原处已关", bar(L, "Images", "gone", "原来的页面已经关了，配好的设置都在。", "回去"))}
  </ul>`;
}

function narrowSpecimen(L: Say): string {
  return `<div class="mw-return-board__narrow">${bar(L, "Cognia", "waiting", "配好模型后自动回去，你写的都还在。", "现在回去")}</div>`;
}

function resumeSpecimen(L: Say): string {
  const prompt = (title: string, body: string, resume: string) =>
    renderResumePrompt({ title: L(title), body: L(body), resume: L(resume), dismiss: L("先不用") });
  return `<div class="mw-return-board__prompts">
    ${prompt("刚才去配了模型，已经好了", "你写的那段还在输入框里。", "接着发送")}
    ${prompt("GitHub 已经连上", "要接着推送这 3 个提交吗？", "接着推送")}
  </div>`;
}

export function renderReturnTripSection(L: Say): string {
  return `<section class="mw-catalog__section" id="return-trips" data-primitive="return-trips"><h2>${escapeHtml(L("回到原处"))}</h2>
    <div class="mw-catalog__specimens">
      ${figure(L, L("设置顶上的返回条 · 从哪里来、配好以后怎样、现在回去"), barsSpecimen(L))}
      ${figure(L, L("返回条 · 窄屏（390）"), narrowSpecimen(L))}
      ${figure(L, L("接着做 · 刷新或重开后回到原处，问一句再做"), resumeSpecimen(L))}
    </div>
  </section>`;
}

/** The board's own layout for the section; the parts' look is the design system's (`.mw-return-bar`, `.mw-resume-prompt`). */
export const RETURN_TRIP_SECTION_STYLES = "#return-trips .mw-catalog__specimen{margin:0}"
  + ".mw-return-board__states{display:grid;gap:12px;max-width:760px;margin:0;padding:0;list-style:none}"
  + ".mw-return-board__states>li{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:12px;min-width:0}"
  + ".mw-return-board__states>li>span:first-child{color:var(--ink-soft);font-size:12px}"
  + ".mw-return-board__narrow{max-width:390px}"
  + ".mw-return-board__prompts{display:grid;gap:24px;max-width:560px}"
  + "@media (max-width:760px){.mw-return-board__states>li{grid-template-columns:minmax(0,1fr);gap:4px}}";
