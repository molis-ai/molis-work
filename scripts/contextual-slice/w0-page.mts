import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { THEME_BOOTSTRAP_SCRIPT, TYPEFACE_STYLES, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { PAGES_STYLES } from "../../plugins/native/pages/src/styles.js";
import { W0_STYLES } from "./w0-styles.mjs";
import { TABS } from "./w0-sources.js";

const tabs = TABS.map((tab, index) => `<button type="button" role="tab" aria-selected="${index === 0}" aria-controls="w0-side-body" id="w0-tab-${tab.id}" data-w0-tab="${tab.id}"${index === 0 ? "" : ` tabindex="-1"`}>${tab.label}</button>`).join("");

export function renderW0Page(): string {
  return `<!doctype html><html lang="zh-CN"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>情境动作 W0 · Molis Work</title><script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/workbench.css"><style>${TYPEFACE_STYLES}${PAGES_STYLES}${W0_STYLES}</style>
  </head><body class="w0-slice" data-mobile-view="document">
  ${renderIconSprite()}
  <header class="w0-top">
    <span class="w0-project">${icon("impact")} Q4 增长</span><span class="w0-top-divider">/</span><span class="w0-top-place">情境动作</span>
    <span class="w0-prototype" title="规则推荐，没有模型；文稿和条目只在本次预览进程里">${icon("info")}<span>交互原型 · 规则推荐 · 内容不离开本次预览</span></span>
    <button type="button" class="mw-btn mw-btn--ghost" data-w0-records aria-haspopup="dialog" aria-expanded="false" hidden>${icon("history")}<span>预览记录</span><span class="w0-count" data-w0-records-count>0</span></button>
    <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-w0-theme aria-label="切换明暗主题" title="切换明暗主题">${icon("sun")}</button>
    <button type="button" class="mw-btn mw-btn--ghost" data-w0-about aria-expanded="false">原型说明</button>
  </header>
  <main class="w0-workspace">
    <section class="w0-paper" aria-label="Pages 文档" data-w0-document-pane>
      <header class="w0-page-bar">
        <details class="w0-document-menu"><summary aria-label="切换预览文档">${icon("note")} Pages ${icon("chevron-down")}</summary><nav data-w0-documents aria-label="预览文档"></nav></details>
        <span class="w0-save" data-w0-save role="status">正在打开…</span>
        <button type="button" class="mw-btn mw-btn--ghost" data-w0-new="pages" title="Pages 一句话新建">${icon("sparkles")}<span>一句话新建</span></button>
        <button type="button" class="mw-btn mw-btn--ghost w0-mobile-only" data-w0-show="side">${icon("sidebar")}<span>右栏</span></button>
      </header>
      <div class="w0-reading" data-w0-reading>
        <div class="w0-page-heading"><p class="w0-eyebrow">工作中的文稿</p><h1 data-w0-title>Q4 增长计划</h1></div>
        <div class="pages-workspace w0-editor-wrap"><div class="pages-editor-host" data-w0-editor></div></div>
        <div class="w0-reading-end">${icon("info")}<span>选一段文字，动作出现在它旁边；在右栏选中一样东西，可以放进这里。文稿只保存在本次预览中。</span></div>
      </div>
    </section>
    <aside class="w0-shelf" aria-label="右栏" data-w0-shelf-pane>
      <nav class="w0-tabs" aria-label="右栏位置" role="tablist">${tabs}</nav>
      <section id="w0-side-body" role="tabpanel" aria-labelledby="w0-tab-shelf" class="w0-side-body"><div data-w0-side-content></div></section>
      <footer class="w0-shelf-footer w0-mobile-only"><button type="button" class="mw-btn mw-btn--ghost" data-w0-show="document">${icon("back")}<span>回到文稿</span></button></footer>
    </aside>
  </main>
  <footer class="w0-dock">
    <div class="w0-dock-left"><span class="w0-dock-current">${icon("note")}<span>Pages</span></span><span class="w0-shortcut"><kbd>⌘</kbd><kbd>.</kbd> 进入浮条</span></div>
    <div class="w0-conversation">
      <div class="w0-context" data-w0-context aria-label="带给助理的情境" hidden></div>
      <form class="w0-composer" data-w0-assistant-form><span class="w0-assistant-mark">${icon("sparkles")}</span>
        <input class="mw-input" data-w0-assistant-input aria-label="交给助理的要求" placeholder="带着手上的内容，说说下一步…" autocomplete="off">
        <button type="submit" class="mw-btn mw-btn--primary mw-btn--icon-only" aria-label="交给助理（模拟）">${icon("send")}</button></form>
    </div>
    <div class="w0-dock-right"><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only w0-side-toggle" data-w0-side-toggle aria-expanded="true" aria-label="侧栏" title="侧栏：Shelf、灵光、文件、浏览器、电脑与讨论">${icon("sidebar")}</button><span class="w0-avatar" aria-label="预览项目">Q4</span></div>
  </footer>
  <div class="w0-mark" data-w0-landing-mark hidden aria-hidden="true"></div>
  <div class="w0-live" data-w0-live role="status" aria-live="polite" aria-atomic="true"></div>
  <aside class="w0-toast" data-w0-toast hidden role="status"></aside>
  <section class="w0-about" data-w0-about-panel hidden aria-label="原型说明">
    <header><h2>这个原型能体验什么</h2><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-w0-about-close aria-label="关闭">${icon("x")}</button></header>
    <p><strong>真的：</strong>Pages 编辑器、规则候选与陈列策略、设计系统。<strong>模拟：</strong>右栏除 Shelf 外的内容、改写与起草（按样例，不调 AI）、待办 / 灵光 / Goal 提案的写入、助理交接。没有模型、凭据或真实 Home；服务重启后全部复位。</p>
    <p><strong>可以试：</strong>选一段文字看浮条；在右栏选一条，再在文稿里点一下换落点；悬停「放进」类动作看落点；拖一条到文稿；创建后撤销或改放到；标题栏和 Shelf、灵光的 ✦ 一句话新建；⌘/Ctrl+. 进入浮条，方向键移动，Esc 回到原处。</p>
    <p><strong>没有验证：</strong>桌面原生拖出、跨 iframe 的右栏格、真实浏览器画布选区、Computer Use（产品里的电脑格已在 main，原型只写说明）、真实 Jev 判断。</p>
    <div class="w0-about-actions"><p class="w0-menu-label">演示开关</p>
      <button type="button" class="mw-btn mw-btn--secondary" data-w0-no-landing>${icon("minus")}<span>让左边没有落点</span></button></div>
  </section>
  <script src="/assets/pages-editor.js"></script><script src="/assets/slice.js"></script>
  </body></html>`;
}
