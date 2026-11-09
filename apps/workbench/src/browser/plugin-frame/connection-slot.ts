import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiConnectionSlotChoice, UiConnectionSlotRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { childConnectionNeed } from "./connection-need.js";
import type { FrameDown, FrameScope, FrameUp, Translate } from "./types.js";

/**
 * The child can cancel a choice when its selection ends; no account directory crosses this port. With no account at all, the shell says
 * so (`need`) and the page shows the platform's connection card beside the anchor (ASC-70): connected there, the slot is read again.
 */
export function childConnectionSlot(port: MessagePort, scope: FrameScope) {
  let sequence = 0;
  const need = childConnectionNeed(port, scope);
  const pending = new Map<number, { finish(value: UiConnectionSlotChoice | null, error?: Error, card?: true): void; cancel(): void }>();
  scope.own(() => { for (const waiter of [...pending.values()]) waiter.cancel(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "connection-slot") return;
    pending.get(event.data.id)?.finish(event.data.value ?? null, event.data.error ? new Error(event.data.error) : undefined, event.data.need);
  });
  const choose = (query: UiConnectionSlotRequest<HTMLElement>): Promise<UiConnectionSlotChoice | null> => new Promise((resolve, reject) => {
    scope.assertCurrent(); query.signal?.throwIfAborted();
    const id = ++sequence, box = query.mode === "choose" ? query.anchor.getBoundingClientRect() : undefined;
    const finish = (value: UiConnectionSlotChoice | null, error?: Error, card?: true) => {
      if (!pending.delete(id)) return;
      query.signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else if (!card) resolve(value); else resolve(connectHere(query));
    };
    const cancel = () => {
      port.postMessage({ type: "connection-slot-cancel", id } satisfies FrameUp);
      finish(null, new DOMException("View changed", "AbortError"));
    };
    pending.set(id, { finish, cancel }); query.signal?.addEventListener("abort", cancel, { once: true });
    port.postMessage({ type: "connection-slot", id, mode: query.mode, slot_id: query.slot_id, record_key: query.record_key,
      ...(box ? { box: { x: box.x, y: box.y, width: box.width, height: box.height } } : {}) } satisfies FrameUp);
  });
  /** The card on an empty place right after the anchor, gone once answered; cancelled is no choice, as the dialog's 取消 was. */
  const connectHere = async (query: UiConnectionSlotRequest<HTMLElement>): Promise<UiConnectionSlotChoice | null> => {
    if (query.mode !== "choose") return null;
    const place = document.createElement("div");
    query.anchor.after(place);
    try {
      const outcome = await need(place, { kind: "slot", slot_id: query.slot_id, record_key: query.record_key }, query.signal ? { signal: query.signal } : {});
      return outcome.status === "connected" ? await choose({ ...query, mode: "read" }) : null;
    } finally { place.remove(); }
  };
  return choose;
}

/** Only a record rendered by this current owner can request a picker. Installation/service remain server-derived. */
function renderedRecord(root: HTMLElement, slot: string, record: string): boolean {
  const raw = root.querySelector("script[data-plugin-document]")?.textContent; if (!raw) return false;
  const html: unknown = JSON.parse(raw); if (typeof html !== "string") return false;
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll<HTMLElement>("[data-plugin-record-slot]")].some(element => {
    const value = JSON.parse(element.dataset.pluginRecordSlot ?? "null") as Record<string, unknown> | null;
    return value?.slot_id === slot && value.record_key === record;
  });
}

/** One request owns its reads, dialog and bind. Superseding it is effective before the first await. */
export function pageConnectionSlot(port: MessagePort, scope: FrameScope, frame: HTMLIFrameElement, root: HTMLElement,
  pageId: string, route: (path: string) => string, _translate: Translate) {
  let current: { id: number; finish(value: UiConnectionSlotChoice | null): void } | null = null;
  const cancel = (id?: number) => { if (current && (id === undefined || current.id === id)) current.finish(null); };
  scope.own(cancel); scope.whenVisible(() => () => cancel());
  scope.observe(new MutationObserver(() => { if (frame.hidden) cancel(); }), frame, { attributes: true, attributeFilter: ["hidden"] });
  const receive = async (message: Extract<FrameUp, { type: "connection-slot" }>): Promise<void> => {
    cancel();
    const controller = new AbortController(); let popup: HTMLDialogElement | undefined, settled = false;
    const finish = (value: UiConnectionSlotChoice | null, error?: string, need?: true) => {
      if (settled) return; settled = true; controller.abort(); popup?.remove();
      if (current === request) current = null;
      if (scope.alive && scope.visible && !frame.hidden) port.postMessage({ type: "connection-slot", id: message.id, value, ...(error ? { error } : {}), ...(need ? { need } : {}) } satisfies FrameDown);
    };
    const request = { id: message.id, finish }; current = request;
    const check = () => { scope.assertCurrent(); if (!scope.visible || frame.hidden || current !== request || settled || controller.signal.aborted) throw new DOMException("View changed", "AbortError"); };
    const read = async (mode: "read" | "bind", connection_id?: string) => {
      check(); if (!renderedRecord(root, message.slot_id, message.record_key)) throw new Error(uiText.text("common.connection-slot.previous-connection-no-longer-available"));
      const result = await molisWorkRequest<{ service_id: string; connection: UiConnectionSlotChoice | null }>(route("/api/host/plugin-page-slot"), {
        headers: { "x-molis-context-page": pageId }, scope, signal: controller.signal,
        body: { slot_id: message.slot_id, record_key: message.record_key, mode, ...(connection_id ? { connection_id } : {}) },
      }); check(); return result;
    };
    try {
      check(); if (!["read", "choose"].includes(message.mode) || typeof message.slot_id !== "string" || typeof message.record_key !== "string") throw new Error(uiText.text("common.connection-slot.previous-connection-no-longer-available"));
      const bound = await read("read"); check();
      if (message.mode === "read" || bound.connection) { finish(bound.connection); return; }
      const directory = await molisWorkRequest<{ connections: Array<ConnectorConnectionView | { project_id: string }> }>(
        "/api/settings/connectors/connections?service_id=" + encodeURIComponent(bound.service_id), { scope, signal: controller.signal });
      check();
      const accounts = directory.connections.filter((connection): connection is ConnectorConnectionView => !("project_id" in connection));
      // No account at all: the connection card on the page instead of a dialog with nothing to pick (ASC-70, §13.5).
      if (!accounts.length) { finish(null, undefined, true); return; }
      popup = document.createElement("dialog"); popup.className = "mw-dialog mw-dialog--form"; popup.setAttribute("aria-label", uiText.text("common.connection-slot.choose-account-connection"));
      const area = document.createElement("div"); area.className = "mw-dialog__body"; area.style.cssText = "display:grid;gap:8px;overflow:auto"; popup.append(area);
      popup.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      for (const account of accounts) {
        const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--ghost";
        button.textContent = (account.account_label || account.display_name) + " · " + account.auth_method + " · " + uiText.text(account.state === "connected" ? "common.connection-slot.available" : account.state === "reauth_required" ? "common.connection-slot.reauthorization-required" : "common.connection-slot.disconnected");
        button.disabled = account.state !== "connected";
        button.style.cssText = "max-width:100%;white-space:normal;text-align:left";
        button.addEventListener("click", () => {
          try { check(); } catch { return; }
          for (const control of area.querySelectorAll("button")) control.disabled = true;
          void (async () => { check(); const selected = await read("bind", account.connection_id); check(); finish(selected.connection); })()
            .catch(error => { if (current === request && !settled) finish(null, error instanceof Error ? error.message : String(error)); });
        }); area.append(button);
      }
      const back = document.createElement("button"); back.type = "button"; back.className = "mw-btn"; back.textContent = uiText.text("common.control.cancel"); back.addEventListener("click", () => finish(null)); area.append(back);
      popup.style.cssText = "max-height:min(400px,80vh);max-width:min(440px,90vw)";
      const box = frame.getBoundingClientRect(), anchor = message.box;
      if (anchor && Object.values(anchor).every(Number.isFinite)) popup.style.cssText += ";position:fixed;inset:auto;margin:0;translate:none;transform:none;width:min(440px,90vw)";
      check(); document.body.append(popup); popup.showModal();
      if (anchor && Object.values(anchor).every(Number.isFinite)) {
        const bounds = popup.getBoundingClientRect();
        popup.style.left = Math.max(8, Math.min(innerWidth - bounds.width - 8, box.left + anchor.x)) + "px";
        popup.style.top = Math.max(8, Math.min(innerHeight - bounds.height - 8, box.top + anchor.y + anchor.height)) + "px";
      }
    } catch (error) { if (current === request && !settled) finish(null, error instanceof Error ? error.message : String(error)); }
  };
  return Object.assign(receive, { cancel });
}
