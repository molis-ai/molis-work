import { renderButton } from "../ui/button.js";
import { escapeHtml } from "../ui/html.js";
import type { MwSubtaskConversationView } from "../ui/subtask-conversation.js";
import { subtaskActions } from "./subtask-actions.js";
import { subtaskComposer } from "./subtask-composer.js";
import type { SubtaskConversationHandle, SubtaskConversationOptions, SubtaskConversationRead } from "./subtask-contract.js";
import { patch, subtaskDom } from "./subtask-dom.js";
import { subtaskReader } from "./subtask-read.js";

/** Mount the shared conversation inside the caller's existing task float. No main-input or shell DOM is consulted. */
export function createSubtaskConversation(root: HTMLElement, options: SubtaskConversationOptions): SubtaskConversationHandle {
  const dom = subtaskDom(root, () => options.labels);
  let target: string | undefined, view: MwSubtaskConversationView | undefined, readFailed = false, dead = false;
  let backFocus: { parent: string; child: string; from: HTMLElement } | undefined;
  const changed = (key: string) => { if (target === key && !dead) { paint(); void reader.refresh(); } };
  const composer = subtaskComposer(dom.composer, options.source, changed);
  const actions = subtaskActions(options.source, changed, composer.reload);
  const reader = subtaskReader(options.source, accept, () => { readFailed = true; paint(); });
  function feedback(message: string, control?: "retry" | "check", label?: string) {
    const html = escapeHtml(message) + (control ? ` ${renderButton({ label: label ?? options.labels[control], variant: "link", attrs: { [`data-subtask-${control}`]: true } })}` : "");
    patch(dom.find("feedback"), html);
  }
  function paint() {
    if (!target) return;
    const labels = options.labels;
    if (!view) { feedback(readFailed ? labels.readFailed : labels.loading, readFailed ? "retry" : undefined); return; }
    actions.observe(view, composer.local(view));
    const operation = actions.get(view.target);
    const hold = operation?.state === "working" ? labels.working : operation?.state === "unknown" ? operation.recovered?.message ?? labels.unknown : undefined;
    const blocked = (action: NonNullable<MwSubtaskConversationView["actions"]>[number]) => hold ? { ...action, disabled: action.disabled ?? hold } : action;
    dom.draw({ ...view, actions: view.actions?.map(blocked), details: view.details?.map(detail => ({ ...detail, actions: detail.actions?.map(blocked) })) });
    dom.composer.hidden = false;
    if (!composer.show(view, view.inputUnavailable ?? hold ?? null)) { dom.composer.hidden = true; feedback(labels.readFailed, "retry"); return; }
    if (operation?.state === "working") feedback(labels.working);
    else if (operation?.state === "unknown") feedback(operation.recovered?.message ?? labels.unknown, "check", operation.recovered?.check.label);
    else if (readFailed) feedback(labels.readFailed, "retry");
    else feedback(operation?.state === "failed" ? operation.reason ?? labels.actionFailed : "");
  }
  function accept(result: SubtaskConversationRead) {
    readFailed = false;
    if (result.state === "denied") {
      if (target) actions.forget(target);
      view = undefined; composer.close(); dom.composer.replaceChildren(); dom.composer.hidden = true;
      dom.forget(); dom.idle(); feedback(result.reason, "retry");
    } else { view = result.view; paint(); }
  }
  function close() { reader.stop(); composer.close(); dom.hide(); target = undefined; }
  async function open(next: string) {
    if (dead) return;
    const returning = backFocus?.parent === next ? backFocus : undefined;
    reader.stop(); composer.close();
    if (view?.target !== next) view = undefined;
    target = next; readFailed = false; dom.show(next); dom.composer.hidden = !view;
    if (!view) dom.idle(); paint();
    const opening = reader.open(next), life = reader.signal(); await opening;
    const active = root.ownerDocument.activeElement;
    if (returning && life === reader.signal() && !root.hidden && (active === returning.from || active === root.ownerDocument.body)) {
      const entry = Array.from(dom.find("children").querySelectorAll<HTMLElement>("button")).find(button => button.dataset.subtaskOpen === returning.child);
      (entry ?? dom.find("head").querySelector<HTMLElement>("button"))?.focus();
    }
  }
  async function clicked(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button || !root.contains(button) || button.disabled || button.closest(".mw-subtask__words, .mw-subtask__detail-body")) return;
    const startedHere = root.ownerDocument.activeElement === button;
    const enter = () => {
      if (startedHere && !root.hidden && root.ownerDocument.activeElement === root.ownerDocument.body) dom.find("head").querySelector<HTMLElement>("button")?.focus();
    };
    if (button.hasAttribute("data-subtask-back")) {
      const parent = view?.parent, child = target; close();
      if (startedHere && parent && child) backFocus = { parent: parent.target, child, from: button };
      try { options.onBack(parent); } finally { backFocus = undefined; }
    }
    else if (button.hasAttribute("data-subtask-close")) { close(); options.onClose(); }
    else if (button.hasAttribute("data-subtask-follow")) dom.latest();
    else if (button.hasAttribute("data-subtask-retry")) await reader.refresh();
    else if (view) {
      const child = view.children?.find(item => item.target === button.dataset.subtaskOpen);
      if (child && button.closest("[data-subtask-children]")) { await open(child.target); if (target === child.target) enter(); return; }
      const action = button.hasAttribute("data-subtask-check") ? undefined
        : [...(view.actions ?? []), ...(view.details ?? []).flatMap(detail => detail.actions ?? [])].find(item => item.id === button.dataset.subtaskAction && item.ref === button.dataset.subtaskActionRef);
      if (!action && !button.hasAttribute("data-subtask-check")) return;
      if (!button.closest("[data-subtask-context], .mw-subtask__answers, [data-subtask-feedback]")) return;
      const original = view, focused = root.ownerDocument.activeElement;
      await actions.run(original, action, reader.signal()!);
      if (target === original.target && focused === button && !button.isConnected && root.ownerDocument.activeElement === root.ownerDocument.body) {
        (dom.find("context").querySelector<HTMLElement>("button:not(:disabled)") ?? dom.find("head").querySelector<HTMLElement>("button"))?.focus();
      }
    }
  }
  const listener = (event: MouseEvent) => { void clicked(event).catch(() => { readFailed = true; paint(); }); };
  root.addEventListener("click", listener); root.hidden = true;
  return { open, close, refresh: () => reader.refresh(), destroy() { if (dead) return; close(); dead = true; actions.destroy(); composer.destroy(); root.removeEventListener("click", listener); dom.destroy(); } };
}
