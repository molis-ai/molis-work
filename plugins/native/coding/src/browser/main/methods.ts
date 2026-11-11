import { CODING_PUBLISHER_BINDING } from "../../identity.js";
import { el } from "../dom.js";
import { shut } from "./composer-state.js";
import type { Page } from "./page.js";
import { skillRefKey } from "@molis-ai/molis-work-plugin-sdk/skill-ref";
import type { McpServer, McpToolRef, SkillChoice } from "./shapes.js";

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
  const { readText, lifetime } = page, { s } = page, servers = s.state.mcp || [];
  const catalog: ToolRow[] = servers.flatMap(server => server.tools.map(tool => ({ ...tool, label: server.label, description: tool.description ?? "", available: connected(server) })));
  for (const selected of s.mcpChoices) {
    if (!catalog.some(tool => toolKey(tool) === toolKey(selected))) {
      catalog.push({ ...selected, label: servers.find(server => server.id === selected.server)?.label || selected.server, available: false, description: readText("coding.mcp.tool-gone") });
    }
  }
  for (const tool of catalog) {
    const chosen = s.mcpChoices.some(item => toolKey(item) === toolKey(tool));
    const { row, check } = checkRow(chosen, !tool.available && !chosen, tool.label + " / " + tool.tool + (tool.available ? "" : " " + readText("coding.mcp.unavailable-mark")) + " · " + tool.description);
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
  const { readText, lifetime } = page, { s } = page, servers = s.state.mcp || [];
  const sources: SourceRow[] = servers.filter(server => server.resources?.length).map(server => ({ server: server.id, configuration_version: server.version, label: server.label, resources: server.resources ?? [], available: connected(server) }));
  for (const selected of s.mcpSourceChoices) {
    if (!sources.some(item => sourceKey(item) === sourceKey(selected))) {
      sources.push({ ...selected, label: servers.find(server => server.id === selected.server)?.label || selected.server, resources: [], available: false });
    }
  }
  for (const source of sources) {
    const chosen = s.mcpSourceChoices.some(item => sourceKey(item) === sourceKey(source));
    const { row, check } = checkRow(chosen, !source.available && !chosen, source.label + " · " + (source.available ? readText("coding.mcp.source", { count: source.resources.length }) : readText("coding.mcp.source-unavailable")));
    lifetime.listen(check, "change", () => {
      s.mcpSourceChoices = s.mcpSourceChoices.filter(item => sourceKey(item) !== sourceKey(source));
      if (check.checked) s.mcpSourceChoices.push({ server: source.server, configuration_version: source.configuration_version });
    });
    list.append(row);
  }
  return sources.length;
}

export function renderMcp(page: Page) {
  const { readText } = page;
  const list = page.q("[data-coding-mcp-list]");
  list.replaceChildren();
  const tools = drawMcpTools(page, list), sources = drawMcpSources(page, list);
  if (!tools && !sources) list.textContent = readText("coding.mcp.none");
}


const BUILTIN_METHOD_WORDS: Readonly<Record<string, { name: string; description: string }>> = {
  "coding-review-change": { name: "coding.skill.coding-review-change.name", description: "coding.skill.coding-review-change.description" },
  "coding-diagnose-fix": { name: "coding.skill.coding-diagnose-fix.name", description: "coding.skill.coding-diagnose-fix.description" },
  "coding-implement-change": { name: "coding.skill.coding-implement-change.name", description: "coding.skill.coding-implement-change.description" },
  "coding-git-delivery": { name: "coding.skill.coding-git-delivery.name", description: "coding.skill.coding-git-delivery.description" },
};

function methodWords(page: Page, skill: SkillChoice) {
  const { source, skill_id, version } = skill.ref;
  const copy = version === 2 && source.plugin_id === page.host.pluginId && source.publisher_signature === CODING_PUBLISHER_BINDING
    ? BUILTIN_METHOD_WORDS[skill_id] : undefined;
  return copy ? { name: page.readText(copy.name), description: page.readText(copy.description), fixed: true }
    : { name: skill.name, description: skill.description, fixed: false };
}

function methodTitle(page: Page, skill: SkillChoice, tag: "span" | "h3"): HTMLElement {
  const words = methodWords(page, skill);
  const title = el(tag), name = el("span", words.name);
  name.translate = words.fixed;
  title.append(name, " · v" + skill.ref.version);
  return title;
}

/** A Skill's opening as the catalog keeps it: the menu reads no body (the round's start does). */
function showExcerpt(page: Page, skill: SkillChoice) {
  const doc = page.q("[data-coding-method-document]");
  doc.hidden = false;
  const excerpt = el("p", skill.excerpt); excerpt.translate = false;
  doc.replaceChildren(methodTitle(page, skill, "h3"), excerpt);
  doc.scrollIntoView({ block: "nearest" });
}

/** One Skill of the catalog: its box, its words, and its opening. */
function methodRow(page: Page, skill: SkillChoice): HTMLElement {
  const { readText, lifetime } = page, { s } = page, key = skillRefKey(skill.ref);
  const row = el("div", "", "mw-field"), label = el("label", "", "mw-check-row"), check = el("input", "", "mw-check");
  const chosen = s.methodChoices.some(ref => skillRefKey(ref) === key);
  check.type = "checkbox";
  check.checked = chosen;
  // Another plugin's `manual` Skill is named only in the Assistant; one already kept can still be cleared.
  check.disabled = !chosen && (!skill.available || skill.assistant_only);
  const words = methodWords(page, skill);
  label.append(check, methodTitle(page, skill, "span"));
  lifetime.listen(check, "change", () => {
    s.methodChoices = s.methodChoices.filter(ref => skillRefKey(ref) !== key);
    if (check.checked) s.methodChoices.push(structuredClone(skill.ref));
  });
  const read = el("button", readText("coding.method.read"), "mw-btn mw-btn--ghost");
  read.type = "button";
  read.dataset.codingMethodOpen = key;
  read.setAttribute("aria-label", readText("coding.method.read-label", { name: words.name }));
  lifetime.listen(read, "click", () => showExcerpt(page, skill));
  const heading = el("div", "", "coding-method-heading");
  heading.append(label, read);
  const note = skill.assistant_only ? readText("coding.method.assistant-only", { summary: skill.description })
    : skill.available ? words.description : readText("coding.method.unavailable", { summary: skill.description });
  const description = el("small", note);
  description.translate = !skill.available || skill.assistant_only || words.fixed;
  row.append(heading, description);
  return row;
}

export function renderMethods(page: Page) {
  const { readText, lifetime, q } = page, { s } = page;
  const list = q("[data-coding-method-list]"), needle = q<HTMLInputElement>("[data-coding-method-search]").value.trim().toLocaleLowerCase();
  list.replaceChildren();
  const catalog = s.state.skills || [], rows = catalog.filter(item => {
    const { name, description } = methodWords(page, item);
    return (name + " " + description).toLocaleLowerCase().includes(needle);
  });
  for (const skill of rows) list.append(methodRow(page, skill));
  if (!rows.length) list.append(el("p", needle ? readText("coding.method.no-match") : readText("coding.method.none")));
  for (const ref of s.methodChoices.filter(item => !catalog.some(skill => skillRefKey(skill.ref) === skillRefKey(item)))) {
    const remove = el("button", readText("coding.method.remove-gone", { method: ref.skill_id + " · v" + ref.version }), "mw-btn");
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
  s.methodChoices = [...structuredClone(s.methodSelections.get(s.current) || [])];
  q<HTMLInputElement>("[data-coding-method-search]").value = "";
  q("[data-coding-method-document]").hidden = true;
  q("[data-coding-method-error]").textContent = "";
  renderMethods(page);
  q<HTMLDialogElement>("[data-coding-method-dialog]").showModal();
}

/** The accessible label also contains the selected method's display name. */
export function retitleMethodControls(page: Page): void {
  if (!page.q<HTMLDialogElement>("[data-coding-method-dialog]").open) return;
  const rows = new Map((page.s.state.skills ?? []).map(skill => [skillRefKey(skill.ref), skill]));
  for (const button of page.q("[data-coding-method-list]").querySelectorAll<HTMLButtonElement>("[data-coding-method-open]")) {
    const method = rows.get(button.dataset.codingMethodOpen ?? "");
    if (method) button.setAttribute("aria-label", page.readText("coding.method.read-label", { name: methodWords(page, method).name }));
  }
}
