import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ConnectorMethodOption, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ConnectorSettingsCardView } from "./settings-view.js";
import type { ConnectorSetupView } from "./settings-connector-request.js";

export interface ConnectorPrimitives {
  readText(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "link" | "mail" | "back" | "tree"): string;
}

/** A package declares a card's name, summary and source line with no length limit: these are the limits the card shows, in characters. */
export const CONNECTOR_NAME_MAX_CHARS = 120;
export const CONNECTOR_SUMMARY_MAX_CHARS = 400;
/** The source line's package name and the card's title are both display text a package provides (the title from the service declaration, the source line from the declaring plugin's Manifest name or its id when that has no name), so they share the same limit. */
export const CONNECTOR_SOURCE_MAX_CHARS = CONNECTOR_NAME_MAX_CHARS;

/** Cut a card's words to `max` whole characters (code points, as the action schemas count), the last one 「…」; never half of one. */
export function connectorCardText(text: string, max: number): string {
  const characters = [...text];
  return characters.length <= max ? text : characters.slice(0, max - 1).join("") + "…";
}

/** Whether the page can sign in for the person now: the method's login is ready, or the service also takes a device code and the product has a client for it. */
export function loginReady(method?: ConnectorMethodOption): boolean {
  return Boolean(method?.login_ready || method?.oauth?.device?.login_ready);
}

export function recommendedMethod(card: ConnectorSettingsCardView): ConnectorMethodOption | undefined {
  const methods = card.method_options ?? [];
  if (card.connector_id === "feishu") {
    const cli = methods.find(m => m.kind === "cli" && m.cli?.installed);
    if (cli) return cli;
  }
  const direct = methods.find(m => m.kind === "oauth" && loginReady(m))
    ?? methods.find(m => m.kind === "mcp" && m.login_ready);
  if (direct) return direct;
  if (card.connector_id === "figma") return methods.find(m => m.mcp);
  if (["model-api", "image-api", "typesafe", "mcp-bearer", "wechat"].includes(card.connector_id)) return methods.find(m => m.kind === "token" && m.support === "paste");
  return undefined;
}

type Translate = (text: string, values?: Record<string, string | number>) => string;

/** How a method connects, in the page's language. */
export function methodLabel(method: ConnectorMethodOption, _L: Translate): string {
  if (method.kind === "oauth") return loginReady(method) ? uiText.text("workbench.settings-connector-guide.sign-account") : uiText.text("workbench.settings-connector-guide.authorize-own-app");
  if (method.kind === "mcp") return uiText.text("workbench.settings-connector-guide.connect-official-tools");
  if (method.kind === "cli") return uiText.text("workbench.settings-connector-guide.use-client-mac");
  return uiText.text("workbench.settings-connector-guide.connect-key");
}

/** A method the page prepared for one request (the request page) is drawn as its one click when it has one, else with its fields. */
export function requestGuideVariant(method: ConnectorMethodOption): "main" | "full" {
  return method.oauth && !loginReady(method) ? "full" : "main";
}

const CONNECTOR_PURPOSE: Record<string, string> = {
  github: "workbench.settings-connector-guide.bring-unread-git-hub-notifications-into-project-keep",
  gmail: "workbench.settings-connector-guide.bring-email-into-project-sort-out-work-threads",
  "model-api": "workbench.settings-connector-guide.choose-text-models-molis-jelly-can-use",
  "image-api": "workbench.settings-connector-guide.use-own-image-generation-service-images",
  typesafe: "workbench.settings-connector-guide.let-functions-use-type-safe-account",
  "mcp-bearer": "workbench.settings-connector-guide.save-key-remote-tool-service-choose-coding",
  loom: "workbench.settings-connector-guide.reach-authorized-content-through-atlassian-rovo-s-official",
  figma: "workbench.settings-connector-guide.connect-official-design-tools-so-agent-can-read",
};

/** What a connector is for: the workbench's own sentence where it has one, else the catalog's summary (the catalog's words are its own; specs/font-and-skin-system FSS-36). */
export function connectorPurpose(card: ConnectorSettingsCardView, _readText: Translate): string {
  return Object.hasOwn(CONNECTOR_PURPOSE, card.connector_id) ? uiText.text(CONNECTOR_PURPOSE[card.connector_id]!) : card.summary;
}

export function officialLinks(links: readonly ConnectorSetupLink[], p: ConnectorPrimitives): string {
  const seen = new Set<string>();
  return `<nav class="settings-connector-links" aria-label="${uiText("workbench.settings-connector-guide.official-page-opens-browser")}">${links.filter(link => {
    if (!link.url.startsWith("https://") || seen.has(link.url)) return false;
    seen.add(link.url); return true;
  }).map(link => `<a href="${p.escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-connector-method-link>${p.icon("link")}${p.escapeHtml(link.label)}</a>`).join("")}</nav>`;
}

const COMPOSITE: Record<string, { separator: string; fields: readonly [string, string, string?][] }> = {
  feishu: { separator: ":", fields: [["应用 ID", "text", "cli_…"], ["应用密钥", "password"]] },
  lark: { separator: ":", fields: [["应用 ID", "text", "cli_…"], ["应用密钥", "password"]] },
  wechat: { separator: ":", fields: [["企业 ID（CorpID）", "text", "ww…"], ["应用 Secret", "password"]] },
  bitbucket: { separator: ":", fields: [["Atlassian 邮箱", "email"], ["API Token", "password"]] },
  jira: { separator: "|", fields: [["站点域名", "text", "your-site.atlassian.net"], ["Atlassian 邮箱", "email"], ["API Token", "password"]] },
  confluence: { separator: "|", fields: [["站点域名", "text", "your-site.atlassian.net"], ["Atlassian 邮箱", "email"], ["API Token", "password"]] },
  salesforce: { separator: "|", fields: [["实例地址", "url", "https://your.my.salesforce.com"], ["访问令牌", "password"]] },
  adobe: { separator: "|", fields: [["API Key / Client ID", "text"], ["访问令牌", "password"]] },
};

export function credentialInputs(card: ConnectorSettingsCardView, p: ConnectorPrimitives): { fields: string; separator?: string } {
  const { escapeHtml: e } = p;
  const composite = Object.hasOwn(COMPOSITE, card.connector_id) ? COMPOSITE[card.connector_id] : undefined;
  const fields = composite ? composite.fields.map(([label, type, placeholder]) => `<label class="settings-connector-field"><span>${e(label)}</span><input class="mw-input" data-credential-part type="${type}" autocomplete="off" placeholder="${e(placeholder ?? "")}" required></label>`).join("")
    : `<label class="settings-connector-field"><span>${e(uiText.text(card.token_label || "workbench.settings-connector-guide.api-key-access-token"))}</span><input class="mw-input" type="password" autocomplete="off" data-connector-token="${e(card.connector_id)}" placeholder="${e(card.token_placeholder || "")}" required></label>`;
  return { fields, separator: composite?.separator };
}

function tokenGuide(card: ConnectorSettingsCardView, option: ConnectorMethodOption, p: ConnectorPrimitives): string {
  const { escapeHtml: e } = p;
  const { fields, separator } = credentialInputs(card, p);
  return `<form class="settings-connector-auth" data-connector-auth="${e(card.connector_id)}"${separator ? ` data-credential-separator="${separator}"` : ""}>
    <ol class="settings-connector-steps"><li><strong>${uiText("workbench.settings-connector-guide.get-credentials-official-console")}</strong><p>${uiText("workbench.settings-connector-guide.open-official-page-below-sign-create-key-need")}</p>${officialLinks(option.links, p)}</li>
    <li><strong>${uiText("workbench.settings-connector-guide.come-back-here-enter-credentials")}</strong>${fields}</li></ol>
    ${card.auth_help || option.note ? `<details class="settings-connector-help"><summary>${uiText("workbench.settings-connector-guide.permission-requirements-help-filling")}</summary><p>${e((card.auth_help || option.note))}</p></details>` : ""}
    <p>${uiText("workbench.settings-connector-guide.credentials-stored-only-computer-not-shown-again-after")}</p>
    <button class="mw-btn mw-btn--primary" type="submit">${uiText(["model-api", "image-api", "typesafe", "mcp-bearer"].includes(card.connector_id) ? "workbench.settings-connector-guide.save-continue" : "workbench.settings-connector-guide.save-check-connection")}</button>
    <div data-protocol-result role="status" aria-live="polite" hidden></div></form>`;
}

/**
 * Where a method's guide is drawn. `full`: every field the method takes (another way to connect, under 高级, and the request page).
 * `main`: the one-click path on the service's row, with nothing to fill in — an OAuth login with the product's app, a tool service at
 * its declared address. `own`: the same method with the person's own app or settings, under 高级 (§13.1 ② plan A).
 */
export type MethodGuideVariant = "full" | "main" | "own";

export function renderMethodGuide(card: ConnectorSettingsCardView, option: ConnectorMethodOption, p: ConnectorPrimitives, setup?: ConnectorSetupView["setup"], cliJob?: string, variant: MethodGuideVariant = "full"): string {
  const { escapeHtml: e } = p;
  const field = (key: string, label: string, value = "", secret = false, placeholder = "", required = false) => `<label class="settings-connector-field"><span>${e(uiText.text(label))}</span><input class="mw-input" data-protocol-field="${e(key)}" type="${secret ? "password" : "text"}" autocomplete="off" value="${e(value)}" placeholder="${e(placeholder)}"${required ? " required" : ""}></label>`;
  const manualReturn = `<div data-oauth-return hidden>${field("returned_url", "workbench.settings-connector-guide.full-return-address-browser", "", true)}<button class="mw-btn mw-btn--secondary" type="button" data-oauth-complete>${uiText("workbench.settings-connector-guide.confirm-authorization-result")}</button></div>`;
  const primary = (attrs: string, label: string) => `<button class="mw-btn mw-btn--primary" type="button" ${attrs}>${e(label)}</button>`;
  let body = "";
  if (option.kind === "token" && option.support === "paste") body = tokenGuide(card, option, p);
  else if (option.oauth) {
    const dedicated = Boolean(option.oauth.device?.login_ready);
    const ready = dedicated || Boolean(option.login_ready);
    // An own app always needs its fields; the full guide needs them only while the product's own app is not ready.
    const own = variant === "own" || !ready;
    const provider = card.connector_id === "gmail" ? "Google" : card.title;
    const start = (label: string) => primary(`data-protocol-start="oauth"${dedicated && variant === "main" ? ` data-device-login="${e(provider)}"` : ""}`, label);
    if (variant === "main") body = `<ol class="settings-connector-steps"><li><strong>${e(uiText.text("workbench.settings-connector-guide.sign-name-browser-agree", { name: provider }))}</strong><p>${uiText("workbench.settings-connector-guide.come-back-here-yourself-nothing-copy")}</p></li></ol>
      ${option.oauth.note ? `<p>${e(option.oauth.note)}</p>` : ""}${start(uiText.text("workbench.settings-connector-guide.connect-name", { name: card.title }))}${manualReturn}`;
    else body = `<ol class="settings-connector-steps"><li><strong>${uiText("workbench.settings-connector-guide.open-official-console-prepare-app")}</strong>${officialLinks(option.links, p)}<p>${uiText("workbench.settings-connector-guide.if-don-t-have-developer-access-ask-app")}</p></li>
      <li><strong>${uiText("workbench.settings-connector-guide.register-callback-url")}</strong><p>${uiText("workbench.settings-connector-guide.add-address-below-app-s-allowed-callback-urls")}</p><div class="settings-connector-copy"><code data-oauth-callback${option.oauth.callback_path ? ` data-callback-path="${e(option.oauth.callback_path)}"` : ""}${option.oauth.callback_host ? ` data-callback-host="${e(option.oauth.callback_host)}"` : ""}${ready ? ` data-account-callback="${e(card.connector_id)}"` : ""}></code><button type="button" class="mw-btn mw-btn--ghost" data-copy-callback>${uiText("common.control.copy")}</button></div></li>
      <li><strong>${uiText("workbench.settings-connector-guide.enter-app-details")}</strong>${field("client_id", "workbench.settings-connector-guide.app-client-id", "", false, "", own)}${field("client_secret", option.oauth.client_secret_required ? "workbench.settings-connector-guide.app-client-secret" : "workbench.settings-connector-guide.client-secret-optional", "", true, "", own && option.oauth.client_secret_required)}${option.oauth.fields.map(f => field(`setting:${f.key}`, f.label, "", false, f.placeholder, own && f.required)).join("")}</li></ol>
      ${option.oauth.note ? `<p>${e(option.oauth.note)}</p>` : ""}
      ${field("redirect_uri", "workbench.settings-connector-guide.https-callback-url-optional")}<p>${uiText("workbench.settings-connector-guide.use-only-when-service-doesn-t-accept-local")}</p>
      ${start(uiText.text("workbench.settings-connector-guide.sign-app"))}${manualReturn}`;
  } else if (option.mcp) {
    const custom = card.connector_id === "mcp-bearer";
    const manual = custom || !option.login_ready && (option.mcp.client_registration === "manual" || ["feishu", "lark"].includes(card.connector_id));
    const select = (key: string, label: string, values: Array<[string, string]>, selected?: string) => `<label class="settings-connector-field"><span>${e(uiText.text(label))}</span><select class="mw-input" data-protocol-field="${key}">${values.map(([value, text]) => `<option value="${value}"${value === selected ? " selected" : ""}>${e(text)}</option>`).join("")}</select></label>`;
    const fixed = ["authentication", "transport"].map(key => { const value = setup?.[key as "authentication" | "transport"]; return value ? `<input type="hidden" data-protocol-field="${key}" value="${e(value)}">` : ""; }).join("");
    const start = primary('data-protocol-start="mcp"', uiText.text("workbench.settings-connector-guide.connect-name-tools", { name: card.title }));
    // The one-click path sends the declared address and nothing else: the settings a service may also take are under 高级.
    if (variant === "main" && !manual) body = `<p>${uiText("workbench.settings-connector-guide.after-connecting-can-view-use-tools-provider-offers")}</p><input type="hidden" data-protocol-field="endpoint" value="${e(option.mcp.endpoint)}">${fixed}${start}${manualReturn}`;
    else body = `<p>${e(option.note)}</p>${officialLinks(option.links, p)}
      ${manual ? `<p>${uiText("workbench.settings-connector-guide.service-needs-app-organization-configuration-before-authorizatio")}</p>` : ""}
      ${field("endpoint", "workbench.settings-connector-guide.official-tool-service-address", option.mcp.endpoint)}${custom ? select("authentication", "workbench.settings-connector-guide.authentication", [["oauth", "OAuth"], ["none", "无需鉴权"], ["bearer", "Bearer Token"]], setup?.authentication) + select("transport", "workbench.settings-connector-guide.transport", [["http", "Streamable HTTP"], ["sse", "SSE"]], setup?.transport) : fixed}${field("client_id", "workbench.settings-connector-guide.app-client-id-app-id-enter-if-service")}${field("client_secret", "workbench.settings-connector-guide.client-secret-app-secret-enter-if-service-requires", "", true)}${field("token", "workbench.settings-connector-guide.access-token-optional-if-service-supports", "", true)}<div class="settings-connector-copy"><code data-mcp-callback></code><button type="button" class="mw-btn mw-btn--ghost" data-copy-callback>${uiText("workbench.settings-connector-guide.copy-callback")}</button></div>${field("redirect_uri", "workbench.settings-connector-guide.registered-https-callback-optional")}
      ${variant === "own" ? primary('data-protocol-start="mcp"', uiText.text("workbench.settings-connector-guide.connect-these-settings")) : start}${manualReturn}`;
  } else if (option.cli) {
    body = `<p>${e(uiText.text(card.connector_id === "feishu" ? "workbench.settings-connector-guide.sign-user-account-local-client-connection-checked-automatically" : "workbench.settings-connector-guide.sign-installed-official-client-check-account-connection-can"))}</p>
      <p data-cli-availability>${e(option.cli.binary)} · ${uiText(option.cli.installed ? "workbench.settings-connector-guide.installed" : "workbench.settings-connector-guide.not-installed")}</p>
      ${officialLinks([{ label: "打开官方安装说明", url: option.cli.install_url }], p)}
      ${(option.cli.environment_fields ?? []).map(input => field(`setting:${input.name}`, input.label, "", input.secret)).join("")}
      <div class="settings-connector-actions"><button class="mw-btn mw-btn--primary" type="button" data-cli-login${option.cli.installed ? "" : " disabled"}>${uiText("workbench.settings-connector-guide.sign-connect")}</button><button class="mw-btn mw-btn--secondary" type="button" data-cli-connect${option.cli.installed ? "" : " disabled"}>${uiText("workbench.settings-connector-guide.connect-signed-account")}</button><button class="mw-btn mw-btn--ghost" type="button" data-cli-detect>${uiText("workbench.settings-connector-guide.detect-installation-again")}</button></div>
      ${option.cli.note ? `<details class="settings-connector-help"><summary>${uiText("workbench.settings-connector-guide.client-instructions")}</summary><p>${e(option.cli.note)}</p>${officialLinks(option.links, p)}</details>` : ""}
      ${option.cli.setup_available ? `<button type="button" class="mw-btn mw-btn--secondary" data-cli-configure${option.cli.installed ? "" : " disabled"}>${uiText("workbench.settings-connector-guide.configure-client")}</button>` : ""}
      <div data-cli-session hidden><p>${uiText("workbench.settings-connector-guide.follow-client-s-prompts-finish-signing-some-clients")}</p><pre class="settings-connection-output" data-cli-output aria-live="polite"></pre>${field("cli_input", "workbench.settings-connector-guide.client-input-sends-enter-if-left-blank", "", true)}<div class="settings-connector-actions"><button type="button" class="mw-btn mw-btn--secondary" data-cli-input>${uiText("workbench.settings-connector-guide.send")}</button><button type="button" class="mw-btn mw-btn--ghost" data-cli-cancel>${uiText("workbench.settings-connector-guide.end-operation")}</button></div></div>`;
  } else body = `<p>${e(option.note)}</p>${officialLinks(option.links, p)}`;
  return `<section class="settings-connector-method" data-connector-method="${option.kind}" data-method-support="${option.support}"><div data-protocol="${option.kind}" data-protocol-service="${e(card.connector_id)}"${cliJob ? ` data-cli-job="${e(cliJob)}"` : ""} class="settings-connector-flow">${body}${option.kind === "token" ? "" : '<div data-protocol-result role="status" aria-live="polite" hidden></div>'}</div></section>`;
}

/** What a service can and cannot do, in its own words (§13.1: 「能读通知、看仓库」, never permission names). */
export function renderCapabilities(card: ConnectorSettingsCardView, p: ConnectorPrimitives): string {
  if (!card.capabilities?.length) return "";
  return `<ul class="settings-connector-capabilities">${card.capabilities.map(c => `<li data-fulfillment="${c.fulfillment}"><span>${uiText(c.fulfillment === "live" ? "workbench.settings-connector-guide.can" : "workbench.settings-connector-guide.not-supported-yet")}</span>${p.escapeHtml(c.label)}</li>`).join("")}</ul>`;
}

const WAY: Record<string, string> = { oauth: "workbench.settings-connector-guide.sign-own-provider-app", token: "workbench.settings-connector-guide.paste-api-key", cli: "workbench.settings-connector-guide.sign-official-client-machine", mcp: "workbench.settings-connector-guide.connect-provider-s-official-tools" };

/**
 * The service's path on its row (ASC-45～47): the one click that connects it; or, when there is none yet, why, and the ways that
 * work now, each under 高级 — never a form passed off as one-click, nor a button that cannot work.
 */
export function renderConnectorConnect(card: ConnectorSettingsCardView, p: ConnectorPrimitives): string {
  const { escapeHtml: e } = p;
  if (card.availability === "placeholder") return `<div class="settings-connector-pending"><p>${e(uiText.text(card.unavailable_reason || "workbench.settings-connector-guide.service-isn-t-integrated-yet-can-read-official"))}</p>${officialLinks(card.setup_links ?? [], p)}</div>`;
  const recommended = recommendedMethod(card);
  if (recommended) return `${renderCapabilities(card, p)}${renderMethodGuide(card, recommended, p, undefined, undefined, "main")}`;
  const provider = card.connector_id === "gmail" ? "Google" : card.title;
  const ways = [...new Set((card.method_options ?? []).map(m => m.kind))].filter(kind => Object.hasOwn(WAY, kind)).map(kind => uiText.text(WAY[kind]!, { provider }));
  return `<div class="settings-connector-pending"><p>${e(uiText.text("workbench.settings-connector-guide.not-one-click-yet-molis-work-hasn-t", { name: card.title }))}</p>
    <p>${e(ways.length ? uiText.text("workbench.settings-connector-guide.what-works-now-ways-all-under-advanced-below", { ways: ways.join("；") }) : uiText.text("workbench.settings-connector-guide.there-no-other-way-yet-can-connect-another"))}</p></div>
    ${renderCapabilities(card, p)}${ways.length ? `<button class="mw-btn mw-btn--secondary" type="button" data-connector-advanced-open>${uiText("workbench.settings-connector-guide.see-other-ways-connect")}</button>` : ""}`;
}

/**
 * The connection ways that belong under 高级 (§13.1 ② plan A): the one-click method with the person's own app or settings, the
 * service's other methods, the new connection's name, and its other official links.
 */
export function renderConnectorWays(card: ConnectorSettingsCardView, p: ConnectorPrimitives): string {
  const { readText, escapeHtml: e } = p;
  if (card.availability === "placeholder") return "";
  const recommended = recommendedMethod(card);
  const own = recommended && (recommended.oauth || recommended.mcp && recommended.kind === "mcp") ? recommended : undefined;
  const others = (card.method_options ?? []).filter(m => m !== recommended);
  const used = new Set((card.method_options ?? []).flatMap(m => m.links.map(l => l.url)));
  const extra = (card.setup_links ?? []).filter(l => !used.has(l.url));
  const way = (summary: string, note: string, body: string, kind: string) => `<details class="settings-connector-alternative" data-method-choice="${kind}"><summary>${e(summary)}<small>${e(note)}</small></summary>${body}</details>`;
  return `${own ? way(uiText.text(own.oauth ? "workbench.settings-connector-guide.use-own-app" : "workbench.settings-connector-guide.server-address-authorization-settings"), uiText.text(own.oauth ? "workbench.settings-connector-guide.when-company-requires-its-own-registered-app" : "workbench.settings-connector-guide.change-address-fill-app-details-service-asks"), renderMethodGuide(card, own, p, undefined, undefined, "own"), own.kind) : ""}
    ${others.map(m => way(methodLabel(m, readText), uiText.text(m.kind === "mcp" ? "workbench.settings-connector-guide.tool-calls" : m.kind === "cli" ? "workbench.settings-connector-guide.requires-official-client" : m.kind === "oauth" ? "workbench.settings-connector-guide.use-own-app-2" : "workbench.settings-connector-guide.get-credentials-official-console"), renderMethodGuide(card, m, p), m.kind)).join("")}
    <label class="settings-connector-field"><span>${uiText("workbench.settings-connector-guide.name-new-connection-optional")}</span><input class="mw-input" data-connector-new-name maxlength="100" placeholder="${e(card.title)}" autocomplete="off"></label>
    ${card.outbound_note ? `<p>${e(card.outbound_note)}</p>` : ""}${extra.length ? officialLinks(extra, p) : ""}`;
}
