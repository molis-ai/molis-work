import { imFailureText } from "./error-text.js";
import { escapeHtml as escapeImText, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImRoom, ImMessage, ImRoomList } from '@molis-ai/molis-work-contracts/services/im';
import type { ApiError } from './types.js';
import type { ImBaseCtx, ImCtx } from './controller-types.js';
/** The modal dialogs: the shared opener and the room, join, share, member and mention dialogs. */
export function createImDialogs(base: ImBaseCtx, context: () => ImCtx): Pick<ImCtx, 'openDialog' | 'newRoom' | 'joinRoom' | 'share' | 'showInvite' | 'members' | 'showMentions'> {
  const { s, v, e, dialog, dialogBody, api, merge } = base;
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
        err.textContent = imFailureText(error);
      }
      finally {
        busy = false;
        controls.forEach(control => control.disabled = false);
      }
    };
  }
  function newRoom() {
    const c = context();
    if (!s.member) {
      c.toast((uiText.text("im-ui.room.name-before-creating")));
      return;
    }
    openDialog((uiText.text("im-ui.room.create")), ("<form><p>" + escapeImText(uiText.text("im-ui.room.shared-thread-description")) + "</p><label class=\"im-field\">" + escapeImText(uiText.text("im-ui.room.name")) + "<input name=\"title\" maxlength=\"80\" required placeholder=\"" + escapeImText(uiText.text("im-ui.room.name-example")) + "\" autofocus></label>") + c.actions((uiText.text("im-ui.room.create"))) + '</form>', async (body, current) => {
      const result = await api<{
        room: ImRoom;
      }>('/rooms', body); s.rooms = (await api<ImRoomList>('/rooms')).rooms; v.roomList(s.rooms, s.roomId); if (!current())
        return; dialog.close(); await c.selectRoom(result.room.id);
    });
  }
  function joinRoom() {
    const c = context();
    if (!s.member) {
      c.toast((uiText.text("im-ui.room.name-before-joining")));
      return;
    }
    openDialog((uiText.text("im-ui.room.join")), ("<form><p>" + escapeImText(uiText.text("im-ui.invitation.paste")) + "</p><label class=\"im-field\">" + escapeImText(uiText.text("im-ui.invitation.link")) + "<input name=\"token\" value=\"") + e(s.inviteToken) + '" required autocomplete="off" autofocus></label>' + c.actions((uiText.text("im-ui.room.join"))) + '</form>', async (body, current) => {
      const result = await api<{
        room: ImRoom;
      }>('/join', { ...body, token: c.parseInvite(body.token) }); s.inviteToken = ''; window.history.replaceState(null, '', location.pathname + location.search.replace(/([?&])invite=[^&]*&?/, '$1').replace(/[?&]$/, '')); s.rooms = (await api<ImRoomList>('/rooms')).rooms; v.roomList(s.rooms, s.roomId); if (!current())
        return; dialog.close(); await c.selectRoom(result.room.id);
    });
  }
  function share(messageId: string) {
    const c = context();
    const reply = s.threadMessages.find(item => item.id === messageId);
    if (!reply)
      return;
    const r = s.roomId, t = s.threadId;
    openDialog(uiText.text("im-ui.thread.bring-back"), `<form><p>${uiText("im-ui.thread.share-destination", { room: s.roomState!.room.title })}</p><div class="im-context-message" translate="no">${e(reply.body)}</div><label class="im-field">${uiText("im-ui.thread.add-note")}<textarea name="body" rows="2" maxlength="12000" placeholder="${uiText("im-ui.thread.note-example")}"></textarea></label>` + c.actions(uiText.text("im-ui.thread.share-to-group")) + '</form>', async (body, current) => {
      const result = await api<{
        message: ImMessage;
      }>(c.pathFor(r, t) + '/share', { ...body, message_id: messageId }); if (current())
        dialog.close(); if (r === s.roomId) {
          s.groupMessages = merge(s.groupMessages, [result.message]);
          c.render('group', 'latest');
          c.scheduleRefresh();
        } c.toast((uiText.text("im-ui.thread.shared-to-group")));
    });
  }
  async function showInvite() {
    const c = context();
    await c.invitations.open(s.roomId, s.roomState!.room.title);
  }
  function members() {
    if (!s.roomState)
      return;
    openDialog(uiText.text("im-ui.member.dialog-title", { count: s.roomState.members.length }), s.roomState.members.map(person => `<div class="im-member-row">${v.avatar(person)}<span translate="no">${e(person.display_name)}</span><small>${uiText(person.id === s.roomState!.room.owner_id ? "im-ui.member.creator" : person.id === s.member?.id ? "im-ui.member.you" : "im-ui.member.member")}</small></div>`).join('') + `<p>${uiText("im-ui.member.visibility")}</p>`);
  }
  function showMentions() {
    openDialog((uiText.text("im-ui.member.mention")), s.roomState!.members.map(person => '<button type="button" class="im-member-row" data-action="insert-mention" data-name="' + e(person.display_name) + '">' + v.avatar(person) + '<span translate="no">' + e(person.display_name) + '</span>' + '</button>').join('') + ("<p>" + escapeImText(uiText.text("im-ui.member.mention-description")) + "</p>"));
  }
  return { openDialog, newRoom, joinRoom, share, showInvite, members, showMentions };
}
