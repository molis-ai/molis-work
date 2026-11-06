import type { ConnectorMethodOption, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ConnectorSettingsCardView } from "./settings-view.js";
import type { ConnectorSetupView } from "./settings-connector-request.js";

export interface ConnectorPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
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
export function methodLabel(method: ConnectorMethodOption, L: Translate): string {
  if (method.kind === "oauth") return loginReady(method) ? L("登录账号") : L("自定义应用授权");
  if (method.kind === "mcp") return L("连接官方工具");
  if (method.kind === "cli") return L("使用本机客户端");
  return L("使用密钥连接");
}

/** A method the page prepared for one request (the request page) is drawn as its one click when it has one, else with its fields. */
export function requestGuideVariant(method: ConnectorMethodOption): "main" | "full" {
  return method.oauth && !loginReady(method) ? "full" : "main";
}

const CONNECTOR_PURPOSE: Record<string, string> = {
  github: "把 GitHub 未读通知带进项目，跟进代码协作。",
  gmail: "把邮件带进项目，整理工作往来与待办。当前只读取邮件。",
  "model-api": "为 Molis 和 Jelly 选择可用的文本模型。",
  "image-api": "在 Images 中使用自己的图像生成服务。",
  typesafe: "让 Functions 使用你的 TypeSafe 账号。",
  "mcp-bearer": "保存远程工具服务的密钥，在 Coding 中选择使用。",
  loom: "通过 Atlassian Rovo 的官方工具访问已授权内容。",
  figma: "连接官方设计工具，供 Agent 读取和处理已授权的设计。",
};

/** What a connector is for: the workbench's own sentence where it has one, else the catalog's summary (the catalog's words are its own; specs/font-and-skin-system FSS-36). */
export function connectorPurpose(card: ConnectorSettingsCardView, L: Translate): string {
  return Object.hasOwn(CONNECTOR_PURPOSE, card.connector_id) ? L(CONNECTOR_PURPOSE[card.connector_id]!) : L(card.summary);
}

export function officialLinks(links: readonly ConnectorSetupLink[], p: ConnectorPrimitives): string {
  const seen = new Set<string>();
  return `<nav class="settings-connector-links" aria-label="${p.L("官方入口（在浏览器打开）")}">${links.filter(link => {
    if (!link.url.startsWith("https://") || seen.has(link.url)) return false;
    seen.add(link.url); return true;
  }).map(link => `<a href="${p.escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-connector-method-link>${p.icon("link")}${p.escapeHtml(p.L(link.label))}</a>`).join("")}</nav>`;
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
  const { L, escapeHtml: e } = p;
  const composite = Object.hasOwn(COMPOSITE, card.connector_id) ? COMPOSITE[card.connector_id] : undefined;
  const fields = composite ? composite.fields.map(([label, type, placeholder]) => `<label class="settings-connector-field"><span>${e(L(label))}</span><input class="mw-input" data-credential-part type="${type}" autocomplete="off" placeholder="${e(placeholder ?? "")}" required></label>`).join("")
    : `<label class="settings-connector-field"><span>${e(L(card.token_label || "API Key / 访问令牌"))}</span><input class="mw-input" type="password" autocomplete="off" data-connector-token="${e(card.connector_id)}" placeholder="${e(card.token_placeholder || "")}" required></label>`;
  return { fields, separator: composite?.separator };
}

function tokenGuide(card: ConnectorSettingsCardView, option: ConnectorMethodOption, p: ConnectorPrimitives): string {
  const { L, escapeHtml: e } = p;
  const { fields, separator } = credentialInputs(card, p);
  return `<form class="settings-connector-auth" data-connector-auth="${e(card.connector_id)}"${separator ? ` data-credential-separator="${separator}"` : ""}>
    <ol class="settings-connector-steps"><li><strong>${L("在官方后台获取凭据")}</strong><p>${L("打开下方官方入口，登录账号并创建所需密钥。")}</p>${officialLinks(option.links, p)}</li>
    <li><strong>${L("回到这里，填写凭据")}</strong>${fields}</li></ol>
    ${card.auth_help || option.note ? `<details class="settings-connector-help"><summary>${L("权限要求与填写帮助")}</summary><p>${e(L(card.auth_help || option.note))}</p></details>` : ""}
    <p>${L("凭据只保存在本机，保存后不会再次显示。")}</p>
    <button class="mw-btn mw-btn--primary" type="submit">${L(["model-api", "image-api", "typesafe", "mcp-bearer"].includes(card.connector_id) ? "保存并继续" : "保存并检查连接")}</button>
    <div data-protocol-result role="status" aria-live="polite" hidden></div></form>`;
}

/**
 * Where a method's guide is drawn. `full`: every field the method takes (another way to connect, under 高级, and the request page).
 * `main`: the one-click path on the service's row, with nothing to fill in — an OAuth login with the product's app, a tool service at
 * its declared address. `own`: the same method with the person's own app or settings, under 高级 (§13.1 ② plan A).
 */
export type MethodGuideVariant = "full" | "main" | "own";

export function renderMethodGuide(card: ConnectorSettingsCardView, option: ConnectorMethodOption, p: ConnectorPrimitives, setup?: ConnectorSetupView["setup"], cliJob?: string, variant: MethodGuideVariant = "full"): string {
  const { L, escapeHtml: e } = p;
  const field = (key: string, label: string, value = "", secret = false, placeholder = "", required = false) => `<label class="settings-connector-field"><span>${e(L(label))}</span><input class="mw-input" data-protocol-field="${e(key)}" type="${secret ? "password" : "text"}" autocomplete="off" value="${e(value)}" placeholder="${e(placeholder)}"${required ? " required" : ""}></label>`;
  const manualReturn = `<div data-oauth-return hidden>${field("returned_url", "浏览器中的完整返回地址", "", true)}<button class="mw-btn mw-btn--secondary" type="button" data-oauth-complete>${L("确认授权结果")}</button></div>`;
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
    if (variant === "main") body = `<ol class="settings-connector-steps"><li><strong>${e(L("在浏览器登录 {name}，点同意", { name: provider }))}</strong><p>${L("登录完会自动回到这里，不用复制任何东西。")}</p></li></ol>
      ${option.oauth.note ? `<p>${e(L(option.oauth.note))}</p>` : ""}${start(L("连接 {name}", { name: card.title }))}${manualReturn}`;
    else body = `<ol class="settings-connector-steps"><li><strong>${L("打开官方后台，准备应用")}</strong>${officialLinks(option.links, p)}<p>${L("没有开发者权限时，请让应用管理员完成这一步，或选择下方其他连接方式。")}</p></li>
      <li><strong>${L("登记回调地址")}</strong><p>${L("将下面的地址添加到应用的允许回调地址中。")}</p><div class="settings-connector-copy"><code data-oauth-callback${option.oauth.callback_path ? ` data-callback-path="${e(option.oauth.callback_path)}"` : ""}${option.oauth.callback_host ? ` data-callback-host="${e(option.oauth.callback_host)}"` : ""}${ready ? ` data-account-callback="${e(card.connector_id)}"` : ""}></code><button type="button" class="mw-btn mw-btn--ghost" data-copy-callback>${L("复制")}</button></div></li>
      <li><strong>${L("填写应用信息")}</strong>${field("client_id", "应用 Client ID", "", false, "", own)}${field("client_secret", option.oauth.client_secret_required ? "应用 Client Secret" : "Client Secret（可选）", "", true, "", own && option.oauth.client_secret_required)}${option.oauth.fields.map(f => field(`setting:${f.key}`, f.label, "", false, f.placeholder, own && f.required)).join("")}</li></ol>
      ${option.oauth.note ? `<p>${e(L(option.oauth.note))}</p>` : ""}
      ${field("redirect_uri", "HTTPS 回调地址（可选）")}<p>${L("仅在服务不接受本机回调时使用。授权后将完整返回地址粘贴到这里。")}</p>
      ${start(L("用这个应用登录"))}${manualReturn}`;
  } else if (option.mcp) {
    const custom = card.connector_id === "mcp-bearer";
    const manual = custom || !option.login_ready && (option.mcp.client_registration === "manual" || ["feishu", "lark"].includes(card.connector_id));
    const select = (key: string, label: string, values: Array<[string, string]>, selected?: string) => `<label class="settings-connector-field"><span>${e(L(label))}</span><select class="mw-input" data-protocol-field="${key}">${values.map(([value, text]) => `<option value="${value}"${value === selected ? " selected" : ""}>${e(L(text))}</option>`).join("")}</select></label>`;
    const fixed = ["authentication", "transport"].map(key => { const value = setup?.[key as "authentication" | "transport"]; return value ? `<input type="hidden" data-protocol-field="${key}" value="${e(value)}">` : ""; }).join("");
    const start = primary('data-protocol-start="mcp"', L("连接 {name} 工具", { name: card.title }));
    // The one-click path sends the declared address and nothing else: the settings a service may also take are under 高级.
    if (variant === "main" && !manual) body = `<p>${L("连接后可查看并使用服务商提供的工具。工具授权与邮件、文档同步账号独立，以官方授权页显示的权限为准。")}</p><input type="hidden" data-protocol-field="endpoint" value="${e(option.mcp.endpoint)}">${fixed}${start}${manualReturn}`;
    else body = `<p>${e(L(option.note))}</p>${officialLinks(option.links, p)}
      ${manual ? `<p>${L("此服务需要先准备应用或组织配置，再开始授权。请按官方说明填写以下信息。")}</p>` : ""}
      ${field("endpoint", "官方工具服务地址", option.mcp.endpoint)}${custom ? select("authentication", "认证方式", [["oauth", "OAuth"], ["none", "无需鉴权"], ["bearer", "Bearer Token"]], setup?.authentication) + select("transport", "传输方式", [["http", "Streamable HTTP"], ["sse", "SSE"]], setup?.transport) : fixed}${field("client_id", "应用 Client ID / App ID（服务要求时填写）")}${field("client_secret", "Client Secret / App Secret（服务要求时填写）", "", true)}${field("token", "访问令牌（服务支持时可选）", "", true)}<div class="settings-connector-copy"><code data-mcp-callback></code><button type="button" class="mw-btn mw-btn--ghost" data-copy-callback>${L("复制回调")}</button></div>${field("redirect_uri", "已注册的 HTTPS 回调（可选）")}
      ${variant === "own" ? primary('data-protocol-start="mcp"', L("用这些设置连接")) : start}${manualReturn}`;
  } else if (option.cli) {
    body = `<p>${e(L(card.connector_id === "feishu" ? "使用本机客户端登录你的用户账号，登录后自动检查连接。" : "使用已安装的官方客户端登录并检查账号。此连接可在这里读取信息，不代替 Feed 的账号授权。"))}</p>
      <p data-cli-availability>${e(option.cli.binary)} · ${L(option.cli.installed ? "已安装" : "尚未安装")}</p>
      ${officialLinks([{ label: "打开官方安装说明", url: option.cli.install_url }], p)}
      ${(option.cli.environment_fields ?? []).map(input => field(`setting:${input.name}`, input.label, "", input.secret)).join("")}
      <div class="settings-connector-actions"><button class="mw-btn mw-btn--primary" type="button" data-cli-login${option.cli.installed ? "" : " disabled"}>${L("登录并连接")}</button><button class="mw-btn mw-btn--secondary" type="button" data-cli-connect${option.cli.installed ? "" : " disabled"}>${L("连接已登录账号")}</button><button class="mw-btn mw-btn--ghost" type="button" data-cli-detect>${L("重新检测安装")}</button></div>
      ${option.cli.note ? `<details class="settings-connector-help"><summary>${L("客户端使用说明")}</summary><p>${e(L(option.cli.note))}</p>${officialLinks(option.links, p)}</details>` : ""}
      ${option.cli.setup_available ? `<button type="button" class="mw-btn mw-btn--secondary" data-cli-configure${option.cli.installed ? "" : " disabled"}>${L("配置客户端")}</button>` : ""}
      <div data-cli-session hidden><p>${L("请按客户端提示完成登录。部分客户端需要在下方输入选项。")}</p><pre class="settings-connection-output" data-cli-output aria-live="polite"></pre>${field("cli_input", "客户端交互输入（空白发送回车）", "", true)}<div class="settings-connector-actions"><button type="button" class="mw-btn mw-btn--secondary" data-cli-input>${L("发送")}</button><button type="button" class="mw-btn mw-btn--ghost" data-cli-cancel>${L("结束操作")}</button></div></div>`;
  } else body = `<p>${e(L(option.note))}</p>${officialLinks(option.links, p)}`;
  return `<section class="settings-connector-method" data-connector-method="${option.kind}" data-method-support="${option.support}"><div data-protocol="${option.kind}" data-protocol-service="${e(card.connector_id)}"${cliJob ? ` data-cli-job="${e(cliJob)}"` : ""} class="settings-connector-flow">${body}${option.kind === "token" ? "" : '<div data-protocol-result role="status" aria-live="polite" hidden></div>'}</div></section>`;
}

/** What a service can and cannot do, in its own words (§13.1: 「能读通知、看仓库」, never permission names). */
export function renderCapabilities(card: ConnectorSettingsCardView, p: ConnectorPrimitives): string {
  if (!card.capabilities?.length) return "";
  return `<ul class="settings-connector-capabilities">${card.capabilities.map(c => `<li data-fulfillment="${c.fulfillment}"><span>${p.L(c.fulfillment === "live" ? "能" : "暂不支持")}</span>${p.escapeHtml(p.L(c.label))}</li>`).join("")}</ul>`;
}

const WAY: Record<string, string> = { oauth: "用你自己的 {provider} 应用登录", token: "填一把 API 密钥", cli: "用本机的官方客户端登录", mcp: "连接 {provider} 的官方工具" };

/**
 * The service's path on its row (ASC-45～47): the one click that connects it; or, when there is none yet, why, and the ways that
 * work now, each under 高级 — never a form passed off as one-click, nor a button that cannot work.
 */
export function renderConnectorConnect(card: ConnectorSettingsCardView, p: ConnectorPrimitives): string {
  const { L, escapeHtml: e } = p;
  if (card.availability === "placeholder") return `<div class="settings-connector-pending"><p>${e(L(card.unavailable_reason || "此服务暂未接入。可以查看官方说明，选择其他可用服务。"))}</p>${officialLinks(card.setup_links ?? [], p)}</div>`;
  const recommended = recommendedMethod(card);
  if (recommended) return `${renderCapabilities(card, p)}${renderMethodGuide(card, recommended, p, undefined, undefined, "main")}`;
  const provider = card.connector_id === "gmail" ? "Google" : card.title;
  const ways = [...new Set((card.method_options ?? []).map(m => m.kind))].filter(kind => Object.hasOwn(WAY, kind)).map(kind => L(WAY[kind]!, { provider }));
  return `<div class="settings-connector-pending"><p>${e(L("还不能一键连接：Molis Work 还没开通 {name} 的一键登录，这一步由我们准备，你不用去注册开发者应用。", { name: card.title }))}</p>
    <p>${e(ways.length ? L("现在能走的路：{ways}。都在下面的「高级」里。", { ways: ways.join(L("；")) }) : L("现在没有别的路，可以先连别的服务。"))}</p></div>
    ${renderCapabilities(card, p)}${ways.length ? `<button class="mw-btn mw-btn--secondary" type="button" data-connector-advanced-open>${L("看其他连接方式")}</button>` : ""}`;
}

/**
 * The connection ways that belong under 高级 (§13.1 ② plan A): the one-click method with the person's own app or settings, the
 * service's other methods, the new connection's name, and its other official links.
 */
export function renderConnectorWays(card: ConnectorSettingsCardView, p: ConnectorPrimitives): string {
  const { L, escapeHtml: e } = p;
  if (card.availability === "placeholder") return "";
  const recommended = recommendedMethod(card);
  const own = recommended && (recommended.oauth || recommended.mcp && recommended.kind === "mcp") ? recommended : undefined;
  const others = (card.method_options ?? []).filter(m => m !== recommended);
  const used = new Set((card.method_options ?? []).flatMap(m => m.links.map(l => l.url)));
  const extra = (card.setup_links ?? []).filter(l => !used.has(l.url));
  const way = (summary: string, note: string, body: string, kind: string) => `<details class="settings-connector-alternative" data-method-choice="${kind}"><summary>${e(summary)}<small>${e(note)}</small></summary>${body}</details>`;
  return `${own ? way(L(own.oauth ? "用自己的应用" : "服务地址与授权设置"), L(own.oauth ? "公司要求用自己注册的应用时" : "改地址或填写服务要求的应用信息"), renderMethodGuide(card, own, p, undefined, undefined, "own"), own.kind) : ""}
    ${others.map(m => way(methodLabel(m, L), L(m.kind === "mcp" ? "供工具调用使用" : m.kind === "cli" ? "需安装官方客户端" : m.kind === "oauth" ? "使用自有应用" : "在官方后台获取凭据"), renderMethodGuide(card, m, p), m.kind)).join("")}
    <label class="settings-connector-field"><span>${L("新连接的名称（可选）")}</span><input class="mw-input" data-connector-new-name maxlength="100" placeholder="${e(card.title)}" autocomplete="off"></label>
    ${card.outbound_note ? `<p>${e(L(card.outbound_note))}</p>` : ""}${extra.length ? officialLinks(extra, p) : ""}`;
}
