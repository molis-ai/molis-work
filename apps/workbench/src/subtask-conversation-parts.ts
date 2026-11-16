import { escapeHtml, renderButton, renderStateRing, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Pending D-track review: the selected B58 float's parts. Move this same implementation to the SDK after review. */
export interface MwSubtaskLink { readonly target: string; readonly title: string; readonly unread?: boolean }
export interface MwSubtaskAction {
  readonly id: string;
  readonly label: string;
  readonly title?: string;
  readonly disabled?: string;
}
export interface MwSubtaskMessage {
  /** Stable identity from the owner's original history, including its attempt where needed. */
  readonly id: string;
  readonly role: "user" | "assistant" | "notice";
  readonly name?: string;
  /** Trusted, sanitized rich text; never raw model HTML. */
  readonly html: string;
  readonly receipt?: string;
}
export interface MwSubtaskDetail {
  readonly id: string;
  readonly title: string;
  /** Trusted, sanitized rich text. Questions and approvals remain the owner's separate actions. */
  readonly html: string;
  readonly actions?: readonly MwSubtaskAction[];
  readonly expanded?: boolean;
}
export interface MwSubtaskConversationView {
  /** Opaque owner key. A reassigned execution must not silently reuse a former target's key. */
  readonly target: string;
  readonly title: string;
  readonly parent: MwSubtaskLink;
  readonly status: { readonly state: StateRingState; readonly label: string };
  readonly summary?: string;
  readonly messages: readonly MwSubtaskMessage[];
  readonly details?: readonly MwSubtaskDetail[];
  readonly children?: readonly MwSubtaskLink[];
  readonly actions?: readonly MwSubtaskAction[];
  readonly running: boolean;
  /** Owner's reason sending is unavailable; does not hide accessible history. */
  readonly inputUnavailable?: string;
}
export interface MwSubtaskConversationLabels {
  readonly back: string;
  readonly close: string;
  readonly loading: string;
  readonly readFailed: string;
  readonly retry: string;
  readonly latest: string;
  readonly messages: string;
  readonly children: string;
  readonly unread: string;
  readonly working: string;
  readonly actionFailed: string;
  readonly unknown: string;
  readonly check: string;
}

export function subtaskAction(action: MwSubtaskAction): string {
  return renderButton({ label: action.label, variant: "secondary", size: "sm", disabled: Boolean(action.disabled),
    attrs: { "data-subtask-action": action.id, title: action.disabled ?? action.title } });
}
export function subtaskHeader(view: MwSubtaskConversationView | undefined, labels: MwSubtaskConversationLabels): string {
  return `${renderButton({ label: labels.back, icon: "chevron-left", iconOnly: true, variant: "ghost", size: "sm", attrs: { "data-subtask-back": true } })}`
    + `<strong title="${escapeHtml(view?.title ?? labels.loading)}">${escapeHtml(view?.title ?? labels.loading)}</strong>`
    + renderButton({ label: labels.close, icon: "x", iconOnly: true, variant: "ghost", size: "sm", attrs: { "data-subtask-close": true } });
}
export function subtaskContext(view: MwSubtaskConversationView): string {
  return `<span class="mw-subtask__parent">${renderButton({ label: view.parent.title, variant: "link", size: "sm", attrs: { "data-subtask-back": true, title: view.parent.title } })}</span>`
    + `<span class="mw-subtask__controls">${(view.actions ?? []).map(subtaskAction).join("")}</span>`;
}
export function subtaskIntroduction(view: MwSubtaskConversationView): string {
  return `<h3>${escapeHtml(view.title)}</h3>${view.summary ? `<p>${escapeHtml(view.summary)}</p>` : ""}`
    + `<span class="mw-subtask__state">${renderStateRing({ state: view.status.state, label: view.status.label })}<span>${escapeHtml(view.status.label)}</span></span>`;
}
export function subtaskMessage(message: MwSubtaskMessage): string {
  return `${message.name ? `<div class="mw-subtask__who">${escapeHtml(message.name)}</div>` : ""}<div class="mw-subtask__words" translate="no">${message.html}</div>`
    + `${message.receipt ? `<p class="mw-subtask__receipt">${escapeHtml(message.receipt)}</p>` : ""}`;
}
export function subtaskDetails(view: MwSubtaskConversationView): string {
  return (view.details ?? []).map(detail => `<details class="mw-subtask__detail" data-subtask-detail="${escapeHtml(detail.id)}"${detail.expanded ? " open" : ""}>`
    + `<summary>${escapeHtml(detail.title)}</summary><div class="mw-subtask__detail-body" translate="no">${detail.html}</div>`
    + `${detail.actions?.length ? `<div class="mw-subtask__answers">${detail.actions.map(subtaskAction).join("")}</div>` : ""}</details>`).join("");
}
export function subtaskChildren(view: MwSubtaskConversationView, labels: MwSubtaskConversationLabels): string {
  if (!view.children?.length) return "";
  return `<p>${escapeHtml(labels.children)}</p>${view.children.map(child => `<div class="mw-subtask__child">${renderButton({ label: child.title, variant: "ghost", size: "sm", icon: "chevron-right",
    attrs: { "data-subtask-open": child.target, title: child.title, ...(child.unread ? { "aria-description": labels.unread } : {}) } })}${child.unread ? renderStateRing({ state: "unread", label: labels.unread }) : ""}</div>`).join("")}`;
}

/** The inside of the existing task float. The caller owns the float and its position; no main conversation is touched. */
export function renderSubtaskConversation(options: { readonly labels: MwSubtaskConversationLabels; readonly view?: MwSubtaskConversationView; readonly composerHtml?: string }): string {
  const { labels, view } = options;
  return `<section class="mw-subtask" aria-label="${escapeHtml(view?.title ?? labels.messages)}">`
    + `<header class="mw-subtask__head" data-subtask-head>${subtaskHeader(view, labels)}</header>`
    + `<div class="mw-subtask__context" data-subtask-context>${view ? subtaskContext(view) : ""}</div>`
    + `<div class="mw-subtask__feedback" data-subtask-feedback role="status"></div>`
    + `<div class="mw-subtask__thread" data-subtask-thread tabindex="0" role="region" aria-label="${escapeHtml(labels.messages)}">`
    + `<div class="mw-subtask__intro" data-subtask-intro>${view ? subtaskIntroduction(view) : `<p>${escapeHtml(labels.loading)}</p>`}</div>`
    + `<div class="mw-subtask__messages" data-subtask-messages>${view?.messages.map(message => `<article class="mw-subtask__message" data-subtask-message="${escapeHtml(message.id)}" data-role="${message.role}">${subtaskMessage(message)}</article>`).join("") ?? ""}</div>`
    + `<div data-subtask-details>${view ? subtaskDetails(view) : ""}</div><div class="mw-subtask__children" data-subtask-children>${view ? subtaskChildren(view, labels) : ""}</div></div>`
    + `<div class="mw-subtask__latest" data-subtask-latest hidden>${renderButton({ label: labels.latest, variant: "ghost", size: "sm", icon: "chevron-down", attrs: { "data-subtask-follow": true } })}</div>`
    + `<div class="mw-subtask__composer" data-subtask-composer>${options.composerHtml ?? ""}</div></section>`;
}
