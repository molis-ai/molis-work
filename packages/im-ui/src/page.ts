import { icon, renderIconSprite } from "@molis-ai/molis-work-design-system";

const button = (action: string, label: string, glyph: Parameters<typeof icon>[0], extra = "") =>
  `<button type="button" class="im-icon-button ${extra}" data-action="${action}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`;

function composer(kind: "group" | "thread") {
  return `<form class="im-composer" data-composer="${kind}">
    <label class="im-composer-destination" for="im-${kind}-input" data-destination="${kind}"></label>
    <div class="im-composer-field"><textarea id="im-${kind}-input" rows="1" maxlength="12000" placeholder="${kind === "group" ? "发到群聊…" : "继续这个话题…"}" aria-label="${kind === "group" ? "群聊消息" : "Thread 回复"}" required></textarea>
    <button class="im-send" type="submit" aria-label="${kind === "group" ? "发送群消息" : "发送 Thread 回复"}" disabled>${icon("send")}</button></div>
    <div class="im-composer-foot"><span class="im-compose-status" data-compose-status="${kind}" role="status"></span><span class="im-key-hint">Enter 发送 · Shift Enter 换行</span></div>
  </form>`;
}

/** No data or credentials are embedded in the page; the shared server resolves the current member. */
export function renderImPage(options: { embedded?: boolean } = {}): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>群聊 · Molis Work</title><link rel="stylesheet" href="/im/styles.css"><script src="/im/client.js" defer></script></head>
  <body>${renderIconSprite()}<main class="im-app${options.embedded ? " is-embedded" : ""}" data-im-app>
    <aside class="im-sidebar" aria-label="群聊目录">
      <div class="im-brand"><span>${options.embedded ? "群聊" : "Molis Work"}</span>${button("create-room", "创建群聊", "plus")}</div>
      <div class="im-sidebar-heading"><span>我的群聊</span><div>${button("join", "加入群聊", "link")}${button("create-room", "创建群聊", "plus")}</div></div>
      <nav class="im-room-list" data-room-list aria-label="我的群聊"><p class="im-muted im-sidebar-empty">正在连接…</p></nav>
      <div class="im-profile"><span class="im-avatar" data-own-avatar></span><span data-own-name>尚未加入</span><span class="im-connection" data-connection role="status">连接中</span></div>
    </aside>
    <section class="im-welcome" data-welcome aria-label="开始群聊">
      <div class="im-welcome-symbol">${icon("message")}</div><h1 data-welcome-title>让讨论在一起发生</h1>
      <p data-welcome-copy>一个群聊，多个话题。展开 Thread 时，大家仍在同一个空间里。</p>
      <div data-welcome-body><p class="im-muted" role="status">正在连接群聊…</p></div>
    </section>
    <section class="im-conversations" data-conversations hidden aria-label="群聊与 Thread">
      <section class="im-group" aria-label="群聊">
        <header class="im-group-header"><div class="im-group-heading">${button("rooms", "显示群聊目录", "sidebar", "im-mobile-directory")}<div><h1 data-room-title></h1><button class="im-member-button" data-action="members" type="button" data-member-count></button></div></div>
          <div class="im-header-actions"><button type="button" class="im-member-avatars" data-member-avatars data-action="members" aria-label="查看群成员"></button>${button("invite", "邀请成员", "plus")}</div>
        </header>
        <nav class="im-thread-strip" data-thread-strip aria-label="群内 Thread"></nav>
        <div class="im-stream" data-stream="group" role="region" aria-label="群聊消息" tabindex="0"></div>
        <button class="im-new-messages" type="button" data-action="latest-group" hidden>有新消息 · 回到最新</button>
        ${composer("group")}
      </section>
      <section class="im-thread" data-thread-pane hidden aria-label="当前 Thread">
        <header class="im-thread-header"><div><h2 data-thread-title></h2><p data-thread-scope></p></div>${button("close-thread", "收起 Thread", "x")}</header>
        <div class="im-thread-context" data-thread-context></div>
        <div class="im-stream" data-stream="thread" role="region" aria-label="Thread 消息" tabindex="0"></div>
        <button class="im-new-messages" type="button" data-action="latest-thread" hidden>有新回复 · 回到最新</button>
        ${composer("thread")}
      </section>
    </section>
    <div class="im-toast" data-toast role="status" hidden></div>
    <div class="im-sync-alert" data-sync-alert role="status" hidden><span></span><button type="button" data-action="retry">重新连接</button></div>
    <button class="im-sidebar-scrim" type="button" data-action="rooms" aria-label="收起群聊目录" hidden></button>
  </main>
  <dialog class="im-dialog" data-dialog><header><h2 data-dialog-title></h2>${button("close-dialog", "关闭", "x")}</header><div data-dialog-body></div></dialog>
  </body></html>`;
}
