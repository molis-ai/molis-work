import type { ImRoomState, ImThreadState } from '@molis-ai/molis-work-contracts/services/im';
import type { ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** Choosing a room and a thread, with their loading, restore and retry states. */
export function createImRooms(c: ImCtx): Pick<ImCtx, 'selectRoom' | 'selectThread'> {
  const { s, root, v, q, e, api, storage, latest } = c;
  async function selectRoom(id: string) {
    c.rememberPosition();
    s.threadDraft = null;
    const version = ++s.epoch;
    s.events?.close();
    s.roomId = id;
    s.roomState = null;
    s.threadId = '';
    s.threadState = null;
    s.groupMessages = [];
    s.threadMessages = [];
    s.groupPage = null;
    s.threadPage = null;
    c.formFor('group').hidden = true;
    c.formFor('thread').hidden = true;
    c.syncComposer('group');
    c.syncComposer('thread');
    q('[data-room-title]').textContent = s.rooms.find(room => room.id === id)?.title || '群聊';
    q('[data-member-count]').textContent = '正在载入…';
    q('[data-thread-strip]').replaceChildren();
    q('[data-member-avatars]').replaceChildren();
    q('[data-action="invite"]').hidden = true;
    q('[data-welcome]').hidden = true;
    q('[data-conversations]').hidden = false;
    q('[data-thread-pane]').hidden = true;
    q('[data-conversations]').classList.remove('has-thread');
    root.classList.remove('show-directory');
    q('[data-sidebar-scrim]')?.setAttribute('hidden', '');
    q('[data-stream="group"]').innerHTML = '<p class="im-empty" role="status">正在载入群聊…</p>';
    q('[data-conversations]').classList.add('im-loading');
    try {
      const [state, messages] = await Promise.all([api<ImRoomState>(c.pathFor(id)), latest(c.pathFor(id), [], null, () => s.epoch === version)]);
      if (version !== s.epoch)
        return;
      s.roomState = state;
      s.groupMessages = messages.messages;
      s.groupPage = messages;
      c.updateHeader();
      c.render('group', 'latest');
      await c.restorePosition('group', version);
      c.formFor('group').hidden = false;
      c.restoreDraft('group');
      storage.write(c.key('room'), id);
      c.connectEvents();
      c.syncError('');
      q('[data-conversations]').classList.remove('im-loading');
      const saved = storage.read(c.key('thread:' + id), '');
      if (state.threads.some(thread => thread.id === saved))
        await selectThread(saved, false);
    }
    catch (cause) {
      const error = cause as ApiError;
      if (version === s.epoch) {
        q('[data-stream="group"]').innerHTML = '<div class="im-empty">' + e(error.message) + '<p><button class="im-secondary" type="button" data-action="retry">重试</button></p></div>';
        c.syncError(error.message);
      }
    }
    finally {
      if (version === s.epoch)
        q('[data-conversations]').classList.remove('im-loading');
    }
  }
  async function selectThread(id: string, focus = false) {
    if (!s.roomState || s.roomState.room.id !== s.roomId)
      return;
    if (s.threadId === id && s.threadState) {
      c.closeSearch();
      return;
    }
    c.rememberPosition();
    s.threadDraft = null;
    c.closeSearch();
    const version = ++s.epoch;
    s.threadId = id;
    s.threadState = null;
    s.threadMessages = [];
    s.threadPage = null;
    c.revealThread();
    q('[data-thread-title]').textContent = s.roomState!.threads.find(t => t.id === id)?.title || '话题';
    q('[data-thread-context]').replaceChildren();
    q('[data-stream="thread"]').innerHTML = '<p class="im-empty" role="status">正在载入讨论…</p>';
    c.formFor('thread').hidden = true;
    c.updateHeader();
    try {
      const cached = s.streamCache.get(c.target('thread'));
      const [state, messages] = await Promise.all([api<ImThreadState>(c.pathFor(s.roomId, id)), latest(c.pathFor(s.roomId, id), cached?.messages || [], cached?.page || null, () => s.epoch === version)]);
      if (version !== s.epoch)
        return;
      s.threadState = state;
      s.threadMessages = messages.messages;
      s.threadPage = messages;
      v.context(state);
      c.formFor('thread').hidden = false;
      c.restoreDraft('thread');
      c.updateHeader();
      c.render('thread', 'latest');
      await c.restorePosition('thread', version);
      if (version !== s.epoch)
        return;
      storage.write(c.key('thread:' + s.roomId), id);
      c.scheduleRead();
      if (focus)
        c.inputFor('thread').focus({ preventScroll: true });
    }
    catch (cause) {
      const error = cause as ApiError;
      if (version === s.epoch)
        q('[data-stream="thread"]').innerHTML = '<div class="im-empty">' + e(error.message) + '<p><button type="button" class="im-secondary" data-action="select-thread" data-id="' + e(id) + '">重试</button></p></div>';
    }
  }
  return { selectRoom, selectThread };
}
