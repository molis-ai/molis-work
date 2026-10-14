import type { PagesUiModel } from "./ui.js";

export function renderPagesComments({ primitives: p }: PagesUiModel): string {
  return `<section class="pages-comments" data-pages-comments aria-label="${p.text("文档评论")}">
    <header><small>${p.text("正在查看")}</small><h2 data-comment-title>${p.text("选择一篇文档")}</h2>
      <div class="pages-comment-modes"><button type="button" data-comment-mode="comments" aria-pressed="true">${p.text("评论")}</button><button type="button" data-comment-mode="notes" aria-pressed="false">${p.text("块备注")}</button></div>
    </header>
    <div data-comment-discussion><nav data-comment-threads aria-label="${p.text("评论线程")}"></nav><button class="mw-btn mw-btn--ghost" type="button" data-comment-new>${p.text("评论整篇文档")}</button>
      <blockquote data-comment-quote hidden></blockquote><button type="button" class="mw-btn mw-btn--ghost" data-comment-locate hidden>${p.text("定位原文")}</button><div class="pages-comment-messages" data-comment-messages aria-live="polite"></div>
      <p data-comment-run role="status"></p><div class="pages-comment-controls"><button class="mw-btn mw-btn--ghost" type="button" data-comment-retry hidden>${p.text("重试")}</button><button class="mw-btn mw-btn--ghost" type="button" data-comment-stop hidden>${p.text("停止")}</button></div>
    </div><div data-comment-notes hidden></div>
    <form data-comment-form><p data-comment-scope hidden>${p.text("助理读取这篇文档和当前评论线程，回复留在这里。长内容会节选。")}</p><label data-comment-unsaved hidden><input type="checkbox" data-comment-include-draft>${p.text("明确附上本页未保存的正文草稿")}</label><button type="button" class="mw-btn mw-btn--ghost" data-comment-reply hidden></button><textarea class="mw-input" data-comment-draft rows="3" maxlength="20000" aria-label="${p.text("写评论")}" placeholder="${p.text("写评论，或请助理参与这条讨论")}"></textarea>
      <footer><button class="mw-btn mw-btn--ghost" type="button" data-comment-ai aria-pressed="false">@${p.text("助理")}</button><span>${p.text("⌘ / Ctrl + Enter 发送")}</span><button class="mw-btn mw-btn--primary" data-comment-send>${p.text("发送")}</button></footer>
    </form><p class="pages-comment-error" data-comment-error role="alert" hidden></p><button type="button" class="mw-btn mw-btn--ghost" data-comment-reload hidden>${p.text("重新载入评论")}</button>
  </section>`;
}

export const PAGES_COMMENT_STYLES = `
.pages-comments{display:flex;flex-direction:column;height:calc(100dvh - 32px);min-height:0;gap:14px;color:var(--ink)}
.pages-comments>header,[data-comment-form]{flex:none}[data-comment-discussion],[data-comment-notes]{flex:1;min-height:0;overflow:auto}
.pages-comments header small{color:var(--muted);font-size:11px}.pages-comments h2{font-size:17px;line-height:1.4;margin:4px 0 14px;overflow-wrap:anywhere}
.pages-comment-modes{display:flex;border-bottom:1px solid var(--line);gap:18px}.pages-comment-modes button{border:0;background:none;padding:8px 0;color:var(--muted);font:inherit;cursor:pointer}.pages-comment-modes [aria-pressed=true]{color:var(--ink);box-shadow:0 2px var(--accent)}
[data-comment-threads]{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}[data-comment-threads] button{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--muted);padding:5px 9px;font:inherit;cursor:pointer}[data-comment-threads] [aria-current=true]{color:var(--ink);background:var(--nav-active)}
.pages-comments blockquote{margin:12px 0;padding:8px 12px;border-left:2px solid var(--accent);background:var(--nav-hover);color:var(--muted);white-space:pre-wrap;max-height:120px;overflow:auto;overflow-wrap:anywhere}
.pages-comment-messages article{padding:14px 0;border-bottom:1px solid var(--line)}.pages-comment-messages article>div{display:flex;align-items:center;gap:8px}.pages-comment-messages strong{font-size:12px}.pages-comment-messages time{font-size:11px;color:var(--muted);flex:1}.pages-comment-messages p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.pages-comment-messages .mw-btn{font-size:11px;padding:2px 6px;min-height:24px}
[data-comment-form]{margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}[data-comment-draft]{width:100%;resize:vertical;min-height:88px;max-height:260px;box-sizing:border-box}[data-comment-form] footer{display:flex;align-items:center;gap:8px;margin-top:8px}[data-comment-form] footer span{flex:1;font-size:11px;color:var(--muted)}[data-comment-ai][aria-pressed=true]{background:var(--nav-active);color:var(--accent)}[data-comment-reply],[data-comment-run]{font-size:12px;color:var(--muted)}.pages-comment-error{font-size:12px;color:var(--danger,#af4234);white-space:pre-wrap}.pages-comment-controls{display:flex;gap:8px}
[data-comment-notes] label{display:block;margin:12px 0}[data-comment-notes] label>span{display:block;color:var(--muted);margin-bottom:6px;overflow-wrap:anywhere}[data-comment-notes] textarea{width:100%;box-sizing:border-box;margin-bottom:6px}.pages-comments [hidden]{display:none!important}
[data-comment-scope],[data-comment-unsaved]{font-size:11px;line-height:1.6;color:var(--muted);margin:0 0 10px}[data-comment-unsaved]{display:flex;align-items:flex-start;gap:6px}[data-comment-form] footer{flex-wrap:wrap}
@media(max-width:600px){.pages-comments{gap:8px}.pages-comments header small{display:none}.pages-comments h2{font-size:15px;margin:0 0 4px}[data-comment-form]{padding-top:8px}[data-comment-draft]{height:80px;min-height:80px}}
@media(max-width:600px),(pointer:coarse){.pages-comments :is(button,.mw-btn){min-width:44px;min-height:44px}.pages-comments textarea{font-size:16px}}
`;
