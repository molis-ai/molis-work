import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
type Primitives = Pick<SettingsRenderPrimitives, "readText" | "escapeHtml">;

export interface McpAccessEntry {
  capability_id: string; version: number; provider_id: string;
  /** The Plugin whose action this is. Its declared title and description are shown as written. */
  plugin_id?: string;
  title: string; provider_title: string; description: string; kind: string;
  permissions: readonly string[];
  status: "ungranted" | "enabled" | "disabled" | "unavailable" | "stale" | "missing" | "public";
  reason?: string;
  can_enable: boolean;
  can_revoke: boolean;
}
export interface McpAccessModel {
  client_id: string | null;
  project_id: string | null;
  clients: readonly { id: string; title: string }[];
  entries: readonly McpAccessEntry[];
  query: string;
  filter: string;
  unavailable_projects?: readonly string[];
  scope_error?: string;
}
const labels: Record<McpAccessEntry["status"], string> = { ungranted: "workbench.mcp-access.not-authorized", enabled: "workbench.mcp-access.authorized", disabled: "workbench.mcp-access.access-revoked", unavailable: "workbench.mcp-access.unavailable", stale: "workbench.mcp-access.reauthorization-required", missing: "workbench.mcp-access.original-capability-unavailable", public: "workbench.mcp-access.available-default" };
export const mcpAccessEntryKey = (entry: Pick<McpAccessEntry, "capability_id" | "version" | "provider_id">) => JSON.stringify([entry.capability_id, entry.version, entry.provider_id]);

export function renderMcpAccessRows(model: Pick<McpAccessModel, "entries" | "query" | "filter">, p: Primitives): string {
  const { escapeHtml: e } = p;
  const needle = model.query.trim().toLocaleLowerCase();
  const entries = model.entries.filter(row => (!needle || `${row.title} ${row.description} ${row.provider_title} ${row.capability_id}`.toLocaleLowerCase().includes(needle))
    && (model.filter !== "granted" || row.can_revoke) && (model.filter !== "attention" || ["stale", "missing", "unavailable"].includes(row.status)));
  return `<p class="mcp-access-count" role="status">${uiText("workbench.mcp-access.count-count", { count: entries.length })}</p>${entries.length ? entries.map(row => {
    const key = e(mcpAccessEntryKey(row));
    const action = (enabled: boolean, label: string) => `<button type="button" class="mw-btn mw-btn--secondary" data-mcp-grant="${key}" data-grant-enabled="${enabled}">${uiText(label)}</button>`;
    return `<article class="mcp-access-row" data-grant-row="${key}"><div class="mcp-access-copy"><h3>${e(row.title)}</h3><p>${e(row.description)}</p><span class="mcp-access-origin">${e(row.provider_title)} · v${row.version} · ${uiText(row.kind === "query" ? "workbench.mcp-access.query" : row.kind === "judgment" ? "workbench.mcp-access.evaluation" : "workbench.mcp-access.action")}</span><p class="mcp-access-state" data-status="${row.status}" data-mw-state="${row.status === "enabled" || row.status === "public" ? "ready" : row.status === "stale" || row.status === "ungranted" ? "reauth" : row.status === "disabled" ? "disabled" : "unavailable"}">${uiText(labels[row.status])}${row.reason ? ` · ${e(row.reason)}` : ""}</p><details><summary>${uiText("workbench.mcp-access.view-permissions-identity")}</summary><dl><dt>${uiText("workbench.mcp-access.required-permissions")}</dt><dd>${e(row.permissions.join(", ") || uiText.text("workbench.mcp-access.no-additional-permissions"))}</dd><dt>${uiText("workbench.mcp-access.capabilities")}</dt><dd><code>${e(row.capability_id)}@${row.version}</code></dd><dt>${uiText("workbench.mcp-access.provider")}</dt><dd><code>${e(row.provider_id)}</code></dd></dl></details></div><div class="mcp-access-actions">${row.can_enable ? action(true, row.status === "stale" ? "workbench.mcp-access.update-access" : "workbench.mcp-access.authorize-capability") : ""}${row.can_revoke ? action(false, "workbench.mcp-access.revoke-access") : ""}</div></article>`;
  }).join("") : `<div class="settings-empty"><strong>${uiText("workbench.mcp-access.no-matching-capabilities")}</strong><span>${uiText("workbench.mcp-access.adjust-search-filters-select-another-scope")}</span></div>`}`;
}

export function renderMcpAccess(model: McpAccessModel, projects: readonly { project_id: string; display_name: string }[], desktop: boolean, p: Primitives): string {
  const { escapeHtml: e } = p;
  const scopes = [...projects, ...(model.unavailable_projects ?? []).filter(id => !projects.some(project => project.project_id === id)).map(id => ({ project_id: id, display_name: uiText.text("workbench.mcp-access.removed-project") + " · " + id }))];
  const known = model.clients.some(client => client.id === model.client_id);
  return `<section class="mcp-access" data-mcp-access data-client-id="${e(model.client_id ?? "")}" data-project-id="${e(model.project_id ?? "")}">
    <form class="capability-filters mcp-access-scope" method="get" action="/capabilities/access">${desktop ? '<input type="hidden" name="desktop" value="1">' : ""}<label>${uiText("workbench.mcp-access.client")}<select name="client" data-mcp-client><option value="">${uiText("workbench.mcp-access.select-client")}</option>${model.clients.map(client => `<option value="${e(client.id)}"${client.id === model.client_id ? " selected" : ""}>${e(client.title)}</option>`).join("")}<option value="custom"${model.client_id && !known ? " selected" : ""}>${uiText("workbench.mcp-access.other-client")}</option></select></label><label data-mcp-custom${known || !model.client_id ? " hidden" : ""}>${uiText("workbench.mcp-access.client-identity")}<input name="client_custom" value="${known ? "" : e(model.client_id ?? "")}" placeholder="runtime:my-client" aria-label="${uiText("workbench.mcp-access.client-identity")}"></label><label>${uiText("workbench.mcp-access.access-scope")}<select name="project" aria-label="${uiText("workbench.mcp-access.access-scope")}"><option value="">${uiText("workbench.mcp-access.global-capabilities")}</option>${scopes.map(project => `<option value="${e(project.project_id)}"${project.project_id === model.project_id ? " selected" : ""}>${e(project.display_name)}</option>`).join("")}</select></label><button type="submit" class="mw-btn mw-btn--secondary">${uiText("workbench.mcp-access.view-capabilities")}</button></form>
    <p data-mcp-scope-pending role="status" hidden>${uiText("workbench.mcp-access.scope-changed-select-view-capabilities-load-before-continuing")}</p>
    ${model.scope_error ? `<p role="status">${e(model.scope_error)}</p>` : ""}
    <p class="mcp-access-context">${uiText("workbench.mcp-access.all-sessions-client-share-these-grants-each-project")}${model.client_id?.startsWith("agent:") ? ` ${uiText.text("workbench.mcp-access.built-agent-also-needs-capabilities-chosen-task-character")}` : ""}</p>
    ${model.client_id ? `<div data-mcp-access-result><form class="capability-filters mcp-access-search" data-mcp-access-search><label class="capability-search">${uiText("workbench.mcp-access.search-capabilities")}<input type="search" name="q" value="${e(model.query)}" placeholder="${uiText("workbench.mcp-access.name-purpose-provider")}"></label><label>${uiText("workbench.mcp-access.show")}<select name="filter"><option value="">${uiText("workbench.mcp-access.all")}</option><option value="granted"${model.filter === "granted" ? " selected" : ""}>${uiText("workbench.mcp-access.authorized")}</option><option value="attention"${model.filter === "attention" ? " selected" : ""}>${uiText("workbench.mcp-access.needs-attention")}</option></select></label><button type="submit" class="mw-btn mw-btn--secondary">${uiText("workbench.mcp-access.update-list")}</button></form><p class="mcp-access-feedback" data-mcp-access-feedback role="status" hidden></p><button type="button" class="mw-btn mw-btn--secondary" data-mcp-access-refresh hidden>${uiText("workbench.mcp-access.refresh-confirm-status")}</button><div data-mcp-access-rows>${renderMcpAccessRows(model, p)}</div></div>` : `<div class="settings-empty"><strong>${uiText("workbench.mcp-access.select-client-view-its-capabilities")}</strong><span>${uiText("workbench.mcp-access.authorizing-access-does-not-install-client-use-connection")}</span></div>`}
  </section>`;
}
