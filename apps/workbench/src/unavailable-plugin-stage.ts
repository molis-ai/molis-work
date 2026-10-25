import { escapeHtml, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Host-owned presentation data, separate from untrusted plugin contribution HTML. */
export interface UnavailablePluginStage {
  surface: string;
  label: string;
  reason: string;
  scope: "home" | "project";
}

/** An unavailable instance has no page authority or client; only the Host explains why it cannot open. */
export function renderUnavailablePluginStage(stage: UnavailablePluginStage,
  L: (text: string, values?: Record<string, string | number>) => string): string {
  const hint = stage.scope === "home"
    ? `<a class="mw-btn mw-btn--secondary" href="/plugins/${encodeURIComponent(stage.surface)}">${escapeHtml(L("查看插件状态"))}</a>`
    : `<p>${escapeHtml(L("请检查插件状态后重新打开。"))}</p>`;
  return renderPluginStageShell({ surface: stage.surface, label: L(stage.label), dataset: `${stage.scope}-plugin-unavailable`,
    body: `<div class="mw-empty" role="alert"><h2>${escapeHtml(L("{plugin} 暂不可用", { plugin: L(stage.label) }))}</h2><p>${escapeHtml(L(stage.reason))}</p>${hint}</div>` });
}
