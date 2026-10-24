import { button, messageOf, text } from "./dom.js";
import type { AuthConnection, ImageConnection, ImagesPage } from "./types.js";

const PRESETS = {
  openai: { name: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-image-1.5" },
  gemini: { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.1-flash-image" },
} as const;

export function syncParameters(page: ImagesPage): void {
  const { s, L, root } = page;
  const connection = page.pickedConn();
  page.field("connected").hidden = !s.cid && !s.conns.length;
  page.field("connection-empty").hidden = s.conns.length > 0;
  // Until a service is connected, connecting is the step; the generate row waits.
  const submitRow = root.querySelector<HTMLElement>(".images-submit-row");
  if (submitRow) submitRow.hidden = !s.conns.length;
  page.field("service-label").textContent = connection ? `${connection.name} · ${connection.model}` : L("images.service.unavailable");
  const unavailable = page.field("service-unavailable");
  unavailable.hidden = !s.cid || Boolean(connection && connection.available !== false);
  unavailable.textContent = connection?.unavailable_reason || L("images.service.unavailable");
  page.field("size-field").hidden = !connection || connection.api_format !== "openai-images";
  page.field("ratio-field").hidden = !connection || connection.api_format !== "gemini";
  page.field("service-options").querySelectorAll<HTMLElement>("[data-images-use-connection]")
    .forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.imagesUseConnection === s.cid)));
  page.syncGenerate();
}

export function paintConnections(page: ImagesPage): void {
  const { s, L } = page;
  if (!s.cid) s.cid = s.conns[0]?.id || "";
  page.field("service-options").replaceChildren(...s.conns.map((connection) => {
    const node = button("", "data-images-use-connection", connection.id);
    node.className = "images-service-option";
    node.append(text("span", connection.name), text("small", connection.model + (connection.available === false ? ` · ${L("images.account.unavailable")}` : "")));
    return node;
  }));
  page.field("saved-connections").replaceChildren(...s.conns.map((connection) => {
    const row = text("div", "", "images-saved-connection");
    const node = button(connection.name, "data-images-edit-connection", connection.id, "secondary");
    node.setAttribute("aria-pressed", String(s.editingId === connection.id));
    row.append(node, button(L("images.service.delete"), "data-images-delete-connection", connection.id));
    return row;
  }));
  syncParameters(page);
}

/** The dialog's own state: which protocol and service are being edited, and what to tell about the key. */
export function paintConn(page: ImagesPage): void {
  const { s, L, root, el } = page;
  root.querySelectorAll<HTMLElement>("[data-images-format]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.imagesFormat === s.editingFormat)));
  root.querySelectorAll<HTMLElement>("[data-images-edit-connection]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.imagesEditConnection === s.editingId)));
  const existing = s.conns.find((item) => item.id === s.editingId);
  const changedDestination = existing && (existing.api_format !== s.editingFormat || existing.base_url !== el.connectionUrl.value.trim());
  const choices = s.authConnections.filter((item) => item.state === "connected" || item.connection_id === s.editingAuth);
  el.connectionAuth.replaceChildren(
    new Option(L(existing?.auth_connection_id ? "images.account.keep" : "images.account.anonymous"), ""),
    ...choices.map((item) => new Option(item.display_name + (item.state === "connected" ? "" : ` · ${L("images.account.unavailable")}`), item.connection_id)));
  if (s.editingAuth && !choices.some((item) => item.connection_id === s.editingAuth)) el.connectionAuth.add(new Option(L("images.account.missing"), s.editingAuth));
  el.connectionAuth.value = s.editingAuth;
  const unavailable = s.editingAuth && !s.authConnections.some((item: AuthConnection) => item.connection_id === s.editingAuth && item.state === "connected");
  page.field("key-help").textContent = unavailable ? L("images.account.reconnect") : changedDestination ? L("images.account.reselect")
    : existing?.has_key ? L("images.account.saved") : L("images.account.key-help");
  page.field("connection-heading").textContent = s.editingId ? L("images.service.edit") : L("images.service.add");
}

export function usePreset(page: ImagesPage, preset: string): void {
  const { s, el } = page;
  const known = preset === "gemini" || preset === "openai" ? PRESETS[preset] : null;
  s.editingFormat = preset === "gemini" ? "gemini" : "openai-images";
  el.connectionName.value = known?.name ?? "";
  el.connectionUrl.value = known?.url ?? "";
  el.connectionModel.value = known?.model ?? "";
  paintConn(page);
}

export function editConnection(page: ImagesPage, id: string): void {
  const { s, el } = page;
  const connection = s.conns.find((item) => item.id === id);
  s.editingId = connection?.id || "";
  s.editingAuth = connection?.auth_connection_id || "";
  if (connection) {
    s.editingFormat = connection.api_format;
    el.connectionName.value = connection.name;
    el.connectionUrl.value = connection.base_url;
    el.connectionModel.value = connection.model;
    paintConn(page);
  } else usePreset(page, "openai");
  page.say("", false, "[data-images-connection-note]");
}

export async function loadConnections(page: ImagesPage, signal = page.s.viewSignal): Promise<void> {
  const { s } = page;
  const seq = ++s.loadSeq;
  const payload = await page.request<{ connections?: ImageConnection[]; auth_connections?: AuthConnection[] }>("GET", "/connections", undefined, signal);
  if (seq !== s.loadSeq || !page.root.isConnected) return;
  s.conns = Array.isArray(payload.connections) ? payload.connections : [];
  s.authConnections = Array.isArray(payload.auth_connections) ? payload.auth_connections : [];
  paintConnections(page);
  paintConn(page);
}

export function openConnections(page: ImagesPage): void {
  const { s, el } = page;
  if (s.resumeConnection !== s.cid) editConnection(page, s.cid);
  s.resumeConnection = null;
  if (!el.dialog.open) el.dialog.showModal();
  el.connectionName.focus();
  const seq = s.loadSeq + 1, signal = s.viewSignal;
  void loadConnections(page, signal).catch((error: unknown) => {
    if (seq === s.loadSeq && !signal?.aborted && el.dialog.open) page.say(messageOf(error) || page.L("images.error.request"), true, "[data-images-connection-note]");
  });
}

export function syncSaving(page: ImagesPage): void {
  if (!page.life.alive) return;
  const { s, L, el } = page;
  page.field<HTMLFieldSetElement>("connection-fields").disabled = s.saving;
  el.dialog.querySelectorAll<HTMLButtonElement>("[data-images-edit-connection], [data-images-delete-connection], [data-images-add-connection], [data-images-dialog-close], [data-images-save-connection]")
    .forEach((node) => { node.disabled = s.saving; });
  page.field("save-connection").textContent = s.saving ? L("images.service.saving") : L("images.service.save");
}

async function saveConnection(page: ImagesPage): Promise<void> {
  const { s, L, el } = page;
  if (s.saving || !el.connectionForm.reportValidity()) return;
  const input = {
    ...(s.editingId ? { id: s.editingId } : {}), name: el.connectionName.value.trim(), api_format: s.editingFormat,
    base_url: el.connectionUrl.value.trim(), model: el.connectionModel.value.trim(), auth_connection_id: el.connectionAuth.value,
  };
  s.saving = true;
  syncSaving(page);
  page.say("", false, "[data-images-connection-note]");
  try {
    const payload = await page.request<{ connection: ImageConnection }>("POST", "/connections", input);
    s.loadSeq += 1;
    const index = s.conns.findIndex((item) => item.id === payload.connection.id);
    if (index >= 0) s.conns[index] = payload.connection; else s.conns.push(payload.connection);
    s.cid = payload.connection.id;
    s.editingId = s.cid;
    paintConnections(page);
    page.saveDraft();
    el.dialog.close();
    page.say(L(payload.connection.available === false ? "images.service.saved-connect" : "images.service.saved"));
  } catch (error) {
    page.say(messageOf(error) || L("images.error.save"), true, "[data-images-connection-note]");
  } finally {
    s.saving = false;
    syncSaving(page);
  }
}

/** The connection dialog's own listeners; the buttons inside it go through the page's command table. */
export function installConnections(page: ImagesPage): void {
  const { life, el, s } = page;
  life.listen(el.connectionForm, "submit", (event) => { event.preventDefault(); void saveConnection(page); });
  life.listen(el.dialog, "cancel", (event) => { if (s.saving) event.preventDefault(); });
  life.listen(el.connectionUrl, "input", () => paintConn(page));
  life.listen(el.connectionAuth, "change", () => { s.editingAuth = el.connectionAuth.value; paintConn(page); });
  syncSaving(page);
}
