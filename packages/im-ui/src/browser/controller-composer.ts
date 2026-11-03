import type { ImMessagePage, ImReadState, ImMarkReadInput } from '@molis-ai/molis-work-contracts/services/im';
import type { StreamKind } from './types.js';
import type { ImBaseCtx, ImCtx } from './controller-types.js';
/** The conversation surface: drafts, quotes, drawing the streams, reading positions, search visibility and read marks. */
export function createImComposer(base: ImBaseCtx, context: () => ImCtx): Pick<ImCtx, 'restoreDraft' | 'readDraft' | 'render' | 'updateHeader' | 'rememberPosition' | 'restorePosition' | 'paintQuote' | 'quoteMessage' | 'closeSearch' | 'openSearch' | 'scheduleRead' | 'markVisible'> {
  const { s, v, q, e, icon, api, storage, merge, drafts } = base;
  function restoreDraft(kind: StreamKind) {
    const c = context();
    c.inputFor(kind).value = drafts.get(c.target(kind))?.body || '';
    paintQuote(kind);
    c.status(kind, '');
    c.syncComposer(kind);
    c.resizeInput(kind);
  }
  function readDraft(kind: StreamKind) {
    const c = context();
    const id = c.target(kind);
    if (!id)
      return;
    const body = c.inputFor(kind).value;
    drafts.edit(id, body);
    c.syncComposer(kind);
    c.resizeInput(kind);
  }
  function render(kind: StreamKind, mode: 'preserve' | 'latest' | 'older' = 'preserve') {
    v.stream(kind, kind === 'group' ? s.groupMessages : s.threadMessages, kind === 'group' ? s.groupPage : s.threadPage, s.roomState?.threads || [], s.threadId, mode, s.threadDraft?.source_message_id || '', s.member?.id);
    scheduleRead();
  }
  function updateHeader() {
    if (!s.roomState)
      return;
    v.groupHeader(s.roomState, s.threadDraft ? '__draft' : s.threadId, s.seen, s.member);
    v.roomList(s.rooms, s.roomId);
  }
  function rememberPosition() {
    const c = context();
    if (!s.member || !s.roomId)
      return;
    const kind = c.activeKind();
    if (s.threadDraft)
      return;
    const id = c.target(kind);
    // Hidden search results and closed panes have no reading geometry.
    const anchor = q('[data-search]').hidden ? v.captureScroll(kind) : null;
    if (anchor) {
      s.anchors[id] = anchor;
      storage.write(c.key('anchors'), s.anchors);
    }
    if (kind === 'thread' && s.threadState)
      s.streamCache.set(id, { messages: s.threadMessages, page: s.threadPage });
  }
  async function restorePosition(kind: StreamKind, version: number) {
    const c = context();
    const anchor = s.anchors[c.target(kind)];
    if (!anchor)
      return;
    let messages = kind === 'group' ? s.groupMessages : s.threadMessages, page = kind === 'group' ? s.groupPage : s.threadPage;
    while (anchor.id && !messages.some(m => m.id === anchor.id) && page?.has_more) {
      page = await api<ImMessagePage>(c.pathFor(s.roomId, kind === 'thread' ? s.threadId : '') + '/messages?before=' + page.next_before);
      if (version !== s.epoch)
        return;
      messages = merge(messages, page.messages);
      if (kind === 'group') {
        s.groupMessages = messages;
        s.groupPage = page;
      }
      else {
        s.threadMessages = messages;
        s.threadPage = page;
      }
    }
    render(kind);
    v.restoreScroll(kind, anchor);
  }
  function paintQuote(kind: StreamKind) {
    const c = context();
    const draft = drafts.get(c.target(kind)), node = q('[data-quote="' + kind + '"]');
    node.hidden = !draft?.quote_id;
    node.innerHTML = draft?.quote_id ? '<span>引用 ' + e(draft.quote_author) + '：' + e(draft.quote_body) + '</span><button type="button" data-action="cancel-quote" aria-label="取消引用">' + icon('x') + '</button>' : '';
  }
  function quoteMessage(id: string) {
    const c = context();
    const kind = c.activeKind(), message = (kind === 'group' ? s.groupMessages : s.threadMessages).find(m => m.id === id);
    if (!message)
      return;
    readDraft(kind);
    drafts.quote(c.target(kind), { quote_id: id, quote_body: message.body, quote_author: message.author.display_name });
    paintQuote(kind);
    c.inputFor(kind).focus();
  }
  function closeSearch() {
    const c = context();
    const wasSearching = !q('[data-search]').hidden;
    s.searchVersion++;
    q('[data-search]').hidden = true;
    q('[data-conversations]').classList.remove('is-searching');
    if (wasSearching) v.restoreScroll(c.activeKind(), s.anchors[c.target(c.activeKind())] ?? null);
  }
  function openSearch() { rememberPosition(); q('[data-search]').hidden = false; q('[data-conversations]').classList.add('is-searching'); q<HTMLInputElement>('[data-search] input').focus(); }
  function scheduleRead() { clearTimeout(s.readTimer); s.readTimer = setTimeout(() => void markVisible(), 500); }
  async function markVisible() {
    const c = context();
    if (!s.hostVisible || document.visibilityState !== 'visible' || !s.roomState || s.threadDraft || s.readBusy || !q('[data-search]').hidden)
      return;
    const kind = c.activeKind(), stream = q('[data-stream="' + kind + '"]'), bounds = v.scroller(kind).getBoundingClientRect(), messages = kind === 'group' ? s.groupMessages : s.threadMessages;
    const visible = [...stream.querySelectorAll<HTMLElement>('[data-message]')].filter(node => { const rect = node.getBoundingClientRect(); return rect.top < bounds.bottom && rect.bottom > bounds.top; }).at(-1);
    const message = messages.find(m => m.id === visible?.dataset.message), t = s.threadId, r = s.roomId;
    if (!message || message.sequence <= (s.positions[t] || 0))
      return;
    s.readBusy = true;
    try {
      const result = await api<ImReadState>(c.pathFor(r) + '/read', { message_id: message.id, client_id: crypto.randomUUID() } satisfies ImMarkReadInput);
      if (r === s.roomId) {
        s.seen = result.unread;
        s.positions = result.positions;
        updateHeader();
      }
    }
    catch { /* a read mark that fails is sent again by the next scroll or refresh; the person has nothing to act on */ }
    finally {
      s.readBusy = false;
    }
  }
  return { restoreDraft, readDraft, render, updateHeader, rememberPosition, restorePosition, paintQuote, quoteMessage, closeSearch, openSearch, scheduleRead, markVisible };
}
