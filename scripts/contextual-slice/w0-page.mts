import { THEME_BOOTSTRAP_SCRIPT, TYPEFACE_STYLES, icon, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { PAGES_STYLES } from "../../plugins/native/pages/src/styles.js";
import { W0_STYLES } from "./w0-styles.mjs";

export function renderW0Page(): string {
  return `<!doctype html><html lang="zh-CN"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>情境动作 W0 · Molis Work</title><script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/workbench.css"><style>${TYPEFACE_STYLES}${PAGES_STYLES}${W0_STYLES}</style>
  </head><body class="w0-slice" data-mobile-view="document">
  ${renderIconSprite()}
  <header class="w0-top">
    <span class="w0-project">${icon("impact")} Q4 增长</span><span class="w0-top-divider">/</span><span>情境动作</span>
    <span class="w0-prototype">交互原型 · 规则推荐</span>
    <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-w0-theme aria-label="切换明暗主题">${icon("sun")}</button>
    <button type="button" class="mw-btn mw-btn--ghost" data-w0-about aria-expanded="false">原型说明</button>
  </header>
  <main class="w0-workspace">
    <section class="w0-paper" aria-label="Pages 文档" data-w0-document-pane>
      <header class="w0-page-bar">
        <details class="w0-document-menu"><summary aria-label="切换预览文档">${icon("note")} Pages ${icon("chevron-down")}</summary><nav data-w0-documents aria-label="预览文档"></nav></details>
        <span class="w0-save" data-w0-save role="status">正在打开…</span>
        <button type="button" class="mw-btn mw-btn--ghost" data-w0-clear-landing hidden title="清除放入文稿的位置">清除落点</button>
        <button type="button" class="mw-btn mw-btn--ghost" data-w0-new="pages">${icon("sparkles")}<span>一句话新建</span></button>
        <button type="button" class="mw-btn mw-btn--ghost w0-mobile-only" data-w0-show="shelf">材料 ${icon("panel")}</button>
      </header>
      <div class="w0-reading" data-w0-reading>
        <div class="w0-page-heading"><p class="w0-eyebrow">工作中的文稿</p><h1 data-w0-title>Q4 增长计划</h1>
          <p class="w0-help">选一段文字，下一步就在它旁边。也可以把右侧材料放进来。</p></div>
        <div class="pages-workspace w0-editor-wrap"><div class="pages-editor-host" data-w0-editor></div></div>
        <div class="w0-reading-end">文档只保存在本次预览中</div>
      </div>
    </section>
    <aside class="w0-shelf" aria-label="右栏材料" data-w0-shelf-pane>
      <nav class="w0-tabs" aria-label="右栏位置" role="tablist">
        <button type="button" role="tab" aria-selected="true" aria-controls="w0-side-body" id="w0-tab-shelf" data-w0-tab="shelf">Shelf</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="w0-side-body" id="w0-tab-sparks" data-w0-tab="sparks" tabindex="-1">灵光</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="w0-side-body" id="w0-tab-files" data-w0-tab="files" tabindex="-1">文件</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="w0-side-body" id="w0-tab-browser" data-w0-tab="browser" tabindex="-1">浏览器</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="w0-side-body" id="w0-tab-computer" data-w0-tab="computer" tabindex="-1">电脑</button>
        <button type="button" role="tab" aria-selected="false" aria-controls="w0-side-body" id="w0-tab-discussion" data-w0-tab="discussion" tabindex="-1">讨论</button>
      </nav>
      <section id="w0-side-body" role="tabpanel" aria-labelledby="w0-tab-shelf" class="w0-side-body">
        <div data-w0-shelf-content>
          <header class="w0-shelf-head"><div><h2>手边的材料</h2><p>选中，再决定放到哪里。</p></div>
            <button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-w0-new="shelf" aria-label="Shelf 一句话新建">${icon("sparkles")}</button></header>
          <p class="w0-section-label">本次预览 · 个人材料样例</p><div class="w0-materials" data-w0-materials></div>
          <div class="w0-shelf-note">${icon("grip")}<span>拖到文稿里，在松手的位置选择动作。<br>不会立即写入。</span></div>
          <section class="w0-created" aria-label="刚刚创建的预览条目" data-w0-created-section hidden><h3>刚刚创建</h3><div data-w0-created></div></section>
        </div>
        <div class="w0-unavailable" data-w0-unavailable hidden></div>
      </section>
      <footer class="w0-shelf-footer"><button type="button" class="mw-btn mw-btn--ghost w0-mobile-only" data-w0-show="document">${icon("back")} 回到文稿</button>
        <span>预览材料 · 非真实 Shelf</span></footer>
    </aside>
  </main>
  <footer class="w0-dock">
    <div class="w0-dock-left"><span class="w0-dock-current">${icon("note")}<span>Pages</span></span><span class="w0-shortcut">⌘. 唤起动作</span></div>
    <div class="w0-conversation">
      <div class="w0-context" data-w0-context aria-label="带给助理的情境"></div>
      <form class="w0-composer" data-w0-assistant-form><span class="w0-assistant-mark">${icon("sparkles")}</span>
        <input class="mw-input" data-w0-assistant-input aria-label="交给助理的要求" placeholder="带着手上的内容，说说下一步…" autocomplete="off">
        <button type="submit" class="mw-btn mw-btn--primary mw-btn--icon-only" aria-label="预览交给助理">${icon("send")}</button></form>
      <span class="w0-composer-note">助理交接为模拟，不发送给模型</span>
    </div>
    <div class="w0-dock-right"><button type="button" class="mw-btn mw-btn--ghost" data-w0-side-toggle aria-expanded="true">${icon("panel")}<span>材料</span></button><span class="w0-avatar" aria-label="预览项目">Q4</span></div>
  </footer>
  <div class="w0-mark" data-w0-landing-mark hidden aria-hidden="true"></div>
  <div class="w0-live" data-w0-live role="status" aria-live="polite" aria-atomic="true"></div>
  <aside class="w0-toast" data-w0-toast hidden role="status"></aside>
  <section class="w0-about" data-w0-about-panel hidden aria-label="原型说明">
    <header><h2>这次可以体验什么</h2><button type="button" class="mw-btn mw-btn--ghost" data-w0-about-close>关闭</button></header>
    <p>真实 Pages 编辑、规则候选与陈列策略。文档与条目仅存于预览进程，服务重启后复位。</p>
    <p>自然语言起草、待办和 Shelf 写入、助理交接均为模拟。没有模型、凭据或真实 Home 访问。</p>
    <p>可试：选文字、选材料、拖到文稿、预览后确认、创建并撤销。⌘/Ctrl+. 进入浮条，方向键移动，Esc 返回。</p>
    <p>“电脑”保留给 Computer Use；桌面原生拖出未验证。首批放入动作与对象命名待看实物后决定。</p>
  </section>
  <script src="/assets/pages-editor.js"></script><script src="/assets/slice.js"></script>
  </body></html>`;
}
