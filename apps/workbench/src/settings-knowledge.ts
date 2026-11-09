import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { readFileSync } from "node:fs";

/**
 * 项目资料 in a project's settings (specs/project-knowledge §8.3): every piece the project's agents can find, how far its card
 * is organized, today's organizing allowance, and who read what. Everything it shows and changes goes through
 * `/projects/<id>/api/knowledge/*`, which invokes the shared directory's `knowledge.*` actions as the person.
 */
export function renderKnowledgeSettings({ projectId }: { readText(text: string): string; projectId: string }): string {
  const state = (value: string, label: string) => `<option value="${value}">${label}</option>`;
  return `<section class="settings-document knowledge-settings" aria-labelledby="knowledge-title" data-knowledge-settings data-project="${projectId}">
    <header class="settings-page-heading"><h1 id="knowledge-title">${uiText("workbench.settings-knowledge.project-knowledge")}</h1>
      <p>${uiText("workbench.settings-knowledge.everything-agents-project-can-find-read-project-s")}</p>
      <p class="knowledge-summary" data-knowledge-summary aria-live="polite">${uiText("workbench.settings-knowledge.loading")}</p></header>
    <p class="settings-form-error" data-knowledge-error role="alert" hidden></p>
    <p class="knowledge-model-note" data-knowledge-model hidden>${uiText("workbench.settings-knowledge.no-text-model-available-yet-pieces-can-still")} <a href="/settings/models">${uiText("workbench.settings-knowledge.set-up-model")}</a></p>
    <section class="settings-section knowledge-quota" aria-labelledby="knowledge-quota-title">
      <h2 id="knowledge-quota-title">${uiText("workbench.settings-knowledge.today-s-organizing-allowance")}</h2>
      <div class="knowledge-quota-row">
        <div class="knowledge-quota-copy"><span data-knowledge-quota-text>${uiText("workbench.settings-knowledge.loading")}</span>
          <div class="mw-progress knowledge-quota-bar" data-slot="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="${uiText("workbench.settings-knowledge.organizing-allowance-used-today")}"><span data-knowledge-quota-bar style="width:0%"></span></div></div>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-confirm hidden>${uiText("workbench.settings-knowledge.allow-another-day-s-worth")}</button>
      </div>
      <p class="settings-muted" data-knowledge-quota-note hidden>${uiText("workbench.settings-knowledge.today-s-allowance-used-up-so-organizing-has")}</p>
    </section>
    <section class="settings-section knowledge-items" aria-labelledby="knowledge-items-title">
      <div class="knowledge-items-head"><h2 id="knowledge-items-title">${uiText("workbench.settings-knowledge.all-pieces")}</h2>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-organize-all hidden>${uiText("workbench.settings-knowledge.retry-unfinished")}</button></div>
      <div class="knowledge-toolbar" role="group" aria-label="${uiText("workbench.settings-knowledge.filter-pieces")}">
        <select class="mw-select" data-knowledge-filter="state" aria-label="${uiText("workbench.settings-knowledge.organizing-state")}">
          ${state("", uiText.text("workbench.settings-knowledge.all-states"))}${state("pending", uiText.text("workbench.settings-knowledge.waiting"))}${state("ready", uiText.text("workbench.settings-knowledge.organized"))}${state("listed", uiText.text("workbench.settings-knowledge.title-only"))}${state("failed", uiText.text("workbench.settings-knowledge.failed"))}${state("over_quota", uiText.text("workbench.settings-knowledge.over-allowance"))}${state("missing", uiText.text("workbench.settings-knowledge.not-present"))}${state("changed", uiText.text("workbench.settings-knowledge.new-suggestion"))}${state("excluded", uiText.text("workbench.settings-knowledge.kept-agents"))}
        </select>
        <input class="mw-input knowledge-search" type="search" data-knowledge-filter="query" placeholder="${uiText("workbench.settings-knowledge.filter-title-source-keyword")}" aria-label="${uiText("workbench.settings-knowledge.filter-title-source-keyword")}">
      </div>
      <div class="knowledge-batch" data-knowledge-batch hidden role="group" aria-label="${uiText("workbench.settings-knowledge.bulk-actions")}">
        <span data-knowledge-batch-count></span>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-batch-action="organize">${uiText("workbench.settings-knowledge.organize-again")}</button>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-batch-action="exclude">${uiText("workbench.settings-knowledge.kept-agents")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-knowledge-batch-action="include">${uiText("workbench.settings-knowledge.give-back-agents")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-knowledge-batch-action="clear">${uiText("workbench.settings-knowledge.clear-selection")}</button>
      </div>
      <label class="knowledge-select-all"><input type="checkbox" data-knowledge-select-all>${uiText("workbench.settings-knowledge.select-all-listed-pieces")}</label>
      <ul class="knowledge-list" data-knowledge-list><li class="settings-muted">${uiText("workbench.settings-knowledge.loading")}</li></ul>
      <button class="mw-btn mw-btn--ghost mw-btn--sm knowledge-more" type="button" data-knowledge-more hidden>${uiText("workbench.settings-knowledge.show-more")}</button>
    </section>
    <section class="settings-section knowledge-receipts" aria-labelledby="knowledge-receipts-title">
      <h2 id="knowledge-receipts-title">${uiText("workbench.settings-knowledge.recently-read")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-knowledge.every-time-agent-read-piece-s-original-text")}</p>
      <ul class="knowledge-receipt-list" data-knowledge-receipts><li class="settings-muted">${uiText("workbench.settings-knowledge.loading")}</li></ul>
    </section>
  </section>`;
}

/**
 * The browser program of project knowledge: TypeScript in `src/browser/knowledge/` (tsconfig.browser.json), bundled by esbuild
 * into `dist/knowledge-client.js` when the package builds, and served once as `KNOWLEDGE_CLIENT_ASSET` (cached; the user chose
 * one asset over copies inside each page's script, 2026-10-19). It binds every 项目资料 page, also one the settings cover places
 * later, the side panel's import, and the one picker of project knowledge. It needs the page's `readText` and `molisWorkRequest`
 * first, so its tag comes after the page's own scripts.
 */
const KNOWLEDGE_CLIENT_ASSET = "/assets/molis-work-knowledge.js";
export const knowledgeClientTag = (): string => `<script src="${KNOWLEDGE_CLIENT_ASSET}"></script>`;
let client: string | null = null;
export function renderMolisWorkKnowledgeClientScript(): string {
  return client ??= readFileSync(new URL("./knowledge-client.js", import.meta.url), "utf8").trim();
}
