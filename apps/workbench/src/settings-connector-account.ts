import { renderBadge, renderCard, renderRadioGroup, renderStatusMark, type MwStatusTone, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { credentialInputs, recommendedMethod, type ConnectorPrimitives } from "./settings-connector-guide.js";
import { renderConnectionStatus } from "./settings-connection-status.js";
import type { ConnectorSettingsCardView, ConnectorSettingsConnection } from "./settings-view.js";

/**
 * One connected account on the service connections page (spec assistant-service-connections §13.1, plan A): what the person sees in
 * the service's open row — four plain rows (account, whether it answers and when that was checked, what it can do, who uses it) and
 * the few actions that matter — and what belongs under the service's 高级 (its name, the key, stop and remove, permission names,
 * diagnostics, the MCP developer tools). Both carry `data-connection-scope`, which the page program acts on; only the account
 * itself is the connection's row (`data-connection-row`).
 */
type Primitives = ConnectorPrimitives;

/** Keys only the place that uses them can test (a model, an image service, Functions, a remote tool): the page offers no check for them (§13.2). */
export const KEY_ONLY_SERVICES: readonly string[] = ["model-api", "image-api", "typesafe", "mcp-bearer"];

/** A time as the person's machine shows it, month-day hour:minute, the way the model settings write their checks. */
export function checkTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.valueOf())) return "";
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The service is rate limiting this connection until then (the check's `retry_at`, at most an hour ahead); none once it has passed. */
export function limitedUntil(connection: ConnectorSettingsConnection, now = Date.now()): string | undefined {
  const at = connection.status?.connectivity.retry_at;
  return at && Date.parse(at) > now ? at : undefined;
}

const mark = (label: string, state: StateRingState, tone: MwStatusTone) => renderStatusMark({ label, state, tone, plain: true });

/** Whether the account answers, with when it was last known: stopped, signed out, rate limited, never checked, checked, or why not. */
function reachability(connection: ConnectorSettingsConnection, p: Primitives): string {
  const { L } = p, connectivity = connection.status?.connectivity;
  if (connection.enabled === false) return mark(L("已停用"), "disabled", "quiet");
  if (connection.state === "disconnected") return mark(L("已断开"), "disconnected", "quiet");
  if (connection.state === "reauth_required") return mark(L("登录失效了，要重新登录"), "reauth", "attention");
  const limited = limitedUntil(connection);
  if (limited) return `<span data-connection-retry-at="${p.escapeHtml(limited)}">${mark(L("服务那边暂时限流 · {time} 后自动再查", { time: checkTime(limited) }), "retrying", "hold")}</span>`;
  const time = connectivity?.observed_at ? checkTime(connectivity.observed_at) : "";
  if (!connectivity || connectivity.state === "unchecked") return mark(L("还没检查过"), "idle", "quiet");
  if (connectivity.state === "connected") return mark(time ? L("连得上 · {time} 检查", { time }) : L("连得上"), "connected", "done");
  if (connectivity.state === "failed") return mark(time ? L("没通过检查 · {time}", { time }) : L("没通过检查"), "failed", "blocked");
  return mark(L("结果未确认"), "verify", "quiet");
}

/** What the account can do, in the service's own words; the permission names are under 高级. */
function abilities(card: ConnectorSettingsCardView | undefined, connection: ConnectorSettingsConnection, p: Primitives): string {
  const { L } = p, can = (card?.capabilities ?? []).filter(entry => entry.fulfillment === "live").map(entry => L(entry.label));
  const tools = connection.status?.capabilities.entries.filter(entry => entry.available).length ?? 0;
  if (connection.auth_method === "mcp" && tools) return L("能用 {count} 项工具", { count: tools });
  if (!can.length) return L("连上后按服务给的权限用");
  return can.length > 3 ? L("{list} 等 {count} 项", { list: can.slice(0, 3).join(L("、")), count: can.length }) : can.join(L("、"));
}

/** Who may use the connection and whether the person may change it here: theirs, a project's, or an account an official client keeps. */
function manageable(connection: ConnectorSettingsConnection): { project: boolean; own: boolean } {
  const project = Boolean(connection.project_id);
  return { project, own: !project && (connection.source !== "external" || connection.auth_method === "cli") };
}

function checkable(connection: ConnectorSettingsConnection): boolean {
  return Boolean(connection.project_id) || connection.state !== "disconnected" && !KEY_ONLY_SERVICES.includes(connection.service_id);
}

function scopeAttrs(connection: ConnectorSettingsConnection, p: Primitives): string {
  const e = p.escapeHtml;
  return `data-connection-scope="${e(connection.connection_id)}" data-connection-service="${e(connection.service_id)}" data-connection-auth="${e(connection.auth_method)}" data-connection-name="${e(connection.display_name)}" data-connection-revision="${e(connection.revision)}"${connection.mcp_endpoint ? ` data-connection-endpoint="${e(connection.mcp_endpoint)}"` : ""}`;
}

const accountName = (connection: ConnectorSettingsConnection) => connection.account_label || connection.display_name;

/**
 * 换账号 is switching among the service's accounts (§13.2, user 11-05): the places that use this one move to another connected one,
 * or to one more account logged in now; this one stays and keeps working. The choice is drawn here and shown in place.
 */
function renderSwitch(connection: ConnectorSettingsConnection, others: readonly ConnectorSettingsConnection[], p: Primitives): string {
  const { L, escapeHtml: e } = p;
  const items = [
    ...others.map((other, index) => ({ value: other.connection_id, label: L("{account} · 已连上", { account: accountName(other) }), checked: index === 0 })),
    { value: "add", label: L("再加一个账号 · 在浏览器登录后切过去"), checked: !others.length },
  ];
  return `<div class="settings-connection-switch" data-connection-switch-panel hidden>
    ${renderRadioGroup({ legend: L("用到 {account} 的地方换成哪个账号", { account: accountName(connection) }), name: `switch-${connection.connection_id}`, items })}
    <p class="mw-field__hint">${e(L("{account} 留着、照常可用；用到它的地方切过去，正在跑的那件用原账号做完。", { account: accountName(connection) }))}</p>
    <div class="settings-connection-row__actions"><button class="mw-btn mw-btn--primary" type="button" data-connection-switch-go>${e(L("切过去"))}</button><button class="mw-btn mw-btn--secondary" type="button" data-connection-switch-cancel>${e(L("先不换"))}</button></div>
  </div>`;
}

/**
 * The account's four rows and its actions, in the service's open row. `others` are the service's other connected accounts this
 * person manages, the ones 换账号 can move to.
 */
export function renderConnectionAccount(connection: ConnectorSettingsConnection, card: ConnectorSettingsCardView | undefined, p: Primitives, others: readonly ConnectorSettingsConnection[] = []): string {
  const { L, escapeHtml: e } = p;
  const id = e(connection.connection_id), { project, own } = manageable(connection);
  const key = connection.auth_method === "token" && !connection.account_label;
  const row = (title: string, note: string, value: string) => `<div class="settings-setting-row"><span class="setting-copy"><strong>${title}</strong><span>${note}</span></span><span class="setting-value">${value}</span></div>`;
  const declared = connection.declared_by ? ` <small data-connection-declared-by>${e(L("建于"))} · ${e(connection.declared_by.title)}</small>` : "";
  const named = connection.account_label && connection.account_label !== connection.display_name ? e(connection.display_name) : e(L(key ? "只存在本机，页面和助理都看不到原文" : "你登录的账号"));
  const where = connection.target_origin ? ` · ${e(connection.target_origin)}` : "";
  const reachNote = connection.reauth_note ? `<small data-connection-reauth-note>${e(L(connection.reauth_note))}</small>` : e(L(checkable(connection) ? "最近一次检查" : "在用它的地方检查"));
  const facts = renderCard({ className: "connection-facts", body: [
    row(e(L(key ? "这把密钥" : "这个账号")), `${named}${where}${declared}`, `<strong>${e(accountName(connection))}</strong>`),
    row(e(L("连得上吗")), reachNote, `<span data-connection-state>${reachability(connection, p)}</span>`),
    row(e(L("能做什么")), e(L("权限原值在下面的「高级」里")), `<span>${e(abilities(card, connection, p))}</span>`),
    row(e(L("谁在用")), e(L("换账号或断开会影响这些")), `<span data-connection-usages="${id}">${e(L("打开时读取…"))}</span>`),
  ].join("") });
  const button = (variant: string, attrs: string, label: string) => `<button class="mw-btn mw-btn--${variant}" type="button" ${attrs}>${e(label)}</button>`;
  const relogin = card && own && ["oauth", "mcp"].includes(connection.auth_method);
  const expired = connection.state === "reauth_required";
  const switchable = Boolean(card && own && connection.auth_method === "oauth" && connection.state !== "disconnected");
  const actions = connection.enabled === false ? (own || project ? button("primary", 'data-connection-manage="enable"', L("启用")) : "") : [
    relogin && expired ? button("primary", `data-connection-reauthorize="${id}" data-connection-method="${connection.auth_method}"`,
      connection.auth_method === "oauth" ? L("用 {account} 重新登录", { account: accountName(connection) }) : L("重新登录")) : "",
    checkable(connection) ? button("secondary", `data-connection-check="${id}"`, L("检查连接")) : "",
    relogin && !expired ? button("secondary", `data-connection-reauthorize="${id}" data-connection-method="${connection.auth_method}"`, L(connection.auth_method === "mcp" ? "重新登录" : "重新授权")) : "",
    switchable ? button("secondary", `data-connection-switch="${id}"`, L("换账号")) : "",
    own && connection.auth_method === "token" ? button("secondary", `data-connection-replace-open="${id}"`, L("换密钥")) : "",
    own && connection.state !== "disconnected" ? button("danger-outline", `data-connection-disconnect="${id}"`, L("断开")) : "",
  ].join("");
  const external = project ? `<small>${e(connection.project_id)}</small>` : own ? "" : `<small>${e(L("由外部环境管理凭据"))}</small>`;
  return `<section class="settings-connection-account" data-connection-row="${id}" ${scopeAttrs(connection, p)}>${facts}
    ${actions || external ? `<div class="settings-connection-row__actions">${actions}${external}</div>` : ""}
    ${switchable && connection.enabled !== false ? renderSwitch(connection, others, p) : ""}
    <div class="settings-connection-result" data-connection-result role="status" aria-live="polite" hidden></div>
  </section>`;
}

/** What belongs to the account under the service's 高级: its name, its key, stop and remove, permission names and diagnostics. */
export function renderConnectionManage(connection: ConnectorSettingsConnection, card: ConnectorSettingsCardView | undefined, p: Primitives): string {
  const { L, escapeHtml: e } = p;
  const id = e(connection.connection_id), { project, own } = manageable(connection);
  const name = e(connection.display_name);
  const credential = card ? credentialInputs(card, p) : { fields: `<input class="mw-input" type="password" autocomplete="off" aria-label="${e(L("新令牌"))}" data-connector-token required>`, separator: undefined };
  const scopes = connection.status?.authorization.service.scopes;
  const button = (variant: string, attrs: string, label: string) => `<button class="mw-btn mw-btn--${variant}" type="button" ${attrs}>${e(label)}</button>`;
  return `<section class="settings-connection-manage" ${scopeAttrs(connection, p)}>
    <h4>${name}</h4>
    ${own ? `<form class="settings-connection-inline" data-connection-rename="${id}"><label class="settings-connector-field"><span>${e(L("连接名称"))}</span><input class="mw-input" value="${name}" maxlength="100" required></label><button class="mw-btn mw-btn--secondary" type="submit">${e(L("改名"))}</button></form>` : ""}
    ${own && connection.auth_method === "token" ? `<form class="settings-connection-inline" data-connection-replace="${id}"${credential.separator ? ` data-credential-separator="${credential.separator}"` : ""}>${credential.fields}<button class="mw-btn mw-btn--secondary" type="submit">${e(L("换上新密钥"))}</button></form>` : ""}
    <div class="settings-connection-row__actions">
      ${checkable(connection) ? button("secondary", `data-connection-preview="${id}"`, L(connection.auth_method === "mcp" ? "查看可用工具" : "查看读取结果")) : ""}
      ${own || project ? `${connection.enabled === false ? "" : button("secondary", 'data-connection-manage="disable"', L("停用"))}${button("danger-outline", 'data-connection-manage="remove"', L("移除"))}` : ""}
    </div>
    <div class="settings-connection-scopes"><span>${e(L("权限原值"))}</span>${scopes?.length ? scopes.map(scope => renderBadge({ label: scope })).join("") : `<small>${e(L("服务没有报告权限范围"))}</small>`}</div>
    ${renderConnectionStatus(connection.status, p)}
    ${!project && connection.auth_method === "mcp" && connection.state !== "disconnected" ? `<details class="settings-connection-tool"><summary>${L("开发者工具：手动调用 MCP")}</summary><label class="settings-connector-field"><span>${L("工具名称（先查看工具列表）")}</span><input class="mw-input" data-mcp-tool-name></label><label class="settings-connector-field"><span>${L("参数 JSON")}</span><textarea class="mw-input" data-mcp-tool-arguments rows="4">{}</textarea></label><p>${L("根据工具说明确认作用范围；点击后会执行该工具，包括它声明的写入操作。")}</p><button type="button" class="mw-btn mw-btn--secondary" data-mcp-tool-call="${id}">${L("执行工具")}</button></details><details class="settings-connection-tool"><summary>${L("开发者工具：读取 MCP 资源")}</summary><label class="settings-connector-field"><span>URI</span><input class="mw-input" data-mcp-resource-uri></label><button type="button" class="mw-btn mw-btn--secondary" data-mcp-resource-read="${id}">${L("读取资源")}</button></details>` : ""}
    <div class="settings-connection-result" data-connection-result role="status" aria-live="polite" hidden></div>
  </section>`;
}

/** The service row's one state: the worst that needs the person first, else connected and as whom, else how it can be connected. */
export function serviceState(card: ConnectorSettingsCardView, connections: readonly ConnectorSettingsConnection[], p: Primitives): string {
  const { L, escapeHtml: e } = p;
  const tag = (tone: string, ring: string, label: string) => `<span class="settings-state settings-state--${tone}" data-connector-state data-mw-state="${ring}">${e(label)}</span>`;
  const live = connections.filter(connection => connection.state !== "disconnected"), on = live.filter(connection => connection.enabled !== false);
  if (on.some(connection => connection.state === "reauth_required")) return tag("warning", "reauth", L("需重新授权"));
  if (on.some(connection => limitedUntil(connection))) return tag("warning", "retrying", L("暂时限流"));
  if (on.some(connection => connection.status?.connectivity.state === "failed")) return tag("danger", "failed", L("没通过检查"));
  if (on.length === 1) return tag("success", "connected", L("已连接 · {account}", { account: on[0]!.account_label || on[0]!.display_name }));
  if (on.length) return tag("success", "connected", L("已连接 {count} 个账号", { count: on.length }));
  if (live.length) return tag("neutral", "disabled", L("已停用"));
  if (card.availability === "placeholder") return tag("neutral", "unavailable", L("暂未接入"));
  return recommendedMethod(card) ? tag("neutral", "disconnected", L("未连接")) : tag("neutral", "unavailable", L("还不能一键连接"));
}

/** Connections listed for a service first: those that need the person, then those in use, then stopped and disconnected ones. */
export function connectionOrder(connection: Pick<ConnectorConnectionView, "state" | "enabled">): number {
  return connection.state === "reauth_required" ? 0 : connection.state === "disconnected" ? 3 : connection.enabled === false ? 2 : 1;
}
