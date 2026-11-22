import { escapeHtml, renderButton, renderComposer, renderMenu, renderMenuItem, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";
import { renderAssistantPermissions, renderReviewPermission } from "./assistant-permissions.js";
import { renderAutomationRecommendations } from "./automation-recommendations.js";
import { renderContextCard, renderInfoLists, renderInfoTabs } from "./work-line-parts.js";

/** The glyphs the side pane draws for kinds of things and states, rendered once from the shared icon set. */
const ASSISTANT_GLYPHS: readonly PluginIconName[] = ["file", "note", "image", "zap", "check", "circle", "clock", "flag", "undo", "edit", "alert", "circle-alert", "sparkles", "package",
  "code", "idea", "inbox", "target", "database", "workflow", "upload", "bell", "paperclip", "text", "status-waiting", "x",
  "question", "shield", "terminal", "external", "eye", "search", "list", "refresh", "folder", "git-branch", "link", "user"];

/**
 * The resident Assistant: its conversation (the conversation column, as wide as the input, under one line that names what is
 * talked about; the information column to its right, over the card stack: specs/screen-polish §4「底栏第十三版」) and the platform's composer (unified-input K3), drawn here as its first screen so
 * nothing moves when the island mounts it: who the next message goes to, the text, ＋ and send. Where to go lives at the bar's
 * left and search in the project menu (and ⌘K); the project list uses the same Dock. Who the next message goes to is the tag beside ＋.
 */
export function renderAssistantDock(primitives: { readText(value: string): string; icon(name: PluginIconName): string }): string {
  const { icon } = primitives;
  // The conversation column's keys: 28px, a glyph each, named for a reader and on hover.
  const key = (attr: string, glyph: PluginIconName, label: string, more = "", inside = "") => `<button class="dock-window-action" type="button" ${attr} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${more}>${icon(glyph)}${inside}</button>`;
  const add = uiText.text("workbench.composer.next-boundary");
  return `<div class="bar-center" data-assistant-island>
      <section class="assistant-panel" id="assistant-panel" data-assistant-panel aria-label="${uiText("workbench.assistant-dock.assistant")}" hidden>
        <template data-assistant-glyphs>${ASSISTANT_GLYPHS.map((name) => `<span data-glyph="${name}">${icon(name)}</span>`).join("")}</template>
        <div class="assistant-body">
          <div class="assistant-main">
            <header class="assistant-head" data-assistant-head>
              <span class="assistant-head-mark" data-assistant-head-mark aria-hidden="true"></span>
              <h2 class="assistant-head-title" data-assistant-head-title></h2>
              <span class="assistant-head-note" data-assistant-head-note></span>
              <span class="assistant-head-actions">
                ${key("data-assistant-side-toggle", "list", uiText.text("workbench.assistant-dock.information"), ` aria-expanded="false" aria-controls="assistant-side"`, `<span class="assistant-side-dot" data-assistant-side-dot hidden></span>`)}
                ${key("data-assistant-expand", "maximize", uiText.text("workbench.assistant-dock.maximize"))}
                ${key("data-assistant-retract", "minus", uiText.text("workbench.assistant-dock.restore"), " hidden")}
                ${key("data-assistant-more", "more", uiText.text("workbench.assistant-dock.more"), ` aria-haspopup="menu" aria-expanded="false" aria-controls="assistant-more"`)}
                ${key("data-assistant-panel-close", "chevron-down", uiText.text("workbench.assistant-dock.minimize"))}
              </span>
              ${renderMenu({ className: "assistant-more", attrs: { id: "assistant-more", "data-assistant-more-menu": "", hidden: "", "aria-label": uiText.text("workbench.assistant-dock.more") },
                items: renderMenuItem({ label: uiText.text("workbench.assistant-dock.start-new-piece-work"), iconName: "plus", attrs: { "data-assistant-new": "" } })
                  + renderMenuItem({ label: uiText.text("workbench.assistant-dock.all-work"), iconName: "list", attrs: { "data-assistant-works-toggle": "", "aria-controls": "assistant-works" } })
                  + renderMenuItem({ label: uiText.text("workbench.assistant-dock.details"), iconName: "info", attrs: { "data-info-details-open": "", "aria-controls": "info-details" } }) })}
            </header>
            <nav class="assistant-works" id="assistant-works" data-assistant-works aria-label="${uiText("workbench.assistant-dock.all-work")}" hidden></nav>
            <div class="assistant-page-takes" data-assistant-page-takes hidden>${icon("message")}<p><b>${uiText("workbench.assistant-dock.page-takes-title")}</b>${uiText("workbench.assistant-dock.page-takes-words")}</p>${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.assistant-dock.ask-assistant-instead"), attrs: { "data-assistant-ask-assistant": "" } })}</div>
            <div class="assistant-strip" data-assistant-strip hidden>
              <span class="assistant-state" data-assistant-strip-state></span>
              <span class="assistant-strip-now" data-assistant-strip-now></span>
              <span class="assistant-strip-actions">
                <button class="assistant-control" type="button" data-assistant-control="pause" hidden>${uiText("workbench.assistant-dock.pause")}</button>
                <button class="assistant-control" type="button" data-assistant-control="resume" hidden>${uiText("workbench.assistant-dock.continue")}</button>
                <button class="assistant-control assistant-control--stop" type="button" data-assistant-control="stop" hidden>${uiText("workbench.assistant-dock.stop")}</button><button class="assistant-control" type="button" data-assistant-control="stop" data-keep-connections hidden>${uiText("workbench.assistant-dock.stop-task-keep-connecting")}</button>
              </span>
            </div>
            <div class="assistant-thread" data-assistant-thread role="log" aria-live="polite" aria-relevant="additions">
              <p class="assistant-empty" data-assistant-empty></p>
              <p class="assistant-event-hint" data-assistant-event-hint hidden></p>
            </div>
            <button class="assistant-jump" type="button" data-assistant-jump hidden></button>
          </div>
          <aside class="assistant-side" id="assistant-side" data-assistant-side data-info="info" aria-label="${uiText("workbench.assistant-dock.information")}">
            ${renderInfoTabs()}
            <div class="info-pane" id="info-pane" data-info-pane role="tabpanel" aria-labelledby="info-tab-info">
            <div class="assistant-event-card" data-assistant-event-card hidden></div>
            <div class="work-card work-place-card" data-info-place></div>
            ${renderContextCard()}
            </div>
            <section class="info-details" id="info-details" data-info-details aria-label="${uiText("workbench.assistant-dock.details")}" hidden>
            <header class="info-details-head">${renderButton({ variant: "ghost", size: "sm", icon: "back", iconOnly: true, label: uiText.text("workbench.work-line.back"), attrs: { "data-info-details-close": "" } })}<strong>${uiText("workbench.assistant-dock.details")}</strong></header>
            <div class="info-details-body">
            <div class="assistant-empty-list" data-assistant-empty-list></div>
            <section class="assistant-summary" aria-label="${uiText("workbench.assistant-dock.overview")}">
              <div class="assistant-summary-top">
                <p class="assistant-summary-state"><span class="assistant-state" data-assistant-work-state></span></p>
                <span class="assistant-summary-controls">
                  <a class="assistant-control" data-assistant-memory hidden>${uiText("workbench.assistant-dock.session-memory")}</a>
                  <button class="assistant-control" type="button" data-assistant-control="pause" hidden>${uiText("workbench.assistant-dock.pause")}</button>
                  <button class="assistant-control" type="button" data-assistant-control="resume" hidden>${uiText("workbench.assistant-dock.continue")}</button>
                  <button class="assistant-control assistant-control--stop" type="button" data-assistant-control="stop" hidden>${uiText("workbench.assistant-dock.stop")}</button><button class="assistant-control" type="button" data-assistant-control="stop" data-keep-connections hidden>${uiText("workbench.assistant-dock.stop-task-keep-connecting")}</button>
                </span>
              </div>
              <p class="assistant-summary-title" data-assistant-work-title>${uiText("workbench.assistant-dock.new-work")}</p>
              ${renderButton({ variant: "ghost", size: "sm", icon: "shield", label: uiText.text("workbench.authorization.choose"), attrs: { "data-assistant-permission-open": "", "data-assistant-permission-summary": true, hidden: true } })}
              ${renderButton({ variant: "ghost", size: "sm", icon: "sparkles", label: uiText.text("workbench.automation.title"), attrs: { "data-automation-open": "", "data-assistant-automation": true, hidden: true } })}
              <p class="assistant-summary-now" data-assistant-now hidden></p>
              <dl class="assistant-summary-meta" data-assistant-meta></dl>
            </section>
            <section class="assistant-block assistant-block--attention" data-assistant-block="attention" aria-label="${uiText("workbench.assistant-dock.still-waiting")}" hidden></section>
            <section class="assistant-block" data-assistant-block="path" aria-label="${uiText("workbench.assistant-dock.path")}" hidden></section>
            <section class="assistant-block" data-assistant-block="agreements" aria-label="${uiText("workbench.assistant-dock.what-ai-noted-agreed")}" hidden></section>
            <section class="assistant-block" data-assistant-block="environment" aria-label="${uiText("workbench.assistant-dock.where-runs")}" hidden></section>
            <section class="assistant-block" data-assistant-block="materials" aria-label="${uiText("workbench.assistant-dock.context")}" hidden></section>
            <section class="assistant-block" data-assistant-block="tools" aria-label="${uiText("workbench.assistant-dock.connections-tools")}" hidden></section>
            <section class="assistant-block" data-assistant-block="results" aria-label="${uiText("workbench.assistant-dock.output")}" hidden></section>
            <section class="assistant-block" data-assistant-block="changes" aria-label="${uiText("workbench.assistant-dock.changes")}" hidden></section>
            <section class="assistant-block" data-assistant-block="background" aria-label="${uiText("workbench.assistant-dock.background-job")}" hidden></section>
            <section class="assistant-block assistant-block--usage" data-assistant-usage hidden></section>
            </div>
            </section>
            ${renderInfoLists()}
          </aside>
        </div>
      </section>${renderAssistantPermissions()}${renderReviewPermission()}${renderAutomationRecommendations()}
      <p class="settings-form-error" data-automation-load-error role="alert" hidden></p>
      <div class="assistant-context-strip" data-assistant-context-strip role="group" hidden></div>
      <div class="assistant-next-row" data-assistant-next-row hidden></div>
      <div class="assistant-popover assistant-notices" id="assistant-notices" data-assistant-notices role="group" aria-label="${uiText("workbench.assistant-dock.needs-attention")}" hidden></div>
      <div class="assistant-composer" data-assistant-composer data-composer-next="${escapeHtml(add)}">
        <button class="assistant-answer" type="button" data-assistant-answer hidden></button>
        ${renderComposer({ kind: "ai", labels: assistantComposerLabels(uiText.text, true), placeholder: uiText.text("workbench.assistant-dock.ask-assistant-do-something"), receiver: { label: uiText.text("workbench.assistant-dock.assistant"), icon: "sparkles", open: true } })}
        <button class="assistant-attention" type="button" data-assistant-attention aria-haspopup="true" aria-expanded="false" aria-controls="assistant-notices" title="${uiText("workbench.assistant-dock.needs-attention")}" hidden>${icon("bell")}<span data-assistant-attention-count></span></button>
      </div>
    </div>`;
}
