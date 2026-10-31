import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";

/** What the Goal chrome writes with: the page's words, its escaping and its icons. */
export interface GoalChromePrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: PluginIconName): string;
}

export function renderImmersiveGoalHeader(title: string, primitives: GoalChromePrimitives): string {
  const { L, escapeHtml, icon } = primitives;
  return `<header class="goal-node-toolbar"><button class="goal-node-back" type="button" data-goal-collapse aria-label="${L("返回 Goal 画布")}" title="${L("返回 Goal 画布")}">${icon("chevron-right")}</button><div class="goal-node-heading"><h1 data-workspace-goal-title tabindex="-1">${escapeHtml(title)}</h1><span data-workspace-goal-status></span></div><div class="mw-toggle-group goal-view-switch" data-slot="toggle-group" role="group" aria-label="${L("Goal 视图")}"><button class="mw-toggle is-current" type="button" data-goal-view-tab="document" aria-pressed="true">${icon("file")}<span>${L("概览")}</span></button><button class="mw-toggle" type="button" data-goal-view-tab="work" aria-pressed="false">${icon("terminal")}<span>${L("终端")}</span></button></div>
  </header>`;
}

export function renderGoalDetailsAside(documentHtml: string, primitives: GoalChromePrimitives): string {
  const { L, icon } = primitives;
  return `<aside class="goal-details-aside" data-goal-details-aside>
      <button class="goal-details-toggle" type="button" data-goal-details-toggle aria-expanded="true" aria-label="${L("收起 Goal 信息与时间线")}" title="${L("Goal 信息与时间线")}">${icon("panel")}</button>
      ${documentHtml}
    </aside>`;
}

export function renderImmersiveWorkTabs({ L, icon }: GoalChromePrimitives): string {
  return `<div class="goal-work-modebar"><div role="tablist" aria-label="${L("工作方式")}"><button type="button" role="tab" id="goal-conversation-tab" aria-selected="false" aria-disabled="true" disabled tabindex="-1" title="${L("对话尚未接入")}" data-goal-work-mode="conversation">${icon("message")}<span>${L("对话")}</span></button><button type="button" role="tab" id="goal-terminal-tab" aria-controls="goal-tui-pane" aria-selected="true" data-goal-work-mode="terminal">${icon("terminal")}<span>${L("终端")}</span></button></div><span data-goal-runtime-status></span></div>`;
}
