import { createImText, IM_EN } from "./locale.js";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";
import { escapeHtml as escapeImText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { icon, renderToast } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderIconSprite } from "@molis-ai/molis-work-design-system";
const button = (action: string, label: string, glyph: Parameters<typeof icon>[0], extra = "") =>
  `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm im-icon-button ${extra}" data-action="${action}" aria-label="${escapeImText(label)}" title="${escapeImText(label)}">${icon(glyph)}</button>`;
function composer(kind: "group" | "thread", L: ReturnType<typeof createImText>) {
  return `<form class="im-composer" data-composer="${kind}">
    <div class="im-quote-draft" data-quote="${kind}" hidden></div>
    <label class="im-composer-destination" for="im-${kind}-input" data-destination="${kind}"></label>
    <textarea id="im-${kind}-input" data-fit rows="1" maxlength="12000" placeholder="${escapeImText(L("写下你的想法…"))}" aria-label="${kind === "group" ? (L("群聊消息")) : (L("Thread 回复"))}" required></textarea>
    <div class="im-composer-tools"><div>${button("new-topic", (L("新建公开话题")), "plus")}${button("mention", (L("插入成员名字")), "user")}${button("format-help", (L("消息格式")), "text")}</div><span class="im-compose-status" data-compose-status="${kind}" role="status"></span><button class="mw-btn mw-btn--primary mw-btn--icon-only mw-btn--sm im-send" type="submit" aria-label="${kind === "group" ? (L("发送群消息")) : (L("发送 Thread 回复"))}" disabled>${icon("send")}</button></div>
  </form>`;
}
/** No data or credentials are embedded; the shared server resolves membership. */
export function renderImPage(options: { embedded?: boolean; locale?: string } = {}): string {
  const locale = options.locale?.toLowerCase().startsWith("en") ? "en" : "zh-CN";
  const L = createImText(fillMessage, IM_EN, locale);
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>${escapeImText(L("项目讨论 · Molis Work"))}</title><link rel="stylesheet" href="/im/styles.css"><script src="/im/client.js" defer></script></head>
  <body>${renderIconSprite()}<main class="im-app${options.embedded ? " is-embedded" : ""}" data-im-app>
    <aside class="im-sidebar" aria-label="${escapeImText(L("历史群聊"))}"><div class="im-brand">${escapeImText(L("历史群聊 "))}${button("rooms", (L("收起群聊目录")), "x")}</div><nav data-room-list></nav><div class="im-form-actions">${button("create-room", (L("创建群聊")), "plus")}${button("join", (L("加入群聊")), "link")}</div><div class="im-profile"><span class="im-avatar" data-own-avatar></span><span data-own-name></span><span data-connection role="status"></span></div></aside>
    <section class="im-welcome" data-welcome><div class="im-welcome-symbol">${icon("message")}</div><h1 data-welcome-title>${escapeImText(L("一起，把事情说清楚"))}</h1><p data-welcome-copy>${escapeImText(L("日常沟通留在主群，值得展开的讨论放进话题。所有项目成员都能看到。"))}</p><div data-welcome-body><p class="im-muted" role="status">${escapeImText(L("正在连接项目讨论…"))}</p></div></section>
    <section class="im-conversations" data-conversations hidden aria-label="${escapeImText(L("项目主群与公开话题"))}">
      <header class="im-group-header"><div class="im-group-heading"><button class="im-room-directory" data-action="rooms" type="button" hidden aria-label="${escapeImText(L("切换历史群聊"))}">${escapeImText(L("历史群聊"))}</button><h1 data-room-title></h1><button class="im-member-button" data-action="members" type="button" data-member-count></button></div><div class="im-header-actions"><button type="button" class="im-member-avatars" data-member-avatars data-action="members" aria-label="${escapeImText(L("查看项目成员"))}"></button>${button("search", (L("搜索讨论")), "search")}${button("invite", (L("邀请成员")), "plus")}${button("minimize", (L("收起讨论")), "chevron-down")}</div></header>
      <nav class="im-thread-strip" data-thread-strip aria-label="${escapeImText(L("主群与话题"))}"></nav>
      <section class="im-search" data-search hidden><form data-search-form><input type="search" maxlength="200" aria-label="${escapeImText(L("搜索消息或话题"))}" placeholder="${escapeImText(L("搜索消息或话题…"))}"><button type="submit" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm im-icon-button" aria-label="${escapeImText(L("搜索"))}">${icon("search")}</button>${button("close-search", (L("返回讨论")), "x")}</form><div data-search-results role="region" aria-label="${escapeImText(L("搜索结果"))}"></div></section>
      <section class="im-group" data-group-pane aria-label="${escapeImText(L("主群"))}"><div class="im-stream" data-scroll="group" data-stream="group" role="region" aria-label="${escapeImText(L("群聊消息"))}" tabindex="0"></div><button class="im-new-messages" type="button" data-action="latest-group" hidden>${escapeImText(L("回到最新消息"))}</button>${composer("group", L)}</section>
      <section class="im-thread" data-thread-pane hidden aria-label="${escapeImText(L("当前话题"))}"><header class="im-thread-header"><h2 data-thread-title></h2><p data-thread-scope></p></header><div class="im-scroll" data-scroll="thread" role="region" aria-label="${escapeImText(L("Thread 消息"))}" tabindex="0"><div class="im-thread-context" data-thread-context></div><div class="im-stream" data-stream="thread"></div></div><button class="im-new-messages" type="button" data-action="latest-thread" hidden>${escapeImText(L("回到最新回复"))}</button>${composer("thread", L)}</section>
    </section>
    ${renderToast({ message: "", attrs: { "data-toast": true, hidden: true } })}<div class="im-sync-alert" data-sync-alert role="status" hidden><span></span><button type="button" data-action="retry">${escapeImText(L("重新连接"))}</button></div><button class="im-sidebar-scrim" type="button" data-action="rooms" aria-label="${escapeImText(L("收起群聊目录"))}" hidden></button>
  </main><dialog class="im-dialog" data-dialog><header><h2 data-dialog-title></h2>${button("close-dialog", (L("关闭")), "x")}</header><div data-dialog-body></div></dialog></body></html>`;
}
