import type { ImRoom, ImMessage, ImRoomList } from '@molis-ai/molis-work-contracts/services/im';
import type { ApiError } from './types.js';
import type { ImCtx } from './controller-types.js';
/** The modal dialogs: the shared opener and the room, join, share, member and mention dialogs. */
export function createImDialogs(c: ImCtx): Pick<ImCtx, 'openDialog' | 'newRoom' | 'joinRoom' | 'share' | 'showInvite' | 'members' | 'showMentions'> {
  const { s, v, e, dialog, dialogBody, api, merge } = c;
  function openDialog(title: string, html: string, submit?: (values: Record<string, string>, current: () => boolean) => Promise<void>) {
    const version = ++s.dialogVersion;
    dialog.dataset.room = s.roomId;
    dialog.querySelector('[data-dialog-title]')!.textContent = title;
    dialogBody.innerHTML = html;
    dialog.showModal();
    const current = () => dialog.open && s.dialogVersion === version;
    const form = dialogBody.querySelector('form');
    if (!form || !submit)
      return;
    let pending: {
      signature: string;
      client_id: string;
    } | null = null, busy = false;
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy)
        return;
      const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value)]));
      const signature = JSON.stringify(values);
      if (!pending || pending.signature !== signature)
        pending = { signature, client_id: crypto.randomUUID() };
      const err = form.querySelector<HTMLElement>('[data-form-error]')!;
      err.textContent = '';
      busy = true;
      const controls = [...form.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button,input,textarea')];
      controls.forEach(control => control.disabled = true);
      try {
        await submit({ ...values, client_id: pending.client_id }, current);
      }
      catch (cause) {
        const error = cause as ApiError;
        err.textContent = error.message;
      }
      finally {
        busy = false;
        controls.forEach(control => control.disabled = false);
      }
    };
  }
  function newRoom() {
    if (!s.member) {
      c.toast('先设置你的名字，再创建群聊。');
      return;
    }
    openDialog('创建群聊', '<form><p>成员共享消息和所有 Thread，在同一个空间里讨论。</p><label class="im-field">群聊名称<input name="title" maxlength="80" required placeholder="例如：产品共创" autofocus></label>' + c.actions('创建群聊') + '</form>', async (body, current) => {
      const result = await api<{
        room: ImRoom;
      }>('/rooms', body); s.rooms = (await api<ImRoomList>('/rooms')).rooms; v.roomList(s.rooms, s.roomId); if (!current())
        return; dialog.close(); await c.selectRoom(result.room.id);
    });
  }
  function joinRoom() {
    if (!s.member) {
      c.toast('先设置你的名字，再加入群聊。');
      return;
    }
    openDialog('加入群聊', '<form><p>粘贴群成员发来的邀请链接。</p><label class="im-field">邀请链接<input name="token" value="' + e(s.inviteToken) + '" required autocomplete="off" autofocus></label>' + c.actions('加入群聊') + '</form>', async (body, current) => {
      const result = await api<{
        room: ImRoom;
      }>('/join', { ...body, token: c.parseInvite(body.token) }); s.inviteToken = ''; window.history.replaceState(null, '', location.pathname + location.search.replace(/([?&])invite=[^&]*&?/, '$1').replace(/[?&]$/, '')); s.rooms = (await api<ImRoomList>('/rooms')).rooms; v.roomList(s.rooms, s.roomId); if (!current())
        return; dialog.close(); await c.selectRoom(result.room.id);
    });
  }
  function share(messageId: string) {
    const reply = s.threadMessages.find(item => item.id === messageId);
    if (!reply)
      return;
    const r = s.roomId, t = s.threadId;
    openDialog('把讨论带回群聊', '<form><p>分享到 ' + e(s.roomState!.room.title) + '，保留原回复和 Thread 链接。</p><div class="im-context-message">' + e(reply.body) + '</div><label class="im-field">补充一句（可选）<textarea name="body" rows="2" maxlength="12000" placeholder="例如：这次讨论的结论"></textarea></label>' + c.actions('分享到群聊') + '</form>', async (body, current) => {
      const result = await api<{
        message: ImMessage;
      }>(c.pathFor(r, t) + '/share', { ...body, message_id: messageId }); if (current())
        dialog.close(); if (r === s.roomId) {
          s.groupMessages = merge(s.groupMessages, [result.message]);
          c.render('group', 'latest');
          c.scheduleRefresh();
        } c.toast('已分享到群聊');
    });
  }
  async function showInvite() {
    await c.invitations.open(s.roomId, s.roomState!.room.title);
  }
  function members() {
    if (!s.roomState)
      return;
    openDialog('群成员 · ' + s.roomState.members.length, s.roomState!.members.map(person => '<div class="im-member-row">' + v.avatar(person) + '<span>' + e(person.display_name) + '</span><small>' + (person.id === s.roomState!.room.owner_id ? '创建者' : person.id === s.member?.id ? '你' : '成员') + '</small></div>').join('') + '<p>所有成员共享群聊与全部 Thread。</p>');
  }
  function showMentions() {
    openDialog('提到项目成员', s.roomState!.members.map(person => '<button type="button" class="im-member-row" data-action="insert-mention" data-name="' + e(person.display_name) + '">' + v.avatar(person) + e(person.display_name) + '</button>').join('') + '<p>插入成员名字。本版不会额外发送通知。</p>');
  }
  return { openDialog, newRoom, joinRoom, share, showInvite, members, showMentions };
}
