import { t as uiText, renderButton, renderObjectRow, renderQuestionList, renderSettingsSection, type MwTone } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { RuntimeIntegrationDetection } from "@molis-ai/molis-work-contracts/platform/app-host";
import { renderMcpAccess } from "./mcp-access.js";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import type { MolisWorkSettingsView } from "./settings-view.js";

type RuntimePrimitives = Pick<SettingsRenderPrimitives, "readText" | "escapeHtml" | "icon" | "settingsContextHref">;

function runtimeStatePresentation(state: RuntimeIntegrationDetection["connection_state"]): { label: string; tone: Exclude<MwTone, "info">; description: string } {
  if (state === "connected") return { label: uiText.text("workbench.settings-runtimes.connected"), tone: "success", description: uiText.text("workbench.settings-runtimes.mcp-points-at-install") };
  if (state === "needs_repair") return { label: uiText.text("workbench.settings-runtimes.needs-repair"), tone: "warning", description: uiText.text("workbench.settings-runtimes.older-incomplete-molis-work-connection-was-found") };
  if (state === "conflict") return { label: uiText.text("workbench.settings-runtimes.conflict"), tone: "danger", description: uiText.text("workbench.settings-runtimes.same-named-config-not-owned") };
  if (state === "molis_work_unavailable") return { label: uiText.text("workbench.settings-runtimes.install-incomplete"), tone: "danger", description: uiText.text("workbench.settings-runtimes.check-diagnostics-repair-molis-work-install-first") };
  if (state === "not_detected") return { label: uiText.text("workbench.settings-runtimes.not-found"), tone: "neutral", description: uiText.text("workbench.settings-runtimes.that-runtime-was-not-found-machine") };
  return { label: uiText.text("workbench.settings-runtimes.not-connected"), tone: "neutral", description: uiText.text("workbench.settings-runtimes.mcp-not-written") };
}

/**
 * 「AI 与执行工具」: one tool, one object row in a card (specs/screen-polish/p5-settings.md). The row says what it is and how it
 * stands; opened, it answers where it is installed and whether it connects. A tool that needs the person shows its one action on
 * the row. What stops every tool at once — Molis Work's own install — is said once at the top with the way out beside it, and
 * no row shows a button that cannot be pressed (POLISH-32).
 */
export function renderRuntimeSettings(view: MolisWorkSettingsView, primitives: RuntimePrimitives, desktopShell = false): string {
  const { escapeHtml, settingsContextHref } = primitives;
  const plan = (runtime: RuntimeIntegrationDetection, action: "connect" | "remove", label: string) => renderButton({
    label, variant: "secondary", size: "sm", attrs: { "data-runtime-plan": runtime.runtime_id, "data-runtime-action": action },
  });
  const path = (value: string | null) => value ? `<code>${escapeHtml(value)}</code>` : escapeHtml(uiText.text("workbench.settings-runtimes.executable-not-found"));
  const diagnostics = `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="${escapeHtml(settingsContextHref("/settings/diagnostics", view.context_project ?? null, desktopShell))}">${uiText("workbench.settings-runtimes.open-diagnostics")}</a>`;
  const row = (runtime: RuntimeIntegrationDetection) => {
    const state = runtimeStatePresentation(runtime.connection_state);
    const connected = runtime.connection_state === "connected";
    // What stops every tool at once is said once, at the top of the page; its rows stay quiet.
    const blocked = runtime.connection_state === "molis_work_unavailable", missing = runtime.connection_state === "not_detected";
    const quiet = runtimeStatePresentation("not_connected");
    const action = connected || missing || blocked ? ""
      : plan(runtime, "connect", uiText.text(runtime.connection_state === "needs_repair" ? "workbench.settings-runtimes.preview-repair" : "workbench.settings-runtimes.review-connect"));
    return renderObjectRow({
      name: runtime.display_name,
      hint: blocked ? quiet.description : state.description,
      icon: "terminal",
      state: missing ? undefined : blocked ? { label: quiet.label, tone: "neutral" } : { label: state.label, tone: state.tone },
      action,
      attrs: { "data-runtime-row": runtime.runtime_id, "data-runtime-state": runtime.connection_state },
      body: renderQuestionList({ rows: [
        { question: uiText.text("workbench.settings-runtimes.where-installed"), answer: path(runtime.executable_path) },
        { question: uiText.text("workbench.settings-runtimes.where-config"), answer: path(runtime.config_path) },
        { question: uiText.text("workbench.settings-runtimes.does-it-connect"), answer: escapeHtml(state.description),
          action: connected ? plan(runtime, "remove", uiText.text("workbench.settings-runtimes.preview-removal")) : undefined },
      ] }),
    });
  };
  const of = (...states: RuntimeIntegrationDetection["connection_state"][]) => view.runtimes.filter(runtime => states.includes(runtime.connection_state));
  const section = (title: string, id: string, runtimes: readonly RuntimeIntegrationDetection[]) => runtimes.length
    ? renderSettingsSection({ title: uiText.text(title), id, body: runtimes.map(row).join("") }) : "";
  const unavailable = runtimeStatePresentation("molis_work_unavailable");
  const notice = of("molis_work_unavailable").length ? renderSettingsSection({ attrs: { "data-runtime-notice": true }, body: renderObjectRow({
    name: unavailable.label, hint: unavailable.description, icon: "circle-alert", className: "mw-object-row--alert", action: diagnostics }) }) : "";
  return `<section class="settings-document" aria-labelledby="settings-title" data-runtime-settings>
    <header class="settings-heading"><h1 id="settings-title">${uiText("workbench.settings-runtimes.ai-execution-tools")}</h1><p>${uiText("workbench.settings-runtimes.goal-tree-decisions-records-work-without-any-connection")}</p></header>
    ${view.runtimes.length ? `${notice}${section("workbench.settings-runtimes.connected", "runtimes-connected", of("connected", "needs_repair"))}${
      section("workbench.settings-runtimes.can-connect", "runtimes-available", of("not_connected", "conflict", "molis_work_unavailable"))}${
      section("workbench.settings-runtimes.not-found", "runtimes-missing", of("not_detected"))}`
      : `<div class="settings-empty"><strong>${uiText("workbench.settings-runtimes.no-runtime-could-be-detected")}</strong><span>${uiText("workbench.settings-runtimes.molis-work-itself-still-works-come-back-after")}</span></div>`}
  </section>`;
}

export function renderMcpSettings(view: MolisWorkSettingsView, desktopShell: boolean, primitives: SettingsRenderPrimitives): string {
  const { settingsContextHref } = primitives;
  return `<section class="settings-document" aria-labelledby="settings-title" data-mcp-settings>
    <header class="settings-heading"><h1 id="settings-title">${view.capabilities ? uiText("workbench.settings-runtimes.external-access") : "MCP"}</h1><p>${uiText("workbench.settings-runtimes.select-client-choose-what-can-read-do")} <a href="${settingsContextHref("/settings/runtimes", view.context_project ?? null, desktopShell)}">${uiText("workbench.settings-runtimes.connect-external-ai-tools")}</a></p></header>
    ${view.mcp_access ? renderMcpAccess(view.mcp_access, view.projects, desktopShell, primitives) : ""}
    <p class="settings-form-error" data-mcp-settings-error role="alert" hidden></p>
  </section>`;
}
