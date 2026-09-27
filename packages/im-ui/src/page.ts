import { icon, renderIconSprite } from "@molis-ai/molis-work-design-system";
const button = (action: string, label: string, glyph: Parameters<typeof icon>[0], extra = "") =>
  `<button type="button" class="im-icon-button ${extra}" data-action="${action}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`;
function composer(kind: "group" | "thread") {
  return `<form class="im-composer" data-composer="${kind}">
    <div class="im-quote-draft" data-quote="${kind}" hidden></div>
    <label class="im-composer-destination" for="im-${kind}-input" data-destination="${kind}"></label>
    <textarea id="im-${kind}-input" rows="1" maxlength="12000" placeholder="写下你的想法…" aria-label="${kind === "group" ? "群聊消息" : "Thread 回复"}" required></textarea>
    <div class="im-composer-tools"><div>${button("new-topic", "新建公开话题", "plus")}${button("mention", "插入成员名字", "user")}${button("format-help", "消息格式", "text")}</div><span class="im-compose-status" data-compose-status="${kind}" role="status"></span><button class="im-send" type="submit" aria-label="${kind === "group" ? "发送群消息" : "发送 Thread 回复"}" disabled>${icon("send")}</button></div>
  </form>`;
}
/** No data or credentials are embedded; the shared server resolves membership. */
export function renderImPage(options: { embedded?: boolean } = {}): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>项目讨论 · Molis Work</title><link rel="stylesheet" href="/im/styles.css"><script src="/im/client.js" defer></script></head>
  <body>${renderIconSprite()}<main class="im-app${options.embedded ? " is-embedded" : ""}" data-im-app>
    <aside class="im-sidebar" aria-label="历史群聊"><div class="im-brand">历史群聊 ${button("rooms", "收起群聊目录", "x")}</div><nav data-room-list></nav><div class="im-form-actions">${button("create-room", "创建群聊", "plus")}${button("join", "加入群聊", "link")}</div><div class="im-profile"><span class="im-avatar" data-own-avatar></span><span data-own-name></span><span data-connection role="status"></span></div></aside>
    <section class="im-welcome" data-welcome><div class="im-welcome-symbol">${icon("message")}</div><h1 data-welcome-title>一起，把事情说清楚</h1><p data-welcome-copy>日常沟通留在主群，值得展开的讨论放进话题。所有项目成员都能看到。</p><div data-welcome-body><p class="im-muted" role="status">正在连接项目讨论…</p></div></section>
    <section class="im-conversations" data-conversations hidden aria-label="项目主群与公开话题">
      <header class="im-group-header"><div class="im-group-heading"><button class="im-legacy-directory" data-action="rooms" type="button" hidden aria-label="切换历史群聊">历史群聊</button><h1 data-room-title></h1><button class="im-member-button" data-action="members" type="button" data-member-count></button></div><div class="im-header-actions"><button type="button" class="im-member-avatars" data-member-avatars data-action="members" aria-label="查看项目成员"></button>${button("search", "搜索讨论", "search")}${button("invite", "邀请成员", "plus")}${button("minimize", "收起讨论", "chevron-down")}</div></header>
      <nav class="im-thread-strip" data-thread-strip aria-label="主群与话题"></nav>
      <section class="im-search" data-search hidden><form data-search-form><input type="search" maxlength="200" aria-label="搜索消息或话题" placeholder="搜索消息或话题…"><button type="submit" class="im-icon-button" aria-label="搜索">${icon("search")}</button>${button("close-search", "返回讨论", "x")}</form><div data-search-results role="region" aria-label="搜索结果"></div></section>
      <section class="im-group" data-group-pane aria-label="主群"><div class="im-stream" data-scroll="group" data-stream="group" role="region" aria-label="群聊消息" tabindex="0"></div><button class="im-new-messages" type="button" data-action="latest-group" hidden>回到最新消息</button>${composer("group")}</section>
      <section class="im-thread" data-thread-pane hidden aria-label="当前话题"><header class="im-thread-header"><h2 data-thread-title></h2><p data-thread-scope></p></header><div class="im-scroll" data-scroll="thread" role="region" aria-label="Thread 消息" tabindex="0"><div class="im-thread-context" data-thread-context></div><div class="im-stream" data-stream="thread"></div></div><button class="im-new-messages" type="button" data-action="latest-thread" hidden>回到最新回复</button>${composer("thread")}</section>
    </section>
    <div class="im-toast" data-toast role="status" hidden></div><div class="im-sync-alert" data-sync-alert role="status" hidden><span></span><button type="button" data-action="retry">重新连接</button></div><button class="im-sidebar-scrim" type="button" data-action="rooms" aria-label="收起群聊目录" hidden></button>
  </main><dialog class="im-dialog" data-dialog><header><h2 data-dialog-title></h2>${button("close-dialog", "关闭", "x")}</header><div data-dialog-body></div></dialog></body></html>`;
}
