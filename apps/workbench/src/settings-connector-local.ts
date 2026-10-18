import type { ConnectorSetupView } from "./settings-connector-request.js";
import type { ConnectorPrimitives } from "./settings-connector-guide.js";

export function renderLocalConnectorPlan(plan: NonNullable<ConnectorSetupView["setup"]>, p: ConnectorPrimitives, installed = false): string {
  const { L, escapeHtml: e } = p, local = plan.local_setup, source = local?.source ?? plan.cli_setup!, cli = Boolean(plan.cli_setup);
  const field = (label: string, value: string) => `<div class="settings-connector-field"><span>${e(L(label))}</span><code class="settings-connection-output">${e(value)}</code></div>`;
  return `<form data-connector-local data-protocol="${cli ? "cli" : "local"}" data-protocol-service="${e(plan.service_id)}" class="settings-connector-guide">
    <p>${L(cli ? "先安装并检查客户端，再完成本人登录。安装完成不会创建账号连接。" : "核对这次安装或启动的程序。验证通过后，工具会加入服务连接；不会在此执行你的业务操作。")}</p>
    ${field(source.kind === "executable" ? "可执行文件" : "安装来源", source.kind === "executable" ? source.executable : `${source.kind}: ${source.package}@${source.version}`)}
    ${source.kind !== "executable" ? (source.kind === "powershell" ? field("包源", "https://www.powershellgallery.com/") + field("运行时版本", source.runtime.version) : source.kind === "native" ? field("包源", source.url) : field("包源", source.registry ?? "") + field("运行时版本", source.node_version ?? source.python_version ?? "")) + field("启动命令", source.bin) : ""}
    ${local ? field("启动参数", JSON.stringify(local.args)) + field("工作目录", local.cwd) : ""}
    ${plan.installation ? (source.kind !== "executable" ? field("安装目录", plan.installation.directory) : "") + field("运行平台", `${plan.installation.platform} / ${plan.installation.architecture}`) : ""}
    ${source.kind !== "executable" ? `<p>${L("包与运行时仅安装到本产品的管理目录。缺少运行时会自动补装；共享运行时和工作目录不会随连接移除。")}</p>` : ""}
    ${(local?.environment_names ?? []).map(name => `<label class="settings-connector-field"><span>${e(name)}</span><input class="mw-input" data-local-secret="${e(name)}" type="password" autocomplete="off" required></label>`).join("")}
    <button type="submit" class="mw-btn mw-btn--primary">${L(cli ? installed ? "检查已安装客户端" : "安装并检查客户端" : installed ? "重试验证" : source.kind === "executable" ? "启动并验证" : "安装并验证")}</button><div data-protocol-result role="status" hidden></div>
  </form>`;
}
