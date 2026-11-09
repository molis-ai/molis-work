import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ConnectorSetupView } from "./settings-connector-request.js";
import type { ConnectorPrimitives } from "./settings-connector-guide.js";

export function renderLocalConnectorPlan(plan: NonNullable<ConnectorSetupView["setup"]>, p: ConnectorPrimitives, installed = false): string {
  const { escapeHtml: e } = p, local = plan.local_setup, source = local?.source ?? plan.cli_setup!, cli = Boolean(plan.cli_setup);
  const field = (label: string, value: string) => `<div class="settings-connector-field"><span>${e(uiText.text(label))}</span><code class="settings-connection-output">${e(value)}</code></div>`;
  return `<form data-connector-local data-protocol="${cli ? "cli" : "local"}" data-protocol-service="${e(plan.service_id)}" class="settings-connector-guide">
    <p>${uiText(cli ? "workbench.settings-connector-local.install-check-client-then-sign-installation-alone-does" : "workbench.settings-connector-local.review-program-install-start-once-verified-will-join")}</p>
    ${field(source.kind === "executable" ? "workbench.settings-connector-local.executable" : "workbench.settings-connector-local.install-source", source.kind === "executable" ? source.executable : `${source.kind}: ${source.package}@${source.version}`)}
    ${source.kind !== "executable" ? (source.kind === "powershell" ? field("workbench.settings-connector-local.package-registry", "https://www.powershellgallery.com/") + field("workbench.settings-connector-local.runtime-version", source.runtime.version) : source.kind === "native" ? field("workbench.settings-connector-local.package-registry", source.url) : field("workbench.settings-connector-local.package-registry", source.registry ?? "") + field("workbench.settings-connector-local.runtime-version", source.node_version ?? source.python_version ?? "")) + field("workbench.settings-connector-local.command", source.bin) : ""}
    ${local ? field("workbench.settings-connector-local.arguments", JSON.stringify(local.args)) + field("workbench.settings-connector-local.working-directory", local.cwd) : ""}
    ${plan.installation ? (source.kind !== "executable" ? field("workbench.settings-connector-local.install-directory", plan.installation.directory) : "") + field("workbench.settings-connector-local.platform", `${plan.installation.platform} / ${plan.installation.architecture}`) : ""}
    ${source.kind !== "executable" ? `<p>${uiText("workbench.settings-connector-local.packages-runtimes-installed-app-s-managed-directory-missing")}</p>` : ""}
    ${(local?.environment_names ?? []).map(name => `<label class="settings-connector-field"><span>${e(name)}</span><input class="mw-input" data-local-secret="${e(name)}" type="password" autocomplete="off" required></label>`).join("")}
    <button type="submit" class="mw-btn mw-btn--primary">${uiText(cli ? installed ? "workbench.settings-connector-local.check-installed-client" : "workbench.settings-connector-local.install-check-client" : installed ? "workbench.settings-connector-local.retry-verification" : source.kind === "executable" ? "workbench.settings-connector-local.start-verify" : "workbench.settings-connector-local.install-verify")}</button><div data-protocol-result role="status" hidden></div>
  </form>`;
}
