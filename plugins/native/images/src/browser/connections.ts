import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { button, text } from "./dom.js";
import type { AuthConnection, ImageConnection, ImagesPage } from "./types.js";

const uiText = globalThis.t;

/**
 * The services a person picks by name (PF-A05): each gives the model it uses and the sizes (or aspect ratios) that model takes, so
 * choosing a service is all the default path asks; the protocol, address and model name are its 高级. Anything else is 自定义.
 */
const PRESETS = {
  openai: { name: "OpenAI", url: "https://api.openai.com/v1", model: "gpt-image-1.5", sizes: ["1024x1024", "1536x1024", "1024x1536", "auto"] },
  gemini: { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.1-flash-image", sizes: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"] },
} as const;
type Preset = (typeof PRESETS)[keyof typeof PRESETS];

/** The preset a saved or edited service is: the same address and model; anything else is a custom one. */
function presetOf(url: string, model: string): Preset | undefined {
  return Object.values(PRESETS).find((preset) => preset.url === url.trim().replace(/\/+$/u, "") && preset.model === model.trim());
}

/** The sizes the picked service's model takes, offered under its size (or ratio) field; a custom service's are its own to know. */
function syncSizes(page: ImagesPage, connection: ImageConnection | undefined): void {
  const preset = connection && presetOf(connection.base_url, connection.model);
  const gemini = connection?.api_format === "gemini";
  page.field(gemini ? "ratio-options" : "size-options").replaceChildren(...(preset?.sizes ?? []).map((size) => new Option(size)));
  page.field(gemini ? "ratio-help" : "size-help").textContent = preset
    ? uiText.text("images.compose.sizes-known", { model: preset.model, sizes: preset.sizes.join(" · ") }) : uiText.text("images.compose.size-help");
}

export function syncParameters(page: ImagesPage): void {
  const { s, root } = page;
  const connection = page.pickedConn();
  page.field("connected").hidden = !s.cid && !s.conns.length;
  page.field("connection-empty").hidden = s.conns.length > 0;
  // Until a service is connected, connecting is the step; the generate row waits.
  const submitRow = root.querySelector<HTMLElement>(".images-submit-row");
  if (submitRow) submitRow.hidden = !s.conns.length;
  page.field("service-label").textContent = connection ? `${connection.name} · ${connection.model}` : uiText.text("images.service.unavailable");
  const unavailable = page.field("service-unavailable");
  unavailable.hidden = !s.cid || Boolean(connection && connection.available !== false);
  unavailable.textContent = connection?.unavailable_reason || uiText.text("images.service.unavailable");
  page.field("size-field").hidden = !connection || connection.api_format !== "openai-images";
  page.field("ratio-field").hidden = !connection || connection.api_format !== "gemini";
  syncSizes(page, connection);
  page.field("service-options").querySelectorAll<HTMLElement>("[data-images-use-connection]")
    .forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.imagesUseConnection === s.cid)));
  page.syncGenerate();
}

export function paintConnections(page: ImagesPage): void {
  const { s } = page;
  if (!s.cid) s.cid = s.conns[0]?.id || "";
  page.field("service-options").replaceChildren(...s.conns.map((connection) => {
    const node = button("", "data-images-use-connection", connection.id);
    node.className = "images-service-option";
    node.append(text("span", connection.name), text("small", connection.model + (connection.available === false ? ` · ${uiText.text("images.account.unavailable")}` : "")));
    return node;
  }));
  page.field("saved-connections").replaceChildren(...s.conns.map((connection) => {
    const row = text("div", "", "images-saved-connection");
    const node = button(connection.name, "data-images-edit-connection", connection.id, "secondary");
    node.setAttribute("aria-pressed", String(s.editingId === connection.id));
    row.append(node, button(uiText.text("images.service.delete"), "data-images-delete-connection", connection.id));
    return row;
  }));
  syncParameters(page);
}

/** The dialog's own state: which protocol and service are being edited, and what to tell about the key. */
export function paintConn(page: ImagesPage): void {
  const { s, root, el } = page;
  root.querySelectorAll<HTMLElement>("[data-images-format]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.imagesFormat === s.editingFormat)));
  // The service is the choice; what it gives is said under it. A custom one has no answer here, so its 高级 is where it is filled in.
  const preset = presetOf(el.connectionUrl.value, el.connectionModel.value);
  const picked = preset ? (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((key) => PRESETS[key] === preset) ?? "custom" : "custom";
  root.querySelectorAll<HTMLElement>("[data-images-preset]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.imagesPreset === picked)));
  page.field("offer").textContent = preset ? uiText.text("images.service.offer", { model: preset.model, sizes: preset.sizes.join(" · ") }) : uiText.text("images.service.offer-custom");
  if (!preset) page.field<HTMLDetailsElement>("advanced").open = true;
  root.querySelectorAll<HTMLElement>("[data-images-edit-connection]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.imagesEditConnection === s.editingId)));
  const existing = s.conns.find((item) => item.id === s.editingId);
  const changedDestination = existing && (existing.api_format !== s.editingFormat || existing.base_url !== el.connectionUrl.value.trim());
  const choices = s.authConnections.filter((item) => item.state === "connected" || item.connection_id === s.editingAuth);
  el.connectionAuth.replaceChildren(
    new Option(uiText.text(existing?.auth_connection_id ? "images.account.keep" : "images.account.anonymous"), ""),
    ...choices.map((item) => new Option(item.display_name + (item.state === "connected" ? "" : ` · ${uiText.text("images.account.unavailable")}`), item.connection_id)));
  if (s.editingAuth && !choices.some((item) => item.connection_id === s.editingAuth)) el.connectionAuth.add(new Option(uiText.text("images.account.missing"), s.editingAuth));
  el.connectionAuth.value = s.editingAuth;
  const unavailable = s.editingAuth && !s.authConnections.some((item: AuthConnection) => item.connection_id === s.editingAuth && item.state === "connected");
  page.field("key-help").textContent = unavailable ? uiText.text("images.account.reconnect") : changedDestination ? uiText.text("images.account.reselect")
    : existing?.has_key ? uiText.text("images.account.saved") : uiText.text("images.account.key-help");
  page.field("connection-heading").textContent = s.editingId ? uiText.text("images.service.edit") : uiText.text("images.service.add");
}

export function usePreset(page: ImagesPage, preset: string): void {
  const { s, el } = page;
  const known = preset === "gemini" || preset === "openai" ? PRESETS[preset] : null;
  s.editingFormat = preset === "gemini" ? "gemini" : "openai-images";
  el.connectionName.value = known?.name ?? "";
  el.connectionUrl.value = known?.url ?? "";
  el.connectionModel.value = known?.model ?? "";
  page.field<HTMLDetailsElement>("advanced").open = !known;
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
    page.field<HTMLDetailsElement>("advanced").open = !presetOf(connection.base_url, connection.model);
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
  page.root.querySelector<HTMLElement>('[data-images-preset][aria-pressed="true"]')?.focus();
  const seq = s.loadSeq + 1, signal = s.viewSignal;
  void loadConnections(page, signal).catch((error: unknown) => {
    if (seq === s.loadSeq && !signal?.aborted && el.dialog.open) page.say(messageOf(error) || uiText.text("images.error.request"), true, "[data-images-connection-note]");
  });
}

export function syncSaving(page: ImagesPage): void {
  if (!page.life.alive) return;
  const { s, el } = page;
  page.field<HTMLFieldSetElement>("connection-fields").disabled = s.saving;
  el.dialog.querySelectorAll<HTMLButtonElement>("[data-images-edit-connection], [data-images-delete-connection], [data-images-add-connection], [data-images-dialog-close], [data-images-save-connection]")
    .forEach((node) => { node.disabled = s.saving; });
  page.field("save-connection").textContent = s.saving ? uiText.text("images.service.saving") : uiText.text("images.service.save");
}

async function saveConnection(page: ImagesPage): Promise<void> {
  const { s, el } = page;
  // A field left empty may sit in the folded 高级: open it first, so the browser can point at the field.
  if (!s.saving && !el.connectionForm.checkValidity()) page.field<HTMLDetailsElement>("advanced").open = true;
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
    page.say(uiText.text(payload.connection.available === false ? "images.service.saved-connect" : "images.service.saved"));
  } catch (error) {
    page.say(messageOf(error) || uiText.text("images.error.save"), true, "[data-images-connection-note]");
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
  life.listen(el.connectionModel, "input", () => paintConn(page));
  life.listen(el.connectionAuth, "change", () => { s.editingAuth = el.connectionAuth.value; paintConn(page); });
  syncSaving(page);
}
