import { icon, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { EXTERNAL_SESSION_QUERY_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/sessions";

/**
 * Work-area surface for external AI tool sessions (`data-work-surface="sessions"`).
 * Deferred until opened; its Read Scope Sheet lives at the shell root (`renderSessionsOverlays`) so `open_project_ai_read`
 * can open it over any active conversation without switching pages (SRB-08, contract-design §7.4).
 */
export function renderSessionsStage(projectId?: string): string {
  return [
    `<section class="desktop-work-surface sessions-surface" data-work-surface="sessions" data-work-surface-label="${uiText("workbench.sessions.navigation-name")}" data-deferred-surface data-expanded="false" hidden><template data-deferred-content>`,
    `<div class="sessions-layout"><div class="sessions-list-pane">`,
    `<header class="sessions-head"><h1>${uiText("workbench.sessions.navigation-name")}</h1><div class="sessions-head-actions">`,
    `<button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-sessions-refresh title="${uiText("workbench.sessions.refresh")}" aria-label="${uiText("workbench.sessions.refresh")}">${icon("refresh")}</button>`,
    `<button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-open-scope="tools">${icon("settings")}<span>${uiText("workbench.sessions.read-scope")}</span></button>`,
    projectId ? `<a class="mw-btn mw-btn--secondary mw-btn--sm" href="/onboarding?project=${encodeURIComponent(projectId)}&amp;sessions=1">${uiText("workbench.context-onboarding.start-organizing")}</a>` : "",
    `</div></header>`,
    `<div class="sessions-views mw-toggle-group" role="tablist" aria-label="${uiText("workbench.sessions.view-group")}">`,
    `<button class="mw-toggle" id="sessions-tab-project" type="button" role="tab" aria-controls="sessions-list-panel" data-sessions-view="project">${uiText("workbench.sessions.view-project")}</button>`,
    `<button class="mw-toggle" id="sessions-tab-all" type="button" role="tab" aria-controls="sessions-list-panel" data-sessions-view="all">${uiText("workbench.sessions.view-all")}</button>`,
    `<button class="mw-toggle" id="sessions-tab-unfiled" type="button" role="tab" aria-controls="sessions-list-panel" data-sessions-view="unfiled"><span>${uiText("workbench.sessions.view-unfiled")}</span> <span class="mw-badge" data-sessions-unfiled-count hidden>0</span></button>`,
    `</div>`,
    `<div class="sessions-filter-bar"><div class="sessions-filter-row">`,
    `<select class="mw-input" data-sessions-tool-filter aria-label="${uiText("workbench.sessions.filter-tool")}"><option value="">${uiText("workbench.sessions.all-tools")}</option></select>`,
    `<label class="mw-input-group">${icon("search")}<input class="mw-input" type="search" data-sessions-search maxlength="${EXTERNAL_SESSION_QUERY_MAX_CHARS}" placeholder="${uiText("workbench.sessions.search-list-placeholder")}" aria-label="${uiText("workbench.sessions.search-list-placeholder")}" autocomplete="off"></label>`,
    `</div><div class="sessions-droid-bar" data-sessions-droid-bar hidden>`,
    `<span data-sessions-droid-hint>${uiText("workbench.sessions.droid-search-hint")}</span>`,
    `<button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-droid-run>${icon("search")}<span>${uiText("workbench.sessions.droid-search-run")}</span></button>`,
    `</div></div>`,
    `<section class="sessions-sources" data-sessions-sources aria-label="${uiText("workbench.sessions.sources-status")}" hidden></section>`,
    `<div class="sessions-body" id="sessions-list-panel" data-sessions-body role="tabpanel"></div>`,
    `</div><div class="sessions-detail-pane">`,
    `<div class="sessions-detail-empty" data-sessions-detail-empty>${uiText("workbench.sessions.select-prompt")}</div>`,
    `<div class="sessions-detail" data-sessions-detail hidden></div>`,
    `</div></div></template></section>`,
  ].join("");
}

export function renderSessionsOverlays(): string {
  return [
    `<dialog class="mw-sheet sessions-scope-sheet" data-sessions-scope-sheet aria-labelledby="sessions-scope-title"><div class="mw-sheet__shell">`,
    `<header class="mw-sheet__header"><div><h2 id="sessions-scope-title">${uiText("workbench.sessions.read-scope")}</h2><p class="sessions-scope-hint">${uiText("workbench.sessions.scope-subtitle")}</p></div>`,
    `<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-sessions-scope-close aria-label="${uiText("common.control.close")}">${icon("x")}</button></header>`,
    `<div class="mw-sheet__body">`,
    `<div class="sessions-scope-tabs mw-toggle-group" role="tablist" aria-label="${uiText("workbench.sessions.read-scope")}">`,
    `<button class="mw-toggle is-current" id="sessions-scope-tab-tools" type="button" role="tab" aria-selected="true" aria-controls="sessions-scope-panel-tools" tabindex="0" data-sessions-scope-tab="tools">${uiText("workbench.sessions.scope-tab-tools")}</button>`,
    `<button class="mw-toggle" id="sessions-scope-tab-ai" type="button" role="tab" aria-selected="false" aria-controls="sessions-scope-panel-ai" tabindex="-1" data-sessions-scope-tab="project_ai_read">${uiText("workbench.sessions.scope-tab-ai")}</button>`,
    `</div>`,
    `<div class="sessions-scope-panel" id="sessions-scope-panel-tools" role="tabpanel" aria-labelledby="sessions-scope-tab-tools" data-sessions-scope-panel="tools"></div>`,
    `<div class="sessions-scope-panel" id="sessions-scope-panel-ai" role="tabpanel" aria-labelledby="sessions-scope-tab-ai" data-sessions-scope-panel="project_ai_read" hidden></div>`,
    `<p class="sessions-scope-hint" data-sessions-scope-notice role="status" aria-live="polite"></p></div>`,
    `<footer class="mw-sheet__footer">`,
    `<button class="mw-btn mw-btn--secondary" type="button" data-sessions-scope-close>${uiText("common.control.close")}</button>`,
    `<button class="mw-btn mw-btn--secondary" type="button" data-sessions-scope-return hidden>${uiText("workbench.sessions.return-to-chat")}</button>`,
    `<button class="mw-btn mw-btn--primary" type="button" data-sessions-scope-save>${uiText("workbench.sessions.save-scope")}</button>`,
    `</footer></div></dialog>`,
  ].join("");
}
