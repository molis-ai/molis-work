import { icon, type MolisWorkIcon } from "./icons.js";
import { renderPluginStageShell } from "./plugin-stage-shell.js";
import { escapeHtml } from "./primitives/html.js";
import { renderEmpty } from "./primitives/feedback.js";
import { renderSidebar } from "./primitives/layout.js";

/**
 * What a companion's stage is drawn with: the route prefix of the project page, the plugins the project shows and the shared
 * primitives. The stage of a plugin the Coding page embeds (Files, Git, Diff, Text Stats) is one of these two shapes; Coding's client
 * fills it, which is why the markup keeps its `data-companion` hooks.
 */
export interface CompanionStageModel {
  readonly route_prefix: string;
  readonly shown_plugins?: readonly string[];
  readonly primitives: {
    escape(value: unknown): string;
    text(value: string, values?: Record<string, string | number>): string;
  };
}

/** A companion that browses a list and reads one entry: the plugin's own directory, a note while nothing is open, and its reader. */
export function renderCompanionBrowserStage(input: {
  surface: string; label: string; icon: MolisWorkIcon; route_prefix: string; manage: string;
  empty: { title: string; body: string }; directory: string; result: string;
}): string {
  const manage = `<a class="mw-btn mw-btn--ghost companion-manage" href="${escapeHtml(input.route_prefix)}/settings/workspaces">${icon("folder-tree")}<span>${escapeHtml(input.manage)}</span>${icon("chevron-right")}</a>`;
  const body = `<div class="companion-layout">${renderSidebar({ className: "companion-directory", header: manage, body: input.directory })}<div class="companion-result">${renderEmpty({ className: "companion-empty", icon: input.icon, title: input.empty.title, body: input.empty.body })}${input.result}</div></div>`;
  return renderPluginStageShell({ surface: input.surface, label: input.label, dataset: "coding-companion", extraAttrs: `data-companion="${input.surface}"`,
    body: `<div class="companion-surface mw-layout-primitives">${body}</div>` });
}

/** A companion that is a page of its own content: a refresh, a way to Files, and the content the client fills. */
export function renderCompanionListStage(input: {
  surface: string; label: string; refresh: string; files: { enabled: boolean; open: string; add: string };
}): string {
  const open = input.files.enabled ? { target: "files", label: input.files.open } : { target: "market", label: input.files.add };
  const body = `<div class="plugin-stage-list" data-companion-list><header class="plugin-stage-chrome"><button class="mw-btn mw-btn--ghost" type="button" data-companion-refresh>${icon("refresh")}<span class="mw-spinner" hidden></span><span>${escapeHtml(input.refresh)}</span></button><button class="mw-btn mw-btn--ghost" type="button" data-companion-open="${open.target}">${icon("file")}<span>${escapeHtml(open.label)}</span></button></header><p data-companion-status role="status"></p><div data-companion-content></div></div>`;
  return renderPluginStageShell({ surface: input.surface, label: input.label, dataset: "coding-companion", extraAttrs: `data-companion="${input.surface}"`, body });
}
