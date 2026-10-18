import type { ConnectorConnectionStatus } from "@molis-ai/molis-work-contracts/services/connector-host";

/** Kept in the existing connection detail; the four dimensions are never collapsed into one success badge. */
export function renderConnectionStatus(status: ConnectorConnectionStatus | undefined, p: { L(text: string): string; escapeHtml(value: unknown): string }): string {
  if (!status) return "";
  const { L, escapeHtml: e } = p;
  const connectivity = { disconnected: L("已断开"), unchecked: L("未检查"), connected: L("连通检查通过"), failed: L("检查失败"), unknown: L("结果未确认") };
  const authorization = { "not-required": L("无需服务端登录"), verified: L("账号已验证"), unknown: L("授权尚未验证"), required: L("需重新授权") };
  const work = { allowed: L("当前调用者已获准"), partial: L("当前调用者仅获部分权限"), blocked: L("当前调用者未获准"), unknown: L("尚无能力可核对权限") };
  const capabilities = { "none-discovered": L("未发现可用能力"), callable: L("当前可调用"), partial: L("部分可调用"), blocked: L("暂不可调用") };
  const last = status.last_call;
  const outcome = { succeeded: L("调用成功"), failed: L("调用失败"), unknown: L("结果未确认") };
  return `<details class="settings-connection-tool settings-connection-inline" data-connection-status><summary>${e(L("连接、授权与能力"))} · ${e(connectivity[status.connectivity.state])}</summary><dl>
    <dt>${e(L("配置"))}</dt><dd>${e(status.configuration.state === "complete" ? L("配置完整") : L("配置不完整"))} · ${e(status.configuration.enabled ? L("已启用") : L("已停用"))}</dd>
    <dt>${e(L("连通性"))}</dt><dd>${e(connectivity[status.connectivity.state])}${status.connectivity.observed_at ? ` · <time>${e(status.connectivity.observed_at)}</time>` : ""}${status.connectivity.current === false ? ` · ${e(L("旧检查不代表当前配置"))}` : ""}</dd>
    <dt>${e(L("授权"))}</dt><dd>${e(authorization[status.authorization.service.state])} · ${e(status.authorization.service.scopes?.join(", ") || L("服务端授权范围未知"))}<br>${e(work[status.authorization.work.state])}${status.authorization.work.source === "current-project" ? ` · ${e(L("请在所属项目中核对调用权限"))}` : ""}</dd>
    <dt>${e(L("能力"))}</dt><dd>${e(capabilities[status.capabilities.state])}${status.capabilities.entries.length ? `<ul>${status.capabilities.entries.map(entry => `<li>${e(entry.title)} · ${e(entry.available ? L("当前可调用") : entry.reason || L("暂不可调用"))}</li>`).join("")}</ul>` : ""}</dd>
    <dt>${e(L("最近实际调用"))}</dt><dd>${last ? `${e(outcome[last.outcome])} · <time>${e(last.at)}</time>${last.current_revision ? "" : ` · ${e(L("来自旧配置"))}`}` : e(L("尚无调用记录"))}</dd>
  </dl><small>${e(L("依据连接配置、当前权限、能力目录和实际回执；每次调用仍会复核。"))}</small></details>`;
}
