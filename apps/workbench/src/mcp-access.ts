import type { SettingsRenderPrimitives } from "./settings-renderer.js";
type Primitives = Pick<SettingsRenderPrimitives, "L" | "escapeHtml">;

export interface McpAccessEntry {
  capability_id: string; version: number; provider_id: string;
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
const labels: Record<McpAccessEntry["status"], string> = { ungranted: "未授权", enabled: "已授权", disabled: "授权已撤销", unavailable: "暂不可用", stale: "需要重新授权", missing: "原能力已失效", public: "默认开放" };
export const mcpAccessEntryKey = (entry: Pick<McpAccessEntry, "capability_id" | "version" | "provider_id">) => JSON.stringify([entry.capability_id, entry.version, entry.provider_id]);

export function renderMcpAccessRows(model: Pick<McpAccessModel, "entries" | "query" | "filter">, p: Primitives): string {
  const { L, escapeHtml: e } = p;
  const needle = model.query.trim().toLocaleLowerCase();
  const entries = model.entries.filter(row => (!needle || `${row.title} ${row.description} ${row.provider_title} ${row.capability_id}`.toLocaleLowerCase().includes(needle))
    && (model.filter !== "granted" || row.can_revoke) && (model.filter !== "attention" || ["stale", "missing", "unavailable"].includes(row.status)));
  return `<p class="mcp-access-count" role="status">${L("共 {count} 项", { count: entries.length })}</p>${entries.length ? entries.map(row => {
    const key = e(mcpAccessEntryKey(row));
    const action = (enabled: boolean, label: string) => `<button type="button" class="mw-btn mw-btn--secondary" data-mcp-grant="${key}" data-grant-enabled="${enabled}">${L(label)}</button>`;
    return `<article class="mcp-access-row" data-grant-row="${key}"><div class="mcp-access-copy"><h3>${e(row.title)}</h3><p>${e(L(row.description))}</p><span class="mcp-access-origin">${e(row.provider_title)} · v${row.version} · ${L(row.kind === "query" ? "查询" : row.kind === "judgment" ? "判断" : "操作")}</span><p class="mcp-access-state" data-status="${row.status}">${L(labels[row.status])}${row.reason ? ` · ${e(L(row.reason))}` : ""}</p><details><summary>${L("查看权限与能力身份")}</summary><dl><dt>${L("所需权限")}</dt><dd>${e(row.permissions.join(", ") || L("无额外权限"))}</dd><dt>${L("能力")}</dt><dd><code>${e(row.capability_id)}@${row.version}</code></dd><dt>${L("提供方")}</dt><dd><code>${e(row.provider_id)}</code></dd></dl></details></div><div class="mcp-access-actions">${row.can_enable ? action(true, row.status === "stale" ? "更新授权" : "授权此能力") : ""}${row.can_revoke ? action(false, "撤销授权") : ""}</div></article>`;
  }).join("") : `<div class="settings-empty"><strong>${L("没有符合条件的能力")}</strong><span>${L("调整搜索或筛选条件，或选择其他范围。")}</span></div>`}`;
}

export function renderMcpAccess(model: McpAccessModel, projects: readonly { project_id: string; display_name: string }[], desktop: boolean, p: Primitives): string {
  const { L, escapeHtml: e } = p;
  const scopes = [...projects, ...(model.unavailable_projects ?? []).filter(id => !projects.some(project => project.project_id === id)).map(id => ({ project_id: id, display_name: L("已移除的项目") + " · " + id }))];
  const known = model.clients.some(client => client.id === model.client_id);
  return `<section class="mcp-access" data-mcp-access data-client-id="${e(model.client_id ?? "")}" data-project-id="${e(model.project_id ?? "")}">
    <form class="capability-filters mcp-access-scope" method="get" action="/capabilities/access">${desktop ? '<input type="hidden" name="desktop" value="1">' : ""}<label>${L("客户端")}<select name="client" data-mcp-client><option value="">${L("请选择客户端")}</option>${model.clients.map(client => `<option value="${e(client.id)}"${client.id === model.client_id ? " selected" : ""}>${e(client.title)}</option>`).join("")}<option value="custom"${model.client_id && !known ? " selected" : ""}>${L("其他客户端")}</option></select></label><label data-mcp-custom${known || !model.client_id ? " hidden" : ""}>${L("客户端身份")}<input name="client_custom" value="${known ? "" : e(model.client_id ?? "")}" placeholder="runtime:my-client" aria-label="${L("客户端身份")}"></label><label>${L("授权范围")}<select name="project" aria-label="${L("授权范围")}"><option value="">${L("全局能力")}</option>${scopes.map(project => `<option value="${e(project.project_id)}"${project.project_id === model.project_id ? " selected" : ""}>${e(project.display_name)}</option>`).join("")}</select></label><button type="submit" class="mw-btn mw-btn--secondary">${L("查看能力")}</button></form>
    <p data-mcp-scope-pending role="status" hidden>${L("范围已更改，请点击「查看能力」加载后再操作。")}</p>
    ${model.scope_error ? `<p role="status">${e(L(model.scope_error))}</p>` : ""}
    <p class="mcp-access-context">${L("同一客户端的所有会话共用此授权；每个项目与全局范围分别配置。")}</p>
    ${model.client_id ? `<div data-mcp-access-result><form class="capability-filters mcp-access-search" data-mcp-access-search><label class="capability-search">${L("搜索能力")}<input type="search" name="q" value="${e(model.query)}" placeholder="${L("名称、用途或来源")}"></label><label>${L("显示")}<select name="filter"><option value="">${L("全部")}</option><option value="granted"${model.filter === "granted" ? " selected" : ""}>${L("已授权")}</option><option value="attention"${model.filter === "attention" ? " selected" : ""}>${L("需要处理")}</option></select></label><button type="submit" class="mw-btn mw-btn--secondary">${L("更新列表")}</button></form><p class="mcp-access-feedback" data-mcp-access-feedback role="status" hidden></p><button type="button" class="mw-btn mw-btn--secondary" data-mcp-access-refresh hidden>${L("刷新确认状态")}</button><div data-mcp-access-rows>${renderMcpAccessRows(model, p)}</div></div>` : `<div class="settings-empty"><strong>${L("选择一个客户端，查看它能使用的能力")}</strong><span>${L("授权不会安装客户端；需要连接时可使用上方的接入入口。")}</span></div>`}
  </section>`;
}
