import { icon as designIcon } from "@molis-ai/molis-work-design-system";
import { renderFunctionsSettings } from "./functions/settings-ui.js";
import type { ConnectorConnectionView, ConnectorDirectoryGroupId } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorPurpose, credentialInputs, pathLabel, renderConnectorSetup, recommendedMethod, readyAccountLogin } from "./settings-connector-guide.js";
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
  /** Where the docs page that lists every outbound network class is read, in the interface language; no link without it. */
  networkDocHref?: string;
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
  if (method === "oauth") return L("账号授权");
  if (method === "cli") return L("本机客户端");
  if (method === "mcp") return L("官方工具");
  if (method === "none") return L("无需鉴权");
  return L("访问令牌");
}

function connectionState(state: ConnectorConnectionView["state"], L: ConnectorsSettingsPrimitives["L"]): { label: string; tone: string } {
  if (state === "connected") return { label: L("已保存"), tone: "neutral" };
  if (state === "reauth_required") return { label: L("需重新授权"), tone: "warning" };
  return { label: L("已断开"), tone: "neutral" };
}

function renderConnectionRow(connection: ConnectorConnectionView, card: ConnectorSettingsCardView | undefined, p: ConnectorsSettingsPrimitives, inDetail = false): string {
  const { L, escapeHtml } = p;
  const state = connectionState(connection.state, L);
  const name = escapeHtml(connection.display_name);
  const serviceTitle = escapeHtml(card?.title || connection.service_id);
  const canManage = connection.source !== "external" || connection.auth_method === "cli";
  const credential = card ? credentialInputs(card, p) : { fields: `<input class="mw-input" type="password" autocomplete="off" aria-label="${escapeHtml(L("新令牌"))}" data-connector-token required>` };
  const id = escapeHtml(connection.connection_id);
  const serviceId = escapeHtml(connection.service_id);
  return `<div class="settings-connection-row" data-connection-row="${id}" data-connection-service="${serviceId}">
    ${renderConnectorMark(connection.service_id, escapeHtml)}
    <div class="settings-connection-row__identity"><strong>${name}</strong><small>${serviceTitle} · ${escapeHtml(connectionMethod(connection.auth_method, L))}${connection.account_label ? ` · ${escapeHtml(connection.account_label)}` : ""}</small>${connection.target_origin ? `<small>${escapeHtml(L("绑定地址"))} · ${escapeHtml(connection.target_origin)}</small>` : ""}</div>
    <span class="settings-state settings-state--${state.tone}" data-connection-state>${escapeHtml(state.label)}</span>
    ${inDetail ? `<div class="settings-connection-row__actions">
      ${connection.state !== "disconnected" && !["model-api", "image-api", "typesafe", "mcp-bearer"].includes(connection.service_id) ? `<button class="mw-btn mw-btn--secondary" type="button" data-connection-check="${id}">${L("检查连接")}</button><button class="mw-btn mw-btn--secondary" type="button" data-connection-preview="${id}">${L(connection.auth_method === "mcp" ? "查看可用工具" : "查看读取结果")}</button>` : ""}
      ${canManage && ["oauth", "mcp"].includes(connection.auth_method) ? `<button class="mw-btn mw-btn--secondary" type="button" data-connection-reauthorize="${id}" data-connection-method="${connection.auth_method}">${L(connection.auth_method === "mcp" ? "新增 MCP 授权" : "重新授权")}</button>` : ""}
      ${canManage && connection.auth_method === "token" ? `<details class="settings-connection-inline"><summary>${L("更换令牌")}</summary><form data-connection-replace="${id}"${credential.separator ? ` data-credential-separator="${credential.separator}"` : ""}>${credential.fields}<button class="mw-btn mw-btn--secondary" type="submit">${L("保存")}</button></form></details>` : ""}
      ${canManage ? `<details class="settings-connection-inline"><summary>${L("重命名")}</summary><form data-connection-rename="${id}"><input class="mw-input" value="${name}" maxlength="100" required aria-label="${escapeHtml(L("连接名称"))}"><button class="mw-btn mw-btn--secondary" type="submit">${L("保存")}</button></form></details>
        ${connection.state !== "disconnected" ? `<button class="mw-btn mw-btn--danger-outline" type="button" data-connection-disconnect="${id}">${L("断开")}</button>` : ""}` : `<small>${L("由外部环境管理凭据")}</small>`}
    </div><div class="settings-connection-result" data-connection-result role="status" aria-live="polite" hidden></div>
    ${connection.auth_method === "mcp" && connection.state !== "disconnected" ? `<details class="settings-connection-tool"><summary>${L("开发者工具：手动调用 MCP")}</summary><label class="settings-connector-field"><span>${L("工具名称（先查看工具列表）")}</span><input class="mw-input" data-mcp-tool-name></label><label class="settings-connector-field"><span>${L("参数 JSON")}</span><textarea class="mw-input" data-mcp-tool-arguments rows="4">{}</textarea></label><p>${L("根据工具说明确认作用范围；点击后会执行该工具，包括它声明的写入操作。")}</p><button type="button" class="mw-btn mw-btn--secondary" data-mcp-tool-call="${id}">${L("执行工具")}</button></details><details class="settings-connection-tool"><summary>${L("开发者工具：读取 MCP 资源")}</summary><label class="settings-connector-field"><span>URI</span><input class="mw-input" data-mcp-resource-uri></label><button type="button" class="mw-btn mw-btn--secondary" data-mcp-resource-read="${id}">${L("读取资源")}</button></details>` : ""}` : `<button class="mw-btn mw-btn--ghost" type="button" data-connector-open="${serviceId}">${L("管理")}</button>`}
  </div>`;
}

function renderCardButton(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives, count: number): string {
  const { L, escapeHtml } = p;
  const placeholder = card.availability === "placeholder";
  const method = recommendedMethod(card);
  const direct = !placeholder && !count && (method?.login_ready || readyAccountLogin(card));
  return `<button class="mw-card settings-connector-card${placeholder ? " settings-connector-card--placeholder" : ""}" type="button" data-connector-open="${escapeHtml(card.connector_id)}"${direct ? ` data-connector-direct="${method!.kind}"` : ""} data-connector-search="${escapeHtml((card.title + " " + card.connector_id + " " + connectorPurpose(card)).toLowerCase())}" aria-label="${escapeHtml(`${card.title}，${count ? L("{count} 条连接", { count }) : direct ? L("登录并连接") : L("查看连接方式")}`)}">
    ${renderConnectorMark(card.connector_id, escapeHtml)}
    <span class="settings-connector-card__body">
      <span class="settings-connector-card__title"><strong>${escapeHtml(card.title)}</strong><span class="settings-state settings-state--neutral">${escapeHtml(count ? L("{count} 个账号", { count }) : direct ? L("登录并连接") : L(pathLabel(card)))}</span></span>
      <span class="settings-connector-card__copy">${escapeHtml(L(connectorPurpose(card)))}</span>
    </span>
  </button>`;
}

function renderNextSteps(card: ConnectorSettingsCardView, connections: readonly ConnectorConnectionView[], p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml: e } = p;
  const active = connections.filter(connection => connection.state === "connected");
  const instructions: Array<{ text: string; label?: string; href?: string; plugin?: string }> = [];
  if (!active.length) {
    const method = recommendedMethod(card)?.kind;
    const text = method === "mcp" ? "连接完成后，在 Coding 的 MCP 设置中选择此账号，再选择本轮可用的工具。"
      : method === "cli" ? "完成本机客户端登录后，回到这里检查账号与可用操作。"
      : "先完成账号连接。连接成功后，这里会显示可用的下一步。";
    instructions.push({ text });
  } else {
    if (active.some(row => row.auth_method === "mcp" && row.agent_available !== false) || card.connector_id === "mcp-bearer") instructions.push({ text: "在 Coding 的 MCP 设置中选择已授权账号，保存并连接后，在会话中选择本轮工具。", label: "设置 Agent 工具", href: "/settings/coding-settings" });
    if (active.some(row => row.auth_method === "mcp" && row.agent_available === false)) instructions.push({ text: "此连接使用服务商的原生传输。可以在上方查看工具并执行明确的工具操作；当前传输暂不支持 Coding。" });
    if (active.some(row => row.auth_method === "cli")) instructions.push({ text: "账号由本机客户端管理。可以在上方检查连接、查看读取结果；本机客户端连接不用于 Feed 自动同步。" });
    if (active.some(row => row.auth_method === "oauth" || row.auth_method === "token")) {
      if (card.connector_id === "model-api") instructions.push({ text: "在模型设置中选择此连接，再选择模型并检查可用性。", label: "打开模型设置", href: "/settings/models" });
      else if (card.connector_id === "image-api") instructions.push({ text: "在项目 Images 中选择此连接，配置图像服务并尝试生成。", label: "选择项目，打开 Images", href: "/", plugin: "images" });
      else if (card.connector_id === "typesafe") instructions.push({ text: "在 Functions 或 Experiments 中选择此账号。", label: "查看 Functions", href: "/capabilities/library" });
      else if (card.feed_available) instructions.push({ text: "在项目 Feed 中添加来源并选择已连接的 API 账号与内容范围。", label: "选择项目，添加来源", href: "/", plugin: "feed" });
      else if (card.connector_id !== "mcp-bearer") instructions.push({ text: "可以在上方检查账号授权。此 API 连接暂不提供 Feed 同步。" });
    }
  }
  return `<section class="settings-connector-next" data-connector-next><h3>${L(active.length ? "连接后，下一步" : "连接后可以做什么")}</h3>${instructions.map(step => `<p>${e(L(step.text))}</p>${step.href ? `<a class="mw-btn mw-btn--secondary" data-connector-next-link="${e(step.plugin || "")}" href="${e(step.href)}">${e(L(step.label!))}</a>` : ""}`).join("")}<small>${L("连接只保存账号授权。你可以在使用时选择账号与内容范围。")}</small></section>`;
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
    const body = renderConnectorSetup(card, primitives);
    return `<section class="settings-connector-detail" data-connector-detail="${escapeHtml(card.connector_id)}" hidden>
      <button class="mw-btn mw-btn--ghost settings-connector-back" type="button" data-connectors-back>${icon("back")}${L("返回列表")}</button>
      <header class="settings-connector-detail__head">
        ${renderConnectorMark(card.connector_id, escapeHtml)}
        <h2 tabindex="-1">${escapeHtml(card.title)}</h2>
        <span class="settings-state settings-state--neutral">${escapeHtml(L(pathLabel(card)))}</span>
      </header>
      <p class="settings-connector-purpose">${escapeHtml(L(connectorPurpose(card)))}</p>
      <div class="settings-connector-feedback" data-connector-feedback role="status" aria-live="polite" hidden></div>
      ${serviceConnections.length ? `<section class="settings-connection-detail-list"><h3>${L("已有连接")}</h3>${serviceConnections.map((connection) => renderConnectionRow(connection, card, primitives, true)).join("")}</section>` : ""}
      ${card.connector_id === "typesafe" && view.functions_settings ? renderFunctionsSettings({ ...view.functions_settings, embedded: true, primitives: { escape: escapeHtml, text: L } }) : ""}
      ${serviceConnections.length ? `<details class="settings-connector-add" data-connector-add><summary>${L("添加另一个账号")}</summary>${body}</details>` : `<div data-connector-add>${body}</div>`}
      ${renderNextSteps(card, serviceConnections, primitives)}
    </section>`;
  }).join("");
  const liveGroups = (["mail", "files", "chat", "code", "work", "design", "crm", "social"] as const).map((groupId) => {
    const groupCards = live.filter((card) => card.group_id === groupId);
    if (!groupCards.length) return "";
    return `<section class="settings-connector-subgroup" data-connector-subgroup="${groupId}">
      <h3>${groupTitle(groupId, L)}</h3>
      <div class="settings-connectors-grid">${groupCards.map((card) => renderCardButton(card, primitives, connections.filter((connection) => connection.service_id === card.connector_id && connection.state !== "disconnected").length)).join("")}</div>
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
  // Under the heading, like the MCP page's link to the external-tools page: a footnote below the whole catalog is rarely seen.
  const networkDoc = primitives.networkDocHref ? `<p data-network-doc>${L("Molis Work 自己联网的去处（模型、搜索、订阅源、依赖下载等）逐类写在这一页：")}<a href="${escapeHtml(primitives.networkDocHref)}" target="_blank" rel="noopener noreferrer">${L("Molis Work 会联网去哪里")}</a></p>` : "";
  return `<section class="settings-document" aria-labelledby="settings-title" data-connectors-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("服务连接")}</h1></div><p>${L("连接你常用的应用，把工作内容和工具带进 Molis。")}</p>${networkDoc}</header>
    <div class="settings-body">
      <p class="settings-form-error" data-connectors-error role="alert" hidden></p>
      <div data-connectors-list>
        <section class="settings-connection-section" aria-label="${escapeHtml(L("我的连接"))}">
          <header><div><h2>${L("我的连接")}</h2><p>${L("同一个服务可以连接多个账号，各自保存授权和状态。")}</p></div><button class="mw-btn mw-btn--primary" type="button" data-connectors-add>${L("添加连接")}</button></header>
          ${connections.length ? `<div class="settings-connection-list">${connections.map((connection) => renderConnectionRow(connection, cards.find((card) => card.connector_id === connection.service_id), primitives)).join("")}</div>`
            : `<div class="settings-connection-empty"><strong>${L("从你常用的一个应用开始")}</strong><p>${L("选择下方服务，按提示登录或填写密钥。你可以稍后再添加其他账号。")}</p></div>`}
        </section>
        <section class="settings-connector-catalog" data-connectors-catalog>
          <header><h2>${L("添加服务")}</h2><p>${L("点击“登录并连接”前往官方授权；标记为准备中的服务尚未开放直接登录。")}</p></header>
          <div class="settings-connector-filters"><label class="settings-connector-field"><span>${L("搜索服务")}</span><input class="mw-input" type="search" data-connectors-search placeholder="${L("搜索 Gmail、Notion、飞书…")}"></label><label class="settings-connector-field"><span>${L("分类")}</span><select class="mw-input" data-connectors-category><option value="">${L("所有服务")}</option>${(["mail", "files", "chat", "code", "work", "design", "crm", "social"] as const).map(id => `<option value="${id}">${groupTitle(id, L)}</option>`).join("")}</select></label></div>
          <p data-connectors-no-results role="status" hidden>${L("没有找到这个服务。换个关键词，或查看所有分类。")} <button type="button" class="mw-btn mw-btn--ghost" data-connectors-reset>${L("清除筛选")}</button></p>
        ${live.length ? `<section class="settings-connector-group" data-connector-group="live">

    ${liveGroups}
  </section>` : ""}
        ${placeholders.length ? `<section class="settings-connector-group" data-connector-group="placeholder">
    <h2>${L("暂未接入")}</h2>
    ${placeholderGroups}
  </section>` : ""}
        </section>
      </div>
      ${details}
    </div>
  </section>`;
}
