import { el } from "../dom.js";
import { codeOf, codingRequest, errorMessage, translate as L, type Workspace } from "./page.js";

interface McpServer {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly transport: string;
  readonly enabled: boolean;
  readonly timeout_ms: number;
  readonly executable?: string;
  readonly argv?: readonly string[];
  readonly endpoint?: string;
  readonly auth_connection_id?: string;
  readonly credential?: string;
  readonly directory?: { readonly canonical_path: string };
  readonly health: string;
  readonly error?: string;
  readonly tools: readonly { readonly tool: string; readonly description: string }[];
  readonly resources?: readonly string[];
  readonly busy?: string;
}

/** A connection the person made in Connectors that an MCP server may sign in with. */
interface AuthConnection {
  readonly connection_id: string;
  readonly service_id: string;
  readonly auth_method: string;
  readonly agent_available?: boolean;
  readonly state: string;
  readonly display_name: string;
  readonly mcp_endpoint?: string;
}

type Control = "connect" | "disconnect" | "cancel" | "remove";
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** What the section holds while the page is open. */
interface Mcp {
  readonly root: HTMLElement;
  readonly form: HTMLFormElement;
  readonly q: <Found extends HTMLElement = HTMLElement>(selector: string) => Found;
  /** The form's field of that name. */
  readonly field: <Kind extends Field = HTMLInputElement>(name: string) => Kind;
  servers: McpServer[];
  workspaces: Workspace[];
  authConnections: AuthConnection[];
  editing: { id: string; version: number } | null;
  /** What each server is being asked to do right now. */
  readonly pending: Map<string, Control>;
  poll: ReturnType<typeof setInterval> | null;
}

const status = (state: Mcp, text: string) => {
  state.q("[data-mcp-status]").textContent = text;
};
const api = <Answer>(state: Mcp, path: string, body?: unknown) => codingRequest<Answer>(state.root, path, body, L("coding.mcp-config.failed"));

const transport = (state: Mcp) => {
  const kind = state.field("transport").value;
  state.q("[data-mcp-stdio]").hidden = kind !== "stdio";
  state.q("[data-mcp-http]").hidden = kind !== "http";
};
const reset = (state: Mcp) => {
  state.editing = null;
  state.form.reset();
  state.q("[data-mcp-form-title]").textContent = L("coding.mcp-config.add");
  transport(state);
};

/** Puts a server in the form to change it. */
function edit(state: Mcp, server: McpServer) {
  const { field } = state;
  state.editing = { id: server.id, version: server.version };
  state.q("[data-mcp-form-title]").textContent = L("coding.mcp-config.edit-title", { name: server.label });
  field("label").value = server.label;
  field<HTMLSelectElement>("transport").value = server.transport;
  field("enabled").checked = server.enabled;
  field("timeout").value = String(server.timeout_ms);
  field("executable").value = server.executable || "";
  field("argv").value = JSON.stringify(server.argv || []);
  field("endpoint").value = server.endpoint || "";
  field<HTMLSelectElement>("auth").value = server.auth_connection_id ? "connection" : server.credential === "present" ? "keep-existing" : "none";
  field<HTMLSelectElement>("auth_connection_id").value = server.auth_connection_id || "";
  field<HTMLSelectElement>("workspace").value = state.workspaces.find(item => item.canonical_path === server.directory?.canonical_path)?.workspace_id || "";
  transport(state);
  field("label").focus();
}

/** One line under a server: the tools it offers, or the resources it exposes. */
function listOf(items: readonly string[]) {
  const list = el("ul");
  for (const text of items) list.append(el("li", text));
  return list;
}

/** The buttons a server in its state is offered. */
function serverActions(state: Mcp, server: McpServer, busy: string | undefined) {
  const actions = el("div", "", "mw-form__actions");
  const add = (label: string, action: () => unknown) => {
    const button = el("button", label, "mw-btn mw-btn--secondary");
    button.type = "button";
    button.setAttribute("aria-label", L("coding.mcp-config.action-label", { action: label, name: server.label }));
    button.addEventListener("click", () => void action());
    actions.append(button);
  };
  if (!busy) {
    add(L("coding.mcp-config.edit"), () => edit(state, server));
    if (server.enabled && server.health !== "connected") add(L("coding.mcp-config.connect"), () => control(state, server, "connect"));
    if (server.health === "connected") add(L("coding.mcp-config.disconnect"), () => control(state, server, "disconnect"));
    add(L("coding.mcp-config.remove"), () => control(state, server, "remove"));
  } else if (busy === "connect") {
    add(L("coding.mcp-config.cancel"), () => control(state, server, "cancel"));
  }
  return actions;
}

/** What a server is doing, in words. */
function busyWords(busy: string | undefined) {
  if (!busy) return "";
  const names: Readonly<Record<string, string>> = { connect: L("coding.mcp-config.connect"), disconnect: L("coding.mcp-config.disconnect"), remove: L("coding.mcp-config.remove"), cancel: L("coding.mcp-config.cancel"), save: L("coding.mcp-config.save") };
  return L("coding.mcp-config.busy", { action: names[busy] || busy });
}

function serverRow(state: Mcp, server: McpServer, opened: ReadonlySet<string | undefined>) {
  const row = el("details");
  row.dataset.server = server.id;
  row.open = opened.has(server.id);
  const health: Readonly<Record<string, string>> = { connected: L("coding.mcp-config.health.connected"), disconnected: L("coding.mcp-config.health.disconnected"), unavailable: L("coding.mcp-config.health.unavailable"), "not-reattached": L("coding.mcp-config.health.not-reattached") };
  row.append(el("summary", server.label + " · " + (server.enabled ? health[server.health] || server.health : L("coding.mcp-config.disabled"))));
  row.append(el("p", server.transport === "stdio" ? server.executable + " " + JSON.stringify(server.argv) : server.endpoint));
  const error = el("p", server.error || "");
  error.setAttribute("role", "status");
  row.append(error, listOf(server.tools.map(tool => tool.tool + L("coding.timeline.colon") + tool.description)), listOf((server.resources || []).map(uri => L("coding.mcp-config.resource", { uri }))));
  const busy = state.pending.get(server.id) || server.busy;
  row.append(serverActions(state, server, busy), el("p", busyWords(busy)));
  return row;
}

/** Draws the servers, unless nothing they show changed. */
function render(state: Mcp) {
  const list = state.q("[data-mcp-servers]"), key = JSON.stringify([state.servers, [...state.pending]]);
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  const opened = new Set([...list.querySelectorAll<HTMLElement>("details[open]")].map(item => item.dataset.server));
  list.replaceChildren();
  for (const server of state.servers) list.append(serverRow(state, server, opened));
  if (!state.servers.length) list.textContent = L("coding.mcp-config.none");
}

/** The connections the section offers in its sign-in list. A failed read leaves the list as it is. */
async function readConnections(state: Mcp) {
  const response = await molisWorkRequest<Response>("/api/settings/connectors/connections", { as: "response" });
  if (!response.ok) return;
  const data: { connections?: AuthConnection[] } = await response.json();
  state.authConnections = (data.connections || []).filter(item => item.service_id === "mcp-bearer" || (item.auth_method === "mcp" && item.agent_available !== false));
  const select = state.field<HTMLSelectElement>("auth_connection_id"), current = select.value, none = el("option", L("coding.mcp-config.choose-connection"));
  none.value = "";
  select.replaceChildren(none, ...state.authConnections.filter(item => item.state === "connected").map(item => {
    const option = el("option", item.display_name);
    option.value = item.connection_id;
    return option;
  }));
  select.value = current;
}

/** Reads the servers, the project's directories and the connections again, and draws them. */
async function refresh(state: Mcp) {
  const result = await api<{ mcp?: McpServer[]; workspaces: Workspace[] }>(state, "/state");
  state.servers = result.mcp || [];
  state.workspaces = result.workspaces;
  await readConnections(state);
  const select = state.field<HTMLSelectElement>("workspace"), key = JSON.stringify(state.workspaces), previous = select.value;
  if (select.dataset.options !== key) {
    select.replaceChildren(...state.workspaces.map(item => {
      const option = el("option", item.canonical_path);
      option.value = item.workspace_id;
      return option;
    }));
    select.dataset.options = key;
    if (state.workspaces.some(item => item.workspace_id === previous)) select.value = previous;
  }
  render(state);
}

/** Asks the Host to connect, disconnect, cancel or remove a server. */
async function control(state: Mcp, server: McpServer, action: Control) {
  if (state.pending.has(server.id) && action !== "cancel") return;
  if (action !== "cancel") state.pending.set(server.id, action);
  render(state);
  const doing = { connect: L("coding.mcp-config.doing.connect"), disconnect: L("coding.mcp-config.doing.disconnect"), cancel: L("coding.mcp-config.doing.cancel"), remove: L("coding.mcp-config.doing.remove") };
  status(state, doing[action]);
  try {
    await api(state, "/mcp/" + encodeURIComponent(server.id) + "/control", { action });
    status(state, action === "connect" ? L("coding.mcp-config.connected") : action === "remove" ? L("coding.mcp-config.removed") : L("coding.mcp-config.confirmed"));
  } catch (error) {
    status(state, errorMessage(error));
  } finally {
    if (action !== "cancel") state.pending.delete(server.id);
    await refresh(state).catch(error => status(state, errorMessage(error)));
    render(state);
  }
}

/** What the form holds, as the Host's save route takes it. */
function formBody(state: Mcp) {
  const { field, editing } = state, kind = field<HTMLSelectElement>("transport").value;
  const body: Record<string, unknown> = { ...(editing ? { id: editing.id } : {}), expected_version: editing?.version ?? 0, label: field("label").value, transport: kind, enabled: field("enabled").checked, timeout_ms: Number(field("timeout").value) };
  if (kind === "stdio") {
    body.workspace_id = field<HTMLSelectElement>("workspace").value;
    body.executable = field("executable").value;
    try { body.argv = JSON.parse(field("argv").value); } catch { throw new Error(L("coding.mcp-config.argv-json")); }
  } else {
    const auth = field<HTMLSelectElement>("auth").value;
    body.endpoint = field("endpoint").value;
    body.auth = { kind: auth, ...(auth === "connection" ? { connection_id: field<HTMLSelectElement>("auth_connection_id").value } : {}) };
  }
  return body;
}

async function submit(state: Mcp, event: Event) {
  event.preventDefault();
  const button = state.form.querySelector<HTMLButtonElement>("[type=submit]");
  if (!button || button.disabled) return;
  button.disabled = true;
  try {
    await api(state, "/mcp", formBody(state));
    reset(state);
    await refresh(state);
    status(state, L("coding.mcp-config.saved"));
  } catch (error) {
    status(state, errorMessage(error));
  } finally {
    button.disabled = false;
  }
}

/** Turns Coding on for the project the section belongs to, then reloads the page. */
async function enable(state: Mcp, button: HTMLButtonElement) {
  button.disabled = true;
  try {
    const project = new URL(state.root.dataset.prefix ?? "", location.origin).pathname.split("/").filter(Boolean)[1];
    if (!project) throw new Error(L("coding.mcp-config.choose-project"));
    await molisWorkRequest("/api/settings/projects/" + encodeURIComponent(project) + "/plugins", { method: "POST", body: { plugin_id: "coding" }, fallback: L("coding.mcp-config.enable-failed") });
    location.reload();
  } catch (error) {
    unavailable(state, error, true);
  }
}

/** Says why the servers cannot be read; when Coding is not enabled in the project, stops polling and offers to enable it. */
function unavailable(state: Mcp, error: unknown, off = false) {
  status(state, L("coding.mcp-config.unreadable", { reason: errorMessage(error) }));
  if (!off && codeOf(error) !== "actions.plugin_disabled") return;
  if (state.poll !== null) {
    clearInterval(state.poll);
    state.poll = null;
  }
  status(state, L("coding.mcp-config.not-enabled"));
  const button = el("button", L("coding.mcp-config.enable"), "mw-btn mw-btn--secondary");
  button.type = "button";
  button.addEventListener("click", () => enable(state, button));
  state.q("[data-mcp-status]").append(" ", button);
}

/** Reads now, and keeps reading every few seconds while the section is on the page. */
function resume(state: Mcp) {
  void refresh(state).then(() => status(state, L("coding.mcp-config.read"))).catch(error => unavailable(state, error));
  if (state.poll !== null) return;
  state.poll = setInterval(() => {
    if (!state.root.isConnected) {
      if (state.poll !== null) clearInterval(state.poll);
      state.poll = null;
      return;
    }
    void refresh(state).catch(error => unavailable(state, error));
  }, 3000);
}

const sections = new WeakMap<HTMLElement, () => void>();

/** Binds the MCP section of a settings page (standalone or embedded); bound again, it reads again. */
export function bindMcp(scope: ParentNode) {
  const root = scope.querySelector<HTMLElement>("[data-coding-mcp-settings]");
  if (!root) return;
  const known = sections.get(root);
  if (known) {
    known();
    return;
  }
  const q = <Found extends HTMLElement = HTMLElement>(selector: string) => {
    const found = root.querySelector<Found>(selector);
    if (!found) throw new Error("mcp settings: " + selector);
    return found;
  };
  const form = q<HTMLFormElement>("[data-mcp-config]");
  const field = <Kind extends Field = HTMLInputElement>(name: string) => {
    const found = form.elements.namedItem(name);
    if (!found) throw new Error("mcp settings: " + name);
    return found as Kind;
  };
  const state: Mcp = { root, form, q, field, servers: [], workspaces: [], authConnections: [], editing: null, pending: new Map(), poll: null };
  form.addEventListener("submit", event => void submit(state, event));
  field("auth_connection_id").addEventListener("change", () => {
    const selected = state.authConnections.find(item => item.connection_id === field<HTMLSelectElement>("auth_connection_id").value);
    if (!selected?.mcp_endpoint) return;
    field("endpoint").value = selected.mcp_endpoint;
    field<HTMLSelectElement>("auth").value = "connection";
    if (!field("label").value.trim()) field("label").value = selected.display_name;
  });
  field("transport").addEventListener("change", () => transport(state));
  q("[data-mcp-reset]").addEventListener("click", () => reset(state));
  transport(state);
  sections.set(root, () => resume(state));
  resume(state);
}
