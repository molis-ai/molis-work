import type { ConnectorPrimitives } from "./settings-connector-guide.js";
import { renderMethodGuide } from "./settings-connector-guide.js";
import type { ConnectorMethodKind } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ConnectorSettingsCardView } from "./settings-view.js";

export interface ConnectorSetupView {
  id: string;
  status: "prepared" | "pending" | "connected" | "cancelled" | "failed" | "expired";
  connection_id: string;
  expires_at: number;
  setup?: { service_id: string; method: ConnectorMethodKind; display_name: string; connection_id?: string; endpoint?: string; authentication?: "none" | "bearer" | "oauth"; transport?: "http" | "sse" };
  presentation?: { authorization_url?: string; user_code?: string };
}

/** The requested method uses the existing protected form; none of its input is sent through the conversation. */
export function renderConnectorRequest(request: ConnectorSetupView | null, cards: readonly ConnectorSettingsCardView[], p: ConnectorPrimitives): string {
  const { L, escapeHtml: e } = p, plan = request?.setup;
  const card = cards.find(row => row.connector_id === plan?.service_id);
  const option = card?.method_options?.find(row => row.kind === plan?.method);
  if (!request || !plan || !card || !option) return `<section class="settings-document"><h1>${L("接入请求已失效")}</h1><p>${L("请回到原对话重新准备接入。已有连接不受影响。")}</p></section>`;
  const prepared = request.status === "prepared", pending = request.status === "pending";
  const selected = option.mcp && plan.endpoint ? { ...option, mcp: { ...option.mcp, endpoint: plan.endpoint } } : option;
  const message = prepared ? "请在这里完成本人操作。密钥不会进入助理对话。" : pending ? "等待你完成授权。关闭这个页面不会取消接入。"
    : request.status === "connected" ? "连接已保存。实际可用范围以连接检查和业务调用为准。" : "这次接入没有完成。请回到原对话查看状态或重新准备。";
  return `<section class="settings-document" data-connectors-settings data-setup-id="${e(request.id)}" data-open-connector="${e(card.connector_id)}" data-setup-connection="${e(plan.connection_id ?? "")}">
    <div data-connectors-list hidden></div><p data-connectors-error role="alert" hidden></p>
    <section class="settings-connector-detail" data-connector-detail="${e(card.connector_id)}">
      <header class="settings-heading"><h2 tabindex="-1">${e(plan.display_name)}</h2><p>${e(card.title)}</p></header>
      <p data-connector-feedback role="status">${L(message)}</p><div class="settings-body">
      ${prepared ? `${renderMethodGuide(card, selected, p, plan)}<input data-connector-new-name type="hidden" value="${e(plan.display_name)}">` : ""}
      ${pending ? `<div data-protocol="${e(plan.method)}" data-protocol-service="${e(card.connector_id)}" data-pending-setup="${e(request.id)}" data-setup-expires="${request.expires_at}"><div data-protocol-result></div>
        ${request.presentation?.authorization_url ? `<a class="mw-btn mw-btn--secondary" href="${e(request.presentation.authorization_url)}" target="_blank" rel="noopener noreferrer">${L("重新打开官方授权页")}</a>` : ""}
        ${request.presentation?.user_code ? `<p>${e(L("在 GitHub 输入设备码：{code}", { code: request.presentation.user_code }))}</p>` : ""}</div>` : ""}
      ${prepared || pending ? `<button class="mw-btn mw-btn--ghost" data-setup-cancel>${L("取消这次接入")}</button>` : ""}
      <a class="mw-btn mw-btn--secondary" href="/capabilities/connections">${L("查看所有连接")}</a>
      </div>
    </section>
  </section>`;
}
