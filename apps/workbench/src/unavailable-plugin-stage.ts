import { t as uiText, escapeHtml, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";

/** What the Host may offer for a project plugin that does not run: start it again, or release its quarantine and start it. */
export type PluginRestartOffer = "restart" | "release-quarantine";

/** Host-owned presentation data, separate from untrusted plugin contribution HTML. */
export interface UnavailablePluginStage {
  surface: string;
  label: string;
  reason: string;
  scope: "home" | "project";
  /** Project scope: the plugin's Manifest id, which the restart button names. */
  plugin_id?: string;
  /** Project scope: what the Runtime's supervisor says is wrong with the plugin, and the stable code it gave; absent when it says none. */
  status?: "starting" | "failed" | "blocked";
  code?: string | null;
  /** Project scope: set by the Host only for an instance that failed or was quarantined (never one switched off, blocked or uninstalled). */
  restart?: PluginRestartOffer | null;
}

/** A stage drawn for a plugin that did not start, either scope (`renderUnavailablePluginStage`): the shell's amber marks find it by this. */
export const UNAVAILABLE_STAGE = ":is([data-home-plugin-unavailable], [data-project-plugin-unavailable])";

/** An unavailable instance has no page authority or client; only the Host explains why it cannot open, and may offer to start it again. */
export function renderUnavailablePluginStatus(stage: UnavailablePluginStage,
  readText: (text: string, values?: Record<string, string | number>) => string, announce = true): string {
  if (stage.status === "starting") return `<div class="mw-empty" role="status" aria-busy="true"><h2>${escapeHtml(uiText.text("workbench.unavailable-plugin-stage.plugin-starting", { plugin: stage.label }))}</h2><p>${escapeHtml(stage.reason)}</p></div>`;
  return `<div class="mw-empty"${announce ? ' role="alert"' : ""}><h2>${escapeHtml(uiText.text("workbench.unavailable-plugin-stage.plugin-unavailable", { plugin: stage.label }))}</h2><p>${escapeHtml(stage.reason)}</p>${stage.scope === "home" ? homeHint(stage, readText) : projectHint(stage, readText)}</div>`;
}

export function renderUnavailablePluginStage(stage: UnavailablePluginStage,
  readText: (text: string, values?: Record<string, string | number>) => string): string {
  return renderPluginStageShell({ surface: stage.surface, label: stage.label, dataset: `${stage.scope}-plugin-unavailable`,
    body: renderUnavailablePluginStatus(stage, readText) });
}

function homeHint(stage: UnavailablePluginStage, _L: (text: string) => string): string {
  return `<a class="mw-btn mw-btn--secondary" href="/plugins/${encodeURIComponent(stage.surface)}">${escapeHtml(uiText.text("workbench.unavailable-plugin-stage.view-plugin-status"))}</a>`;
}

function projectHint(stage: UnavailablePluginStage, _L: (text: string, values?: Record<string, string | number>) => string): string {
  const status = stage.status ? `<p data-project-plugin-status>${escapeHtml(uiText.text("workbench.unavailable-plugin-stage.status-status", { status: stage.status === "failed" ? uiText.text("workbench.unavailable-plugin-stage.failed-start") : uiText.text("workbench.unavailable-plugin-stage.blocked") }))}${stage.code ? ` <code>${escapeHtml(stage.code)}</code>` : ""}</p>` : "";
  const restart = stage.restart && stage.plugin_id
    ? `<button class="mw-btn mw-btn--secondary" type="button" data-project-plugin-restart="${stage.restart}" data-restart-plugin="${escapeHtml(stage.plugin_id)}">${escapeHtml(stage.restart === "restart" ? uiText.text("workbench.unavailable-plugin-stage.restart") : uiText.text("workbench.unavailable-plugin-stage.release-quarantine-restart"))}</button><p role="status" data-project-plugin-restart-status hidden></p>`
    : "";
  return `<p>${escapeHtml(uiText.text("workbench.unavailable-plugin-stage.check-plugin-status-then-reopen"))}</p>${status}${restart}`;
}
