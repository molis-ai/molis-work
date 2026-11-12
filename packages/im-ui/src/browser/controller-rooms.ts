import { imFailureText } from "./error-text.js";
import { setImHeading } from "../views.js";
import { escapeHtml as escapeImText, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImRoomState, ImThreadState } from '@molis-ai/molis-work-contracts/services/im';
import type { ApiError } from './types.js';
import type { ImBaseCtx, ImCtx } from './controller-types.js';
/** Choosing a room and a thread, with their loading, restore and retry states. */
export function createImRooms(base: ImBaseCtx, context: () => ImCtx): Pick<ImCtx, 'selectRoom' | 'selectThread'> {
  const { s, root, v, q, e, api, storage, latest } = base;
  async function selectRoom(id: string) {
    const c = context();
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
    const title = s.rooms.find(room => room.id === id)?.title;
    setImHeading(q('[data-room-title]'), title || uiText.text("im-ui.room.group"), Boolean(title));
    q('[data-member-count]').textContent = (uiText.text("im-ui.status.loading"));
    q('[data-thread-strip]').replaceChildren();
    q('[data-member-avatars]').replaceChildren();
    q('[data-action="invite"]').hidden = true;
    q('[data-welcome]').hidden = true;
    q('[data-conversations]').hidden = false;
    q('[data-thread-pane]').hidden = true;
    q('[data-conversations]').classList.remove('has-thread');
    root.classList.remove('show-directory');
    q('[data-sidebar-scrim]')?.setAttribute('hidden', '');
    q('[data-stream="group"]').innerHTML = ("<p class=\"im-empty\" role=\"status\">" + escapeImText(uiText.text("im-ui.room.loading")) + "</p>");
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
        q('[data-stream="group"]').innerHTML = '<div class="im-empty">' + e(imFailureText(error)) + ("<p><button class=\"mw-btn mw-btn--secondary mw-btn--sm\" type=\"button\" data-action=\"retry\">" + escapeImText(uiText.text("im-ui.control.retry")) + "</button></p></div>");
        c.syncError(imFailureText(error));
      }
    }
    finally {
      if (version === s.epoch)
        q('[data-conversations]').classList.remove('im-loading');
    }
  }
  async function selectThread(id: string, focus = false) {
    const c = context();
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
    const title = s.roomState!.threads.find(thread => thread.id === id)?.title;
    setImHeading(q('[data-thread-title]'), title || uiText.text("im-ui.thread.topic"), Boolean(title));
    q('[data-thread-context]').replaceChildren();
    q('[data-stream="thread"]').innerHTML = ("<p class=\"im-empty\" role=\"status\">" + escapeImText(uiText.text("im-ui.thread.loading")) + "</p>");
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
        q('[data-stream="thread"]').innerHTML = '<div class="im-empty">' + e(imFailureText(error)) + '<p><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-action="select-thread" data-id="' + e(id) + ("\">" + escapeImText(uiText.text("im-ui.control.retry")) + "</button></p></div>");
    }
  }
  return { selectRoom, selectThread };
}
