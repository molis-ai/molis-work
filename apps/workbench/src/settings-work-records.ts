import { readFileSync } from "node:fs";
import { escapeHtml, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { scriptJson } from "./plugin-directory.js";
import type { WebSettingsProject } from "./settings-view.js";

export interface WorkRecordsSettingsOptions {
  readonly projects: readonly Pick<WebSettingsProject, "project_id" | "display_name">[];
}

export function renderWorkRecordsSettings(options: WorkRecordsSettingsOptions): string {
  const projectsJson = escapeHtml(scriptJson(options.projects.map((p) => ({ project_id: p.project_id, display_name: p.display_name }))));
  return `<section class="settings-document wr-page" aria-labelledby="wr-title" data-work-records-settings data-wr-projects="${projectsJson}">
    <header class="settings-page-heading">
      <h1 id="wr-title">${uiText("workbench.settings-work-records.title")}</h1>
      <p>${uiText("workbench.settings-work-records.subtitle")}</p>
    </header>
    <div class="mw-tabs" data-slot="tabs">
      <div class="mw-tabs__list" role="tablist" aria-label="${uiText("workbench.settings-work-records.title")}">
        <button type="button" class="mw-tabs__tab is-active" role="tab" id="wr-tab-scope" aria-controls="wr-panel" aria-selected="true" data-wr-tab="scope">${uiText("workbench.settings-work-records.tab-scope")}</button>
        <button type="button" class="mw-tabs__tab" role="tab" id="wr-tab-clean" aria-controls="wr-panel" aria-selected="false" data-wr-tab="clean">${uiText("workbench.settings-work-records.tab-clean")}</button>
        <button type="button" class="mw-tabs__tab" role="tab" id="wr-tab-space" aria-controls="wr-panel" aria-selected="false" data-wr-tab="space">${uiText("workbench.settings-work-records.tab-space")}</button>
        <button type="button" class="mw-tabs__tab" role="tab" id="wr-tab-gaps" aria-controls="wr-panel" aria-selected="false" data-wr-tab="gaps">${uiText("workbench.settings-work-records.tab-gaps")}</button>
      </div>
    </div>
    <div data-wr-error hidden></div>
    <div class="wr-block" id="wr-panel" role="tabpanel" aria-labelledby="wr-tab-scope" data-wr-panel>
      <p class="wr-sub mw-loading" role="status">${uiText("workbench.settings-work-records.loading")}</p>
    </div>
    <dialog class="mw-dialog" data-slot="dialog" aria-labelledby="wr-dlg-title" data-wr-dialog></dialog>
    <div class="mw-sr-only" role="status" aria-live="polite" data-wr-live></div>
  </section>`;
}

let client: string | null = null;
export function renderMolisWorkWorkRecordsClientScript(): string {
  return client ??= readFileSync(new URL("./work-records-client.js", import.meta.url), "utf8").trim();
}
export const WORK_RECORDS_SETTINGS_LOADER_SCRIPT = readFileSync(new URL("../dist/work-records-loader.js", import.meta.url), "utf8").trim();
