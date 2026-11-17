import { subtaskConversationLabels } from "./subtask-conversation-labels.js";
export { subtaskConversationLabels } from "./subtask-conversation-labels.js";
import { escapeHtml, renderButton, renderComposer, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";
import { renderSubtaskConversation, type MwSubtaskConversationView } from "@molis-ai/molis-work-plugin-sdk/ui";

const say = (key: string) => t.text(`workbench.subtask-conversation.${key}`);
export type SubtaskSpecimenState = "running" | "round-ended" | "answer" | "approval" | "stopped" | "failed" | "interrupted" | "unavailable";
export function subtaskSpecimenView(state: SubtaskSpecimenState): MwSubtaskConversationView {
  const held = ["stopped", "failed", "interrupted", "unavailable"].includes(state);
  const text = (key: string) => `<p>${escapeHtml(say(key))}</p>`;
  const question = state === "answer" || state === "approval";
  const running = state === "running" || question;
  return {
    target: "writer", binding: "specimen-attempt:1", title: say("task"), parent: { target: "beta", title: say("parent") },
    status: { state, label: say(state) }, summary: say("brief"), running,
    ...(held ? { inputUnavailable: say(state === "unavailable" ? "reassigned" : "continue-note") } : {}),
    messages: [
      { id: "user-1", role: "user", content: { html: text("sample-user") }, receipt: say("receipt") },
      { id: "assistant-1", role: "assistant", name: say("writer"), content: { html: text("sample-reply") } },
    ],
    details: [
      { id: "process", title: say("process"), content: { html: text("process-text") } },
      ...(question ? [{ id: state, title: say(state === "answer" ? "question" : "approval-question"), content: { html: text(state === "approval" ? "approval-scope" : "question-note") }, expanded: true,
        actions: state === "answer" ? [{ id: "answer-short", ref: "specimen:answer-short", label: say("short") }, { id: "answer-long", ref: "specimen:answer-long", label: say("long") }]
          : [{ id: "approve", ref: "specimen:approve", label: say("approve") }, { id: "deny", ref: "specimen:deny", label: say("deny") }] }] : []),
    ],
    children: [{ target: "mobile", title: say("nested"), unread: true }],
    actions: running ? [{ id: "stop", ref: "specimen:stop", label: say("stop") }]
      : state === "round-ended" || held && state !== "unavailable" ? [{ id: "continue", ref: "specimen:continue", label: say("continue"), title: say("continue-note") }] : [],
  };
}
export function renderSubtaskSpecimen(state: SubtaskSpecimenState): string {
  const view = subtaskSpecimenView(state);
  const input = renderComposer({ kind: "ai", labels: { ...assistantComposerLabels(t.text, true), input: say("input") }, add: false,
    receiver: { label: say("writer"), icon: "user" }, ...(view.running ? { state: "running" as const } : {}),
    ...(view.inputUnavailable ? { disabled: { caption: view.status.label, reason: view.inputUnavailable } } : {}) });
  return renderSubtaskConversation({ view, labels: subtaskConversationLabels(), composerHtml: input }).replace('<section class=', `<section data-subtask-demo-state="${state}" class=`);
}
export function renderSubtaskConversationSection(): string {
  const states: readonly SubtaskSpecimenState[] = ["running", "round-ended", "answer", "approval", "stopped", "failed", "interrupted", "unavailable"];
  const tools = `<div class="mw-subtask-demo-tools">${["history", "read-error", "reset"].map(key => renderButton({ label: say(`demo-${key}`), variant: "secondary", size: "sm", attrs: { "data-subtask-demo": key } })).join("")}</div>`;
  const figures = states.map(state => `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(say(state))}</figcaption><div class="mw-subtask-specimen">${renderSubtaskSpecimen(state)}</div></figure>`).join("");
  const unreadable = renderSubtaskSpecimen("running").replace('<div class="mw-subtask__feedback" data-subtask-feedback role="status"></div>',
    `<div class="mw-subtask__feedback" data-subtask-feedback role="status">${escapeHtml(say("read-failed"))} ${renderButton({ label: say("retry"), variant: "link", attrs: { "data-subtask-retry": true } })}</div>`);
  return `<section class="mw-catalog__section" id="subtask-conversation" data-primitive="subtask-conversation"><h2>${escapeHtml(say("title"))}</h2>`
    + `<p class="mw-catalog__hint">${escapeHtml(say("specimen-note"))}</p><div class="mw-catalog__specimens mw-subtask-specimens">${figures}`
    + `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(say("read-failed"))}</figcaption><div class="mw-subtask-specimen">${unreadable}</div></figure></div>${tools}</section>`;
}
export const SUBTASK_SPECIMEN_STYLES = `
  .mw-subtask-specimens { grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); }
  .mw-subtask-demo-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 16px; }
  .mw-subtask-specimen { width: min(100%, 330px); height: 570px; min-width: 0; }
`;
