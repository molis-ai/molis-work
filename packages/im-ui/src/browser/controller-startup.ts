import type { ImRoom, ImRoomList, ImSessionState } from '@molis-ai/molis-work-contracts/services/im';
import type { ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** Connecting: the session, the name form and the first room. */
export function createImStartup(c: ImCtx): Pick<ImCtx, 'startup'> {
  const { s, root, v, q, e, projectId, api, storage, connectProject, resetHistory, drafts } = c;
  async function startup() {
    c.connection('连接中');
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
        c.connection('待加入');
        q('[data-welcome]').hidden = false;
        q('[data-conversations]').hidden = true;
        q('[data-welcome-body]').innerHTML = '<form data-name-form><label class="im-field">你的名字<input name="display_name" maxlength="40" required autocomplete="nickname" placeholder="你的名字"></label><p class="im-form-error" data-form-error role="alert"></p><div class="im-form-actions"><button class="im-primary" type="submit">继续</button></div></form>';
        q<HTMLFormElement>('[data-name-form]').onsubmit = async (event) => {
          event.preventDefault(); const form = event.currentTarget as HTMLFormElement, button = form.querySelector('button')!; button.disabled = true; const name = form.querySelector<HTMLInputElement>('[name=display_name]')!.value; const id = form.dataset.requestName === name && form.dataset.requestId || crypto.randomUUID(); form.dataset.requestId = id; form.dataset.requestName = name; try {
            await api('/session', { display_name: name, client_id: id });
            await startup();
          }
            catch (cause) {
              const error = cause as ApiError;
              form.querySelector<HTMLElement>('[data-form-error]')!.textContent = error.message;
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
      c.connection('已连接');
      c.syncError('');
      if (s.rooms.length) {
        const saved = storage.read(c.key('room'), '');
        await c.selectRoom(s.rooms.some(room => room.id === saved) ? saved : s.rooms[0].id);
      }
      else {
        q('[data-welcome-title]').textContent = '从一个群聊开始';
        q('[data-welcome-copy]').textContent = '邀请一起工作的人，把消息、话题和讨论结果留在同一个地方。';
        q('[data-welcome-body]').innerHTML = '<div class="im-form-actions"><button class="im-primary" type="button" data-action="create-room">创建群聊</button><button class="im-secondary" type="button" data-action="join">通过邀请加入</button></div>';
      }
      if (s.inviteToken)
        c.joinRoom();
    }
    catch (cause) {
      const error = cause as ApiError;
      c.connection('未连接', true);
      q('[data-welcome]').hidden = false;
      q('[data-conversations]').hidden = true;
      q('[data-welcome-body]').innerHTML = '<p class="im-form-error">' + e(error.message) + '</p><div class="im-form-actions"><button type="button" class="im-primary" data-action="retry">重新连接</button></div>';
      c.syncError('群聊服务暂时不可用。');
    }
  }
  return { startup };
}
