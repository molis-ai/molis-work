import { t as uiText, icon as designIcon, renderAlert, renderButton, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderFunctionsSettings } from "./judgment-rules/settings-ui.js";
import type { ConnectorConnectionView, ConnectorDirectoryGroupId } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorCardText, CONNECTOR_NAME_MAX_CHARS, CONNECTOR_SOURCE_MAX_CHARS, CONNECTOR_SUMMARY_MAX_CHARS, connectorPurpose, recommendedMethod, renderConnectorConnect, renderConnectorWays } from "./settings-connector-guide.js";
import { connectionOrder, renderConnectionAccount, renderConnectionManage, serviceState } from "./settings-connector-account.js";
import { connectorMark } from "./connector-marks.js";
import { renderConnectionItem, renderConnectionProgress } from "./service-connection-parts.js";
import type { ConnectorSettingsCardView, ConnectorSettingsConnection, MolisWorkSettingsView } from "./settings-view.js";
import { renderConnectorRequest } from "./settings-connector-request.js";
import { renderPluginSlots } from "./settings-plugin-slots.js";

/**
 * 设置 › 服务连接, plan A of the service-connection decision (specs/assistant-service-connections §13.1, 2026-11-04): one column of
 * services grouped by what they are for; a press on a row opens it in place (`renderConnectionItem`), with the service's accounts —
 * four plain rows each — or its one way to connect, and a folded 高级 at the bottom for an own app, addresses, other ways, permission
 * names and diagnostics. The page program is `CONNECTORS_SETTINGS_CLIENT_SCRIPT`; what the parts do in place is
 * src/browser/service-connection-item.ts.
 */
interface ConnectorsSettingsPrimitives {
  readText(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "link" | "mail" | "back" | "tree"): string;
  /** Where the docs page that lists every outbound network class is read, in the interface language; no link without it. */
  networkDocHref?: string;
}

/** The page's groups, by what a service is for; the directory's groups are the contract's and stay as they are. */
const DISPLAY_GROUPS: ReadonlyArray<{ id: string; title: string; directory: readonly ConnectorDirectoryGroupId[] }> = [
  { id: "models", title: "模型", directory: [] },
  { id: "code", title: "代码与项目", directory: ["code", "work"] },
  { id: "mail", title: "邮件与日程", directory: ["mail"] },
  { id: "docs", title: "文档与笔记", directory: ["files"] },
  { id: "chat", title: "消息", directory: ["chat", "social"] },
  { id: "design", title: "设计", directory: ["design"] },
  { id: "crm", title: "客户与销售", directory: ["crm"] },
];
const MODEL_SERVICES: readonly string[] = ["model-api", "image-api"];

function displayGroup(card: ConnectorSettingsCardView): string {
  if (MODEL_SERVICES.includes(card.connector_id)) return "models";
  return DISPLAY_GROUPS.find(group => group.directory.includes(card.group_id))?.id ?? "code";
}

export function renderConnectorMark(connectorId: string, escapeHtml: ConnectorsSettingsPrimitives["escapeHtml"]): string {
  const mark = connectorMark(connectorId);
  if (!mark) {
    const symbol = connectorId === "image-api" ? "image" : connectorId === "mcp-bearer" ? "network" : "sparkles";
    if (["image-api", "mcp-bearer", "model-api"].includes(connectorId)) return `<span class="settings-connector-mark" data-connector-mark="${escapeHtml(connectorId)}" data-on="light" aria-hidden="true">${designIcon(symbol)}</span>`;
    return `<span class="settings-connector-mark settings-connector-mark--fallback" data-connector-mark="${escapeHtml(connectorId)}" aria-hidden="true">${escapeHtml(connectorId.slice(0, 2).toUpperCase())}</span>`;
  }
  return `<span class="settings-connector-mark" data-connector-mark="${escapeHtml(connectorId)}" data-on="${mark.on}" aria-hidden="true"><img src="data:image/svg+xml,${encodeURIComponent(mark.svg)}" alt="" width="24" height="24"></span>`;
}

function renderNextSteps(card: ConnectorSettingsCardView, connections: readonly ConnectorConnectionView[], p: ConnectorsSettingsPrimitives): string {
  const { escapeHtml: e } = p;
  const active = connections.filter(connection => connection.state === "connected");
  if (!active.length) return "";
  const instructions: Array<{ text: string; label?: string; href?: string; plugin?: string }> = [];
  if (active.some(row => row.auth_method === "mcp" && row.agent_available !== false) || card.connector_id === "mcp-bearer") instructions.push({ text: uiText.text("workbench.settings-connectors.choose-authorized-account-coding-s-mcp-settings-save"), label: uiText.text("workbench.settings-connectors.set-up-agent-tools"), href: "/settings/coding-settings" });
  if (active.some(row => row.auth_method === "mcp" && row.agent_available === false)) instructions.push({ text: uiText.text("workbench.settings-connectors.connection-uses-provider-s-native-transport-under-advanced") });
  if (active.some(row => row.auth_method === "cli")) instructions.push({ text: uiText.text("workbench.settings-connectors.account-managed-client-machine-can-check-connection-view") });
  if (active.some(row => row.auth_method === "oauth" || row.auth_method === "token")) {
    if (card.connector_id === "model-api") instructions.push({ text: uiText.text("workbench.settings-connectors.choose-connection-model-settings-then-pick-model-check"), label: uiText.text("workbench.settings-connectors.open-model-settings"), href: "/settings/models" });
    else if (card.connector_id === "image-api") instructions.push({ text: uiText.text("workbench.settings-connectors.choose-connection-project-s-images-set-up-image"), label: uiText.text("workbench.settings-connectors.choose-project-open-images"), href: "/", plugin: "images" });
    else if (card.connector_id === "typesafe") instructions.push({ text: uiText.text("workbench.settings-connectors.choose-account-functions"), label: uiText.text("workbench.settings-connectors.see-functions"), href: "/capabilities/library" });
    else if (card.feed_available) instructions.push({ text: uiText.text("workbench.settings-connectors.project-s-feed-add-source-choose-connected-api"), label: uiText.text("workbench.settings-connectors.choose-project-add-source"), href: "/", plugin: "feed" });
    else if (card.connector_id !== "mcp-bearer") instructions.push({ text: uiText.text("workbench.settings-connectors.can-check-account-s-authorization-api-connection-doesn") });
  }
  if (!instructions.length) return "";
  return `<section class="settings-connector-next" data-connector-next><h3>${uiText("workbench.settings-connectors.once-connected")}</h3>${instructions.map(step => `<div class="settings-connector-next__step"><p>${e(step.text)}</p>${step.href ? `<a class="mw-btn mw-btn--secondary" data-connector-next-link="${e(step.plugin || "")}" href="${e(step.href)}">${e(step.label!)}</a>` : ""}</div>`).join("")}</section>`;
}

/** The folded 高级 at the bottom of a service (§13.1 ② plan A): each account's own settings, then the other ways to connect. */
function renderAdvanced(body: string, _p: ConnectorsSettingsPrimitives): string {
  return body.trim() ? `<details class="mw-collapsible settings-connector-advanced" data-slot="collapsible" data-connector-advanced><summary>${uiText("workbench.settings-connectors.advanced")}</summary><div class="mw-collapsible__body">${body}</div></details>` : "";
}

/** A service's open part: what it is, its accounts, the way to connect it (or one more account), what to do next, and 高级. */
function renderServiceBody(card: ConnectorSettingsCardView, connections: readonly ConnectorSettingsConnection[], view: Pick<MolisWorkSettingsView, "functions_settings">, p: ConnectorsSettingsPrimitives): string {
  const { readText, escapeHtml: e } = p;
  // null is the platform's own; an object names the declaring package; undefined means nothing said where the service comes from, so
  // no source line is shown rather than a trust label the page cannot back.
  const source = card.declared_by === null ? uiText.text("workbench.settings-connectors.molis-work-built")
    : card.declared_by ? connectorCardText(card.declared_by.title, CONNECTOR_SOURCE_MAX_CHARS) : undefined;
  const live = connections.filter(connection => connection.state !== "disconnected");
  const connect = renderConnectorConnect(card, p);
  const add = live.length && card.availability !== "placeholder"
    ? `<details class="mw-collapsible settings-connector-add" data-slot="collapsible" data-connector-add><summary>${uiText(recommendedMethod(card) ? "workbench.settings-connectors.add-another-account" : "workbench.settings-connectors.add-another-account-key")}</summary><div class="mw-collapsible__body settings-connector-flow">${connect}</div></details>`
    : `<div class="settings-connector-flow" data-connector-add>${connect}</div>`;
  return `<div class="settings-connector-panel" data-connector-detail="${e(card.connector_id)}">
    ${source === undefined ? "" : `<p class="settings-connector-source"><small data-connector-source>${e(uiText.text("workbench.settings-connectors.package", { package: source }))}</small></p>`}
    <div class="settings-connector-feedback" data-connector-feedback role="status" aria-live="polite" tabindex="-1" hidden></div>
    ${connections.map(connection => renderConnectionAccount(connection, card, p, connections.filter(other => other !== connection && other.state === "connected" && other.enabled !== false && !other.project_id && other.auth_method === connection.auth_method))).join("")}
    ${card.connector_id === "typesafe" && view.functions_settings ? renderFunctionsSettings({ ...view.functions_settings, embedded: true, primitives: { escape: e, text: readText } }) : ""}
    ${add}
    ${renderNextSteps(card, connections, p)}
    ${renderAdvanced(connections.map(connection => renderConnectionManage(connection, card, p)).join("") + renderConnectorWays(card, p), p)}
  </div>`;
}

export function renderConnectorsSettings(
  view: Pick<MolisWorkSettingsView, "connectors" | "connector_connections" | "connector_setup" | "capabilities" | "functions_settings" | "plugin_slots" | "context_project">,
  primitives: ConnectorsSettingsPrimitives,
): string {
  const { readText, escapeHtml } = primitives;
  const cards = view.connectors ?? [];
  if (view.connector_setup !== undefined) return renderConnectorRequest(view.connector_setup, cards, primitives);
  const connections = [...view.connector_connections ?? []].sort((a, b) => connectionOrder(a) - connectionOrder(b));
  const of = (serviceId: string) => connections.filter(connection => connection.service_id === serviceId);
  // Within a group: services that have an account first, then those that connect now, then those not in yet.
  const rank = (card: ConnectorSettingsCardView) => of(card.connector_id).some(connection => connection.state !== "disconnected") ? 0 : card.availability === "placeholder" ? 2 : 1;
  const item = (card: ConnectorSettingsCardView) => {
    const purpose = connectorPurpose(card, readText);
    return renderConnectionItem({
      id: `connector-${card.connector_id}`, mark: renderConnectorMark(card.connector_id, escapeHtml),
      // A package writes the row's words: the row shows them within their limits, cut in whole characters; the search reads them whole.
      name: connectorCardText(card.title, CONNECTOR_NAME_MAX_CHARS), caption: connectorCardText(purpose, CONNECTOR_SUMMARY_MAX_CHARS),
      state: serviceState(card, of(card.connector_id), primitives), body: renderServiceBody(card, of(card.connector_id), view, primitives),
      attrs: { "data-connector-item": card.connector_id, "data-connector-search": `${card.title} ${card.connector_id} ${purpose}`.toLowerCase() },
    }, readText);
  };
  const groups = DISPLAY_GROUPS.map(group => {
    const rows = cards.filter(card => displayGroup(card) === group.id).map((card, index) => ({ card, index })).sort((a, b) => rank(a.card) - rank(b.card) || a.index - b.index);
    return rows.length ? `<section class="settings-connector-subgroup" data-connector-subgroup="${group.id}"><h3>${uiText.text(group.title)}</h3>${rows.map(row => item(row.card)).join("")}</section>` : "";
  }).join("");
  // A connection whose service is no longer declared (its package was removed) has no way to connect left: its row opens on the account
  // and what can still be done with it.
  const orphans = connections.filter(connection => !cards.some(card => card.connector_id === connection.service_id));
  const orphanGroup = orphans.length ? `<section class="settings-connector-subgroup" data-connector-subgroup="orphan"><h3>${uiText("workbench.settings-connectors.no-longer-catalog")}</h3>${orphans.map(connection => renderConnectionItem({
    id: `connection-${connection.connection_id}`, mark: renderConnectorMark(connection.service_id, escapeHtml), name: connection.display_name,
    caption: uiText.text("workbench.settings-connectors.plugin-that-provided-gone-connection-remains-can-be"), state: `<span class="settings-state settings-state--neutral" data-connector-state data-mw-state="unavailable">${escapeHtml(uiText.text("workbench.settings-connectors.not-catalog"))}</span>`,
    // Not a service the page can open or connect: no `data-connector-item`, no service panel, only this account and what can be done with it.
    body: `<div class="settings-connector-panel">${renderConnectionAccount(connection, undefined, primitives)}${renderAdvanced(renderConnectionManage(connection, undefined, primitives), primitives)}</div>`,
    attrs: { "data-connector-orphan": connection.connection_id, "data-connector-search": `${connection.display_name} ${connection.service_id}`.toLowerCase() },
  }, readText)).join("")}</section>` : "";
  // Under the heading, like the MCP page's link to the external-tools page: a footnote below the whole catalog is rarely seen.
  const networkDoc = primitives.networkDocHref ? `<p data-network-doc>${uiText("workbench.settings-connectors.everywhere-molis-work-goes-online-itself-models-search")}<a href="${escapeHtml(primitives.networkDocHref)}" target="_blank" rel="noopener noreferrer">${uiText("workbench.settings-connectors.where-molis-work-connects")}</a></p>` : "";
  return `<section class="settings-document" aria-labelledby="settings-title" data-connectors-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-connectors.service-connections")}</h1></div><p>${uiText("workbench.settings-connectors.connect-apps-use-bring-work-tools-into-molis")}</p>${networkDoc}</header>
    <div class="settings-body">
      <p class="settings-form-error" data-connectors-error role="alert" hidden></p>
      <div class="settings-connector-catalog" data-connectors-list>
        <label class="settings-connector-field settings-connector-search"><span>${uiText("workbench.settings-connectors.search-services")}</span><input class="mw-input" type="search" data-connectors-search placeholder="${uiText("workbench.settings-connectors.search-gmail-notion-feishu")}"></label>
        <p class="settings-connector-empty" data-connectors-no-results role="status" hidden><span>${uiText("workbench.settings-connectors.no-service-matches-try-another-word")}</span><button type="button" class="mw-btn mw-btn--secondary" data-connectors-reset>${uiText("workbench.settings-connectors.clear-search")}</button></p>
        ${groups}${orphanGroup}
      </div>
      ${renderPluginSlots(view, cards, connections, { readText, escapeHtml, mark: serviceId => renderConnectorMark(serviceId, escapeHtml) })}
      ${CLIENT_TEMPLATES(primitives)}
    </div>
  </section>`;
}

/**
 * What the page program draws in place, written once here so the program never writes the words or the markup again: the step
 * progress of a login and of a key (`renderConnectionProgress`), and the row's running state.
 */
function CLIENT_TEMPLATES(p: ConnectorsSettingsPrimitives): string {
  const progress = (steps: readonly string[]) => renderConnectionProgress({ steps: steps.map(step => uiText.text(step)), at: 0, state: "running" }, p.readText);
  return `<template data-connector-template="progress-login">${progress(["在浏览器登录", "看能做什么", "能用了"])}</template>
    <template data-connector-template="progress-key">${progress(["填密钥", "验证密钥", "能用了"])}</template>
    <template data-connector-template="running">${renderStatusMark({ label: uiText.text("workbench.settings-connectors.connecting"), state: "running", tone: "progress", plain: true })}</template>
    <template data-connector-template="switching">${renderStatusMark({ label: uiText.text("workbench.settings-connectors.switch-account"), state: "answer", tone: "attention", plain: true })}</template>
    <template data-connector-template="reach-connected">${renderStatusMark({ label: uiText.text("workbench.settings-connectors.reachable-checked-time"), state: "connected", tone: "done", plain: true })}</template>
    <template data-connector-template="reach-failed">${renderStatusMark({ label: uiText.text("workbench.settings-connectors.check-failed-time"), state: "failed", tone: "blocked", plain: true })}</template>
    <template data-connector-template="reach-limited">${renderStatusMark({ label: uiText.text("workbench.settings-connectors.rate-limited-service-checks-again-time"), state: "retrying", tone: "hold", plain: true })}</template>
    <template data-connector-template="draft">${draftNote(p)}</template>`;
}

/** The note before 高级 when it holds changes not saved in this window: the alert as it is, and its two answers under it. */
function draftNote(_p: ConnectorsSettingsPrimitives): string {
  const answer = (attr: string, label: string) => renderButton({ label: uiText.text(label), variant: "secondary", attrs: { [attr]: "" } });
  const alert = renderAlert({ title: uiText.text("workbench.settings-connectors.advanced-has-changes-didn-t-save"), body: uiText.text("workbench.settings-connectors.kept-only-window-keys-aren-t-kept-must") });
  return `<div class="settings-connector-draft" data-connector-draft>${alert}<div class="settings-connector-actions">${answer("data-draft-resume", "workbench.settings-connectors.keep-editing")}${answer("data-draft-drop", "workbench.settings-connectors.discard-changes")}</div></div>`;
}
