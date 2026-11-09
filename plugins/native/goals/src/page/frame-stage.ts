import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";

/** The Goal's Frame surface: its summary, the canvas of what it gathers, the picker for adding content, and the zoom tools. Hidden until the Frame opens. */
export function renderGoalFrameStage({ icon }: { L: (text: string) => string; icon: (name: PluginIconName) => string }): string {
  return `<section class="goal-frame-surface" data-goal-frame-surface aria-label="Frame" hidden>
    <header class="frame-goal-summary"><div class="frame-goal-heading"><h1 data-frame-goal-title></h1><span data-frame-goal-status></span></div><p data-frame-goal-outcome></p>    <div class="frame-goal-actions mw-toolbar"><button class="mw-btn mw-btn--secondary" type="button" data-frame-add-content>${icon("plus")}${uiText("goals.frame-stage.add-existing-content")}</button><button class="mw-btn mw-btn--secondary" type="button" data-frame-goal-work>${icon("terminal")}${uiText("goals.frame-stage.open-workspace")}</button><button class="mw-btn mw-btn--ghost" type="button" data-frame-goal-locate>${icon("target")}${uiText("goals.frame-stage.locate-relation-canvas")}</button></div></header>
    <div class="goal-frame-canvas" data-frame-canvas><div class="frame-empty mw-empty" data-frame-empty><strong>${uiText("goals.frame-stage.put-what-goal-needs-here")}</strong><p>${uiText("goals.frame-stage.drag-messages-sessions-files-directory-arrange-them-one")}</p><button type="button" class="mw-btn mw-btn--primary" data-frame-add-content>${icon("plus")}${uiText("goals.frame-stage.add-existing-content")}</button></div>
      <div class="goal-frame-world" data-frame-world></div>
    </div>
    <dialog class="frame-picker mw-dialog" data-frame-picker aria-labelledby="frame-picker-title">
      <header><h2 id="frame-picker-title">${uiText("goals.frame-stage.add-existing-content")}</h2><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only" data-frame-picker-close aria-label="${uiText("goals.frame-stage.close")}">${icon("x")}</button></header>
      <div class="frame-picker-tools mw-input-group"><input class="mw-input" type="search" data-frame-picker-search placeholder="${uiText("goals.frame-stage.search-titles-sources")}" aria-label="${uiText("goals.frame-stage.search-titles-sources")}" autofocus><select class="mw-select" data-frame-picker-kind aria-label="${uiText("goals.frame-stage.content-source")}"><option value="all">${uiText("goals.frame-stage.all-sources")}</option><option value="feed">Feed</option><option value="inbox">Inbox</option><option value="session">${uiText("goals.frame-stage.session")}</option><option value="artifact">${uiText("goals.frame-stage.result")}</option></select></div>
      <div class="frame-picker-list mw-scroll" data-frame-picker-list></div>
      <footer><span>${uiText("goals.frame-stage.add-reference-original-stays-its-source")}</span><button type="button" class="mw-btn mw-btn--secondary" data-frame-picker-close>${uiText("goals.frame-stage.cancel")}</button></footer>
    </dialog>
    <footer class="goal-canvas-tools goal-frame-tools"><div role="group" aria-label="${uiText("goals.frame-stage.canvas-zoom")}"><button type="button" data-frame-zoom="out" aria-label="${uiText("goals.frame-stage.zoom-out")}">−</button><output data-frame-zoom-value>100%</output><button type="button" data-frame-zoom="in" aria-label="${uiText("goals.frame-stage.zoom")}">+</button></div></footer>
  </section>`;
}
