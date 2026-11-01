import type { UiConnectionSlotChoice, UiConnectionSlotRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { FrameDown, FrameScope, FrameUp, Translate } from "./types.js";

/** A child receives just its current/selected account; the directory and the person's decision remain in the Host. */
export function childConnectionSlot(port: MessagePort, scope: FrameScope) {
  let sequence = 0;
  const pending = new Map<number, { resolve(value: UiConnectionSlotChoice | null): void; reject(error: Error): void }>();
  scope.own(() => { for (const waiter of pending.values()) waiter.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "connection-slot") return;
    const waiter = pending.get(event.data.id); if (!waiter) return;
    pending.delete(event.data.id);
    if (event.data.error) waiter.reject(new Error(event.data.error)); else waiter.resolve(event.data.value ?? null);
  });
  return (query: UiConnectionSlotRequest<HTMLElement>): Promise<UiConnectionSlotChoice | null> => new Promise((resolve, reject) => {
    scope.assertCurrent();
    const id = ++sequence, box = query.mode === "choose" ? query.anchor.getBoundingClientRect() : undefined;
    pending.set(id, { resolve, reject });
    port.postMessage({ type: "connection-slot", id, mode: query.mode, slot_id: query.slot_id, record_key: query.record_key,
      ...(box ? { box: { x: box.x, y: box.y, width: box.width, height: box.height } } : {}) } satisfies FrameUp);
  });
}

/** The selected slot/record must have been rendered by this owner; a child does not choose an arbitrary account scope. */
function renderedRecord(root: HTMLElement, slot: string, record: string): boolean {
  const raw = root.querySelector("script[data-plugin-document]")?.textContent;
  if (!raw) return false;
  const html: unknown = JSON.parse(raw); if (typeof html !== "string") return false;
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll<HTMLElement>("[data-plugin-record-slot]")].some(element => {
    const value = JSON.parse(element.dataset.pluginRecordSlot ?? "null") as Record<string, unknown> | null;
    return value?.slot_id === slot && value.record_key === record;
  });
}

/** The existing user-only record-slot owner is called only from this trusted control. */
export function pageConnectionSlot(port: MessagePort, scope: FrameScope, frame: HTMLIFrameElement, root: HTMLElement,
  pageId: string, route: (path: string) => string, translate: Translate) {
  let close = () => {};
  scope.own(() => close()); scope.whenVisible(() => () => close());
  const check = () => { scope.assertCurrent(); if (!scope.visible) throw new Error("View hidden"); };
  return async (message: Extract<FrameUp, { type: "connection-slot" }>): Promise<void> => {
    close();
    const headers = { "x-molis-context-page": pageId };
    const query = { slot_id: message.slot_id, record_key: message.record_key };
    const request = (mode: "read" | "bind", connection_id?: string) => molisWorkRequest<{ service_id: string; connection: UiConnectionSlotChoice | null }>(
      route("/api/host/plugin-page-slot"), { body: { ...query, mode, ...(connection_id ? { connection_id } : {}) }, headers, scope });
    const send = (value: UiConnectionSlotChoice | null, error?: string) => {
      if (scope.alive) port.postMessage({ type: "connection-slot", id: message.id, value, ...(error ? { error } : {}) } satisfies FrameDown);
    };
    try {
      check();
      if (!["read", "choose"].includes(message.mode) || typeof message.slot_id !== "string" || typeof message.record_key !== "string"
        || !renderedRecord(root, message.slot_id, message.record_key)) throw new Error(translate("原连接已不可用"));
      const current = await request("read"); check();
      if (message.mode === "read" || current.connection) { send(current.connection); return; }
      const result = await molisWorkRequest<{ connections: ConnectorConnectionView[] }>(
        "/api/settings/connectors/connections?service_id=" + encodeURIComponent(current.service_id), { scope });
      check();
      const accounts = result.connections.filter(connection => !connection.project_id);
      const popup = document.createElement("dialog"); popup.className = "mw-dialog mw-dialog--form";
      popup.setAttribute("aria-label", translate("请选择账号连接"));
      const area = document.createElement("div"); area.className = "mw-dialog__body"; popup.append(area);
      let settled = false;
      const finish = (value: UiConnectionSlotChoice | null, error?: string) => {
        if (settled) return; settled = true; popup.remove(); send(value, error);
      };
      close = () => finish(null);
      popup.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      for (const account of accounts) {
        const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--ghost";
        button.textContent = (account.account_label || account.display_name) + " · " + account.auth_method + " · "
          + translate(account.state === "connected" ? "可用" : account.state === "reauth_required" ? "需要重新授权" : "已断开");
        button.disabled = account.state !== "connected";
        button.addEventListener("click", () => {
          for (const control of area.querySelectorAll("button")) control.disabled = true;
          void (async () => {
            check(); if (!renderedRecord(root, message.slot_id, message.record_key)) throw new Error(translate("原连接已不可用"));
            const selected = await request("bind", account.connection_id); check(); finish(selected.connection);
          })().catch(error => finish(null, error instanceof Error ? error.message : String(error)));
        }); area.append(button);
      }
      if (!accounts.length) { const note = document.createElement("p"); note.textContent = translate("还没有账号连接，请先在 Connectors 添加。"); area.append(note); }
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "mw-btn";
      cancel.textContent = translate("取消"); cancel.addEventListener("click", () => finish(null)); area.append(cancel);
      const box = frame.getBoundingClientRect();
      if (message.box && Object.values(message.box).every(Number.isFinite)) popup.style.cssText = `position:fixed;margin:0;left:${Math.max(8, Math.min(innerWidth - 320, box.left + message.box.x))}px;top:${Math.max(8, Math.min(innerHeight - 240, box.top + message.box.y + message.box.height))}px;max-height:min(400px,80vh);max-width:min(440px,90vw)`;
      document.body.append(popup); popup.showModal();
    } catch (error) { send(null, error instanceof Error ? error.message : String(error)); }
  };
}
