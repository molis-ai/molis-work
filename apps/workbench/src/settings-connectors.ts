import { renderHint, icon as designIcon } from "@molis-ai/molis-work-design-system";
import { renderFunctionsSettings } from "./functions/settings-ui.js";
import type { ConnectorConnectionView, ConnectorDirectoryGroupId, ConnectorMethodOption } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorMark } from "./connector-marks.js";
import type { ConnectorSettingsCardView, MolisWorkSettingsView } from "./settings-view.js";

function groupTitle(groupId: ConnectorDirectoryGroupId, L: ConnectorsSettingsPrimitives["L"]): string {
  if (groupId === "mail") return L("邮件与日历");
  if (groupId === "files") return L("云盘与文档");
  if (groupId === "chat") return L("沟通");
  if (groupId === "code") return L("代码与发布");
  if (groupId === "work") return L("任务与知识");
  if (groupId === "design") return L("设计");
  if (groupId === "crm") return L("客户与增长");
  return L("社交");
}

interface ConnectorsSettingsPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "link" | "mail" | "back" | "tree"): string;
}

function renderConnectorMark(connectorId: string, escapeHtml: ConnectorsSettingsPrimitives["escapeHtml"]): string {
  const mark = connectorMark(connectorId);
  if (!mark) {
    const symbol = connectorId === "image-api" ? "image" : connectorId === "mcp-bearer" ? "network" : "sparkles";
    if (["image-api", "mcp-bearer", "model-api"].includes(connectorId)) return `<span class="settings-connector-mark" data-connector-mark="${escapeHtml(connectorId)}" data-on="light" aria-hidden="true">${designIcon(symbol)}</span>`;
    return `<span class="settings-connector-mark settings-connector-mark--fallback" data-connector-mark="${escapeHtml(connectorId)}" aria-hidden="true">${escapeHtml(connectorId.slice(0, 2).toUpperCase())}</span>`;
  }
  return `<span class="settings-connector-mark" data-connector-mark="${escapeHtml(connectorId)}" data-on="${mark.on}" aria-hidden="true"><img src="data:image/svg+xml,${encodeURIComponent(mark.svg)}" alt="" width="24" height="24"></span>`;
}

function connectionMethod(method: ConnectorConnectionView["auth_method"], L: ConnectorsSettingsPrimitives["L"]): string {
  if (method === "oauth") return L("OAuth 授权");
  if (method === "cli") return L("本机 CLI");
  if (method === "mcp") return L("MCP 工具连接");
  if (method === "none") return L("无需鉴权");
  return L("访问令牌");
}

function connectionState(state: ConnectorConnectionView["state"], L: ConnectorsSettingsPrimitives["L"]): { label: string; tone: string } {
  if (state === "connected") return { label: L("凭据已保存"), tone: "neutral" };
  if (state === "reauth_required") return { label: L("需重新授权"), tone: "warning" };
  return { label: L("已断开"), tone: "neutral" };
}

function renderConnectionRow(connection: ConnectorConnectionView, card: ConnectorSettingsCardView | undefined, p: ConnectorsSettingsPrimitives, inDetail = false): string {
  const { L, escapeHtml } = p;
  const state = connectionState(connection.state, L);
  const name = escapeHtml(connection.display_name);
  const serviceTitle = escapeHtml(card?.title || connection.service_id);
  const canManage = connection.source !== "external" || connection.auth_method === "cli";
  const id = escapeHtml(connection.connection_id);
  const serviceId = escapeHtml(connection.service_id);
  return `<div class="settings-connection-row" data-connection-row="${id}" data-connection-service="${serviceId}">
    ${renderConnectorMark(connection.service_id, escapeHtml)}
    <div class="settings-connection-row__identity"><strong>${name}</strong><small>${serviceTitle} · ${escapeHtml(connectionMethod(connection.auth_method, L))}${connection.account_label ? ` · ${escapeHtml(connection.account_label)}` : ""}</small>${connection.target_origin ? `<small>${escapeHtml(L("绑定地址"))} · ${escapeHtml(connection.target_origin)}</small>` : ""}</div>
    <span class="settings-state settings-state--${state.tone}">${escapeHtml(state.label)}</span>
    ${inDetail ? `<div class="settings-connection-row__actions">
      ${connection.state !== "disconnected" ? `<button class="mw-btn mw-btn--secondary" type="button" data-connection-check="${id}">${L("验证连接")}</button><button class="mw-btn mw-btn--secondary" type="button" data-connection-preview="${id}">${L(connection.auth_method === "mcp" ? "查看工具" : "读取预览")}</button>` : ""}
      ${canManage && ["oauth", "mcp"].includes(connection.auth_method) ? `<button class="mw-btn mw-btn--secondary" type="button" data-connection-reauthorize="${id}" data-connection-method="${connection.auth_method}">${L(connection.auth_method === "mcp" ? "新增 MCP 授权" : "重新授权")}</button>` : ""}
      ${canManage && connection.auth_method === "token" ? `<details class="settings-connection-inline"><summary>${L("更换令牌")}</summary><form data-connection-replace="${id}"><input class="mw-input" type="password" autocomplete="off" aria-label="${escapeHtml(L("新令牌"))}" required><button class="mw-btn mw-btn--secondary" type="submit">${L("保存")}</button></form></details>` : ""}
      ${canManage ? `<details class="settings-connection-inline"><summary>${L("重命名")}</summary><form data-connection-rename="${id}"><input class="mw-input" value="${name}" maxlength="100" required aria-label="${escapeHtml(L("连接名称"))}"><button class="mw-btn mw-btn--secondary" type="submit">${L("保存")}</button></form></details>
        <button class="mw-btn mw-btn--danger-outline" type="button" data-connection-disconnect="${id}">${L("断开")}</button>` : `<small>${L("由外部环境管理凭据")}</small>`}
    </div><div class="settings-connection-result" data-connection-result hidden></div>
    ${connection.auth_method === "mcp" ? `<details class="settings-connection-tool"><summary>${L("调用 MCP 工具")}</summary><label class="settings-connector-field"><span>${L("工具名称（先查看工具列表）")}</span><input class="mw-input" data-mcp-tool-name></label><label class="settings-connector-field"><span>${L("参数 JSON")}</span><textarea class="mw-input" data-mcp-tool-arguments rows="4">{}</textarea></label><p>${L("根据工具说明确认作用范围；点击后会执行该工具，包括它声明的写入操作。")}</p><button type="button" class="mw-btn mw-btn--secondary" data-mcp-tool-call="${id}">${L("执行工具")}</button></details><details class="settings-connection-tool"><summary>${L("读取 MCP 资源")}</summary><label class="settings-connector-field"><span>URI</span><input class="mw-input" data-mcp-resource-uri></label><button type="button" class="mw-btn mw-btn--secondary" data-mcp-resource-read="${id}">${L("读取资源")}</button></details>` : ""}` : `<button class="mw-btn mw-btn--ghost" type="button" data-connector-open="${serviceId}">${L("管理")}</button>`}
  </div>`;
}

function renderProtocolControls(card: ConnectorSettingsCardView, option: ConnectorMethodOption, p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml: e } = p;
  const input = (key: string, label: string, value = "", secret = false, placeholder = "") => `<label class="settings-connector-field"><span>${e(L(label))}</span><input class="mw-input" data-protocol-field="${e(key)}" type="${secret ? "password" : "text"}" autocomplete="off" value="${e(value)}" placeholder="${e(placeholder)}"></label>`;
  let controls = "";
  if (option.oauth) controls = `${option.oauth.note ? `<p>${e(L(option.oauth.note))}</p>` : ""}
    ${input("client_id", "Client ID")}${input("client_secret", option.oauth.client_secret_required ? "Client Secret" : "Client Secret（公开客户端可留空）", "", true)}
    ${option.oauth.fields.map(field => input(`setting:${field.key}`, field.label, "", false, field.placeholder)).join("")}
    <p>${L("在服务商应用中登记以下回调地址：")}<code data-oauth-callback></code></p>
    <details><summary>${L("使用已注册的 HTTPS 回调")}</summary>${input("redirect_uri", "HTTPS 回调地址（可选）")}<p>${L("授权后复制浏览器完整返回地址，回到这里完成连接。")}</p></details>
    <button class="mw-btn mw-btn--secondary" type="button" data-protocol-start="oauth">${L("开始 OAuth 授权")}</button>
    <div data-oauth-return hidden>${input("returned_url", "完整授权返回地址")}<button class="mw-btn mw-btn--secondary" type="button" data-oauth-complete>${L("完成授权")}</button></div>`;
  if (option.mcp) controls = `${input("endpoint", "官方 MCP 地址", option.mcp.endpoint)}
    ${input("client_id", "OAuth Client ID / 飞书 App ID（如服务要求）")}${input("client_secret", "Client Secret / App Secret（如服务要求）", "", true)}
    ${input("token", "MCP 访问令牌（支持令牌的服务可选）", "", true)}
    <p>${L("在应用中登记回调地址：")}<code data-mcp-callback></code></p><details><summary>${L("使用已注册的 HTTPS 回调")}</summary>${input("redirect_uri", "HTTPS 回调地址（可选）")}</details>
    ${["feishu", "lark"].includes(card.connector_id) ? `<p>${L("由本机 npx 启动官方 lark-mcp。App 凭据使用租户身份；填写用户访问令牌时使用用户身份。")}</p>` : ""}
    <button class="mw-btn mw-btn--secondary" type="button" data-protocol-start="mcp">${L("连接并发现工具")}</button>
    <div data-oauth-return hidden>${input("returned_url", "完整授权返回地址")}<button class="mw-btn mw-btn--secondary" type="button" data-oauth-complete>${L("完成授权")}</button></div>`;
  if (option.cli) controls = `<p>${e(option.cli.binary)} · ${L(option.cli.installed ? "已安装" : "尚未安装")}</p>${option.cli.note ? `<p>${e(L(option.cli.note))}</p>` : ""}
    <a href="${e(option.cli.install_url)}" target="_blank" rel="noopener noreferrer">${L("官方安装说明")}</a>
    <div class="settings-connector-actions"><button class="mw-btn mw-btn--secondary" type="button" data-cli-login>${L("运行 CLI 登录")}</button><button class="mw-btn mw-btn--secondary" type="button" data-cli-connect>${L("验证并连接当前账号")}</button></div>
    <div data-cli-session hidden><pre class="settings-connection-output" data-cli-output aria-live="polite"></pre>${input("cli_input", "CLI 交互输入（空白发送回车）", "", true)}<div class="settings-connector-actions"><button type="button" class="mw-btn mw-btn--secondary" data-cli-input>${L("发送输入")}</button><button type="button" class="mw-btn mw-btn--ghost" data-cli-cancel>${L("结束登录")}</button></div></div>`;
  return controls ? `<details class="settings-connector-protocol" data-protocol="${option.kind}" data-protocol-service="${e(card.connector_id)}"><summary>${L("配置并连接")}</summary>${controls}<div data-protocol-result role="status"></div></details>` : "";
}

function renderSetupLinks(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml, icon } = p;
  const links = (card.setup_links ?? []).filter((link) => link.url.startsWith("https://") && link.label.trim().length > 0);
  const options = card.method_options ?? [];
  const methodTitle = { oauth: L("OAuth 授权"), cli: L("官方 CLI"), token: L("令牌 / 应用凭据"), mcp: L("官方 MCP") };
  const supportTitle = { in_app: L("可在应用内连接"), paste: L("可在此粘贴凭据"), external: L("Molis Work 尚未接入") };
  const methodRows = options.map((option) => {
    const officialLinks = option.links.filter((link) => link.url.startsWith("https://") && link.label.trim().length > 0);
    return `<li class="settings-connector-method" data-connector-method="${option.kind}" data-method-support="${option.support}">
      <div class="settings-connector-method__head"><strong>${escapeHtml(methodTitle[option.kind])}</strong><span class="settings-state settings-state--${option.support === "external" ? "neutral" : "success"}">${escapeHtml(supportTitle[option.support])}</span></div>
      <p>${escapeHtml(L(option.note))}</p>
      ${renderProtocolControls(card, option, p)}
      ${officialLinks.length ? `<ul>${officialLinks.map((link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-connector-method-link>${icon("link")}${escapeHtml(L(link.label))}</a></li>`).join("")}</ul>` : ""}
    </li>`;
  }).join("");
  const legacyLinks = links.length ? `<details class="settings-connector-setup-extra"><summary>${escapeHtml(L("更多官方配置入口"))}</summary><nav class="settings-connector-setup" aria-label="${escapeHtml(L("配置入口"))}">
    <ul>${links.map((link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-connector-setup-link>${icon("link")}${escapeHtml(L(link.label))}</a></li>`).join("")}</ul>
  </nav></details>` : "";
  if (!methodRows) return legacyLinks;
  return `<section class="settings-connector-methods" aria-label="${escapeHtml(L("官方连接方式"))}">
    <h3>${escapeHtml(L("官方连接方式"))}</h3>
    <ul>${methodRows}</ul>
    ${legacyLinks}
  </section>`;
}

function renderCapabilities(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const rows = card.capabilities ?? [];
  if (!rows.length) return "";
  const { L, escapeHtml } = p;
  return `<ul class="settings-connector-capabilities">
    ${rows.map((row) => {
      const live = row.fulfillment === "live";
      return `<li data-fulfillment="${live ? "live" : "unfulfilled"}"><span>${escapeHtml(L(live ? "已兑现" : "未兑现"))}</span>${escapeHtml(L(row.label))}</li>`;
    }).join("")}
  </ul>`;
}

function renderGithubDetail(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml } = p;
  const connected = card.account_state === "connected";
  const reauth = card.account_state === "reauth_required";
  const disconnect = `<button class="mw-btn mw-btn--danger-outline" type="button" data-connector-unbind="github">${L("断开")}</button>`;
  return `<form class="settings-connector-auth" data-connector-auth="github">
    <p>${L("授权信息保存在本机；不同项目可以选择各自的连接。凭据不会回显。")}</p>
    ${renderSetupLinks(card, p)}
    ${renderCapabilities(card, p)}
    ${connected ? `${card.hint ? `<p>${L("本机只显示令牌末四位")} <code>${escapeHtml(card.hint)}</code></p>` : ""}
      <div class="settings-connector-actions">
        <button class="mw-btn mw-btn--secondary" type="button" data-connector-whoami="github">${L("查看当前账号")}</button>
        ${disconnect}
      </div>
      <p class="settings-connector-whoami" data-connector-whoami-result hidden></p>` : `${reauth ? `<p>${L("要重新授权")}${card.hint ? ` <code>${escapeHtml(card.hint)}</code>` : ""}</p>` : ""}
    <label class="settings-connector-field"><span>${L("GitHub 访问令牌（需要 notifications 权限）")}</span><input class="mw-input" type="password" autocomplete="off" data-connector-token="github" placeholder="ghp_…"></label>
      <div class="settings-connector-actions"><button class="mw-btn mw-btn--primary" type="submit">${L("连接 GitHub")}</button>${reauth ? disconnect : ""}</div>
      <details class="settings-connector-extra"><summary>${L("使用 Device Flow（notifications + read:user）")}</summary>
        <label class="settings-connector-field"><span>${L("OAuth App Client ID")}</span><input class="mw-input" autocomplete="off" data-connector-github-client-id></label>
        <div class="settings-connector-actions">
          <button class="mw-btn mw-btn--secondary" type="button" data-connector-github-device-start>${L("开始授权")}</button>
          <button class="mw-btn mw-btn--secondary" type="button" data-connector-github-device-poll hidden>${L("我已授权，检查状态")}</button>
        </div>
        <p data-connector-github-device-status hidden></p>
      </details>`}
    ${card.outbound_note ? `<p class="settings-connector-note">${escapeHtml(L(card.outbound_note))}</p>` : ""}
  </form>`;
}

function renderGmailDetail(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  return renderTokenDetail({ ...card, token_label: p.L("Google 访问令牌"),
    auth_help: p.L("OAuth 会自动刷新授权；也可以粘贴带 gmail.readonly 权限的访问令牌，到期后需要重新提供。") }, p);
}

function renderNotionDetail(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  return renderTokenDetail({ ...card,
    auth_help: p.L("使用内部集成令牌时，请把需要读取的页面共享给该集成。OAuth、CLI 和 MCP 可在下方分别配置。") }, p);
}

function renderFeishuDetail(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const { L } = p;
  return renderTokenDetail(card, p) + `<details class="settings-connector-extra"><summary>${L("首次配置飞书 CLI 应用")}</summary>
    <p>${L("安装官方 lark-cli 后，可在这里配置应用；随后使用上方 CLI 入口登录并连接。")}</p>
    <button class="mw-btn mw-btn--secondary" type="button" data-connector-feishu-setup>${L("配置 CLI 应用")}</button>
    <p data-connector-feishu-status aria-live="polite"></p></details>`;
}

function renderTokenDetail(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml } = p;
  const connected = card.account_state === "connected";
  const reauth = card.account_state === "reauth_required";
  const disconnect = `<button class="mw-btn mw-btn--danger-outline" type="button" data-connector-unbind="${escapeHtml(card.connector_id)}">${L("断开")}</button>`;
  const tokenLabel = card.token_label || L("访问令牌");
  return `<form class="settings-connector-auth" data-connector-auth="${escapeHtml(card.connector_id)}">
    <p>${L("授权信息保存在本机；不同项目可以选择各自的连接。凭据不会回显。")}</p>
    ${renderSetupLinks(card, p)}
    ${renderCapabilities(card, p)}
    ${connected ? `${card.hint ? `<p>${L("本机只显示令牌末四位")} <code>${escapeHtml(card.hint)}</code></p>` : ""}
      <div class="settings-connector-actions">
        <button class="mw-btn mw-btn--secondary" type="button" data-connector-whoami="${escapeHtml(card.connector_id)}">${L("查看当前账号")}</button>
        ${disconnect}
      </div>
      <p class="settings-connector-whoami" data-connector-whoami-result hidden></p>` : `${reauth ? `<p>${L("要重新授权")}${card.hint ? ` <code>${escapeHtml(card.hint)}</code>` : ""}</p>` : ""}
    ${card.auth_help ? `<p>${escapeHtml(card.auth_help)}</p>` : ""}
    <label class="settings-connector-field"><span>${escapeHtml(tokenLabel)}</span><input class="mw-input" type="password" autocomplete="off" data-connector-token="${escapeHtml(card.connector_id)}" placeholder="${escapeHtml(card.token_placeholder || "")}"></label>
      <div class="settings-connector-actions"><button class="mw-btn mw-btn--primary" type="submit">${escapeHtml(L("连接 {name}", { name: card.title }))}</button>${reauth ? disconnect : ""}</div>`}
    ${card.outbound_note ? `<p class="settings-connector-note">${escapeHtml(L(card.outbound_note))}</p>` : ""}
  </form>`;
}

function renderCardButton(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives, count: number): string {
  const { L, escapeHtml } = p;
  const placeholder = card.availability === "placeholder";
  return `<button class="mw-card settings-connector-card${placeholder ? " settings-connector-card--placeholder" : ""}" type="button" data-connector-open="${escapeHtml(card.connector_id)}" aria-label="${escapeHtml(`${card.title}，${count ? L("{count} 条连接", { count }) : L("添加连接")}`)}">
    ${renderConnectorMark(card.connector_id, escapeHtml)}
    <span class="settings-connector-card__body">
      <span class="settings-connector-card__title"><strong>${escapeHtml(card.title)}</strong><span class="settings-state settings-state--neutral">${escapeHtml(count ? L("{count} 条", { count }) : L("添加"))}</span></span>
      <span class="settings-connector-card__copy">${escapeHtml(L(card.summary))}</span>
    </span>
  </button>`;
}

export function renderConnectorsSettings(
  view: Pick<MolisWorkSettingsView, "connectors" | "connector_connections" | "capabilities" | "functions_settings">,
  primitives: ConnectorsSettingsPrimitives,
): string {
  const { L, escapeHtml, icon } = primitives;
  const cards = view.connectors ?? [];
  const connections = view.connector_connections ?? [];
  const live = cards.filter((card) => card.availability !== "placeholder");
  const placeholders = cards.filter((card) => card.availability === "placeholder");
  const details = cards.map((card) => {
    const serviceConnections = connections.filter((connection) => connection.service_id === card.connector_id);
    const formCard = { ...card, account_state: "disconnected" as const };
    const body = card.auth_kind === "github"
      ? renderGithubDetail(formCard, primitives)
      : card.auth_kind === "gmail"
        ? renderGmailDetail(formCard, primitives)
        : card.auth_kind === "notion"
          ? renderNotionDetail(formCard, primitives)
          : card.auth_kind === "feishu"
            ? renderFeishuDetail(formCard, primitives)
        : card.auth_kind === "token"
          ? renderTokenDetail(formCard, primitives)
          : `<div class="settings-connector-auth">${renderSetupLinks(card, primitives)}${renderCapabilities(card, primitives)}<p>${escapeHtml(L(card.unavailable_reason || card.summary))}</p></div>`;
    return `<section class="settings-connector-detail" data-connector-detail="${escapeHtml(card.connector_id)}" hidden>
      <button class="mw-btn mw-btn--ghost settings-connector-back" type="button" data-connectors-back>${icon("back")}${L("返回列表")}</button>
      <header class="settings-connector-detail__head">
        ${renderConnectorMark(card.connector_id, escapeHtml)}
        <h2>${escapeHtml(card.title)}</h2>
        <span class="settings-state settings-state--neutral">${escapeHtml(L("{count} 条连接", { count: serviceConnections.length }))}</span>
      </header>
      ${serviceConnections.length ? `<section class="settings-connection-detail-list"><h3>${L("已有连接")}</h3>${serviceConnections.map((connection) => renderConnectionRow(connection, card, primitives, true)).join("")}</section>` : ""}
      ${card.connector_id === "typesafe" && view.functions_settings ? renderFunctionsSettings({ ...view.functions_settings, embedded: true, primitives: { escape: escapeHtml, text: L } }) : ""}
      <h3 class="settings-connection-add-title">${L("添加新连接")}</h3>
      <label class="settings-connector-field"><span>${L("连接名称")}</span><input class="mw-input" data-connector-new-name maxlength="100" value="${escapeHtml(card.title)}" autocomplete="off"></label>
      ${body}
    </section>`;
  }).join("");
  const liveGroups = (["mail", "files", "chat", "code", "work", "design", "crm", "social"] as const).map((groupId) => {
    const groupCards = live.filter((card) => card.group_id === groupId);
    if (!groupCards.length) return "";
    return `<section class="settings-connector-subgroup" data-connector-subgroup="${groupId}">
      <h3>${groupTitle(groupId, L)}</h3>
      <div class="settings-connectors-grid">${groupCards.map((card) => renderCardButton(card, primitives, connections.filter((connection) => connection.service_id === card.connector_id).length)).join("")}</div>
    </section>`;
  }).join("");
  const placeholderGroups = (["mail", "files", "chat", "code", "work", "design", "crm", "social"] as const).map((groupId) => {
    const groupCards = placeholders.filter((card) => card.group_id === groupId);
    if (!groupCards.length) return "";
    return `<section class="settings-connector-subgroup" data-connector-subgroup="${groupId}">
      <h3>${groupTitle(groupId, L)}</h3>
      <div class="settings-connectors-grid">${groupCards.map((card) => renderCardButton(card, primitives, 0)).join("")}</div>
    </section>`;
  }).join("");
  return `<section class="settings-document" aria-labelledby="settings-title" data-connectors-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L(view.capabilities ? "服务连接" : "Connectors")}</h1>${renderHint({ id: "settings-hint-connectors", label: L("如何生效"), text: L("账号和访问令牌保存在这台电脑的连接库。一个服务可以连接多个账号；Feed、判断规则等功能分别选择使用哪条连接。") })}</div><p>${L("在这里管理账号授权；使用时只选择连接。凭据不会回显。")}</p></header>
    <div class="settings-body">
      <p class="settings-form-error" data-connectors-error role="alert" hidden></p>
      <div data-connectors-list>
        <section class="settings-connection-section" aria-label="${escapeHtml(L("我的连接"))}">
          <header><div><h2>${L("我的连接")}</h2><p>${L("同一个服务可以连接多个账号，各自保存授权和状态。")}</p></div><button class="mw-btn mw-btn--primary" type="button" data-connectors-add>${L("添加连接")}</button></header>
          ${connections.length ? `<div class="settings-connection-list">${connections.map((connection) => renderConnectionRow(connection, cards.find((card) => card.connector_id === connection.service_id), primitives)).join("")}</div>`
            : `<div class="settings-connection-empty"><strong>${L("还没有连接")}</strong><p>${L("从下方选择一个服务，添加第一条账号连接。")}</p></div>`}
        </section>
        <section class="settings-connector-catalog" data-connectors-catalog>
          <header><h2>${L("添加连接")}</h2><p>${L("先选服务，再选 OAuth、令牌或该服务支持的其他方式。")}</p></header>
        ${live.length ? `<section class="settings-connector-group" data-connector-group="live">
    <h2>${L("可以连接")}</h2>
    ${liveGroups}
  </section>` : ""}
        ${placeholders.length ? `<section class="settings-connector-group" data-connector-group="placeholder">
    <h2>${L("还不能连")}</h2>
    ${placeholderGroups}
  </section>` : ""}
        </section>
      </div>
      ${details}
    </div>
  </section>`;
}
