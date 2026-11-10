import { escapeHtml as escapeImText, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
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
      content = ("<p>" + escapeImText(uiText.text("im-ui.invitation.explains-access")) + "</p><label class=\"im-field\">" + escapeImText(uiText.text("im-ui.invitation.link")) + "<input class=\"im-invite-value\" readonly value=\"") + o.escape(url.href) + '" data-invite-value></label>';
    } else {
      const hint = intent?.pending ? (uiText.text("im-ui.invitation.replacement-unconfirmed")) : state.token_hash
        ? (uiText.text("im-ui.invitation.shared-link-retained"))
        : (uiText.text("im-ui.invitation.no-link"));
      content = '<p data-invite-notice>' + hint + '</p>';
    }
    const label = intent?.pending ? (uiText.text("im-ui.invitation.retry-original")) : state.token_hash ? (uiText.text("im-ui.invitation.replace")) : (uiText.text("im-ui.invitation.generate"));
    o.body.innerHTML = content + '<p class="im-form-error" data-invite-error role="alert">' + o.escape(error) + '</p><div class="im-form-actions"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-action="rotate-invite">' + label + '</button>'
      + (matches ? '<button class="mw-btn mw-btn--primary mw-btn--sm" type="button" data-action="copy-invite">' + o.icon("copy") + (escapeImText(uiText.text("im-ui.invitation.copy")) + "</button>") : "") + '</div>';
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
    o.open(uiText.text("im-ui.invitation.dialog-title", { room: title }), `<p role="status">${uiText("im-ui.invitation.reading-status")}</p>`);
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
        await read(room, version, accepted ? "" : (uiText.text("im-ui.invitation.replaced-elsewhere")));
        if (accepted && o.body.querySelector("[data-invite-value]")) o.toast((uiText.text("im-ui.invitation.generated")));
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
    if (!await window.molisCopy?.(button, input.value, { done: (uiText.text("im-ui.invitation.copied")), failed: (uiText.text("im-ui.invitation.copy-failed")) })) {
      input.focus(); input.select(); o.toast((uiText.text("im-ui.invitation.link-selected")));
    }
  }
  return { open, rotate, copy };
}
