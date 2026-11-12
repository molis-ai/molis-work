import { imFailureText } from "./error-text.js";
import { escapeHtml as escapeImText, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImRoom, ImRoomList, ImSessionState } from '@molis-ai/molis-work-contracts/services/im';
import type { ApiError } from './types.js';
import type { ImBaseCtx, ImCtx } from './controller-types.js';
/** Connecting: the session, the name form and the first room. */
export function createImStartup(base: ImBaseCtx, context: () => ImCtx): Pick<ImCtx, 'startup'> {
  const { s, root, v, q, e, projectId, api, storage, connectProject, resetHistory, drafts } = base;
  async function startup() {
    const c = context();
    c.connection((uiText.text("im-ui.status.connecting")));
    try {
      s.events?.close();
      s.streamCache.clear();
      resetHistory();
      let result = await api<ImSessionState>('/session');
      // The authenticated host may recover its existing local project owner before asking for a new name.
      if (projectId && parent !== window) {
        await connectProject();
        result = await api<ImSessionState>('/session');
      }
      s.member = result.member;
      s.authLost = false;
      s.inviteToken = s.inviteToken || new URLSearchParams(location.hash.slice(1)).get('invite') || new URLSearchParams(location.search).get('invite') || '';
      if (!s.member) {
        c.connection((uiText.text("im-ui.status.not-joined")));
        q('[data-welcome]').hidden = false;
        q('[data-conversations]').hidden = true;
        q('[data-welcome-body]').innerHTML = ("<form data-name-form><label class=\"im-field\">" + escapeImText(uiText.text("im-ui.member.your-name")) + "<input name=\"display_name\" maxlength=\"40\" required autocomplete=\"nickname\" placeholder=\"" + escapeImText(uiText.text("im-ui.member.your-name")) + "\"></label><p class=\"im-form-error\" data-form-error role=\"alert\"></p><div class=\"im-form-actions\"><button class=\"mw-btn mw-btn--primary mw-btn--sm\" type=\"submit\">" + escapeImText(uiText.text("im-ui.control.continue")) + "</button></div></form>");
        q<HTMLFormElement>('[data-name-form]').onsubmit = async (event) => {
          event.preventDefault(); const form = event.currentTarget as HTMLFormElement, button = form.querySelector('button')!; button.disabled = true; const name = form.querySelector<HTMLInputElement>('[name=display_name]')!.value; const id = form.dataset.requestName === name && form.dataset.requestId || crypto.randomUUID(); form.dataset.requestId = id; form.dataset.requestName = name; try {
            await api('/session', { display_name: name, client_id: id });
            await startup();
          }
            catch (cause) {
              const error = cause as ApiError;
              form.querySelector<HTMLElement>('[data-form-error]')!.textContent = imFailureText(error);
              button.disabled = false;
            }
        };
        v.roomList([], null);
        return;
      }
      drafts.load(s.member.id);
      s.anchors = storage.read(c.key('anchors'), {});
      root.dataset.member = s.member.id;
      if (projectId) {
        const project = await api<{
          room: ImRoom;
        }>('/projects/' + encodeURIComponent(projectId) + '/room', {});
        s.rooms = [project.room];
        await c.selectRoom(project.room.id);
        return;
      }
      q('[data-own-name]').textContent = s.member.display_name;
      q('[data-own-avatar]').textContent = [...s.member.display_name].slice(-2).join('');
      s.rooms = (await api<ImRoomList>('/rooms')).rooms;
      v.roomList(s.rooms, s.roomId);
      c.connection((uiText.text("im-ui.status.connected")));
      c.syncError('');
      if (s.rooms.length) {
        const saved = storage.read(c.key('room'), '');
        await c.selectRoom(s.rooms.some(room => room.id === saved) ? saved : s.rooms[0].id);
      }
      else {
        q('[data-welcome-title]').textContent = (uiText.text("im-ui.room.start"));
        q('[data-welcome-copy]').textContent = (uiText.text("im-ui.room.start-description"));
        q('[data-welcome-body]').innerHTML = ("<div class=\"im-form-actions\"><button class=\"mw-btn mw-btn--primary mw-btn--sm\" type=\"button\" data-action=\"create-room\">" + escapeImText(uiText.text("im-ui.room.create")) + "</button><button class=\"mw-btn mw-btn--secondary mw-btn--sm\" type=\"button\" data-action=\"join\">" + escapeImText(uiText.text("im-ui.invitation.join")) + "</button></div>");
      }
      if (s.inviteToken)
        c.joinRoom();
    }
    catch (cause) {
      const error = cause as ApiError;
      c.connection((uiText.text("im-ui.status.disconnected")), true);
      q('[data-welcome]').hidden = false;
      q('[data-conversations]').hidden = true;
      q('[data-welcome-body]').innerHTML = '<p class="im-form-error">' + e(imFailureText(error)) + ("</p><div class=\"im-form-actions\"><button type=\"button\" class=\"mw-btn mw-btn--primary mw-btn--sm\" data-action=\"retry\">" + escapeImText(uiText.text("im-ui.status.reconnect")) + "</button></div>");
      c.syncError((uiText.text("im-ui.status.service-unavailable")));
    }
  }
  return { startup };
}
