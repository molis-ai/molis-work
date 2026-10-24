import type { ImRoomState, ImThreadState, ImMessagePage, ImRoomList, ImReadState } from '@molis-ai/molis-work-contracts/services/im';
import type { StreamKind, ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** Keeping the page in step with the server: the event stream, the refresh cycle and older-history paging. */
export function createImSync(c: ImCtx): Pick<ImCtx, 'connectEvents' | 'scheduleRefresh' | 'refresh' | 'history'> {
  const { s, v, q, api, subscribe, merge, latest } = c;
  function connectEvents() {
    s.events?.close();
    s.events = null;
    if (!s.roomId)
      return;
    const captured = s.roomId;
    s.events = subscribe(c.pathFor(s.roomId), {
      update() {
        if (captured !== s.roomId)
          return; c.connection('已连接'); scheduleRefresh();
      },
      revoked() { s.authLost = true; c.connection('访问已失效', true); c.syncError('连接或群访问已失效，请重新连接。'); s.roomState = null; c.syncComposer('group'); c.syncComposer('thread'); },
      offline() {
        if (captured === s.roomId) {
          c.connection('重连中', true);
          scheduleRefresh();
        }
      },
    });
  }
  function scheduleRefresh() {
    clearTimeout(s.refreshTimer);
    s.refreshTimer = setTimeout(() => void refresh(), 100);
  }
  async function refresh() {
    if (!s.roomId)
      return;
    if (s.refreshing) {
      s.refreshAgain = true;
      return;
    }
    s.refreshing = true;
    const version = s.epoch, r = s.roomId, t = s.threadId;
    try {
      const [listing, state, group, read, thread] = await Promise.all([
        api<ImRoomList>('/rooms'), api<ImRoomState>(c.pathFor(r)), latest(c.pathFor(r), s.groupMessages, s.groupPage, () => s.epoch === version), api<ImReadState>(c.pathFor(r) + '/read'),
        t ? Promise.all([api<ImThreadState>(c.pathFor(r, t)), latest(c.pathFor(r, t), s.threadMessages, s.threadPage, () => s.epoch === version)]) : null,
      ]);
      if (version !== s.epoch)
        return;
      const threadWasUnloaded = !s.threadState;
      s.rooms = listing.rooms;
      s.roomState = state;
      s.seen = read.unread;
      s.positions = read.positions;
      s.groupMessages = merge(s.groupMessages, group.messages);
      s.groupPage = group;
      if (thread) {
        s.threadState = thread[0];
        s.threadMessages = merge(s.threadMessages, thread[1].messages);
        s.threadPage = thread[1];
        v.context(s.threadState);
        if (threadWasUnloaded) {
          c.formFor('thread').hidden = false;
          c.restoreDraft('thread');
        }
      }
      c.updateHeader();
      c.render('group');
      if (t)
        c.render('thread');
      c.syncError('');
    }
    catch (cause) {
      const error = cause as ApiError;
      if (version === s.epoch) {
        if (error.status === 403) {
          s.authLost = true;
          s.events?.close();
          c.syncComposer('group');
          c.syncComposer('thread');
        }
        c.connection('同步中断', true);
        c.syncError(error.status === 403 ? '你已无法访问这个群聊。' : '同步暂时中断，已输入的内容会保留。');
      }
    }
    finally {
      s.refreshing = false;
      if (s.refreshAgain) {
        s.refreshAgain = false;
        scheduleRefresh();
      }
    }
  }
  async function history(kind: StreamKind) {
    const page = kind === 'group' ? s.groupPage : s.threadPage;
    if (!page?.has_more)
      return;
    const version = s.epoch, node = q('[data-stream="' + kind + '"]'), button = node.querySelector<HTMLButtonElement>('[data-action="history"]')!;
    button.disabled = true;
    button.textContent = '正在载入…';
    try {
      const result = await api<ImMessagePage>(c.pathFor(s.roomId, kind === 'thread' ? s.threadId : '') + '/messages?before=' + page.next_before);
      if (version !== s.epoch)
        return;
      if (kind === 'group') {
        s.groupPage = result;
        s.groupMessages = merge(s.groupMessages, result.messages);
      }
      else {
        s.threadPage = result;
        s.threadMessages = merge(s.threadMessages, result.messages);
      }
      c.render(kind, 'older');
    }
    catch (cause) {
      const error = cause as ApiError;
      c.toast(error.message);
      button.textContent = '重试加载更早的消息';
    }
    finally {
      if (button.isConnected) {
        button.disabled = false;
        if (button.textContent === '正在载入…')
          button.textContent = '加载更早的消息';
      }
    }
  }
  return { connectEvents, scheduleRefresh, refresh, history };
}
