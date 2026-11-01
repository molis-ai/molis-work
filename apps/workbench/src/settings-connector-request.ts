import type { ConnectorPrimitives } from "./settings-connector-guide.js";
import { renderLocalConnectorPlan } from "./settings-connector-local.js";
import { renderMethodGuide } from "./settings-connector-guide.js";
import type { ConnectorMethodKind } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ConnectorSettingsCardView } from "./settings-view.js";

type ConnectorToolSource = { kind: "executable"; executable: string } | { kind: "powershell"; package: string; version: string; bin: string; runtime: { version: string; url: string } } | { kind: "native"; package: string; version: string; bin: string; url: string; sha256: string; entry?: string } | { kind: "npm" | "python"; package: string; version: string; bin: string; registry?: string; node_version?: string; python_version?: string };

export interface ConnectorSetupView {
  id: string;
  status: "prepared" | "pending" | "connected" | "cancelled" | "failed" | "expired";
  connection_id: string;
  expires_at: number;
  commit_held?: boolean;
  completion_ready?: boolean;
  installation_ready?: boolean;
  setup?: { service_id: string; method: ConnectorMethodKind; display_name: string; connection_id?: string; endpoint?: string; authentication?: "none" | "bearer" | "oauth"; transport?: "http" | "sse" | "stdio";
    cli_setup?: Exclude<ConnectorToolSource, { kind: "executable" }>;
    local_setup?: { source: ConnectorToolSource; args: string[]; cwd: string; environment_names: string[] };
    installation?: { platform: string; architecture: string; directory: string; requires_credentials: boolean } };
  presentation?: { authorization_url?: string; user_code?: string; cli_job?: string };
}

/** The requested method uses the existing protected form; none of its input is sent through the conversation. */
export function renderConnectorRequest(request: ConnectorSetupView | null, cards: readonly ConnectorSettingsCardView[], p: ConnectorPrimitives): string {
  const { L, escapeHtml: e } = p, plan = request?.setup;
  const card = cards.find(row => row.connector_id === plan?.service_id);
  const option = card?.method_options?.find(row => row.kind === plan?.method);
  if (!request || !plan || !card || (!option && !plan.local_setup)) return `<section class="settings-document"><h1>${L("接入请求已失效")}</h1><p>${L("请回到原对话重新准备接入。已有连接不受影响。")}</p></section>`;
  const prepared = request.status === "prepared" || request.status === "failed" && request.installation_ready === true, pending = request.status === "pending";
  const selected = plan.cli_setup && option?.cli ? { ...option, cli: { ...option.cli, installed: request.installation_ready === true } } : option?.mcp && plan.endpoint ? { ...option, mcp: { ...option.mcp, endpoint: plan.endpoint } } : option;
  const message = request.commit_held ? "正在核对你刚提出的新要求，接入暂不提交。请回到原对话继续。" : request.status === "failed" && request.installation_ready ? plan.cli_setup ? "安装已保留。请检查客户端运行条件或登录状态，再重试。" : "安装已保留。请修复启动条件或重新填写凭据，再重试验证。原连接未更改。" : prepared ? "请在这里完成本人操作。密钥不会进入助理对话。" : pending ? plan.local_setup || plan.cli_setup ? "正在安装或验证本地工具。关闭页面不会取消；可以稍后重新打开查看结果。" : "等待你完成授权。关闭这个页面不会取消接入。"
    : request.status === "connected" ? "连接已保存。实际可用范围以连接检查和业务调用为准。" : "这次接入没有完成。请回到原对话查看状态或重新准备。";
  return `<section class="settings-document" data-connectors-settings data-setup-id="${e(request.id)}" data-open-connector="${e(card.connector_id)}" data-setup-connection="${e(plan.connection_id ?? "")}">
    <div data-connectors-list hidden></div><p data-connectors-error role="alert" hidden></p>
    <section class="settings-connector-detail" data-connector-detail="${e(card.connector_id)}">
      <header class="settings-heading"><h2 tabindex="-1">${e(plan.display_name)}</h2><p>${e(plan.local_setup ? L("本地 MCP") : card.title)}</p></header>
      <p data-connector-feedback role="status">${L(message)}</p><div class="settings-body">
      ${prepared ? `${plan.cli_setup ? renderLocalConnectorPlan(plan, p, request.installation_ready) + (request.installation_ready ? renderMethodGuide(card, selected!, p, plan, request.presentation?.cli_job) : "") : plan.local_setup ? renderLocalConnectorPlan(plan, p, request.installation_ready) : renderMethodGuide(card, selected!, p, plan)}<input data-connector-new-name type="hidden" value="${e(plan.display_name)}">` : ""}
      ${pending ? `<div data-protocol="${e(plan.method)}" data-protocol-service="${e(card.connector_id)}" data-pending-setup="${e(request.id)}" data-setup-expires="${request.expires_at}"><div data-protocol-result></div>
        ${request.presentation?.authorization_url ? `<a class="mw-btn mw-btn--secondary" href="${e(request.presentation.authorization_url)}" target="_blank" rel="noopener noreferrer">${L("重新打开官方授权页")}</a>` : ""}
        ${request.presentation?.user_code ? `<p>${e(L("在 {name} 输入设备码：{code}", { name: card.title, code: request.presentation.user_code }))}</p>` : ""}</div>` : ""}
      ${prepared || pending ? `<button class="mw-btn mw-btn--ghost" data-setup-cancel>${L("取消这次接入")}</button>` : ""}
      <a class="mw-btn mw-btn--secondary" href="/capabilities/connections">${L("查看所有连接")}</a>
      </div>
    </section>
  </section>`;
}
