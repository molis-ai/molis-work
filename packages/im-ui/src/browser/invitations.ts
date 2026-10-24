import type { ImInviteState, ImRotateInviteInput } from "@molis-ai/molis-work-contracts/services/im";
import type { Api, ApiError } from "./types.js";

interface InvitationDialog {
  api: Api;
  dialog: HTMLDialogElement;
  body: HTMLElement;
  current(): { room: string; version: number };
  open(title: string, html: string): void;
  escape(value: string): string;
  icon(name: string): string;
  toast(message: string): void;
}

/** Serialized with the formal client. Original tokens live only in this page's closure. */
export function createInvitations(o: InvitationDialog) {
  const intents = new Map<string, { request: ImRotateInviteInput; pending: boolean }>();
  let observed: ImInviteState | null = null;
  const route = (room: string) => "/rooms/" + encodeURIComponent(room) + "/invite";
  const current = (room: string, version: number) => o.dialog.open && o.current().room === room && o.current().version === version;
  const digest = async (token: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), byte => byte.toString(16).padStart(2, "0")).join("");
  function paint(state: ImInviteState, matches: boolean, error = "") {
    const intent = intents.get(state.room_id);
    let content: string;
    if (matches && intent) {
      const url = new URL("/im", location.origin); url.searchParams.set("invite", intent.request.token);
      content = '<p>通过这个链接加入群聊后，可以查看群里的消息和全部 Thread。</p><label class="im-field">邀请链接<input class="im-invite-value" readonly value="' + o.escape(url.href) + '" data-invite-value></label>';
    } else {
      const hint = intent?.pending ? "尚未确认更换结果，请重试原操作。" : state.token_hash
        ? "已分享的链接仍有效。原文只在生成时的页面中保留，无法重新取回；明确更换后，旧链接才会失效。"
        : "尚未生成邀请链接。生成后请复制并保存；刷新页面后无法重新取回原文。";
      content = '<p data-invite-notice>' + hint + '</p>';
    }
    const label = intent?.pending ? "重试原操作" : state.token_hash ? "更换邀请链接" : "生成邀请链接";
    o.body.innerHTML = content + '<p class="im-form-error" data-invite-error role="alert">' + o.escape(error) + '</p><div class="im-form-actions"><button class="im-secondary" type="button" data-action="rotate-invite">' + label + '</button>'
      + (matches ? '<button class="im-primary" type="button" data-action="copy-invite">' + o.icon("copy") + '复制链接</button>' : "") + '</div>';
  }
  async function read(room: string, version: number, error = "") {
    const state = await o.api<ImInviteState>(route(room)), intent = intents.get(room);
    const matches = Boolean(intent && state.token_hash === await digest(intent.request.token));
    if (!current(room, version)) return;
    if (intent && matches) intent.pending = false;
    if (intent && !matches && !intent.pending) intents.delete(room);
    observed = state; paint(state, matches, error);
  }
  async function open(room: string, title: string) {
    observed = null;
    o.open("邀请成员 · " + title, '<p role="status">正在读取邀请状态…</p>');
    const { version } = o.current();
    try { await read(room, version); }
    catch (cause) { if (current(room, version)) o.body.innerHTML = '<p class="im-form-error">' + o.escape((cause as Error).message) + '</p>'; }
  }
  async function rotate(button: HTMLButtonElement) {
    const { room, version } = o.current();
    if (!observed || observed.room_id !== room || button.disabled) return;
    let intent = intents.get(room);
    if (!intent?.pending) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      intent = { request: { client_id: crypto.randomUUID(), token: Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("") }, pending: true };
      intents.set(room, intent);
    }
    button.disabled = true;
    o.body.querySelector<HTMLButtonElement>('[data-action="copy-invite"]')?.setAttribute("disabled", "");
    try {
      const result = await o.api<ImInviteState>(route(room) + "/rotate", intent.request);
      const accepted = result.token_hash === await digest(intent.request.token);
      if (intents.get(room) === intent) {
        intent.pending = false;
        if (!accepted) intents.delete(room);
      }
      if (current(room, version)) {
        await read(room, version, accepted ? "" : "邀请已被另一项操作更换，原操作不会重新激活旧链接。");
        if (accepted && o.body.querySelector("[data-invite-value]")) o.toast("邀请链接已生成；其他旧链接不再可用");
      }
    } catch (cause) {
      const error = cause as ApiError;
      if (error.code === "im.invite.token_conflict" && intents.get(room) === intent) intents.delete(room);
      // Even a read-back failure after a committed POST can retry the same pair.
      if (intents.get(room) === intent) intent.pending = true;
      if (current(room, version) && observed) paint(observed, false, error.message);
    } finally { button.disabled = false; }
  }
  async function copy(button: HTMLButtonElement) {
    const input = o.body.querySelector<HTMLInputElement>("[data-invite-value]");
    if (!input) return;
    if (!await window.molisCopy?.(button, input.value, { done: "已复制", failed: "复制失败" })) {
      input.focus(); input.select(); o.toast("链接已选中，请复制。");
    }
  }
  return { open, rotate, copy };
}
