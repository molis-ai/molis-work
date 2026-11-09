import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";

/** What the Goal chrome writes with: the page's words, its escaping and its icons. */
export interface GoalChromePrimitives {
  L: (text: string, values?: Record<string, string | number>) => string;
  escapeHtml: (value: unknown) => string;
  icon: (name: PluginIconName) => string;
}

export function renderImmersiveGoalHeader(title: string, primitives: GoalChromePrimitives): string {
  const { escapeHtml, icon } = primitives;
  return `<header class="goal-node-toolbar"><button class="goal-node-back" type="button" data-goal-collapse aria-label="${uiText("goals.chrome.back-goal-canvas")}" title="${uiText("goals.chrome.back-goal-canvas")}">${icon("chevron-right")}</button><div class="goal-node-heading"><h1 data-workspace-goal-title tabindex="-1">${escapeHtml(title)}</h1><span data-workspace-goal-status></span></div><div class="mw-toggle-group goal-view-switch" data-slot="toggle-group" role="group" aria-label="${uiText("goals.chrome.goal-view")}"><button class="mw-toggle is-current" type="button" data-goal-view-tab="document" aria-pressed="true">${icon("file")}<span>${uiText("goals.chrome.overview")}</span></button><button class="mw-toggle" type="button" data-goal-view-tab="work" aria-pressed="false">${icon("terminal")}<span>${uiText("goals.chrome.terminal")}</span></button></div>
  </header>`;
}

export function renderGoalDetailsAside(documentHtml: string, primitives: GoalChromePrimitives): string {
  const { icon } = primitives;
  return `<aside class="goal-details-aside" data-goal-details-aside>
      <button class="goal-details-toggle" type="button" data-goal-details-toggle aria-expanded="true" aria-label="${uiText("goals.chrome.collapse-goal-info-timeline")}" title="${uiText("goals.chrome.goal-info-timeline")}">${icon("panel")}</button>
      ${documentHtml}
    </aside>`;
}

export function renderImmersiveWorkTabs({ icon }: GoalChromePrimitives): string {
  return `<div class="goal-work-modebar"><div role="tablist" aria-label="${uiText("goals.chrome.workflow")}"><button type="button" role="tab" id="goal-conversation-tab" aria-selected="false" aria-disabled="true" disabled tabindex="-1" title="${uiText("goals.chrome.conversation-not-available-yet")}" data-goal-work-mode="conversation">${icon("message")}<span>${uiText("goals.chrome.chat")}</span></button><button type="button" role="tab" id="goal-terminal-tab" aria-controls="goal-tui-pane" aria-selected="true" data-goal-work-mode="terminal">${icon("terminal")}<span>${uiText("goals.chrome.terminal")}</span></button></div><span data-goal-runtime-status></span></div>`;
}
