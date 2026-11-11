import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ConnectorPrimitives } from "./settings-connector-guide.js";
import { renderLocalConnectorPlan } from "./settings-connector-local.js";
import { renderMethodGuide, requestGuideVariant } from "./settings-connector-guide.js";
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
  const { escapeHtml: e } = p, plan = request?.setup;
  const card = cards.find(row => row.connector_id === plan?.service_id);
  const option = card?.method_options?.find(row => row.kind === plan?.method);
  if (!request || !plan || !card || (!option && !plan.local_setup)) return `<section class="settings-document"><h1>${uiText("workbench.settings-connector-request.connection-request-no-longer-active")}</h1><p>${uiText("workbench.settings-connector-request.return-conversation-prepare-new-request-existing-connections-una")}</p></section>`;
  const prepared = request.status === "prepared" || request.status === "failed" && request.installation_ready === true, pending = request.status === "pending";
  const selected = plan.cli_setup && option?.cli ? { ...option, cli: { ...option.cli, installed: request.installation_ready === true } } : option?.mcp && plan.endpoint ? { ...option, mcp: { ...option.mcp, endpoint: plan.endpoint } } : option;
  const message = request.commit_held ? "workbench.settings-connector-request.latest-request-being-checked-before-connection-saved-continue" : request.status === "failed" && request.installation_ready ? plan.cli_setup ? "workbench.settings-connector-request.installation-saved-check-client-s-requirements-sign-status" : "workbench.settings-connector-request.installation-kept-fix-its-startup-requirements-re-enter" : prepared ? "workbench.settings-connector-request.complete-step-here-credentials-kept-out-assistant-conversation" : pending ? plan.local_setup || plan.cli_setup ? "workbench.settings-connector-request.installing-checking-local-tool-closing-page-does-not" : "workbench.settings-connector-request.waiting-authorization-closing-page-does-not-cancel-connection"
    : request.status === "connected" ? "workbench.settings-connector-request.connection-saved-check-use-its-capabilities-verify-what" : "workbench.settings-connector-request.connection-request-did-not-complete-return-conversation-check";
  return `<section class="settings-document" data-connectors-settings data-setup-id="${e(request.id)}" data-open-connector="${e(card.connector_id)}" data-setup-connection="${e(plan.connection_id ?? "")}">
    <div data-connectors-list hidden></div><p data-connectors-error role="alert" hidden></p>
    <section class="settings-connector-detail" data-connector-detail="${e(card.connector_id)}">
      <header class="settings-heading"><h2 tabindex="-1">${e(plan.display_name)}</h2><p>${e(plan.local_setup ? uiText.text("workbench.settings-connector-request.local-mcp") : card.title)}</p></header>
      <p data-connector-feedback role="status">${e(uiText.text(message))}</p><div class="settings-body">
      ${prepared ? `${plan.cli_setup ? renderLocalConnectorPlan(plan, p, request.installation_ready) + (request.installation_ready ? renderMethodGuide(card, selected!, p, plan, request.presentation?.cli_job) : "") : plan.local_setup ? renderLocalConnectorPlan(plan, p, request.installation_ready) : renderMethodGuide(card, selected!, p, plan, undefined, requestGuideVariant(selected!))}<input data-connector-new-name type="hidden" value="${e(plan.display_name)}">` : ""}
      ${pending ? `<div data-protocol="${e(plan.method)}" data-protocol-service="${e(card.connector_id)}" data-pending-setup="${e(request.id)}" data-setup-expires="${request.expires_at}"><div data-protocol-result></div>
        ${request.presentation?.authorization_url ? `<a class="mw-btn mw-btn--secondary" href="${e(request.presentation.authorization_url)}" target="_blank" rel="noopener noreferrer">${uiText("workbench.settings-connector-request.reopen-official-authorization-page")}</a>` : ""}
        ${request.presentation?.user_code ? `<p>${e(uiText.text("workbench.settings-connector-request.enter-device-code-name-code", { name: card.title, code: request.presentation.user_code }))}</p>` : ""}</div>` : ""}
      ${prepared || pending ? `<button class="mw-btn mw-btn--ghost" data-setup-cancel>${uiText("workbench.settings-connector-request.cancel-connection-request")}</button>` : ""}
      <a class="mw-btn mw-btn--secondary" href="/capabilities/connections">${uiText("workbench.settings-connector-request.view-all-connections")}</a>
      </div>
    </section>
  </section>`;
}
