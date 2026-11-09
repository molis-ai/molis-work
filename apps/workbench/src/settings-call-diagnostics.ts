import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderHint } from "@molis-ai/molis-work-design-system";
import { renderAgentDiagnostics } from "./settings-agent-diagnostics.js";
import { renderCallRow, type CallRowView } from "./call-row.js";
import { settingRow } from "./settings-row.js";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import type { MolisWorkSettingsView, WebPeriodicTask } from "./settings-view.js";

type DiagnosticsPrimitives = Pick<SettingsRenderPrimitives, "L" | "escapeHtml" | "icon" | "withDesktopQuery">;

/** Where a row's project is, and the way to the call history of that project; a project deleted since has none to open. */
function callPlace(row: CallRowView, view: MolisWorkSettingsView, p: DiagnosticsPrimitives, desktopShell: boolean): { label: string; href?: string } {
  const href = (path: string) => desktopShell ? p.withDesktopQuery(path) : path;
  if (row.project_id === null) return { label: uiText.text("workbench.settings-call-diagnostics.not-any-project"), href: href("/capabilities/history") };
  const project = view.projects.find(item => item.project_id === row.project_id);
  return project ? { label: project.display_name, href: href(`/capabilities/history?project=${encodeURIComponent(project.project_id)}`) } : { label: uiText.text("workbench.settings-call-diagnostics.project-that-no-longer-exists") };
}

/** Look a call up by its 诊断编号, as the error that showed it gave it; or, with none asked for, the newest calls that failed or were turned away. A view the Host gave no call rows has no such section. */
function renderCallLookup(view: MolisWorkSettingsView, p: DiagnosticsPrimitives, desktopShell: boolean): string {
  const { escapeHtml: e } = p;
  const query = view.call_query;
  if (!query) return "";
  const context = view.context_project ?? null;
  const rows = (list: readonly CallRowView[], lead = "") => `<div class="capability-history">${lead}${list.map(row => renderCallRow(row, p, callPlace(row, view, p, desktopShell))).join("")}</div>`;
  const note = (title: string, detail: string) => `<div class="settings-empty" role="status"><strong>${title}</strong><span>${detail}</span></div>`;
  let result: string;
  if (query.text === "") {
    const recent = view.recent_calls ?? [];
    result = `<h3>${uiText("workbench.settings-call-diagnostics.recent-calls-that-failed-did-not-run")}</h3>${recent.length ? rows(recent)
      : note(uiText.text("workbench.settings-call-diagnostics.no-recent-calls-failed-did-not-run"), uiText.text("workbench.settings-call-diagnostics.calls-that-failed-calls-that-were-turned-away"))}`;
  } else if (query.matches === undefined) {
    result = note(uiText.text("workbench.settings-call-diagnostics.diagnostic-id-needs-least-count-count", { count: query.min_length }), uiText.text("workbench.settings-call-diagnostics.enter-few-more-so-operation-can-be-found"));
  } else if (query.matches.length === 0) {
    result = note(uiText.text("workbench.settings-call-diagnostics.no-diagnostic-id-starts-id", { id: e(query.text) }), uiText.text("workbench.settings-call-diagnostics.call-history-keeps-only-recent-calls-tidies-older"));
  } else {
    result = rows(query.matches, `<p role="status">${uiText("workbench.settings-call-diagnostics.count-count-found", { count: query.matches.length })}</p>`);
  }
  return `<section class="settings-section" aria-labelledby="call-lookup-title" data-call-lookup-section>
      <h2 id="call-lookup-title">${uiText("workbench.settings-call-diagnostics.find-diagnostic-id")}</h2>
      <p>${uiText("workbench.settings-call-diagnostics.copy-diagnostic-id-error-s-details-paste-here", { count: query.min_length })}</p>
      <form class="capability-filters" data-call-lookup action="/settings/diagnostics" method="get">${context ? `<input type="hidden" name="project" value="${e(context.project_id)}">` : ""}${desktopShell ? '<input type="hidden" name="desktop" value="1">' : ""}
        <label class="capability-search">${uiText("workbench.settings-call-diagnostics.diagnostic-id")}<input type="search" name="call" value="${e(query.text)}" maxlength="64" autocomplete="off" spellcheck="false" placeholder="${uiText("workbench.settings-call-diagnostics.e-g-a1b2c3d4")}"></label>
        <button class="mw-btn mw-btn--secondary" type="submit">${uiText("workbench.settings-call-diagnostics.find")}</button>
      </form>
      ${result}
    </section>`;
}

/** What the server does on a timer: how often, when it last finished, and the error of a run that failed. */
function renderPeriodicTasks(tasks: readonly WebPeriodicTask[] | undefined, p: DiagnosticsPrimitives): string {
  if (!tasks?.length) return "";
  const { L, escapeHtml } = p;
  const every = (ms: number) => ms === 3_600_000 ? uiText.text("workbench.settings-call-diagnostics.hourly") : ms % 3_600_000 === 0 ? uiText.text("workbench.settings-call-diagnostics.every-count-count", { count: ms / 3_600_000 })
    : ms === 60_000 ? uiText.text("workbench.settings-call-diagnostics.every-minute") : ms % 60_000 === 0 ? uiText.text("workbench.settings-call-diagnostics.every-count-count-2", { count: ms / 60_000 }) : uiText.text("workbench.settings-call-diagnostics.every-count-count-3", { count: Math.round(ms / 1000) });
  const rows = tasks.map(task => {
    const last = task.running ? uiText.text("workbench.settings-call-diagnostics.running-now") : task.last_finished_at ? uiText.text("workbench.settings-call-diagnostics.last-time", { time: new Date(task.last_finished_at).toTimeString().slice(0, 5) }) : uiText.text("workbench.settings-call-diagnostics.not-run-yet");
    const state = task.last_error ? { tone: "danger", label: uiText.text("workbench.settings-call-diagnostics.last-run-failed") } : task.runs ? { tone: "success", label: uiText.text("workbench.settings-call-diagnostics.ok") } : { tone: "neutral", label: uiText.text("workbench.settings-call-diagnostics.waiting") };
    const description = [every(task.interval_ms), last].join(" · ") + (task.last_error ? `<br>${escapeHtml(task.last_error)}` : "");
    return settingRow(escapeHtml(L(task.title)), description, `<span class="settings-state settings-state--${state.tone}">${state.label}</span>`);
  }).join("");
  return `<section class="settings-section" aria-labelledby="periodic-tasks-title" data-periodic-tasks><h2 id="periodic-tasks-title">${uiText("workbench.settings-call-diagnostics.background-job")}</h2><p>${uiText("workbench.settings-call-diagnostics.what-service-does-timer-when-last-run-still")}</p>${rows}</section>`;
}

/** The diagnostics page: how to find a call by its 诊断编号, then the installation, the registries, the launchers and the resident service. */
export function renderDiagnosticsSettings(view: MolisWorkSettingsView, p: DiagnosticsPrimitives, desktopShell: boolean): string {
  const { L, escapeHtml, icon } = p;
  const diagnostics = view.diagnostics;
  const service = view.web_service;
  const installation = diagnostics.installation_state === "ready"
    ? { label: uiText.text("workbench.settings-call-diagnostics.install-complete"), tone: "success" }
    : diagnostics.installation_state === "missing"
      ? { label: uiText.text("workbench.settings-call-diagnostics.install-missing"), tone: "warning" }
      : { label: uiText.text("workbench.settings-call-diagnostics.install-manifest-invalid"), tone: "danger" };
  const launchers = diagnostics.launchers.map((launcher) => settingRow(escapeHtml(launcher.name), escapeHtml(launcher.path), `<span class="settings-state settings-state--${launcher.state === "ready" ? "success" : "danger"}">${launcher.state === "ready" ? uiText("workbench.settings-call-diagnostics.available") : uiText("workbench.settings-call-diagnostics.missing")}</span>`)).join("");
  const serviceTone = service.state === "running" ? "success" : service.state === "stopped" || service.state === "absent" || service.state === "unhealthy" ? "warning" : "danger";
  const serviceLabel = service.state === "running" ? uiText.text("workbench.settings-call-diagnostics.running") : service.state === "stopped" ? uiText.text("workbench.settings-call-diagnostics.installed-not-running") : service.state === "unhealthy" ? uiText.text("workbench.settings-call-diagnostics.process-up-page-not-healthy") : service.state === "absent" ? uiText.text("workbench.settings-call-diagnostics.not-enabled") : service.state === "unsupported" ? uiText.text("workbench.settings-call-diagnostics.not-supported-system") : service.state === "conflict" ? uiText.text("workbench.settings-call-diagnostics.config-conflict") : uiText.text("workbench.settings-call-diagnostics.needs-repair");
  const serviceActions = service.state === "running"
    ? [["restart", uiText.text("workbench.settings-call-diagnostics.restart")], ["stop", uiText.text("workbench.settings-call-diagnostics.stop")], ["remove", uiText.text("workbench.settings-call-diagnostics.remove")]]
    : service.state === "stopped"
      ? [["start", uiText.text("workbench.settings-call-diagnostics.start")], ["remove", uiText.text("workbench.settings-call-diagnostics.remove")]]
      : service.state === "unhealthy"
        ? [["restart", uiText.text("workbench.settings-call-diagnostics.restart-check")], ["remove", uiText.text("workbench.settings-call-diagnostics.remove")]]
      : service.state === "absent"
        ? [["install", uiText.text("workbench.settings-call-diagnostics.enable-persistent-service")]]
        : service.state === "needs_repair"
          ? [["install", uiText.text("workbench.settings-call-diagnostics.repair-persistent-service")]]
        : [];
  const serviceButtons = serviceActions.map(([action, label]) => `<button class="mw-btn mw-btn--secondary" type="button" data-web-service-action="${action}">${label}</button>`).join("");
  const serviceMessage = service.message ? escapeHtml(L(service.message)) : "";
  return `<section class="settings-document" aria-labelledby="settings-title">
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-call-diagnostics.diagnostics")}</h1>${renderHint({ id: "settings-hint-diagnostics", label: uiText.text("workbench.settings-call-diagnostics.how-applies"), html: `${escapeHtml(uiText.text("workbench.settings-call-diagnostics.if-install-incomplete-run-again-terminal"))}<code>molis-work install</code>${escapeHtml(uiText.text("workbench.settings-call-diagnostics.persistent-service-actions-show-preview-ask-confirmation-they"))}` })}</div><p>${uiText("workbench.settings-call-diagnostics.only-reads-molis-work-s-own-installation-state")}</p></header>
    ${renderCallLookup(view, p, desktopShell)}
    <section class="settings-section" aria-label="${uiText("workbench.settings-call-diagnostics.molis-work-install")}">
      ${settingRow(uiText.text("workbench.settings-call-diagnostics.install-state"), uiText.text("workbench.settings-call-diagnostics.only-checks-local-install-manifest-does-not-scan"), `<span class="settings-state settings-state--${installation.tone}">${installation.label}</span>`)}
      ${settingRow(uiText.text("workbench.settings-call-diagnostics.version"), uiText.text("workbench.settings-call-diagnostics.installed-product-version"), `<span class="setting-number">${escapeHtml(diagnostics.version ?? uiText.text("workbench.settings-call-diagnostics.unrecognized"))}</span>`)}
      ${settingRow(uiText.text("workbench.settings-call-diagnostics.projects"), uiText.text("workbench.settings-call-diagnostics.how-many-projects-exist-device"), `<span class="setting-number">${diagnostics.project_count}</span>`)}
      <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${uiText("workbench.settings-call-diagnostics.local-paths")}</strong><span>${uiText("workbench.settings-call-diagnostics.view-install-release-directories")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>Home</dt><dd>${escapeHtml(diagnostics.home_directory)}</dd></div><div><dt>Release</dt><dd>${escapeHtml(diagnostics.release_directory ?? uiText.text("workbench.settings-call-diagnostics.not-found"))}</dd></div></dl></details>
    </section>
    <section class="settings-section" aria-label="${uiText("workbench.settings-call-diagnostics.prompt-character-registry")}">
      ${settingRow(uiText.text("workbench.settings-call-diagnostics.prompt-character-registry"), uiText.text("workbench.settings-call-diagnostics.see-what-each-source-registered-what-not-effect"), `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="/settings/prompts#diagnostics">${uiText("workbench.settings-call-diagnostics.developer-diagnostics")}</a>`)}
    </section>
    ${renderAgentDiagnostics({ L })}
    ${renderPeriodicTasks(view.periodic_tasks, p)}
    <section class="settings-section" aria-labelledby="launcher-title"><h2 id="launcher-title">${uiText("workbench.settings-call-diagnostics.launchers")}</h2>${launchers}</section>
    <section class="settings-section settings-project-maintenance" aria-labelledby="web-service-title">
      <h2 id="web-service-title">${uiText("workbench.settings-call-diagnostics.persistent-web-service")}</h2>
      <section class="project-manager-danger" aria-labelledby="web-service-state">
        <h3 id="web-service-state"><span class="settings-state settings-state--${serviceTone}">${serviceLabel}</span></h3>
        ${serviceMessage ? `<p>${serviceMessage}</p>` : ""}
        ${serviceButtons ? `<div class="project-manager-danger-actions">${serviceButtons}</div>` : ""}
        <p class="settings-form-error" data-web-service-error role="alert" hidden></p>
      </section>
      <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${uiText("workbench.settings-call-diagnostics.service-configuration-logs")}</strong><span>${uiText("workbench.settings-call-diagnostics.view-provider-command-config-log-paths")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>${uiText("workbench.settings-call-diagnostics.mode")}</dt><dd>${service.provider === "macos-launchagent" ? uiText("workbench.settings-call-diagnostics.mac-os-user-launch-agent") : uiText("workbench.settings-call-diagnostics.not-provided-yet")}</dd></div><div><dt>${uiText("workbench.settings-call-diagnostics.command")}</dt><dd>${escapeHtml(service.command.join(" "))}</dd></div><div><dt>${uiText("workbench.settings-call-diagnostics.config")}</dt><dd>${escapeHtml(service.plist_path)}</dd></div><div><dt>${uiText("workbench.settings-call-diagnostics.logs")}</dt><dd>${escapeHtml(service.stdout_log)}<br>${escapeHtml(service.stderr_log)}</dd></div></dl></details>
    </section>
  </section>`;
}
