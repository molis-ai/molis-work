import { el, errorMessage } from "../dom.js";
import { shut } from "./composer-state.js";
import type { Page } from "./page.js";
import { api } from "./request.js";
import type { McpServer, McpToolRef, MethodRef } from "./shapes.js";

interface ToolRow extends McpToolRef { readonly label: string; readonly available: boolean; readonly description: string }
interface SourceRow { readonly server: string; readonly configuration_version: number; readonly label: string; readonly resources: readonly unknown[]; readonly available: boolean }

const toolKey = (ref: McpToolRef) => JSON.stringify([ref.server, ref.tool, ref.version, ref.configuration_version]);
const sourceKey = (ref: { readonly server: string; readonly configuration_version: number }) => JSON.stringify([ref.server, ref.configuration_version]);
const connected = (server: McpServer) => server.enabled && server.health === "connected";

/** A checkbox row of a picker: the box and its words. */
function checkRow(checked: boolean, disabled: boolean, text: string) {
  const row = el("label", "", "mw-check-row"), check = el("input", "", "mw-check");
  check.type = "checkbox";
  check.checked = checked;
  check.disabled = disabled;
  row.append(check, el("span", text));
  return { row, check };
}

/** The tools of the MCP servers, and those the session chose that are gone. */
function drawMcpTools(page: Page, list: HTMLElement) {
  const { L, lifetime } = page, { s } = page, servers = s.state.mcp || [];
  const catalog: ToolRow[] = servers.flatMap(server => server.tools.map(tool => ({ ...tool, label: server.label, available: connected(server) })));
  for (const selected of s.mcpChoices) {
    if (!catalog.some(tool => toolKey(tool) === toolKey(selected))) {
      catalog.push({ ...selected, label: servers.find(server => server.id === selected.server)?.label || selected.server, available: false, description: L("coding.mcp.tool-gone") });
    }
  }
  for (const tool of catalog) {
    const chosen = s.mcpChoices.some(item => toolKey(item) === toolKey(tool));
    const { row, check } = checkRow(chosen, !tool.available && !chosen, tool.label + " / " + tool.tool + (tool.available ? "" : " " + L("coding.mcp.unavailable-mark")) + " · " + tool.description);
    lifetime.listen(check, "change", () => {
      s.mcpChoices = s.mcpChoices.filter(item => toolKey(item) !== toolKey(tool));
      if (check.checked) s.mcpChoices.push({ server: tool.server, tool: tool.tool, version: tool.version, configuration_version: tool.configuration_version });
    });
    list.append(row);
  }
  return catalog.length;
}

/** The servers whose resources can be read, and those the session chose that are gone. */
function drawMcpSources(page: Page, list: HTMLElement) {
  const { L, lifetime } = page, { s } = page, servers = s.state.mcp || [];
  const sources: SourceRow[] = servers.filter(server => server.resources?.length).map(server => ({ server: server.id, configuration_version: server.version, label: server.label, resources: server.resources ?? [], available: connected(server) }));
  for (const selected of s.mcpSourceChoices) {
    if (!sources.some(item => sourceKey(item) === sourceKey(selected))) {
      sources.push({ ...selected, label: servers.find(server => server.id === selected.server)?.label || selected.server, resources: [], available: false });
    }
  }
  for (const source of sources) {
    const chosen = s.mcpSourceChoices.some(item => sourceKey(item) === sourceKey(source));
    const { row, check } = checkRow(chosen, !source.available && !chosen, source.label + " · " + (source.available ? L("coding.mcp.source", { count: source.resources.length }) : L("coding.mcp.source-unavailable")));
    lifetime.listen(check, "change", () => {
      s.mcpSourceChoices = s.mcpSourceChoices.filter(item => sourceKey(item) !== sourceKey(source));
      if (check.checked) s.mcpSourceChoices.push({ server: source.server, configuration_version: source.configuration_version });
    });
    list.append(row);
  }
  return sources.length;
}

export function renderMcp(page: Page) {
  const list = page.q("[data-coding-mcp-list]");
  list.replaceChildren();
  const tools = drawMcpTools(page, list), sources = drawMcpSources(page, list);
  if (!tools && !sources) list.textContent = page.L("coding.mcp.none");
}

/** A method's text, read when asked for. */
async function readMethod(page: Page, method: MethodRef & { readonly skill_id: string }) {
  const { L, lifetime, q } = page, { s } = page, ticket = ++s.methodDocumentTicket, doc = q("[data-coding-method-document]");
  doc.hidden = false;
  doc.textContent = L("coding.method.loading");
  try {
    const result = await api<{ method: { name: string; version: number; body: string } }>(page, "/methods/" + encodeURIComponent(method.skill_id) + "/" + method.version);
    if (ticket !== s.methodDocumentTicket) return;
    doc.replaceChildren(el("h3", L(result.method.name) + " · v" + result.method.version), el("p", result.method.body));
    doc.scrollIntoView({ block: "nearest" });
  } catch (error) {
    if (!lifetime.alive) return;
    if (ticket === s.methodDocumentTicket) doc.textContent = errorMessage(error);
  }
}

/** One method of the catalog: its box, its words, and the way to read it. */
function methodRow(page: Page, method: MethodRef & { readonly name: string; readonly summary: string; readonly enabled: boolean }): HTMLElement {
  const { L, lifetime } = page, { s } = page;
  const row = el("div", "", "mw-field"), label = el("label", "", "mw-check-row"), check = el("input", "", "mw-check");
  check.type = "checkbox";
  check.checked = s.methodChoices.some(ref => ref.skill_id === method.skill_id && ref.version === method.version);
  check.disabled = !method.enabled;
  label.append(check, el("span", L(method.name) + " · v" + method.version));
  lifetime.listen(check, "change", () => {
    s.methodChoices = s.methodChoices.filter(ref => ref.skill_id !== method.skill_id);
    if (check.checked) s.methodChoices.push({ skill_id: method.skill_id, version: method.version });
  });
  const read = el("button", L("coding.method.read"), "mw-btn mw-btn--ghost");
  read.type = "button";
  read.setAttribute("aria-label", L("coding.method.read-label", { name: L(method.name) }));
  read.disabled = !method.enabled;
  lifetime.listen(read, "click", () => readMethod(page, method));
  const heading = el("div", "", "coding-method-heading");
  heading.append(label, read);
  row.append(heading, el("small", method.enabled ? L(method.summary) : L("coding.method.unavailable", { summary: L(method.summary) })));
  return row;
}

export function renderMethods(page: Page) {
  const { L, lifetime, q } = page, { s } = page;
  const list = q("[data-coding-method-list]"), needle = q<HTMLInputElement>("[data-coding-method-search]").value.trim().toLocaleLowerCase();
  list.replaceChildren();
  const catalog = s.state.methods || [], rows = catalog.filter(item => (item.name + " " + item.summary).toLocaleLowerCase().includes(needle));
  for (const method of rows) list.append(methodRow(page, method));
  if (!rows.length) list.append(el("p", needle ? L("coding.method.no-match") : L("coding.method.none")));
  for (const ref of s.methodChoices.filter(item => !catalog.some(method => method.skill_id === item.skill_id && method.version === item.version))) {
    const remove = el("button", L("coding.method.remove-gone", { method: ref.skill_id + " · v" + ref.version }), "mw-btn");
    remove.type = "button";
    lifetime.listen(remove, "click", () => {
      s.methodChoices = s.methodChoices.filter(item => item !== ref);
      renderMethods(page);
    });
    list.append(remove);
  }
}

export function openMethods(page: Page) {
  const { q } = page, { s } = page;
  if (shut(page)) return;
  s.methodChoices = structuredClone(s.methodSelections.get(s.current) || []);
  s.methodDocumentTicket++;
  q<HTMLInputElement>("[data-coding-method-search]").value = "";
  q("[data-coding-method-document]").hidden = true;
  q("[data-coding-method-error]").textContent = "";
  renderMethods(page);
  q<HTMLDialogElement>("[data-coding-method-dialog]").showModal();
}
