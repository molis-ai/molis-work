import { escapeHtml, renderButton, renderComposer, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";

/** The glyphs the side pane draws for kinds of things and states, rendered once from the shared icon set. */
const ASSISTANT_GLYPHS: readonly PluginIconName[] = ["file", "note", "image", "zap", "check", "circle", "clock", "flag", "undo", "edit", "alert", "circle-alert", "sparkles", "package",
  "code", "idea", "inbox", "target", "database", "workflow", "upload", "bell", "paperclip", "text", "status-waiting", "x",
  "question", "shield", "terminal", "external", "eye", "search", "list", "refresh", "folder", "git-branch", "link", "user"];

/**
 * The resident Assistant: its panel of works and the platform's composer (unified-input K3), drawn here as its first screen so
 * nothing moves when the island mounts it: who the next message goes to, the text, ＋ and send. Where to go lives at the bar's
 * left and search in the project menu (and ⌘K); the project list uses the same Dock. Who the next message goes to is the tag beside ＋.
 */
export function renderAssistantDock(primitives: { readText(value: string): string; icon(name: PluginIconName): string }): string {
  const { icon } = primitives;
  const add = uiText.text("workbench.composer.next-boundary");
  return `<div class="bar-center" data-assistant-island data-system-view-owner="assistant">
      <section class="assistant-panel" data-assistant-panel aria-label="${uiText("workbench.assistant-dock.assistant")}" hidden>
        <template data-assistant-glyphs>${ASSISTANT_GLYPHS.map((name) => `<span data-glyph="${name}">${icon(name)}</span>`).join("")}</template>
        <header class="assistant-tabbar">
          <div class="assistant-tabs" data-assistant-tabs data-overflow-fade role="tablist" aria-label="${uiText("workbench.assistant-dock.open-work")}"></div>
          <button class="assistant-tab-new" type="button" data-assistant-new aria-label="${uiText("workbench.assistant-dock.start-new-piece-work")}" title="${uiText("workbench.assistant-dock.start-new-piece-work")}">${icon("plus")}</button>
          <span class="assistant-tabbar-actions">
            <button class="dock-window-action" type="button" data-assistant-expand aria-label="${uiText("workbench.assistant-dock.expand-workspace")}" title="${uiText("workbench.assistant-dock.expand-workspace")}" disabled>${icon("external")}</button>
            ${renderButton({ variant: "ghost", size: "sm", icon: "chevron-down", label: uiText.text("workbench.assistant-dock.return-bottom-bar"), attrs: { "data-assistant-retract": true, hidden: true } })}
            <button class="dock-window-action" type="button" data-assistant-works-toggle aria-expanded="false" aria-controls="assistant-works" aria-label="${uiText("workbench.assistant-dock.all-work")}" title="${uiText("workbench.assistant-dock.all-work")}">${icon("list")}</button>
            <button class="dock-window-action assistant-side-toggle" type="button" data-assistant-side-toggle aria-expanded="true" aria-controls="assistant-side" aria-label="${uiText("workbench.assistant-dock.details-work")}" title="${uiText("workbench.assistant-dock.details-work")}">${icon("sidebar")}<span class="assistant-side-dot" data-assistant-side-dot hidden></span></button>
            <button class="dock-window-action" type="button" data-assistant-panel-close aria-label="${uiText("workbench.assistant-dock.minimize")}" title="${uiText("workbench.assistant-dock.minimize")}">${icon("chevron-down")}</button>
          </span>
        </header>
        <nav class="assistant-works" id="assistant-works" data-assistant-works aria-label="${uiText("workbench.assistant-dock.all-work")}" hidden></nav>
        <div class="assistant-body">
          <aside class="assistant-side" id="assistant-side" data-assistant-side aria-label="${uiText("workbench.assistant-dock.work")}">
            <section class="assistant-summary" aria-label="${uiText("workbench.assistant-dock.overview")}">
              <div class="assistant-summary-top">
                <p class="assistant-summary-state"><span class="assistant-state" data-assistant-work-state></span></p>
                <span class="assistant-summary-controls">
                  <button class="assistant-control" type="button" data-assistant-control="pause" hidden>${uiText("workbench.assistant-dock.pause")}</button>
                  <button class="assistant-control" type="button" data-assistant-control="resume" hidden>${uiText("workbench.assistant-dock.continue")}</button>
                  <button class="assistant-control assistant-control--stop" type="button" data-assistant-control="stop" hidden>${uiText("workbench.assistant-dock.stop")}</button><button class="assistant-control" type="button" data-assistant-control="stop" data-keep-connections hidden>${uiText("workbench.assistant-dock.stop-task-keep-connecting")}</button>
                </span>
              </div>
              <p class="assistant-summary-title" data-assistant-work-title>${uiText("workbench.assistant-dock.new-work")}</p>
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
          </aside>
          <div class="assistant-main">
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
              <div class="assistant-empty" data-assistant-empty><strong>${uiText("workbench.assistant-dock.personal-work-assistant")}</strong><p>${uiText("workbench.assistant-dock.say-what-needs-doing-organize-material-draft-look")}</p><div class="assistant-empty-list" data-assistant-empty-list></div></div>
            </div>
            <button class="assistant-jump" type="button" data-assistant-jump hidden></button>
          </div>
        </div>
      </section>
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
