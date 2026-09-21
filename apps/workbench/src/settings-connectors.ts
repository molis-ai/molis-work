import { renderHint } from "@molis-ai/molis-work-design-system";
import type { ConnectorDirectoryGroupId } from "@molis-ai/molis-work-contracts/services/connector-host";
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

function accountLabel(card: ConnectorSettingsCardView, L: ConnectorsSettingsPrimitives["L"]): { text: string; tone: "success" | "warning" | "neutral" } {
  if (card.availability === "placeholder") return { text: L("还不能连"), tone: "neutral" };
  if (card.account_state === "connected") return { text: L("已连接"), tone: "success" };
  if (card.account_state === "reauth_required") return { text: L("要重新授权"), tone: "warning" };
  return { text: L("未连接"), tone: "neutral" };
}

function renderConnectorMark(connectorId: string, escapeHtml: ConnectorsSettingsPrimitives["escapeHtml"]): string {
  const mark = connectorMark(connectorId);
  if (!mark) {
    return `<span class="settings-connector-mark settings-connector-mark--fallback" data-connector-mark="${escapeHtml(connectorId)}" aria-hidden="true"></span>`;
  }
  const paths = mark.paths.map((path) => `<path d="${path.d}"${path.fill ? ` fill="${path.fill}"` : ""}></path>`).join("");
  const rule = mark.fillRule ? ` fill-rule="${mark.fillRule}"` : "";
  return `<span class="settings-connector-mark" data-connector-mark="${escapeHtml(connectorId)}" data-on="${mark.on}" style="--connector-brand:${mark.tile}" aria-hidden="true"><svg viewBox="${escapeHtml(mark.viewBox)}" focusable="false"${rule}>${paths}${mark.extra ?? ""}</svg></span>`;
}

function renderGithubDetail(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml } = p;
  const connected = card.account_state === "connected";
  const reauth = card.account_state === "reauth_required";
  const disconnect = `<button class="mw-btn mw-btn--danger-outline" type="button" data-connector-unbind="github">${L("断开")}</button>`;
  return `<form class="settings-connector-auth" data-connector-auth="github">
    <p>${L("账号属于这台电脑上的人，不是某个项目。凭据只进本机 SecretStore，这里不显示明文。")}</p>
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
  const { L, escapeHtml } = p;
  const connected = card.account_state === "connected";
  const reauth = card.account_state === "reauth_required";
  const disconnect = `<button class="mw-btn mw-btn--danger-outline" type="button" data-connector-unbind="gmail">${L("断开")}</button>`;
  return `<form class="settings-connector-auth" data-connector-auth="gmail">
    <p>${L("账号属于这台电脑上的人，不是某个项目。Feed 拉信继续用这份连接。")}</p>
    ${connected ? `${card.hint ? `<p>${L("本机只显示令牌末四位")} <code>${escapeHtml(card.hint)}</code></p>` : ""}
      <div class="settings-connector-actions">${disconnect}</div>` : `${reauth ? `<p>${L("要重新授权")}${card.hint ? ` <code>${escapeHtml(card.hint)}</code>` : ""}</p>` : ""}
      <label class="settings-connector-field"><span>${L("Google 访问令牌")}</span><input class="mw-input" type="password" autocomplete="off" data-connector-token="gmail" placeholder="ya29.…"></label>
      <div class="settings-connector-actions"><button class="mw-btn mw-btn--primary" type="submit">${L("连接 Gmail")}</button>${reauth ? disconnect : ""}</div>
      <details class="settings-connector-extra"><summary>${L("使用 Google OAuth")}</summary>
        <p>${L("授权范围：gmail.readonly、openid、email；Molis Work 不发送、删除或修改 Gmail 邮件。")}</p>
        <label class="settings-connector-field"><span>${L("OAuth Client ID")}</span><input class="mw-input" autocomplete="off" data-connector-gmail-client-id></label>
        <label class="settings-connector-field"><span>${L("Client secret（可选）")}</span><input class="mw-input" type="password" autocomplete="off" data-connector-gmail-client-secret></label>
        <button class="mw-btn mw-btn--secondary" type="button" data-connector-gmail-oauth-start>${L("打开授权页面")}</button>
      </details>`}
    ${card.outbound_note ? `<p class="settings-connector-note">${escapeHtml(L(card.outbound_note))}</p>` : ""}
  </form>`;
}

function renderPlaceholderDetail(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml } = p;
  return `<div class="settings-connector-auth">
    <p>${escapeHtml(L(card.unavailable_reason || card.summary))}</p>
  </div>`;
}

function renderCardButton(card: ConnectorSettingsCardView, p: ConnectorsSettingsPrimitives): string {
  const { L, escapeHtml } = p;
  const state = accountLabel(card, L);
  const placeholder = card.availability === "placeholder";
  return `<button class="mw-card settings-connector-card${placeholder ? " settings-connector-card--placeholder" : ""}" type="button" data-connector-open="${escapeHtml(card.connector_id)}" aria-label="${escapeHtml(`${card.title}，${state.text}`)}">
    ${renderConnectorMark(card.connector_id, escapeHtml)}
    <span class="settings-connector-card__body">
      <span class="settings-connector-card__title"><strong>${escapeHtml(card.title)}</strong><span class="settings-state settings-state--${state.tone}">${escapeHtml(state.text)}</span></span>
      <span class="settings-connector-card__copy">${escapeHtml(L(card.summary))}</span>
    </span>
  </button>`;
}

function renderGroup(
  id: "live" | "placeholder",
  title: string,
  cards: readonly ConnectorSettingsCardView[],
  p: ConnectorsSettingsPrimitives,
): string {
  if (!cards.length) return "";
  return `<section class="settings-connector-group" data-connector-group="${id}">
    <h2>${p.L(title)}</h2>
    <div class="settings-connectors-grid">${cards.map((card) => renderCardButton(card, p)).join("")}</div>
  </section>`;
}

export function renderConnectorsSettings(
  view: Pick<MolisWorkSettingsView, "connectors">,
  primitives: ConnectorsSettingsPrimitives,
): string {
  const { L, escapeHtml, icon } = primitives;
  const cards = view.connectors ?? [];
  const live = cards.filter((card) => card.availability !== "placeholder");
  const placeholders = cards.filter((card) => card.availability === "placeholder");
  const details = cards.map((card) => {
    const state = accountLabel(card, L);
    const body = card.auth_kind === "github"
      ? renderGithubDetail(card, primitives)
      : card.auth_kind === "gmail"
        ? renderGmailDetail(card, primitives)
        : renderPlaceholderDetail(card, primitives);
    return `<section class="settings-connector-detail" data-connector-detail="${escapeHtml(card.connector_id)}" hidden>
      <button class="mw-btn mw-btn--ghost settings-connector-back" type="button" data-connectors-back>${icon("back")}${L("返回列表")}</button>
      <header class="settings-connector-detail__head">
        ${renderConnectorMark(card.connector_id, escapeHtml)}
        <h2>${escapeHtml(card.title)}</h2>
        <span class="settings-state settings-state--${state.tone}">${escapeHtml(state.text)}</span>
      </header>
      ${body}
    </section>`;
  }).join("");
  const placeholderGroups = (["mail", "files", "chat", "code", "work", "design", "crm", "social"] as const).map((groupId) => {
    const cards = placeholders.filter((card) => card.group_id === groupId);
    if (!cards.length) return "";
    return `<section class="settings-connector-subgroup" data-connector-subgroup="${groupId}">
      <h3>${groupTitle(groupId, L)}</h3>
      <div class="settings-connectors-grid">${cards.map((card) => renderCardButton(card, primitives)).join("")}</div>
    </section>`;
  }).join("");
  return `<section class="settings-document" aria-labelledby="settings-title" data-connectors-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("Connectors")}</h1>${renderHint({ id: "settings-hint-connectors", label: L("如何生效"), text: L("这里连的是这台电脑上的人的账号。连上之后，该服务已兑现的动作会出现在 Functions 行为总表里，判断只挑，不会自动发出去。Feed 拉通知继续用同一份连接。这和设置 → MCP 不是同一件事。") })}</div><p>${L("点一张卡片进去授权或断开。页面不回显明文。")}</p></header>
    <div class="settings-body">
      <p class="settings-form-error" data-connectors-error role="alert" hidden></p>
      <div data-connectors-list>
        ${renderGroup("live", "可以连接", live, primitives)}
        ${placeholders.length ? `<section class="settings-connector-group" data-connector-group="placeholder">
    <h2>${L("还不能连")}</h2>
    ${placeholderGroups}
  </section>` : ""}
      </div>
      ${details}
    </div>
  </section>`;
}
