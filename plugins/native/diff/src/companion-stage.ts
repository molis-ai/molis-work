import { escapeHtml, icon, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";

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

/** A stage that is a page of its own content: a refresh, a way to the project's materials (where its versions are fixed), and the content the client fills. */
export function renderCompanionListStage(input: {
  surface: string; label: string; refresh: string; materials: string;
}): string {
  // The platform's 资料 surface is on every project page, so the way there needs no plugin added first.
  const open = { target: "materials", label: input.materials };
  const body = `<div class="plugin-stage-list" data-companion-list><header class="plugin-stage-chrome"><button class="mw-btn mw-btn--ghost" type="button" data-companion-refresh>${icon("refresh")}<span class="mw-spinner" hidden></span><span>${escapeHtml(input.refresh)}</span></button><button class="mw-btn mw-btn--ghost" type="button" data-companion-open="${open.target}">${icon("file")}<span>${escapeHtml(open.label)}</span></button></header><p data-companion-status role="status"></p><div data-companion-content></div></div>`;
  return renderPluginStageShell({ surface: input.surface, label: input.label, dataset: "coding-companion", extraAttrs: `data-companion="${input.surface}"`, body });
}
