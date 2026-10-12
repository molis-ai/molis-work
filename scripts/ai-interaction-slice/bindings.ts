import { references, timeLimits, type DemoState } from "./model.ts";
import { appendDraft, edit, editWhen, finishComposition, setDraft } from "./state.ts";
import { adoptSteps, setInteraction, stepLive, type RecommendationState } from "./recommendation.ts";
import { atEnd, find } from "./dom.ts";
import { mountCalendars } from "./calendar.ts";

type TextField = "notes" | "minutes" | "date";
const textFields = new Set<string>(["notes", "minutes", "date"]);
/** What a scene's event handlers need from its controller. */
export interface SceneContext {
  root: HTMLElement;
  state: DemoState;
  recommendation: RecommendationState;
  composer: HTMLInputElement | HTMLTextAreaElement;
  thread: HTMLElement;
  tools: HTMLElement | null;
  refresh(): void;
  action(name: string): void;
  begin(): void;
  land(element: Element | null): void;
  openTools(open: boolean, focus?: boolean): void;
  wide(): boolean;
}
/** Wires one scene's DOM to its state. Handlers only translate events; the rules live in state, execution and recommendation. */
export function bindScene(context: SceneContext): void {
  const { root, state, recommendation, composer, thread, tools, refresh, action, begin, land, openTools, wide } = context;
  root.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target as HTMLElement;
    if (form.matches("[data-question-form]")) { begin(); return; }
    if (recommendation.composing) return;
    setDraft(state, composer.value);
    if (appendDraft(state)) { composer.value = ""; refresh(); land(root.querySelector('[data-field="notes"]')); return; }
    if (state.draft.trim() && !["expired", "replaced", "cancelled"].includes(state.question)) state.notice = "这是演示：新消息不会发给模型。可以用对话里的卡片或输入框旁的下一步继续。";
    refresh();
  });
  root.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    const step = button.closest<HTMLButtonElement>("[data-step-index]");
    if (step) {
      const shown = recommendation.shown[Number(step.dataset.stepIndex)];
      if (!shown || !stepLive(recommendation, shown)) return;
      action(shown.action);
      adoptSteps(recommendation);
      refresh();
      return;
    }
    if (button.dataset.action) { action(button.dataset.action); return; }
    if (button.dataset.minutesStep) {
      const current = Number(state.values.minutes);
      if (Number.isInteger(current)) edit(state, "minutes", String(Math.min(timeLimits.maxMinutes, Math.max(timeLimits.minMinutes, current + Number(button.dataset.minutesStep)))));
      else find(root, '[data-value="minutes"]').focus();
    }
    const name = button.dataset.choice;
    if (name === "format" || name === "topics") {
      const index = Number(button.dataset.index);
      edit(state, name, name === "format" ? [index] : state.values.topics.includes(index) ? state.values.topics.filter(value => value !== index) : [...state.values.topics, index]);
    }
    if (button.dataset.reference !== undefined) {
      const ref = references[Number(button.dataset.reference)];
      if (ref) edit(state, "references", state.values.references.some(value => value.id === ref.id) ? state.values.references.filter(value => value.id !== ref.id) : [...state.values.references, { ...ref }]);
    }
    refresh();
  });
  root.addEventListener("input", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    if (input.hasAttribute("data-composer")) setDraft(state, input.value);
    else if (input.dataset.whenPart === "date" || input.dataset.whenPart === "time") editWhen(state, input.dataset.whenPart, input.value);
    else if (input.dataset.value && textFields.has(input.dataset.value)) edit(state, input.dataset.value as TextField, input.value);
    refresh();
  });
  // In the questionnaire, Enter moves on instead of answering early; ⌘/Ctrl+Enter answers (DESIGN.md Dialogs).
  find(root, "[data-question-form]").addEventListener("keydown", event => {
    const key = event as KeyboardEvent;
    if (key.key !== "Enter" || key.isComposing || recommendation.composing) return;
    if (key.metaKey || key.ctrlKey) { event.preventDefault(); begin(); return; }
    if (!(key.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    const order = [...root.querySelectorAll<HTMLElement>("[data-question-form] [data-focus-target], [data-question-form] [data-when-part=time]")];
    order[order.indexOf(key.target) + 1]?.focus();
  });
  composer.addEventListener("keydown", event => {
    const key = event as KeyboardEvent;
    if (composer instanceof HTMLTextAreaElement && key.key === "Enter" && !key.shiftKey && !key.isComposing && !recommendation.composing) {
      event.preventDefault();
      composer.form?.requestSubmit();
    }
  });
  composer.addEventListener("focus", () => { if (root.dataset.panel === "closed") { root.dataset.panel = "open"; refresh(); } });
  mountCalendars(root, input => input.dispatchEvent(new Event("input", { bubbles: true })));
  const row = find(root, "[data-composer-row]");
  const interaction = (kind: "focused" | "hovered" | "composing", value: boolean) => { setInteraction(recommendation, kind, value); refresh(); };
  row.addEventListener("focusin", () => interaction("focused", true));
  row.addEventListener("focusout", () => queueMicrotask(() => interaction("focused", row.contains(document.activeElement))));
  row.addEventListener("mouseenter", () => interaction("hovered", true));
  row.addEventListener("mouseleave", () => interaction("hovered", false));
  root.addEventListener("compositionstart", () => interaction("composing", true));
  root.addEventListener("compositionend", event => {
    const input = event.target;
    // Keep the final composition text even if the question expired while the person was still composing.
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      if (input.hasAttribute("data-composer")) setDraft(state, input.value);
      else if (input.dataset.whenPart === "date" || input.dataset.whenPart === "time") editWhen(state, input.dataset.whenPart, input.value);
      else if (input.dataset.value && textFields.has(input.dataset.value)) finishComposition(state, input.dataset.value as TextField, input.value);
    }
    interaction("composing", false);
  });
  root.addEventListener("focusout", () => queueMicrotask(refresh));
  root.addEventListener("keydown", event => {
    if (event.key === "Escape" && tools?.dataset.tools === "open" && !wide() && find(root, "[data-tools-panel]").contains(document.activeElement)) openTools(false);
  });
  thread.addEventListener("scroll", () => { if (atEnd(thread)) find(root, "[data-jump]").hidden = true; }, { passive: true });
  find(root, "[data-jump]").addEventListener("click", () => {
    thread.scrollTo({ top: thread.scrollHeight });
    find(root, "[data-jump]").hidden = true;
  });
}
