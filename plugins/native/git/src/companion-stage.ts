import { escapeHtml, icon, renderEmpty, renderPluginStageShell, renderSidebar, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * What this companion's stage is drawn with: the route prefix of the project page, the plugins the project shows and the shared
 * primitives. The Coding page embeds the stage; the plugin's own client fills it, which is why the markup keeps its `data-companion` hooks.
 */
export interface CompanionStageModel {
  readonly route_prefix: string;
  readonly shown_plugins?: readonly string[];
  readonly primitives: {
    escape(value: unknown): string;
    text(value: string, values?: Record<string, string | number>): string;
  };
}

/** A stage that browses a list and reads one entry: the plugin's own directory, a note while nothing is open, and its reader. */
export function renderCompanionBrowserStage(input: {
  surface: string; label: string; icon: PluginIconName; route_prefix: string; manage: string;
  empty: { title: string; body: string }; directory: string; result: string;
}): string {
  const manage = `<a class="mw-btn mw-btn--ghost companion-manage" href="${escapeHtml(input.route_prefix)}/settings/workspaces">${icon("folder-tree")}<span>${escapeHtml(input.manage)}</span>${icon("chevron-right")}</a>`;
  const body = `<div class="companion-layout">${renderSidebar({ className: "companion-directory", header: manage, body: input.directory })}<div class="companion-result">${renderEmpty({ className: "companion-empty", icon: input.icon, title: input.empty.title, body: input.empty.body })}${input.result}</div></div>`;
  return renderPluginStageShell({ surface: input.surface, label: input.label, dataset: "coding-companion", extraAttrs: `data-companion="${input.surface}"`,
    body: `<div class="companion-surface mw-layout-primitives">${body}</div>` });
}
