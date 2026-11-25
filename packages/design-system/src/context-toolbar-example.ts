import { CONTEXT_TOOLBAR_CLIENT_SCRIPT, CONTEXT_TOOLBAR_STYLES } from './context-toolbar.js';
import { resolveCatalogSay, type CatalogSay } from './primitives/catalog-parts.js';

/**
 * The component board's section for the context toolbar. Its style and its demo program are inlined here, not added to the shared
 * sheets: nothing reaches a page until the workbench takes the bar into use. The sample content is labelled as a sample.
 */

const STATIC_STYLES = `
.mw-ctx--static { position: static; display: inline-flex; max-width: 100%; overflow-x: auto; animation: none; }
.mw-ctx-demo { display: grid; gap: 12px; }
.mw-ctx-demo__text { margin: 0; padding: 16px; max-width: 560px; border-radius: var(--r-card, 12px); background: var(--paper); line-height: 1.8; }
.mw-ctx-demo__log { margin: 0; font-size: 12px; color: var(--muted); min-height: 1.5em; }
.mw-ctx-demo__form { display: grid; gap: 8px; }
.mw-ctx-demo__form input { min-height: var(--control-h, 32px); }
`;

const btn = (inner: string, attrs = '') => `<button type="button" class="mw-btn mw-btn--ghost" ${attrs}>${inner}</button>`;
const glyph = (letter: string, label: string, pressed = false) => btn(`<span class="mw-ctx__glyph" data-glyph="${letter}">${letter}</span>`, `aria-label="${label}" title="${label}" aria-pressed="${pressed}"`);

/** The board's section: static states, and a live bar on sample text. */
export function renderContextToolbarExample(say: CatalogSay = resolveCatalogSay()): string {
  const barLabel = say('workbench.catalog-board.ex.ctx-bar-label');
  const staticBar = (label: string, body: string) => `<figure class="mw-catalog__specimen"><figcaption>${label}</figcaption><div class="mw-ctx mw-ctx--static" role="toolbar" aria-label="${barLabel}">${body}</div></figure>`;
  const bold = say('workbench.catalog-board.ex.ctx-bold');
  const italic = say('workbench.catalog-board.ex.ctx-italic');
  const underline = say('workbench.catalog-board.ex.ctx-underline');
  const evidence = say('workbench.catalog-board.ex.ctx-act-evidence');
  const counter = say('workbench.catalog-board.ex.ctx-act-counter');
  const steps = say('workbench.catalog-board.ex.ctx-act-steps');
  const more = say('workbench.catalog-board.ex.ctx-more');
  const assistant = say('workbench.catalog-board.ex.ctx-assistant');
  const tools = `<div class="mw-ctx__tools" role="group" aria-label="${say('workbench.catalog-board.ex.ctx-tools-label')}">${glyph('B', bold, true)}${glyph('I', italic)}${glyph('U', underline)}${btn(`<span>${say('workbench.catalog-board.ex.ctx-format')}</span>`, 'aria-haspopup="menu" aria-expanded="false"')}</div>`;
  const actions = `${btn(`<span>${evidence}</span>`, 'data-emphasis="true"')}${btn(`<span>${counter}</span>`)}${btn(`<span>${steps}</span>`)}${btn(`<span>${more}</span>`, 'aria-haspopup="menu" aria-expanded="false"')}${btn(`<span>${assistant}</span>`)}`;
  const narrow = `${btn(`<span>${evidence}</span>`)}${btn(`<span>${counter}</span>`)}${btn(`<span>${more}</span>`, 'aria-haspopup="menu" aria-expanded="false"')}${btn('', `aria-label="${assistant}" title="${say('workbench.catalog-board.ex.ctx-ask-assistant')}"`)}`;
  const initialCopy = {
    bold, italic, underline,
    strike: say('workbench.catalog-board.ex.ctx-strike'),
    h2: say('workbench.catalog-board.ex.ctx-h2'),
    list: say('workbench.catalog-board.ex.ctx-list'),
    link: say('workbench.catalog-board.ex.ctx-link'),
    linkUrl: say('workbench.catalog-board.ex.ctx-link-url'),
    apply: say('workbench.catalog-board.ex.ctx-apply'),
    evidence, counter, steps,
    summary: say('workbench.catalog-board.ex.ctx-act-summary'),
    groupUnderstand: say('workbench.catalog-board.ex.ctx-group-understand'),
    explain: say('workbench.catalog-board.ex.ctx-act-explain'),
    translate: say('workbench.catalog-board.ex.ctx-act-translate'),
    needModel: say('workbench.catalog-board.ex.ctx-need-model'),
    basisText: say('workbench.catalog-board.ex.ctx-basis-text'),
    basisTitle: say('workbench.catalog-board.ex.ctx-basis-title'),
    logAssistant: say('workbench.catalog-board.ex.ctx-log-assistant'),
    logDismiss: say('workbench.catalog-board.ex.ctx-log-dismiss'),
    logLinkApply: say('workbench.catalog-board.ex.ctx-log-link-apply'),
    logLinkClose: say('workbench.catalog-board.ex.ctx-log-link-close'),
  };
  const demoScript = `(() => {
  const factory = ${CONTEXT_TOOLBAR_CLIENT_SCRIPT};
  const text = document.querySelector("[data-ctx-demo-text]"), log = document.querySelector("[data-ctx-demo-log]");
  if (!text || !log) return;
  const readLive = () => ({
    bold: globalThis.t.text("workbench.catalog-board.ex.ctx-bold"),
    italic: globalThis.t.text("workbench.catalog-board.ex.ctx-italic"),
    underline: globalThis.t.text("workbench.catalog-board.ex.ctx-underline"),
    strike: globalThis.t.text("workbench.catalog-board.ex.ctx-strike"),
    h2: globalThis.t.text("workbench.catalog-board.ex.ctx-h2"),
    list: globalThis.t.text("workbench.catalog-board.ex.ctx-list"),
    link: globalThis.t.text("workbench.catalog-board.ex.ctx-link"),
    linkUrl: globalThis.t.text("workbench.catalog-board.ex.ctx-link-url"),
    apply: globalThis.t.text("workbench.catalog-board.ex.ctx-apply"),
    evidence: globalThis.t.text("workbench.catalog-board.ex.ctx-act-evidence"),
    counter: globalThis.t.text("workbench.catalog-board.ex.ctx-act-counter"),
    steps: globalThis.t.text("workbench.catalog-board.ex.ctx-act-steps"),
    summary: globalThis.t.text("workbench.catalog-board.ex.ctx-act-summary"),
    groupUnderstand: globalThis.t.text("workbench.catalog-board.ex.ctx-group-understand"),
    explain: globalThis.t.text("workbench.catalog-board.ex.ctx-act-explain"),
    translate: globalThis.t.text("workbench.catalog-board.ex.ctx-act-translate"),
    needModel: globalThis.t.text("workbench.catalog-board.ex.ctx-need-model"),
    basisText: globalThis.t.text("workbench.catalog-board.ex.ctx-basis-text"),
    basisTitle: globalThis.t.text("workbench.catalog-board.ex.ctx-basis-title"),
    logAssistant: globalThis.t.text("workbench.catalog-board.ex.ctx-log-assistant"),
    logDismiss: globalThis.t.text("workbench.catalog-board.ex.ctx-log-dismiss"),
    logLinkApply: globalThis.t.text("workbench.catalog-board.ex.ctx-log-link-apply"),
    logLinkClose: globalThis.t.text("workbench.catalog-board.ex.ctx-log-link-close"),
  });
  let copy = ${JSON.stringify(initialCopy).replaceAll('<', '\\u003c')};
  document.addEventListener("molis-work:language-changed", () => { if (globalThis.t?.text) copy = readLive(); });
  const report = (message) => { log.textContent = message; };
  const bar = factory({
    choose: (key) => report(globalThis.t?.text ? globalThis.t.text("workbench.catalog-board.ex.ctx-log-choose", { key }) : key),
    assistant: () => report(copy.logAssistant),
    dismiss: () => report(copy.logDismiss),
  });
  const pressed = { strong: false, em: false };
  let context = "";
  const publish = () => text.dispatchEvent(new CustomEvent("molis:context-tools", { bubbles: true, detail: { context_id: context, groups: [
    { id: "marks", collapse: "overflow", items: [
      { id: "strong", label: copy.bold, glyph: "B", pressed: pressed.strong, shortcut: "⌘B" }, { id: "em", label: copy.italic, glyph: "I", pressed: pressed.em, shortcut: "⌘I" },
      { id: "underline", label: copy.underline, glyph: "U" }, { id: "strike", label: copy.strike, glyph: "S" }] },
    { id: "blocks", collapse: "overflow", items: [{ id: "h2", label: copy.h2, glyph: "H2" }, { id: "list", label: copy.list, icon: "list" }] },
    { id: "insert", collapse: "never", items: [{ id: "link", label: copy.link, icon: "link", opens: "panel" }] }] } }));
  text.addEventListener("molis:context-tool-invoke", (event) => {
    const detail = event.detail;
    if (!detail || detail.context_id !== context) return;
    if (detail.id === "link") {
      const form = document.createElement("form");
      form.className = "mw-ctx-demo__form";
      const label = document.createElement("label");
      label.textContent = copy.linkUrl;
      const input = document.createElement("input");
      input.className = "mw-input";
      input.type = "url";
      input.value = "https://example.com";
      label.append(input);
      const wrap = document.createElement("div");
      const submitBtn = document.createElement("button");
      submitBtn.className = "mw-btn mw-btn--primary";
      submitBtn.type = "submit";
      submitBtn.textContent = copy.apply;
      wrap.append(submitBtn);
      form.append(label, wrap);
      form.addEventListener("submit", (submit) => { submit.preventDefault(); bar.closePanel(); report(copy.logLinkApply); });
      text.dispatchEvent(new CustomEvent("molis:context-panel-open", { bubbles: true, detail: { context_id: context, node: form, label: copy.link, onClose: () => report(copy.logLinkClose) } }));
      return;
    }
    if (detail.id in pressed) { pressed[detail.id] = !pressed[detail.id]; publish(); }
    report(globalThis.t?.text ? globalThis.t.text("workbench.catalog-board.ex.ctx-log-tool", { id: detail.id }) : detail.id);
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
        actions: [{ key: "a", label: copy.evidence }, { key: "b", label: copy.counter }, { key: "c", label: copy.steps }, { key: "d", label: copy.summary }],
        more: [{ title: copy.groupUnderstand, items: [{ key: "e", label: copy.explain }, { key: "f", label: copy.translate, note: copy.needModel, disabled: true }] }],
        basis: { text: copy.basisText, title: copy.basisTitle } });
      publish();
    }, 120);
  });
})();`;
  return `<style>${CONTEXT_TOOLBAR_STYLES}${STATIC_STYLES}</style>
  <p class="mw-catalog__hint">${say('workbench.catalog-board.ex.ctx-hint')}</p>
  <div class="mw-catalog__specimens">
    ${staticBar(say('workbench.catalog-board.ex.ctx-cap-wide'), tools + actions)}
    ${staticBar(say('workbench.catalog-board.ex.ctx-cap-narrow'), narrow)}
    ${staticBar(say('workbench.catalog-board.ex.ctx-cap-readonly'), actions)}
  </div>
  <div class="mw-ctx-demo" data-primitive="context-toolbar">
    <p class="mw-ctx-demo__text" data-ctx-demo-text>${say('workbench.catalog-board.ex.ctx-demo-text')}</p>
    <p class="mw-ctx-demo__log" data-ctx-demo-log role="status" aria-live="polite"></p>
  </div>
  <script>${demoScript}</script>`;
}
