import { escapeHtml, renderPluginStageShell } from "@molis-ai/molis-work-design-system";

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
  status?: "failed" | "blocked";
  code?: string | null;
  /** Project scope: set by the Host only for an instance that failed or was quarantined (never one switched off, blocked or uninstalled). */
  restart?: PluginRestartOffer | null;
}

/** An unavailable instance has no page authority or client; only the Host explains why it cannot open, and may offer to start it again. */
export function renderUnavailablePluginStatus(stage: UnavailablePluginStage,
  L: (text: string, values?: Record<string, string | number>) => string): string {
  return `<div class="mw-empty" role="alert"><h2>${escapeHtml(L("{plugin} 暂不可用", { plugin: L(stage.label) }))}</h2><p>${escapeHtml(L(stage.reason))}</p>${stage.scope === "home" ? homeHint(stage, L) : projectHint(stage, L)}</div>`;
}

export function renderUnavailablePluginStage(stage: UnavailablePluginStage,
  L: (text: string, values?: Record<string, string | number>) => string): string {
  return renderPluginStageShell({ surface: stage.surface, label: L(stage.label), dataset: `${stage.scope}-plugin-unavailable`,
    body: renderUnavailablePluginStatus(stage, L) });
}

function homeHint(stage: UnavailablePluginStage, L: (text: string) => string): string {
  return `<a class="mw-btn mw-btn--secondary" href="/plugins/${encodeURIComponent(stage.surface)}">${escapeHtml(L("查看插件状态"))}</a>`;
}

function projectHint(stage: UnavailablePluginStage, L: (text: string, values?: Record<string, string | number>) => string): string {
  const status = stage.status ? `<p data-project-plugin-status>${escapeHtml(L("状态：{status}", { status: stage.status === "failed" ? L("启动失败") : L("已被阻止") }))}${stage.code ? ` <code>${escapeHtml(stage.code)}</code>` : ""}</p>` : "";
  const restart = stage.restart && stage.plugin_id
    ? `<button class="mw-btn mw-btn--secondary" type="button" data-project-plugin-restart="${stage.restart}" data-restart-plugin="${escapeHtml(stage.plugin_id)}">${escapeHtml(stage.restart === "restart" ? L("重启") : L("解除隔离并重启"))}</button><p role="status" data-project-plugin-restart-status hidden></p>`
    : "";
  return `<p>${escapeHtml(L("请检查插件状态后重新打开。"))}</p>${status}${restart}`;
}
