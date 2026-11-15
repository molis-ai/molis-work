import { icon, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * Work-area surface for external AI tool sessions (`data-work-surface="sessions"`).
 * Deferred until opened; its dialogs live at the shell root (`renderSessionsOverlays`) so `open_project_ai_read`
 * can open the Read Scope Sheet over any active conversation without switching pages (SRB-08, contract-design §7.4).
 */
export function renderSessionsStage(): string {
  return `<section class="desktop-work-surface sessions-surface" data-work-surface="sessions" data-work-surface-label="${uiText("workbench.sessions.navigation-name")}" data-deferred-surface data-expanded="false" hidden><template data-deferred-content>
    <div class="sessions-layout">
      <div class="sessions-list-pane" data-sessions-list-pane>
        <header class="sessions-head">
          <h1>${uiText("workbench.sessions.navigation-name")}</h1>
          <div class="sessions-head-actions">
            <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-sessions-refresh title="${uiText("workbench.sessions.refresh")}" aria-label="${uiText("workbench.sessions.refresh")}">${icon("refresh")}</button>
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-open-scope="tools">${icon("settings")}<span>${uiText("workbench.sessions.read-scope")}</span></button>
          </div>
        </header>
        <div class="sessions-views mw-toggle-group" role="tablist" aria-label="${uiText("workbench.sessions.view-group")}">
          <button class="mw-toggle is-current" type="button" role="tab" aria-selected="true" data-sessions-view="project">${uiText("workbench.sessions.view-project")}</button>
          <button class="mw-toggle" type="button" role="tab" aria-selected="false" data-sessions-view="all">${uiText("workbench.sessions.view-all")}</button>
          <button class="mw-toggle" type="button" role="tab" aria-selected="false" data-sessions-view="unfiled"><span>${uiText("workbench.sessions.view-unfiled")}</span> <span class="mw-badge" data-sessions-unfiled-count hidden>0</span></button>
        </div>
        <div class="sessions-filter-bar">
          <div class="sessions-filter-row">
            <select class="mw-input" data-sessions-tool-filter aria-label="${uiText("workbench.sessions.filter-tool")}">
              <option value="">${uiText("workbench.sessions.all-tools")}</option>
            </select>
            <label class="mw-input-group">${icon("search")}<input class="mw-input" type="search" data-sessions-search placeholder="${uiText("workbench.sessions.search-list-placeholder")}" aria-label="${uiText("workbench.sessions.search-list-placeholder")}" autocomplete="off"></label>
          </div>
          <div class="sessions-droid-bar" data-sessions-droid-bar hidden>
            <span data-sessions-droid-hint>${uiText("workbench.sessions.droid-search-hint")}</span>
            <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-sessions-droid-run>${icon("search")}<span>${uiText("workbench.sessions.droid-search-run")}</span></button>
          </div>
        </div>
        <section class="sessions-sources" data-sessions-sources aria-label="${uiText("workbench.sessions.sources-status")}" hidden></section>
        <div class="sessions-body" data-sessions-body role="list"></div>
      </div>
      <div class="sessions-detail-pane" data-sessions-detail-pane>
        <div class="sessions-detail-empty" data-sessions-detail-empty>${uiText("workbench.sessions.select-prompt")}</div>
        <div class="sessions-detail" data-sessions-detail hidden></div>
      </div>
    </div>
  </template></section>`;
}

export function renderSessionsOverlays(): string {
  return `<dialog class="mw-sheet sessions-scope-sheet" data-sessions-scope-sheet aria-labelledby="sessions-scope-title">
    <div class="mw-sheet__shell">
      <header class="mw-sheet__header">
        <div>
          <h2 id="sessions-scope-title">${uiText("workbench.sessions.read-scope")}</h2>
          <p class="sessions-scope-hint">${uiText("workbench.sessions.scope-subtitle")}</p>
        </div>
        <button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-sessions-scope-close aria-label="${uiText("common.control.close")}">${icon("x")}</button>
      </header>
      <div class="mw-sheet__body">
        <div class="sessions-scope-tabs mw-toggle-group" role="tablist" aria-label="${uiText("workbench.sessions.read-scope")}">
          <button class="mw-toggle is-current" type="button" role="tab" aria-selected="true" data-sessions-scope-tab="tools">${uiText("workbench.sessions.scope-tab-tools")}</button>
          <button class="mw-toggle" type="button" role="tab" aria-selected="false" data-sessions-scope-tab="project_ai_read">${uiText("workbench.sessions.scope-tab-ai")}</button>
        </div>
        <div class="sessions-scope-panel" data-sessions-scope-panel="tools"></div>
        <div class="sessions-scope-panel" data-sessions-scope-panel="project_ai_read" hidden></div>
        <p class="sessions-scope-hint" data-sessions-scope-notice role="status" aria-live="polite"></p>
      </div>
      <footer class="mw-sheet__footer">
        <button class="mw-btn mw-btn--secondary" type="button" data-sessions-scope-close>${uiText("common.control.close")}</button>
        <button class="mw-btn mw-btn--secondary" type="button" data-sessions-scope-return hidden>${uiText("workbench.sessions.return-to-chat")}</button>
        <button class="mw-btn mw-btn--primary" type="button" data-sessions-scope-save>${uiText("workbench.sessions.save-scope")}</button>
      </footer>
    </div>
  </dialog>
  <dialog class="mw-dialog mw-dialog--form sessions-attribution-dialog" data-sessions-attribution-dialog aria-labelledby="sessions-attr-title">
    <form class="mw-form mw-dialog__shell" method="dialog" data-sessions-attr-form>
      <header class="mw-form__header"><h2 id="sessions-attr-title">${uiText("workbench.sessions.change-attribution")}</h2></header>
      <section class="mw-form__body">
        <p class="sessions-scope-hint" data-sessions-attr-session></p>
        <label>${uiText("workbench.sessions.target-project")}<select class="mw-input" data-sessions-attr-select></select></label>
        <p class="sessions-scope-hint">${uiText("workbench.sessions.change-attribution-tool-note")}</p>
        <p class="sessions-scope-hint" data-sessions-attr-error role="alert" hidden></p>
      </section>
      <footer class="mw-form__footer">
        <button class="mw-btn mw-btn--secondary" type="button" data-sessions-attr-cancel>${uiText("common.control.cancel")}</button>
        <button class="mw-btn mw-btn--primary" type="submit" data-sessions-attr-submit>${uiText("workbench.sessions.save-attribution")}</button>
      </footer>
    </form>
  </dialog>`;
}
