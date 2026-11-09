import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderHint } from "@molis-ai/molis-work-design-system";
import type { RuntimeIntegrationDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import { renderMcpAccess } from "./mcp-access.js";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import { settingRow } from "./settings-row.js";
import type { MolisWorkSettingsView } from "./settings-view.js";

type RuntimePrimitives = Pick<SettingsRenderPrimitives, "readText" | "escapeHtml" | "icon">;

function runtimeStatePresentation(state: RuntimeIntegrationDetection["connection_state"], _L: RuntimePrimitives["readText"]): {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
  description: string;
} {
  if (state === "connected") return { label: uiText.text("workbench.settings-runtimes.connected"), tone: "success", description: uiText.text("workbench.settings-runtimes.mcp-molis-work-skill-both-point-install") };
  if (state === "needs_repair") return { label: uiText.text("workbench.settings-runtimes.needs-repair"), tone: "warning", description: uiText.text("workbench.settings-runtimes.older-incomplete-molis-work-connection-was-found") };
  if (state === "conflict") return { label: uiText.text("workbench.settings-runtimes.conflict"), tone: "danger", description: uiText.text("workbench.settings-runtimes.same-named-config-skill-not-owned-molis-work") };
  if (state === "molis_work_unavailable") return { label: uiText.text("workbench.settings-runtimes.install-incomplete"), tone: "danger", description: uiText.text("workbench.settings-runtimes.check-diagnostics-repair-molis-work-install-first") };
  if (state === "not_detected") return { label: uiText.text("workbench.settings-runtimes.not-found"), tone: "neutral", description: uiText.text("workbench.settings-runtimes.that-runtime-was-not-found-machine") };
  return { label: uiText.text("workbench.settings-runtimes.not-connected"), tone: "neutral", description: uiText.text("workbench.settings-runtimes.molis-work-mcp-skill-have-not-been-written") };
}

export function renderRuntimeSettings(view: MolisWorkSettingsView, primitives: RuntimePrimitives): string {
  const { readText, escapeHtml, icon } = primitives;
  const rows = view.runtimes.map((runtime) => {
    const state = runtimeStatePresentation(runtime.connection_state, readText);
    const unavailable = runtime.connection_state === "not_detected" || runtime.connection_state === "molis_work_unavailable";
    const action = runtime.connection_state === "connected" ? "remove" : "connect";
    const actionLabel = action === "remove" ? uiText.text("workbench.settings-runtimes.preview-removal") : runtime.connection_state === "needs_repair" ? uiText.text("workbench.settings-runtimes.preview-repair") : uiText.text("workbench.settings-runtimes.review-connect");
    return `<article data-runtime-row="${escapeHtml(runtime.runtime_id)}">
      ${settingRow(escapeHtml(runtime.display_name), escapeHtml(state.description), `<span class="settings-state settings-state--${state.tone}">${escapeHtml(state.label)}</span><button class="mw-btn mw-btn--secondary" type="button" data-runtime-plan="${escapeHtml(runtime.runtime_id)}" data-runtime-action="${action}"${unavailable ? " disabled" : ""}>${escapeHtml(actionLabel)}</button>`)}
      <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${uiText("workbench.settings-runtimes.local-paths")}</strong><span>${uiText("workbench.settings-runtimes.view-executable-config-skill-paths")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>Runtime</dt><dd>${runtime.executable_path ? escapeHtml(runtime.executable_path) : uiText("workbench.settings-runtimes.executable-not-found")}</dd></div><div><dt>${uiText("workbench.settings-runtimes.config")}</dt><dd>${escapeHtml(runtime.config_path)}</dd></div><div><dt>Skill</dt><dd>${escapeHtml(runtime.skill_path)}</dd></div></dl></details>
    </article>`;
  }).join("");
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-runtimes.ai-execution-tools")}</h1>${renderHint({ id: "settings-hint-runtimes", label: uiText.text("workbench.settings-runtimes.how-applies"), text: uiText.text("workbench.settings-runtimes.codex-claude-code-open-code-pi-agent-grok") })}</div><p>${uiText("workbench.settings-runtimes.goal-tree-decisions-records-work-without-any-connection")}</p></header>
    <section class="settings-section" aria-label="${uiText("workbench.settings-runtimes.ai-execution-tools")}">${rows || `<div class="settings-empty"><strong>${uiText("workbench.settings-runtimes.no-runtime-could-be-detected")}</strong><span>${uiText("workbench.settings-runtimes.molis-work-itself-still-works-come-back-after")}</span></div>`}</section>
  </section>`;
}

export function renderMcpSettings(view: MolisWorkSettingsView, desktopShell: boolean, primitives: SettingsRenderPrimitives): string {
  const { settingsContextHref } = primitives;
  return `<section class="settings-document" aria-labelledby="settings-title" data-mcp-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${view.capabilities ? uiText("workbench.settings-runtimes.external-access") : "MCP"}</h1>${renderHint({ id: "settings-hint-mcp", label: uiText.text("workbench.settings-runtimes.how-applies"), text: uiText.text("workbench.settings-runtimes.grants-control-which-capabilities-client-can-discover-call") })}</div><p>${uiText("workbench.settings-runtimes.select-client-choose-what-can-read-do")}</p><p><a href="${settingsContextHref("/settings/runtimes", view.context_project ?? null, desktopShell)}">${uiText("workbench.settings-runtimes.connect-external-ai-tools")}</a></p></header>
    ${view.mcp_access ? renderMcpAccess(view.mcp_access, view.projects, desktopShell, primitives) : ""}
    <p class="settings-form-error" data-mcp-settings-error role="alert" hidden></p>
  </section>`;
}
