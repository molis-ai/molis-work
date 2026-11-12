import { dateArg, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImMember, ImMessage, ImMessagePage, ImRoom, ImRoomState, ImThread } from "@molis-ai/molis-work-contracts/services/im";
import type { createMessageFormat } from "./message-format.js";
import type { StreamKind, ScrollAnchor } from "./browser/types.js";
/** The two date labels a message row uses: the clock time, and 今天 or a month and day, in the page's language. */
function dateLabels(locale: string) {
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const monthDay = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' });
  return {
    time: (value: string) => clock.format(new Date(value)),
    day: (value: string) => {
      const date = new Date(value);
      return date.toDateString() === new Date().toDateString() ? (L("今天")) : monthDay.format(date);
    },
  };
}
/** Typed browser view helpers; user/server strings are escaped before markup. */
export function createViews(root: HTMLElement, createFormat: typeof createMessageFormat) {
  const q = <T extends HTMLElement = HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const htmlCache = new WeakMap<Element, ViewMarkup>();
  const rowCache = new WeakMap<Element, ViewMarkup>();
  const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const format = createFormat(escape);
  const icon = (name: string) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const avatar = (member: ImMember | null) => {
    const name = member?.display_name || '?';
<<<<<<< HEAD
    return '<span class="im-avatar" title="' + escape(name) + '">' + escape([...name].slice(0, 1).join('')) + '</span>';
  };
  const { time, day } = dateLabels(root.ownerDocument?.documentElement?.lang || 'zh-CN');
=======
    return '<span class="im-avatar" translate="no" title="' + escape(name) + '">' + escape([...name].slice(0, 1).join('')) + '</span>';
  };
  const time = (value: string) => uiText("im-ui.history.timestamp", { value: dateArg(value, "time") });
>>>>>>> origin/main
  // Skip unchanged chrome so SSE does not destroy the current keyboard target.
  const markup = updateViewMarkup.bind(undefined, htmlCache);
  const roomList = (rooms: ImRoom[], selected: string | null) => {
    markup(q('[data-room-list]'), rooms.length ? rooms.map(room => `<button class="im-room-item${room.id === selected ? ' is-active' : ''}" type="button" data-action="select-room" data-id="${escape(room.id)}" aria-current="${room.id === selected}">${icon('review')}<span><strong translate="no">${escape(room.title)}</strong>${room.latest_message ? `<small translate="no">${escape(room.latest_message)}</small>` : `<small>${uiText("im-ui.room.member-count-empty", { count: room.member_count })}</small>`}</span></button>`).join('') : `<p class="im-muted im-sidebar-empty">${uiText("im-ui.room.empty-directory")}</p>`);
  };
  const groupHeader = (state: ImRoomState, selectedThread: string, seen: Record<string, boolean>, member: ImMember | null) => {
    setImHeading(q('[data-room-title]'), state.room.title);
    q('[data-member-count]').textContent = uiText.text(state.room.project_id ? "im-ui.room.project-member-count" : "im-ui.room.group-member-count", { count: state.members.length });
    markup(q('[data-member-avatars]'), state.members.slice(0, 4).map(avatar).join(''));
    q('[data-action="invite"]').hidden = Boolean(state.room.project_id) || state.room.owner_id !== member?.id;
    q('[data-destination="group"]').textContent = uiText.text("im-ui.message.to-main");
    q<HTMLTextAreaElement>('#im-group-input').placeholder = (uiText.text("im-ui.message.group-placeholder"));
    markup(q('[data-thread-strip]'), topicTabs(state.threads, selectedThread, seen, escape, icon));
  };
  const scroller = (kind: StreamKind) => q('[data-scroll="' + kind + '"]');
  const captureScroll = (kind: StreamKind): ScrollAnchor | null => {
    const node = scroller(kind);
    if (!node.getClientRects().length || !node.clientHeight)
      return null;
    const top = node.getBoundingClientRect().top;
    const message = [...node.querySelectorAll<HTMLElement>('[data-message]')].find(item => item.getBoundingClientRect().bottom > top);
    return { id: message?.dataset.message, offset: message ? message.getBoundingClientRect().top - top : 0, bottom: window.molisFollow?.(node).state === 'following' };
  };
  // Tail means following; judge restores molisFollow's saved place, redraws only compensate. restoreScroll owns shifts; native anchoring is off.
  const restoreScroll = (kind: StreamKind, anchor: ScrollAnchor | null, judge = true) => {
    const node = scroller(kind), follow = window.molisFollow?.(node), message = anchor?.id && !anchor.bottom && node.querySelector('[data-message="' + CSS.escape(anchor.id) + '"]');
    if (anchor?.bottom) { if (follow) { follow.resume(); follow.pin(); } else node.scrollTop = node.scrollHeight; return; }
    if (!message || !anchor) return;
    const place = node.scrollTop + message.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.offset;
    if (follow && judge) follow.restore(place); else node.scrollTop = place;
  };
  const stream = (kind: StreamKind, messages: ImMessage[], page: ImMessagePage | null, threads: ImThread[], selectedThread: string, mode: 'preserve' | 'latest' | 'older' = 'preserve', draftSource = '', memberId = '') => {
    const node = q('[data-stream="' + kind + '"]');
    const scroll = scroller(kind), anchor = captureScroll(kind), oldHeight = scroll.scrollHeight, oldTop = scroll.scrollTop;
    const follow = window.molisFollow?.(scroll), atBottom = follow?.state !== 'detached';
    const oldLast = node.querySelector<HTMLElement>('.im-message:last-child')?.dataset.message;
    const existing = new Map(([...node.children] as HTMLElement[]).map(item => [item.dataset.message || item.dataset.row, item]));
    let lastDay = '';
    let previous: ImMessage | null = null;
    let html = page?.has_more ? '<button type="button" class="im-history" data-row="history" data-action="history" data-kind="' + kind + ("\">" + uiText("im-ui.history.load-earlier") + "</button>") : '';
    for (const message of messages) {
      const day = localDay(new Date(message.created_at)), sameDay = day === lastDay;
      if (!sameDay) {
        const label = day === localDay(new Date()) ? uiText("im-ui.history.today") : uiText("im-ui.history.timestamp", { value: dateArg(message.created_at, "month-day") });
        html += '<div class="im-date" data-row="day-' + day + '">' + label + '</div>';
        lastDay = day;
      }
      const related = kind === 'group' ? threads.filter(thread => thread.source_message_id === message.id) : [];
      const source = related.some(thread => thread.id === selectedThread) || message.id === draftSource;
      const consecutive = sameDay && previous?.author.id === message.author.id && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 300000 && !source;
      html += '<article class="im-message' + (source ? ' is-source' : '') + (consecutive ? ' is-consecutive' : '') + (message.author.id === memberId ? ' is-own' : '') + '" tabindex="0" data-message="' + escape(message.id) + '">' + avatar(message.author) + '<div class="im-message-copy"><div class="im-message-meta"><strong translate="no">' + escape(message.author.display_name) + '</strong><time datetime="' + escape(message.created_at) + '">' + time(message.created_at) + '</time></div><div class="im-message-body" translate="no">' + format(message.body) + '</div>';
      if (message.quoted_message) {
        const quote = message.quoted_message;
        html += '<button type="button" class="im-quoted-message" translate="no" data-action="jump-message" data-id="' + escape(quote.id) + '" data-thread="' + escape(quote.thread_id || '') + '"><small>' + escape(quote.author.display_name) + '</small>' + escape(quote.body.slice(0, 180)) + '</button>';
      }
      if (message.shared_reply) {
        const share = message.shared_reply;
        html += '<button type="button" class="im-shared-reply" translate="no" data-action="select-thread" data-id="' + escape(share.thread_id) + '"><small>' + icon('git-branch') + escape(share.thread_title) + ' · ' + escape(share.author.display_name) + '</small>' + escape(share.body) + '</button>';
      }
      if (related.length) {
        html += '<div class="im-message-actions">';
        for (const thread of related)
          html += '<button class="im-inline-thread" type="button" data-action="select-thread" data-id="' + escape(thread.id) + '"><span translate="no"># ' + escape(thread.title) + '</span></button>';
        html += '</div>';
      }
      html += '</div><div class="im-message-tools"><button type="button" data-action="quote" data-id="' + escape(message.id) + ("\">" + uiText("im-ui.message.quote") + "</button>") + (kind === 'group' ? '<button type="button" data-action="create-thread" data-id="' + escape(message.id) + ("\">" + uiText("im-ui.thread.open") + "</button>") : '<button type="button" data-action="share" data-id="' + escape(message.id) + ("\">" + uiText("im-ui.thread.share") + "</button>")) + '</div></article>';
      previous = message;
    }
    if (!messages.length)
      html += '<div class="im-empty" data-row="empty">' + icon(kind === 'group' ? 'message' : 'git-branch') + (kind === 'group' ? (uiText.text("im-ui.message.empty")) : (uiText.text("im-ui.thread.continue"))) + '<p>' + (kind === 'group' ? (uiText.text("im-ui.message.empty-group-description")) : (uiText.text("im-ui.thread.empty-description"))) + '</p></div>';
    const template = document.createElement('template');
    template.innerHTML = html;
    const keep = new Set<Element>(), language = document.documentElement.lang;
    let cursor = node.firstElementChild;
    for (const fresh of [...template.content.children] as HTMLElement[]) {
      const id = fresh.dataset.message || fresh.dataset.row, old = existing.get(id);
      let current = fresh;
      const html = fresh.outerHTML, shown = old && rowCache.get(old);
      if (old && shown && (shown.html === html || shown.language !== language && sameMessageRow(old, fresh))) {
        current = old;
        rowCache.set(old, { html, language });
      } else {
        rowCache.set(fresh, { html, language });
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
      if (mode === 'latest') follow?.resume();
      follow ? follow.pin() : scroll.scrollTop = scroll.scrollHeight;
      q('[data-action="latest-' + kind + '"]').hidden = true;
    }
    else if (mode === 'older') {
      scroll.scrollTop = oldTop + scroll.scrollHeight - oldHeight;
      if (anchor?.id)
        restoreScroll(kind, { ...anchor, bottom: false }, false);
    }
    else {
      scroll.scrollTop = oldTop;
      restoreScroll(kind, anchor && { ...anchor, bottom: false }, false);
      if (oldLast && messages.at(-1)?.id !== oldLast)
        q('[data-action="latest-' + kind + '"]').hidden = false;
    }
  };
  const context = (state: {
    thread: Pick<ImThread, 'id' | 'title' | 'source_message_id'>;
    context: ImMessage[];
  }) => {
    const draft = state.thread.id === 'draft';
    setImHeading(q('[data-thread-title]'), draft ? uiText.text("im-ui.thread.new") : state.thread.title, !draft);
    q('[data-thread-scope]').textContent = (uiText.text("im-ui.thread.visibility"));
    q('[data-destination="thread"]').textContent = draft ? uiText.text("im-ui.message.reply-to-new-topic") : uiText.text("im-ui.message.reply-to", { title: state.thread.title });
    const source = state.context.find(message => message.id === state.thread.source_message_id), prior = state.context.filter(message => message.id !== state.thread.source_message_id);
    const contextNode = q('[data-thread-context]');
    const sameThread = contextNode.dataset.thread === state.thread.id;
    const open = sameThread && contextNode.querySelector('details')?.open;
    const item = (message: ImMessage) => '<div class="im-context-message' + (message.id === state.thread.source_message_id ? ' is-root' : '') + '"><small>' + '<span translate="no">' + escape(message.author.display_name) + '</span> · ' + time(message.created_at) + '</small><span translate="no">' + escape(message.body) + '</span></div>';
    const html = source ? '<div class="im-context-label">' + icon('git-branch') + (uiText("im-ui.thread.from-group") + "<button type=\"button\" data-action=\"source-message\" data-id=\"") + escape(state.thread.source_message_id) + ("\">" + uiText("im-ui.thread.find-source")) + icon('chevron-right') + '</button></div>' + (source ? item(source) : '') + (prior.length ? '<details' + (open ? ' open' : '') + '><summary>' + icon('chevron-down') + uiText("im-ui.thread.prior-count", { count: prior.length }) + "</summary>" + prior.map(item).join('') + '</details>' : '') : '';
    markup(contextNode, html);
    contextNode.dataset.thread = state.thread.id;
  };
  return { q, escape, icon, avatar, time, roomList, groupHeader, stream, context, captureScroll, restoreScroll, scroller };
}

function topicTabs(threads: ImThread[], selectedThread: string, seen: Record<string, boolean>, escape: (value: unknown) => string, icon: (name: string) => string): string {
  const home = `<button type="button" class="im-thread-chip is-home${!selectedThread ? ' is-active' : ''}${seen[''] ? ' is-unread' : ''}" data-action="close-thread" aria-pressed="${!selectedThread}">${uiText("im-ui.room.main")}</button>`;
  const topics = threads.map(thread => `<button type="button" class="im-thread-chip${thread.id === selectedThread ? ' is-active' : ''}${seen[thread.id] ? ' is-unread' : ''}" data-action="select-thread" data-id="${escape(thread.id)}" title="${uiText("im-ui.thread.reply-count", { title: thread.title, count: thread.reply_count })}" aria-pressed="${thread.id === selectedThread}"><span translate="no"># ${escape(thread.title)}</span></button>`);
  const add = uiText("im-ui.thread.new-public");
  return home + topics.join('') + `<button type="button" class="im-thread-chip im-thread-add" data-action="new-topic" aria-label="${add}" title="${add}">${icon('plus')}</button>`;
}

interface ViewMarkup { html: string; language: string }

function sameMessageRow(old: Element, fresh: Element): boolean {
  if (old.isEqualNode(fresh)) return true;
  // Arrival motion and a navigation highlight belong to the existing element, not the message content.
  if (!old.matches(".is-new,.im-source-flash")) return false;
  const stable = old.cloneNode(true) as Element;
  stable.classList.remove("is-new", "im-source-flash");
  return stable.isEqualNode(fresh);
}

function sameViewMarkup(node: HTMLElement, html: string): boolean {
  const template = document.createElement("template");
  template.innerHTML = html;
  const fresh = template.content.childNodes;
  return node.childNodes.length === fresh.length && [...node.childNodes].every((child, index) => child.isEqualNode(fresh[index]!));
}

const localDay = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");

/** A room or thread title is authored; its fallback is the discussion's own text. */
export function setImHeading(node: HTMLElement, text: string, authored = true): void {
  if (node.textContent !== text) node.textContent = text;
  node.translate = !authored;
}

export function updateViewMarkup(htmlCache: WeakMap<Element, ViewMarkup>, node: HTMLElement, html: string): void {
  const shown = htmlCache.get(node), language = document.documentElement.lang;
  if (shown && node.childNodes.length && (shown.html === html || shown.language !== language && sameViewMarkup(node, html))) {
    htmlCache.set(node, { html, language });
    return;
  }
  const active = document.activeElement instanceof HTMLElement && node.contains(document.activeElement) ? document.activeElement : null;
  const action = active?.dataset.action, id = active?.dataset.id;
  node.innerHTML = html;
  htmlCache.set(node, { html, language });
  if (action) {
    const replacement = [...node.querySelectorAll<HTMLElement>('[data-action]')].find(item => item.dataset.action === action && item.dataset.id === id);
    replacement?.focus({ preventScroll: true });
  }
}
