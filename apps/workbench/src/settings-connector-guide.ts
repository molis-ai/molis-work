import type { ConnectorMethodOption, ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ConnectorSettingsCardView } from "./settings-view.js";

export interface ConnectorPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "link" | "mail" | "back" | "tree"): string;
}

export function readyAccountLogin(card: ConnectorSettingsCardView): boolean {
  return Boolean(card.connector_id === "gmail" ? card.gmail_oauth_configured
    : card.connector_id === "notion" ? card.notion_oauth_configured
      : card.connector_id === "github" && card.github_client_id_configured);
}

export function recommendedMethod(card: ConnectorSettingsCardView): ConnectorMethodOption | undefined {
  const methods = card.method_options ?? [];
  if (readyAccountLogin(card)) return methods.find(m => m.kind === "oauth");
  if (card.connector_id === "feishu") {
    const cli = methods.find(m => m.kind === "cli" && m.cli?.installed);
    if (cli) return cli;
  }
  const direct = methods.find(m => m.kind === "oauth" && m.login_ready)
    ?? methods.find(m => m.kind === "mcp" && m.login_ready);
  if (direct) return direct;
  if (card.connector_id === "figma") return methods.find(m => m.mcp);
  if (["model-api", "image-api", "typesafe", "mcp-bearer", "wechat"].includes(card.connector_id)) return methods.find(m => m.kind === "token" && m.support === "paste");
  return undefined;
}

export function methodLabel(method: ConnectorMethodOption, card: ConnectorSettingsCardView): string {
  if (method.kind === "oauth") return method.login_ready || readyAccountLogin(card) ? "登录账号" : "自定义应用授权";
  if (method.kind === "mcp") return "连接官方工具";
  if (method.kind === "cli") return "使用本机客户端";
  return "使用密钥连接";
}

export function pathLabel(card: ConnectorSettingsCardView): string {
  if (card.availability === "placeholder") return "暂未接入";
  const method = recommendedMethod(card);
  if (!method) return "登录接入准备中";
  if (method.kind === "oauth") return method.login_ready || readyAccountLogin(card) ? "浏览器登录" : "登录接入准备中";
  if (method.kind === "mcp") return card.connector_id === "figma" ? "连接 Figma 工具" : method.mcp?.client_registration === "manual" ? "需配置工具授权" : "官方工具授权";
  if (method.kind === "cli") return method.cli?.installed ? "本机登录" : "需安装客户端";
  return "使用 API Key / 令牌";
}

export function connectorPurpose(card: ConnectorSettingsCardView): string {
  const known: Record<string, string> = {
    github: "把 GitHub 未读通知带进项目，跟进代码协作。",
    gmail: "把邮件带进项目，整理工作往来与待办。当前只读取邮件。",
    "model-api": "为 Molis 和 Jelly 选择可用的文本模型。",
    "image-api": "在 Images 中使用自己的图像生成服务。",
    typesafe: "让 Functions 使用你的 TypeSafe 账号。",
    "mcp-bearer": "保存远程工具服务的密钥，在 Coding 中选择使用。",
    loom: "通过 Atlassian Rovo 的官方工具访问已授权内容。",
    figma: "连接官方设计工具，供 Agent 读取和处理已授权的设计。",
  };
  return known[card.connector_id] ?? card.summary;
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
  const composite = COMPOSITE[card.connector_id];
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

export function renderMethodGuide(card: ConnectorSettingsCardView, option: ConnectorMethodOption, p: ConnectorPrimitives): string {
  const { L, escapeHtml: e } = p;
  const field = (key: string, label: string, value = "", secret = false, placeholder = "", required = false) => `<label class="settings-connector-field"><span>${e(L(label))}</span><input class="mw-input" data-protocol-field="${e(key)}" type="${secret ? "password" : "text"}" autocomplete="off" value="${e(value)}" placeholder="${e(placeholder)}"${required ? " required" : ""}></label>`;
  const manualReturn = `<div data-oauth-return hidden>${field("returned_url", "浏览器中的完整返回地址")}<button class="mw-btn mw-btn--secondary" type="button" data-oauth-complete>${L("确认授权结果")}</button></div>`;
  let body = "";
  if (option.kind === "token" && option.support === "paste") body = tokenGuide(card, option, p);
  else if (option.oauth) {
    const dedicated = readyAccountLogin(card);
    const ready = dedicated || Boolean(option.login_ready);
    const provider = card.connector_id === "gmail" ? "Google" : card.title;
    const config = `<ol class="settings-connector-steps"><li><strong>${L("打开官方后台，准备应用")}</strong>${officialLinks(option.links, p)}<p>${L("没有开发者权限时，请让应用管理员完成这一步，或选择下方其他连接方式。")}</p></li>
      <li><strong>${L("登记回调地址")}</strong><p>${L("将下面的地址添加到应用的允许回调地址中。")}</p><div class="settings-connector-copy"><code data-oauth-callback${ready ? ` data-account-callback="${e(card.connector_id)}"` : ""}></code><button type="button" class="mw-btn mw-btn--ghost" data-copy-callback>${L("复制")}</button></div></li>
      <li><strong>${L("填写应用信息")}</strong>${field("client_id", "应用 Client ID", "", false, "", !ready)}${field("client_secret", option.oauth.client_secret_required ? "应用 Client Secret" : "Client Secret（可选）", "", true, "", !ready && option.oauth.client_secret_required)}${option.oauth.fields.map(f => field(`setting:${f.key}`, f.label, "", false, f.placeholder, !ready && f.required)).join("")}</li></ol>`;
    body = `<p>${L(ready ? "将在浏览器打开官方登录页。选择账号并确认权限后，回到这里即可继续。" : "首次连接需要服务商的应用配置。准备完成后，即可在官方页面登录授权。")}</p>
      ${option.oauth.note ? `<p>${e(L(option.oauth.note))}</p>` : ""}
      ${ready ? `<details class="settings-connector-help"><summary>${L("使用其他应用配置")}</summary>${config}</details>` : config}
      <details class="settings-connector-help"><summary>${L("高级：使用已注册的 HTTPS 回调")}</summary>${field("redirect_uri", "HTTPS 回调地址（可选）")}<p>${L("仅在服务不接受本机回调时使用。授权后将完整返回地址粘贴到这里。")}</p></details>
      <button class="mw-btn mw-btn--primary" type="button" data-protocol-start="oauth"${dedicated ? ` data-account-login="${e(card.connector_id)}"` : ""}>${e(L("前往 {name} 登录", { name: provider }))}</button>${manualReturn}`;
  } else if (option.mcp) {
    const manual = !option.login_ready && (option.mcp.client_registration === "manual" || ["feishu", "lark"].includes(card.connector_id));
    const config = `${field("endpoint", "官方工具服务地址", option.mcp.endpoint)}${field("client_id", "应用 Client ID / App ID（服务要求时填写）")}${field("client_secret", "Client Secret / App Secret（服务要求时填写）", "", true)}${field("token", "访问令牌（服务支持时可选）", "", true)}<div class="settings-connector-copy"><code data-mcp-callback></code><button type="button" class="mw-btn mw-btn--ghost" data-copy-callback>${L("复制回调")}</button></div>${field("redirect_uri", "已注册的 HTTPS 回调（可选）")}`;
    body = `<p>${L("连接后可查看并使用服务商提供的工具。工具授权与邮件、文档同步账号独立，以官方授权页显示的权限为准。")}</p><p>${e(L(option.note))}</p>
      ${officialLinks(option.links, p)}
      ${manual ? `<p>${L("此服务需要先准备应用或组织配置，再开始授权。请按官方说明填写以下信息。")}</p>${config}` : `<details class="settings-connector-help"><summary>${L("服务地址与高级授权设置")}</summary>${config}</details>`}
      <button class="mw-btn mw-btn--primary" type="button" data-protocol-start="mcp">${e(L("连接 {name} 工具", { name: card.title }))}</button>${manualReturn}`;
  } else if (option.cli) {
    body = `<p>${e(L(card.connector_id === "feishu" ? "使用本机客户端登录你的用户账号，登录后自动检查连接。" : "使用已安装的官方客户端登录并检查账号。此连接可在这里读取信息，不代替 Feed 的账号授权。"))}</p>
      <p data-cli-availability>${e(option.cli.binary)} · ${L(option.cli.installed ? "已安装" : "尚未安装")}</p>
      ${officialLinks([{ label: "打开官方安装说明", url: option.cli.install_url }], p)}
      <div class="settings-connector-actions"><button class="mw-btn mw-btn--primary" type="button" data-cli-login${option.cli.installed ? "" : " disabled"}>${L("登录并连接")}</button><button class="mw-btn mw-btn--secondary" type="button" data-cli-connect${option.cli.installed ? "" : " disabled"}>${L("连接已登录账号")}</button><button class="mw-btn mw-btn--ghost" type="button" data-cli-detect>${L("重新检测安装")}</button></div>
      ${option.cli.note ? `<details class="settings-connector-help"><summary>${L("客户端使用说明")}</summary><p>${e(L(option.cli.note))}</p>${officialLinks(option.links, p)}</details>` : ""}
      ${card.connector_id === "feishu" ? `<details class="settings-connector-help"><summary>${L("首次使用：配置飞书应用")}</summary><button type="button" class="mw-btn mw-btn--secondary" data-connector-feishu-setup>${L("打开应用配置")}</button></details>` : ""}
      <div data-cli-session hidden><p>${L("请按客户端提示完成登录。部分客户端需要在下方输入选项。")}</p><pre class="settings-connection-output" data-cli-output aria-live="polite"></pre>${field("cli_input", "客户端交互输入（空白发送回车）", "", true)}<div class="settings-connector-actions"><button type="button" class="mw-btn mw-btn--secondary" data-cli-input>${L("发送")}</button><button type="button" class="mw-btn mw-btn--ghost" data-cli-cancel>${L("结束登录")}</button></div></div>`;
  } else body = `<p>${e(L(option.note))}</p>${officialLinks(option.links, p)}`;
  return `<section class="settings-connector-method" data-connector-method="${option.kind}" data-method-support="${option.support}"><div data-protocol="${option.kind}" data-protocol-service="${e(card.connector_id)}" class="settings-connector-flow">${body}${option.kind === "token" ? "" : '<div data-protocol-result role="status" aria-live="polite" hidden></div>'}</div></section>`;
}

export function renderConnectorSetup(card: ConnectorSettingsCardView, p: ConnectorPrimitives): string {
  const { L, escapeHtml: e } = p;
  if (card.availability === "placeholder") return `<p>${e(L(card.unavailable_reason || "此服务暂未接入。可以查看官方说明，选择其他可用服务。"))}</p>${officialLinks(card.setup_links ?? [], p)}`;
  const recommended = recommendedMethod(card);
  const others = (card.method_options ?? []).filter(m => m !== recommended);
  return `<div class="settings-connector-setup">${recommended ? `<h3>${e(L(methodLabel(recommended, card)))}</h3>${renderMethodGuide(card, recommended, p)}` : `<div class="settings-connector-pending"><h3>${L("登录接入准备中")}</h3><p>${L("Molis 尚未完成此服务的应用接入，暂时无法直接登录。这一步由我们准备，你不需要注册开发者应用。")}</p><p>${L("已有密钥或自有应用的用户，可以展开高级连接方式。")}</p></div>`}
    ${others.length ? `<details class="settings-connector-alternatives"><summary>${L("高级连接方式")}</summary>${others.map(m => `<details class="settings-connector-alternative" data-method-choice="${m.kind}"><summary>${e(L(methodLabel(m, card)))}<small>${e(L(m.kind === "mcp" ? "供工具调用使用" : m.kind === "cli" ? "需安装官方客户端" : m.kind === "oauth" ? "使用自有应用" : "在官方后台获取凭据"))}</small></summary>${renderMethodGuide(card, m, p)}</details>`).join("")}</details>` : ""}
    <details class="settings-connector-help"><summary>${L("为这个账号起个名字（可选）")}</summary><label class="settings-connector-field"><span>${L("连接名称")}</span><input class="mw-input" data-connector-new-name maxlength="100" placeholder="${e(card.title)}" autocomplete="off"></label></details>
    ${card.capabilities?.length ? `<details class="settings-connector-help"><summary>${L("支持的用途与限制")}</summary><ul class="settings-connector-capabilities">${card.capabilities.map(c => `<li data-fulfillment="${c.fulfillment}"><span>${L(c.fulfillment === "live" ? "支持" : "暂不支持")}</span>${e(L(c.label))}</li>`).join("")}</ul>${card.outbound_note ? `<p>${e(L(card.outbound_note))}</p>` : ""}</details>` : ""}
    ${(() => { const used = new Set((card.method_options ?? []).flatMap(m => m.links.map(l => l.url))); const extra = (card.setup_links ?? []).filter(l => !used.has(l.url)); return extra.length ? `<details class="settings-connector-help"><summary>${L("更多官方设置与帮助")}</summary>${officialLinks(extra, p)}</details>` : ""; })()}
  </div>`;
}
