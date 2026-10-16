import { CONTEXT_TOOLBAR_CLIENT_SCRIPT, CONTEXT_TOOLBAR_STYLES } from './context-toolbar.js';

/**
 * The component board's section for the context toolbar. Its style and its demo program are inlined here, not added to the shared
 * sheets: nothing reaches a page until the workbench takes the bar into use. The sample content is labelled as a sample.
 */

const STATIC_STYLES = `
.mw-ctx--static { position: static; display: inline-flex; animation: none; }
.mw-ctx-demo { display: grid; gap: 12px; }
.mw-ctx-demo__text { margin: 0; padding: 16px; max-width: 560px; border-radius: var(--r-card, 12px); background: var(--paper); line-height: 1.8; }
.mw-ctx-demo__log { margin: 0; font-size: 12px; color: var(--muted); min-height: 1.5em; }
.mw-ctx-demo__form { display: grid; gap: 8px; }
.mw-ctx-demo__form input { min-height: var(--control-h, 32px); }
`;

const btn = (inner: string, attrs = '') => `<button type="button" class="mw-btn mw-btn--ghost" ${attrs}>${inner}</button>`;
const glyph = (letter: string, label: string, pressed = false) => btn(`<span class="mw-ctx__glyph" data-glyph="${letter}">${letter}</span>`, `aria-label="${label}" title="${label}" aria-pressed="${pressed}"`);
const staticBar = (label: string, body: string) => `<figure class="mw-catalog__specimen"><figcaption>${label}</figcaption><div class="mw-ctx mw-ctx--static" role="toolbar" aria-label="当前内容的动作（样例）">${body}</div></figure>`;

/** What the demo does with the real program: the "plugin" is one paragraph that publishes tools and runs them. */
const DEMO_SCRIPT = String.raw`(() => {
  const factory = ${CONTEXT_TOOLBAR_CLIENT_SCRIPT};
  const text = document.querySelector("[data-ctx-demo-text]"), log = document.querySelector("[data-ctx-demo-log]");
  if (!text || !log) return;
  const say = (message) => { log.textContent = message; };
  const bar = factory({ choose: (key) => say("选了推荐动作：" + key + "（样例，没有真的执行）"), assistant: () => say("交给助理（样例）"), dismiss: () => say("按 Esc 收起了浮条") });
  const pressed = { strong: false, em: false };
  let context = "";
  const publish = () => text.dispatchEvent(new CustomEvent("molis:context-tools", { bubbles: true, detail: { context_id: context, groups: [
    { id: "marks", collapse: "overflow", items: [
      { id: "strong", label: "加粗", glyph: "B", pressed: pressed.strong, shortcut: "⌘B" }, { id: "em", label: "斜体", glyph: "I", pressed: pressed.em, shortcut: "⌘I" },
      { id: "underline", label: "下划线", glyph: "U" }, { id: "strike", label: "删除线", glyph: "S" }] },
    { id: "blocks", collapse: "overflow", items: [{ id: "h2", label: "标题 2", glyph: "H2" }, { id: "list", label: "列表", icon: "list" }] },
    { id: "insert", collapse: "never", items: [{ id: "link", label: "链接", icon: "link", opens: "panel" }] }] } }));
  text.addEventListener("molis:context-tool-invoke", (event) => {
    const detail = event.detail;
    if (!detail || detail.context_id !== context) return;
    if (detail.id === "link") {
      const form = document.createElement("form");
      form.className = "mw-ctx-demo__form";
      form.innerHTML = '<label>链接地址<input class="mw-input" type="url" value="https://example.com"></label><div><button class="mw-btn mw-btn--primary" type="submit">应用</button></div>';
      form.addEventListener("submit", (submit) => { submit.preventDefault(); bar.closePanel(); say("应用了链接（样例）"); });
      text.dispatchEvent(new CustomEvent("molis:context-panel-open", { bubbles: true, detail: { context_id: context, node: form, label: "链接", onClose: () => say("链接面板关了") } }));
      return;
    }
    if (detail.id in pressed) { pressed[detail.id] = !pressed[detail.id]; publish(); }
    say("执行了工具：" + detail.id + "（样例，不改文字）");
  });
  let timer = 0;
  document.addEventListener("selectionchange", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !text.contains(selection.anchorNode) || !text.contains(selection.focusNode)) { if (!bar.busy()) bar.hide(); return; }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      context = "demo:" + selection.toString().trim().slice(0, 40);
      bar.show({ context_id: context, anchor: { rect }, assistant: true,
        actions: [{ key: "a", label: "找依据" }, { key: "b", label: "提反例" }, { key: "c", label: "拆步骤" }, { key: "d", label: "总结要点" }],
        more: [{ title: "理解", items: [{ key: "e", label: "解释这段" }, { key: "f", label: "翻译", note: "需要先连接模型", disabled: true }] }],
        basis: { text: "按规则 · 样例", title: "样例内容：没有接判断模型" } });
      publish();
    }, 120);
  });
})();`;

/** The board's section: static states, and a live bar on sample text. */
export function renderContextToolbarExample(): string {
  const tools = `<div class="mw-ctx__tools" role="group" aria-label="工具">${glyph('B', '加粗', true)}${glyph('I', '斜体')}${glyph('U', '下划线')}${btn('<span>格式</span>', 'aria-haspopup="menu" aria-expanded="false"')}</div>`;
  const actions = `${btn('<span>找依据</span>', 'data-emphasis="true"')}${btn('<span>提反例</span>')}${btn('<span>拆步骤</span>')}${btn('<span>更多</span>', 'aria-haspopup="menu" aria-expanded="false"')}${btn('<span>助理</span>')}`;
  const narrow = `${btn('<span>找依据</span>')}${btn('<span>提反例</span>')}${btn('<span>更多</span>', 'aria-haspopup="menu" aria-expanded="false"')}${btn('', 'aria-label="助理" title="交给助理"')}`;
  return `<style>${CONTEXT_TOOLBAR_STYLES}${STATIC_STYLES}</style>
  <p class="mw-catalog__hint">贴着手上的东西出现的一条浮条：工具（插件声明，固定在左）｜最多三个推荐动作｜更多｜助理。不抢编辑器的焦点；⌘. 进入，←→ 移动，Esc 收起。下面是几种状态的静态标本，和一块可以选字试一试的样例文字（内容和动作都是样例，不会执行）。</p>
  <div class="mw-catalog__specimens">
    ${staticBar('宽：工具 + 三个推荐 + 更多 + 助理', tools + actions)}
    ${staticBar('窄：只留两个推荐，助理只剩图标', narrow)}
    ${staticBar('只读内容：没有工具区', actions)}
  </div>
  <div class="mw-ctx-demo" data-primitive="context-toolbar">
    <p class="mw-ctx-demo__text" data-ctx-demo-text>选中这一段里的几个字：浮条会出现在选区上方，放不下就翻到下面。点「链接」会在浮条下面打开一个小面板；点「更多」看全部动作。这是样例文字。</p>
    <p class="mw-ctx-demo__log" data-ctx-demo-log role="status" aria-live="polite"></p>
  </div>
  <script>${DEMO_SCRIPT}</script>`;
}
