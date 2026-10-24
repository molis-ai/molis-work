import type { ImMessage, ImMessagePage } from '@molis-ai/molis-work-contracts/services/im';
import type { StreamKind, ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** Sending a message and moving to a message (source links and search results). */
export function createImNavigate(c: ImCtx): Pick<ImCtx, 'locateSource' | 'send' | 'jumpMessage'> {
  const { s, v, q, dialog, api, merge, drafts } = c;
  async function locateSource(id: string) {
    if (s.threadId || s.threadDraft)
      c.closeThread();
    const version = s.epoch;
    let message = q('[data-stream="group"] [data-message="' + CSS.escape(id) + '"]');
    try {
      while (!message && s.groupPage?.has_more && version === s.epoch) {
        const page = await api<ImMessagePage>(c.pathFor(s.roomId) + '/messages?before=' + s.groupPage.next_before);
        if (version !== s.epoch)
          return;
        s.groupPage = page;
        s.groupMessages = merge(s.groupMessages, page.messages);
        c.render('group', 'older');
        message = q('[data-stream="group"] [data-message="' + CSS.escape(id) + '"]');
      }
      if (!message)
        return;
      window.molisFollow?.(v.scroller('group')).release();
      message.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      message.focus({ preventScroll: true });
      message.classList.remove('im-source-flash');
      void message.offsetWidth;
      message.classList.add('im-source-flash');
      setTimeout(() => message.classList.remove('im-source-flash'), 1200);
    }
    catch (cause) {
      const error = cause as ApiError;
      c.toast(error.message);
    }
  }
  async function send(kind: StreamKind) {
    const id = c.target(kind), r = s.roomId, t = kind === 'thread' ? s.threadId : '';
    if (!id || s.authLost || s.busyTargets.has(id) || s.roomState?.room.id !== r || (kind === 'thread' && s.threadState?.thread.id !== t))
      return;
    c.readDraft(kind);
    const draft = { ...drafts.get(id)! };
    if (!draft.body?.trim())
      return;
    const wasFocused = document.activeElement === c.inputFor(kind);
    s.busyTargets.add(id);
    c.syncComposer(kind);
    c.status(kind, '正在发送…');
    try {
      const result = await api<{
        message: ImMessage;
      }>(c.pathFor(r, t) + '/messages', { body: draft.body, client_id: draft.client_id, ...(draft.quote_id ? { quote_id: draft.quote_id } : {}) });
      const cleared = drafts.clearMessage(id, draft.client_id);
      if (id === c.target(kind)) {
        if (cleared) {
          c.inputFor(kind).value = '';
          c.paintQuote(kind);
          c.resizeInput(kind);
        }
        c.status(kind, '已发送');
        setTimeout(() => {
          if (id === c.target(kind) && q('[data-compose-status="' + kind + '"]').textContent === '已发送')
            c.status(kind, '');
        }, 1800);
        if (kind === 'group')
          s.groupMessages = merge(s.groupMessages, [result.message]);
        else
          s.threadMessages = merge(s.threadMessages, [result.message]);
        c.render(kind, 'latest');
      }
      c.scheduleRefresh();
    }
    catch (cause) {
      const error = cause as ApiError;
      if (id === c.target(kind))
        c.status(kind, error.uncertain ? '未能确认发送结果。原文已保留，再次发送不会重复。' : error.message, true);
    }
    finally {
      s.busyTargets.delete(id);
      c.syncComposer(kind);
      if (wasFocused && id === c.target(kind) && !dialog.open && document.activeElement === document.body)
        c.inputFor(kind).focus({ preventScroll: true });
    }
  }
  async function jumpMessage(id: string, thread: string) {
    c.closeSearch();
    if (!thread) {
      await locateSource(id);
      return;
    }
    await c.selectThread(thread);
    if (s.threadId !== thread)
      return;
    const version = s.epoch;
    let node = q('[data-stream="thread"] [data-message="' + CSS.escape(id) + '"]');
    while (!node && s.threadPage?.has_more) {
      const before = s.threadPage.next_before;
      await c.history('thread');
      if (version !== s.epoch || before === s.threadPage.next_before)
        return;
      node = q('[data-stream="thread"] [data-message="' + CSS.escape(id) + '"]');
    }
    if (node) {
      window.molisFollow?.(v.scroller('thread')).release();
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      node.focus({ preventScroll: true });
      node.classList.add('im-source-flash');
      setTimeout(() => node.classList.remove('im-source-flash'), 1200);
    }
  }
  return { locateSource, send, jumpMessage };
}
