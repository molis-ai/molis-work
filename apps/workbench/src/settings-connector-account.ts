import { t as uiText, renderBadge, renderCard, renderRadioGroup, renderStatusMark, type MwStatusTone, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
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
  const connectivity = connection.status?.connectivity;
  if (connection.enabled === false) return mark(uiText.text("workbench.settings-connector-account.switched-off"), "disabled", "quiet");
  if (connection.state === "disconnected") return mark(uiText.text("workbench.settings-connector-account.disconnected"), "disconnected", "quiet");
  if (connection.state === "reauth_required") return mark(uiText.text("workbench.settings-connector-account.signed-out-sign-again"), "reauth", "attention");
  const limited = limitedUntil(connection);
  if (limited) return `<span data-connection-retry-at="${p.escapeHtml(limited)}">${mark(uiText.text("workbench.settings-connector-account.rate-limited-service-checks-again-time", { time: checkTime(limited) }), "retrying", "hold")}</span>`;
  const time = connectivity?.observed_at ? checkTime(connectivity.observed_at) : "";
  if (!connectivity || connectivity.state === "unchecked") return mark(uiText.text("workbench.settings-connector-account.not-checked-yet"), "idle", "quiet");
  if (connectivity.state === "connected") return mark(time ? uiText.text("workbench.settings-connector-account.reachable-checked-time", { time }) : uiText.text("workbench.settings-connector-account.reachable"), "connected", "done");
  if (connectivity.state === "failed") return mark(time ? uiText.text("workbench.settings-connector-account.check-failed-time", { time }) : uiText.text("workbench.settings-connector-account.check-failed"), "failed", "blocked");
  return mark(uiText.text("workbench.settings-connector-account.result-unconfirmed"), "verify", "quiet");
}

/** What the account can do, in the service's own words; the permission names are under 高级. */
function abilities(card: ConnectorSettingsCardView | undefined, connection: ConnectorSettingsConnection): string {
  const can = (card?.capabilities ?? []).filter(entry => entry.fulfillment === "live").map(entry => entry.label);
  const tools = connection.status?.capabilities.entries.filter(entry => entry.available).length ?? 0;
  if (connection.auth_method === "mcp" && tools) return uiText.text("workbench.settings-connector-account.count-count-available", { count: tools });
  if (!can.length) return uiText.text("workbench.settings-connector-account.uses-what-service-grants");
  return can.length > 3 ? uiText.text("workbench.settings-connector-account.list-more-count", { list: can.slice(0, 3).join(uiText.text("common.list.separator")), count: can.length }) : can.join(uiText.text("common.list.separator"));
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
  const { escapeHtml: e } = p;
  const items = [
    ...others.map((other, index) => ({ value: other.connection_id, label: uiText.text("workbench.settings-connector-account.account-connected", { account: accountName(other) }), checked: index === 0 })),
    { value: "add", label: uiText.text("workbench.settings-connector-account.add-another-account-sign-browser-then-switch"), checked: !others.length },
  ];
  return `<div class="settings-connection-switch" id="connection-switch-${e(connection.connection_id)}" data-connection-switch-panel hidden>
    ${renderRadioGroup({ legend: uiText.text("workbench.settings-connector-account.which-account-should-replace-account-where-used", { account: accountName(connection) }), name: `switch-${connection.connection_id}`, items })}
    <p class="mw-field__hint">${e(uiText.text("workbench.settings-connector-account.account-stays-keeps-working-what-uses-switches-over", { account: accountName(connection) }))}</p>
    <div class="settings-connection-row__actions"><button class="mw-btn mw-btn--primary" type="button" data-connection-switch-go>${e(uiText.text("workbench.settings-connector-account.switch"))}</button><button class="mw-btn mw-btn--secondary" type="button" data-connection-switch-cancel>${e(uiText.text("workbench.settings-connector-account.not-now"))}</button></div>
  </div>`;
}

/**
 * The account's four rows and its actions, in the service's open row. `others` are the service's other connected accounts this
 * person manages, the ones 换账号 can move to.
 */
export function renderConnectionAccount(connection: ConnectorSettingsConnection, card: ConnectorSettingsCardView | undefined, p: Primitives, others: readonly ConnectorSettingsConnection[] = []): string {
  const { escapeHtml: e } = p;
  const id = e(connection.connection_id), { project, own } = manageable(connection);
  const key = connection.auth_method === "token" && !connection.account_label;
  const row = (title: string, note: string, value: string) => `<div class="settings-setting-row"><span class="setting-copy"><strong>${title}</strong><span>${note}</span></span><span class="setting-value">${value}</span></div>`;
  const declared = connection.declared_by ? ` <small data-connection-declared-by>${e(uiText.text("workbench.settings-connector-account.made"))} · ${e(connection.declared_by.title)}</small>` : "";
  const named = connection.account_label && connection.account_label !== connection.display_name ? e(connection.display_name) : e(uiText.text(key ? "workbench.settings-connector-account.kept-machine-neither-page-nor-assistant-sees" : "workbench.settings-connector-account.account-signed"));
  const where = connection.target_origin ? ` · ${e(connection.target_origin)}` : "";
  const reachNote = connection.reauth_note ? `<small data-connection-reauth-note>${e(connection.reauth_note)}</small>` : e(uiText.text(checkable(connection) ? "workbench.settings-connector-account.last-check" : "workbench.settings-connector-account.checked-where-used"));
  const facts = renderCard({ className: "connection-facts", body: [
    row(e(uiText.text(key ? "workbench.settings-connector-account.key" : "workbench.settings-connector-account.account")), `${named}${where}${declared}`, `<strong>${e(accountName(connection))}</strong>`),
    row(e(uiText.text("workbench.settings-connector-account.reachable-2")), reachNote, `<span data-connection-state>${reachability(connection, p)}</span>`),
    row(e(uiText.text("workbench.settings-connector-account.what-can-do")), e(uiText.text("workbench.settings-connector-account.raw-permissions-under-advanced-below")), `<span>${e(abilities(card, connection))}</span>`),
    row(e(uiText.text("workbench.settings-connector-account.used")), e(uiText.text("workbench.settings-connector-account.switching-disconnecting-affects-these")), `<span data-connection-usages="${id}">${e(uiText.text("workbench.settings-connector-account.read-when-opened"))}</span>`),
  ].join("") });
  const button = (variant: string, attrs: string, label: string) => `<button class="mw-btn mw-btn--${variant}" type="button" ${attrs}>${e(label)}</button>`;
  const relogin = card && own && ["oauth", "mcp"].includes(connection.auth_method);
  const expired = connection.state === "reauth_required";
  const switchable = Boolean(card && own && connection.auth_method === "oauth" && connection.state !== "disconnected");
  const actions = connection.enabled === false ? (own || project ? button("primary", 'data-connection-manage="enable"', uiText.text("workbench.settings-connector-account.enable")) : "") : [
    relogin && expired ? button("primary", `data-connection-reauthorize="${id}" data-connection-method="${connection.auth_method}"`,
      connection.auth_method === "oauth" ? uiText.text("workbench.settings-connector-account.sign-again-account", { account: accountName(connection) }) : uiText.text("workbench.settings-connector-account.log-again")) : "",
    checkable(connection) ? button("secondary", `data-connection-check="${id}"`, uiText.text("workbench.settings-connector-account.check-connection")) : "",
    relogin && !expired ? button("secondary", `data-connection-reauthorize="${id}" data-connection-method="${connection.auth_method}"`, uiText.text(connection.auth_method === "mcp" ? "workbench.settings-connector-account.log-again" : "workbench.settings-connector-account.reconnect")) : "",
    switchable ? button("secondary", `data-connection-switch="${id}" aria-expanded="false" aria-controls="connection-switch-${id}"`, uiText.text("workbench.settings-connector-account.switch-account")) : "",
    own && connection.auth_method === "token" ? button("secondary", `data-connection-replace-open="${id}"`, uiText.text("workbench.settings-connector-account.replace-key")) : "",
    own && connection.state !== "disconnected" ? button("danger-outline", `data-connection-disconnect="${id}"`, uiText.text("workbench.settings-connector-account.disconnect")) : "",
  ].join("");
  const external = project ? `<small>${e(connection.project_id)}</small>` : own ? "" : `<small>${e(uiText.text("workbench.settings-connector-account.credentials-managed-externally"))}</small>`;
  return `<section class="settings-connection-account" data-connection-row="${id}" ${scopeAttrs(connection, p)}>${facts}
    ${actions || external ? `<div class="settings-connection-row__actions">${actions}${external}</div>` : ""}
    ${switchable && connection.enabled !== false ? renderSwitch(connection, others, p) : ""}
    <div class="settings-connection-result" data-connection-result role="status" aria-live="polite" hidden></div>
  </section>`;
}

/** What belongs to the account under the service's 高级: its name, its key, stop and remove, permission names and diagnostics. */
export function renderConnectionManage(connection: ConnectorSettingsConnection, card: ConnectorSettingsCardView | undefined, p: Primitives): string {
  const { escapeHtml: e } = p;
  const id = e(connection.connection_id), { project, own } = manageable(connection);
  const name = e(connection.display_name);
  const credential = card ? credentialInputs(card, p) : { fields: `<input class="mw-input" type="password" autocomplete="off" aria-label="${e(uiText.text("workbench.settings-connector-account.new-token"))}" data-connector-token required>`, separator: undefined };
  const scopes = connection.status?.authorization.service.scopes;
  const button = (variant: string, attrs: string, label: string) => `<button class="mw-btn mw-btn--${variant}" type="button" ${attrs}>${e(label)}</button>`;
  return `<section class="settings-connection-manage" ${scopeAttrs(connection, p)}>
    <h4>${name}</h4>
    ${own ? `<form class="settings-connection-inline" data-connection-rename="${id}"><label class="settings-connector-field"><span>${e(uiText.text("workbench.settings-connector-account.connection-name"))}</span><input class="mw-input" value="${name}" maxlength="100" required></label><button class="mw-btn mw-btn--secondary" type="submit">${e(uiText.text("workbench.settings-connector-account.rename"))}</button></form>` : ""}
    ${own && connection.auth_method === "token" ? `<form class="settings-connection-inline" data-connection-replace="${id}"${credential.separator ? ` data-credential-separator="${credential.separator}"` : ""}>${credential.fields}<button class="mw-btn mw-btn--secondary" type="submit">${e(uiText.text("workbench.settings-connector-account.use-new-key"))}</button></form>` : ""}
    <div class="settings-connection-row__actions">
      ${checkable(connection) ? button("secondary", `data-connection-preview="${id}"`, uiText.text(connection.auth_method === "mcp" ? "workbench.settings-connector-account.view-available-tools" : "workbench.settings-connector-account.view-read-results")) : ""}
      ${own || project ? `${connection.enabled === false ? "" : button("secondary", 'data-connection-manage="disable"', uiText.text("workbench.settings-connector-account.deactivate"))}${button("danger-outline", 'data-connection-manage="remove"', uiText.text("workbench.settings-connector-account.remove"))}` : ""}
    </div>
    <div class="settings-connection-scopes"><span>${e(uiText.text("workbench.settings-connector-account.raw-permissions"))}</span>${scopes?.length ? scopes.map(scope => renderBadge({ label: scope })).join("") : `<small>${e(uiText.text("workbench.settings-connector-account.service-reported-no-scopes"))}</small>`}</div>
    ${renderConnectionStatus(connection.status, p)}
    ${!project && connection.auth_method === "mcp" && connection.state !== "disconnected" ? `<details class="settings-connection-tool"><summary>${uiText("workbench.settings-connector-account.developer-tools-call-mcp-manually")}</summary><label class="settings-connector-field"><span>${uiText("workbench.settings-connector-account.tool-name-list-tools-first")}</span><input class="mw-input" data-mcp-tool-name></label><label class="settings-connector-field"><span>${uiText("workbench.settings-connector-account.arguments-json")}</span><textarea class="mw-input" data-mcp-tool-arguments rows="4">{}</textarea></label><p>${uiText("workbench.settings-connector-account.check-scope-tool-s-description-running-performs-tool")}</p><button type="button" class="mw-btn mw-btn--secondary" data-mcp-tool-call="${id}">${uiText("workbench.settings-connector-account.run-tool")}</button></details><details class="settings-connection-tool"><summary>${uiText("workbench.settings-connector-account.developer-tools-read-mcp-resource")}</summary><label class="settings-connector-field"><span>URI</span><input class="mw-input" data-mcp-resource-uri></label><button type="button" class="mw-btn mw-btn--secondary" data-mcp-resource-read="${id}">${uiText("workbench.settings-connector-account.read-resource")}</button></details>` : ""}
    <div class="settings-connection-result" data-connection-result role="status" aria-live="polite" hidden></div>
  </section>`;
}

/** The service row's one state: the worst that needs the person first, else connected and as whom, else how it can be connected. */
export function serviceState(card: ConnectorSettingsCardView, connections: readonly ConnectorSettingsConnection[], p: Primitives): string {
  const { escapeHtml: e } = p;
  const tag = (tone: string, ring: string, label: string) => `<span class="settings-state settings-state--${tone}" data-connector-state data-mw-state="${ring}">${e(label)}</span>`;
  const live = connections.filter(connection => connection.state !== "disconnected"), on = live.filter(connection => connection.enabled !== false);
  if (on.some(connection => connection.state === "reauth_required")) return tag("warning", "reauth", uiText.text("workbench.settings-connector-account.reauthorization-required"));
  if (on.some(connection => limitedUntil(connection))) return tag("warning", "retrying", uiText.text("workbench.settings-connector-account.rate-limited"));
  if (on.some(connection => connection.status?.connectivity.state === "failed")) return tag("danger", "failed", uiText.text("workbench.settings-connector-account.check-failed"));
  if (on.length === 1) return tag("success", "connected", uiText.text("workbench.settings-connector-account.connected-account", { account: on[0]!.account_label || on[0]!.display_name }));
  if (on.length) return tag("success", "connected", uiText.text("workbench.settings-connector-account.count-count-connected", { count: on.length }));
  if (live.length) return tag("neutral", "disabled", uiText.text("workbench.settings-connector-account.switched-off"));
  if (card.availability === "placeholder") return tag("neutral", "unavailable", uiText.text("workbench.settings-connector-account.not-available-yet"));
  return recommendedMethod(card) ? tag("neutral", "disconnected", uiText.text("workbench.settings-connector-account.disconnected-2")) : tag("neutral", "unavailable", uiText.text("workbench.settings-connector-account.not-one-click-yet"));
}

/** Connections listed for a service first: those that need the person, then those in use, then stopped and disconnected ones. */
export function connectionOrder(connection: Pick<ConnectorConnectionView, "state" | "enabled">): number {
  return connection.state === "reauth_required" ? 0 : connection.state === "disconnected" ? 3 : connection.enabled === false ? 2 : 1;
}
