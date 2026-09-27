import type { ImMember, ImMessage, ImMessagePage, ImRoom, ImRoomState, ImThread } from "@molis-ai/molis-work-contracts/services/im";
import type { createMessageFormat } from "./message-format.js";
import type { StreamKind, ScrollAnchor } from "./browser/types.js";
/** Typed browser view helpers; user/server strings are escaped before markup. */
export function createViews(root: HTMLElement, createFormat: typeof createMessageFormat) {
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const htmlCache = new WeakMap<Element, string>();
  const rowCache = new WeakMap<Element, string>();
  const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const format = createFormat(escape);
  const icon = (name: string) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const avatar = (member: ImMember | null) => {
    const name = member?.display_name || '?';
    return '<span class="im-avatar" title="' + escape(name) + '">' + escape([...name].slice(0, 1).join('')) + '</span>';
  };
  const time = (value: string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  const day = (value: string) => {
    const date = new Date(value);
    return date.toDateString() === new Date().toDateString() ? '今天' : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(date);
  };
  // Skip unchanged chrome so SSE does not destroy the current keyboard target.
  const markup = (node: HTMLElement, html: string) => {
    if (htmlCache.get(node) === html && node.childNodes.length)
      return;
    const active = document.activeElement instanceof HTMLElement && node.contains(document.activeElement) ? document.activeElement : null;
    const action = active?.dataset.action, id = active?.dataset.id;
    node.innerHTML = html;
    htmlCache.set(node, html);
    if (action) {
      const replacement = [...node.querySelectorAll<HTMLElement>('[data-action]')].find(item => item.dataset.action === action && item.dataset.id === id);
      replacement?.focus({ preventScroll: true });
    }
  };
  const roomList = (rooms: ImRoom[], selected: string | null) => {
    markup(q('[data-room-list]'), rooms.length ? rooms.map(room => '<button class="im-room-item' + (room.id === selected ? ' is-active' : '') + '" type="button" data-action="select-room" data-id="' + escape(room.id) + '" aria-current="' + (room.id === selected ? 'true' : 'false') + '">' + icon('review') + '<span><strong>' + escape(room.title) + '</strong><small>' + escape(room.latest_message || room.member_count + ' 位成员 · 还没有消息') + '</small></span></button>').join('') : '<p class="im-muted im-sidebar-empty">创建群聊，或通过邀请加入。</p>');
  };
  const groupHeader = (state: ImRoomState, selectedThread: string, seen: Record<string, boolean>, member: ImMember | null) => {
    q('[data-room-title]').textContent = state.room.title;
    q('[data-member-count]').textContent = (state.room.project_id ? '项目主群 · ' : '群聊 · ') + state.members.length + ' 位成员';
    markup(q('[data-member-avatars]'), state.members.slice(0, 4).map(avatar).join(''));
    q('[data-action="invite"]').hidden = Boolean(state.room.project_id) || state.room.owner_id !== member?.id;
    markup(q('[data-destination="group"]'), '发到 <strong>主群</strong>');
    q<HTMLTextAreaElement>('#im-group-input').placeholder = '发送消息…';
    markup(q('[data-thread-strip]'), '<button type="button" class="im-thread-chip is-home' + (!selectedThread ? ' is-active' : '') + (seen[''] ? ' is-unread' : '') + '" data-action="close-thread" aria-pressed="' + (!selectedThread) + '">主群</button>' + state.threads.map(thread => '<button type="button" class="im-thread-chip' + (thread.id === selectedThread ? ' is-active' : '') + (seen[thread.id] ? ' is-unread' : '') + '" data-action="select-thread" data-id="' + escape(thread.id) + '" title="' + escape(thread.title) + ' · ' + thread.reply_count + ' 条回复" aria-pressed="' + (thread.id === selectedThread) + '"><span># ' + escape(thread.title) + '</span></button>').join('') + '<button type="button" class="im-thread-chip im-thread-add" data-action="new-topic" aria-label="新建公开话题" title="新建公开话题">' + icon('plus') + '</button>');
  };
  const scroller = (kind: StreamKind) => q('[data-scroll="' + kind + '"]');
  const captureScroll = (kind: StreamKind): ScrollAnchor | null => {
    const node = scroller(kind);
    if (!node.getClientRects().length || !node.clientHeight)
      return null;
    const top = node.getBoundingClientRect().top;
    const message = [...node.querySelectorAll<HTMLElement>('[data-message]')].find(item => item.getBoundingClientRect().bottom > top);
    return { id: message?.dataset.message, offset: message ? message.getBoundingClientRect().top - top : 0, bottom: node.scrollHeight - node.scrollTop - node.clientHeight < 70 };
  };
  const restoreScroll = (kind: StreamKind, anchor: ScrollAnchor | null) => {
    if (!anchor)
      return;
    const node = scroller(kind);
    if (anchor.bottom) {
      node.scrollTop = node.scrollHeight;
      return;
    }
    const message = anchor.id && node.querySelector('[data-message="' + CSS.escape(anchor.id) + '"]');
    if (message)
      node.scrollTop += message.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.offset;
  };
  const stream = (kind: StreamKind, messages: ImMessage[], page: ImMessagePage | null, threads: ImThread[], selectedThread: string, mode: 'preserve' | 'latest' | 'older' = 'preserve', draftSource = '', memberId = '') => {
    const node = q('[data-stream="' + kind + '"]');
    const scroll = scroller(kind), anchor = captureScroll(kind), oldHeight = scroll.scrollHeight, oldTop = scroll.scrollTop;
    const atBottom = oldHeight - oldTop - scroll.clientHeight < 70;
    const oldLast = node.querySelector<HTMLElement>('.im-message:last-child')?.dataset.message;
    const existing = new Map(([...node.children] as HTMLElement[]).map(item => [item.dataset.message || item.dataset.row, item]));
    let lastDay = '';
    let previous: ImMessage | null = null;
    let html = page?.has_more ? '<button type="button" class="im-history" data-row="history" data-action="history" data-kind="' + kind + '">加载更早的消息</button>' : '';
    for (const message of messages) {
      const label = day(message.created_at), sameDay = label === lastDay;
      if (!sameDay) {
        html += '<div class="im-date" data-row="day-' + escape(label) + '">' + label + '</div>';
        lastDay = label;
      }
      const related = kind === 'group' ? threads.filter(thread => thread.source_message_id === message.id) : [];
      const source = related.some(thread => thread.id === selectedThread) || message.id === draftSource;
      const consecutive = sameDay && previous?.author.id === message.author.id && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 300000 && !source;
      html += '<article class="im-message' + (source ? ' is-source' : '') + (consecutive ? ' is-consecutive' : '') + (message.author.id === memberId ? ' is-own' : '') + '" tabindex="0" data-message="' + escape(message.id) + '">' + avatar(message.author) + '<div class="im-message-copy"><div class="im-message-meta"><strong>' + escape(message.author.display_name) + '</strong><time datetime="' + escape(message.created_at) + '">' + time(message.created_at) + '</time></div><div class="im-message-body">' + format(message.body) + '</div>';
      if (message.quoted_message) {
        const quote = message.quoted_message;
        html += '<button type="button" class="im-quoted-message" data-action="jump-message" data-id="' + escape(quote.id) + '" data-thread="' + escape(quote.thread_id || '') + '"><small>' + escape(quote.author.display_name) + '</small>' + escape(quote.body.slice(0, 180)) + '</button>';
      }
      if (message.shared_reply) {
        const share = message.shared_reply;
        html += '<button type="button" class="im-shared-reply" data-action="select-thread" data-id="' + escape(share.thread_id) + '"><small>' + icon('git-branch') + escape(share.thread_title) + ' · ' + escape(share.author.display_name) + '</small>' + escape(share.body) + '</button>';
      }
      if (related.length) {
        html += '<div class="im-message-actions">';
        for (const thread of related)
          html += '<button class="im-inline-thread" type="button" data-action="select-thread" data-id="' + escape(thread.id) + '"><span># ' + escape(thread.title) + '</span></button>';
        html += '</div>';
      }
      html += '</div><div class="im-message-tools"><button type="button" data-action="quote" data-id="' + escape(message.id) + '">引用</button>' + (kind === 'group' ? '<button type="button" data-action="create-thread" data-id="' + escape(message.id) + '">展开话题</button>' : '<button type="button" data-action="share" data-id="' + escape(message.id) + '">分享至主群</button>') + '</div></article>';
      previous = message;
    }
    if (!messages.length)
      html += '<div class="im-empty" data-row="empty">' + icon(kind === 'group' ? 'message' : 'git-branch') + (kind === 'group' ? '还没有消息' : '继续这个话题') + '<p>' + (kind === 'group' ? '发条消息，开始这里的讨论。' : '回复会留在这里，所有群成员都能参与。') + '</p></div>';
    const template = document.createElement('template');
    template.innerHTML = html;
    const keep = new Set<Element>();
    let cursor = node.firstElementChild;
    for (const fresh of [...template.content.children] as HTMLElement[]) {
      const id = fresh.dataset.message || fresh.dataset.row, old = existing.get(id);
      let current = fresh;
      if (old && rowCache.get(old) === fresh.outerHTML)
        current = old;
      else {
        rowCache.set(fresh, fresh.outerHTML);
        if (old) {
          const focused = old.contains(document.activeElement) ? (document.activeElement as HTMLElement | null)?.dataset.action : null;
          old.replaceWith(fresh);
          if (cursor === old)
            cursor = fresh;
          if (focused)
            fresh.querySelector<HTMLElement>('[data-action="' + CSS.escape(focused) + '"]')?.focus({ preventScroll: true });
        }
        else if (fresh.dataset.message && oldLast && mode !== 'older')
          fresh.classList.add('is-new');
      }
      if (current !== cursor)
        node.insertBefore(current, cursor);
      keep.add(current);
      cursor = current.nextElementSibling;
    }
    for (const child of [...node.children] as HTMLElement[])
      if (!keep.has(child))
        child.remove();
    if (mode === 'latest' || (mode !== 'older' && atBottom)) {
      scroll.scrollTop = scroll.scrollHeight;
      q('[data-action="latest-' + kind + '"]').hidden = true;
    }
    else if (mode === 'older') {
      scroll.scrollTop = oldTop + scroll.scrollHeight - oldHeight;
      if (anchor?.id)
        restoreScroll(kind, { ...anchor, bottom: false });
    }
    else {
      scroll.scrollTop = oldTop;
      restoreScroll(kind, anchor);
      if (oldLast && messages.at(-1)?.id !== oldLast)
        q('[data-action="latest-' + kind + '"]').hidden = false;
    }
  };
  const context = (state: {
    thread: Pick<ImThread, 'id' | 'title' | 'source_message_id'>;
    context: ImMessage[];
  }) => {
    q('[data-thread-title]').textContent = state.thread.title;
    q('[data-thread-scope]').textContent = '所有项目成员可见';
    markup(q('[data-destination="thread"]'), '回复 <strong>' + escape(state.thread.title) + '</strong>');
    const source = state.context.find(message => message.id === state.thread.source_message_id), prior = state.context.filter(message => message.id !== state.thread.source_message_id);
    const contextNode = q('[data-thread-context]');
    const sameThread = contextNode.dataset.thread === state.thread.id;
    const open = sameThread && contextNode.querySelector('details')?.open;
    const item = (message: ImMessage) => '<div class="im-context-message' + (message.id === state.thread.source_message_id ? ' is-root' : '') + '"><small>' + escape(message.author.display_name) + ' · ' + time(message.created_at) + '</small>' + escape(message.body) + '</div>';
    const html = source ? '<div class="im-context-label">' + icon('git-branch') + '来自群聊<button type="button" data-action="source-message" data-id="' + escape(state.thread.source_message_id) + '">定位原消息 ' + icon('chevron-right') + '</button></div>' + (source ? item(source) : '') + (prior.length ? '<details' + (open ? ' open' : '') + '><summary>' + icon('chevron-down') + '查看 ' + prior.length + ' 条相关上文</summary>' + prior.map(item).join('') + '</details>' : '') : '';
    markup(contextNode, html);
    contextNode.dataset.thread = state.thread.id;
  };
  return { q, escape, icon, avatar, time, roomList, groupHeader, stream, context, captureScroll, restoreScroll, scroller };
}
