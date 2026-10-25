import { references, type DemoState } from "./model.ts";
import { appendDraft, edit, editWhen, setDraft } from "./state.ts";
import { adoptSteps, setInteraction, stepLive, type RecommendationState } from "./recommendation.ts";
import { atEnd, find } from "./dom.ts";
import type { InteractionClient, InteractionClientHost } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { createInteractionClient } from "../../packages/design-system/src/interaction-client.ts";

type TextField = "notes" | "minutes" | "date";
const textFields = new Set<string>(["notes", "minutes", "date"]);
type Change = Parameters<NonNullable<InteractionClientHost["onChange"]>>[0];
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
const picked = (value: Change["value"]): string[] => Array.isArray(value) ? value.map(item => typeof item === "string" ? item : item.value)
  : typeof value === "object" && "picked" in value ? value.picked : [];
/** What the shared questionnaire client reports becomes an edit of the draft; the rules stay in state. */
function applyChange(state: DemoState, { field, part, value }: Change): void {
  if (field === "format") edit(state, "format", picked(value).map(Number));
  else if (field === "topics") edit(state, "topics", picked(value).map(Number));
  else if (field === "when" && (part === "date" || part === "time") && typeof value === "object" && "date" in value) editWhen(state, part, value[part]);
  else if (field === "references") {
    const ids = picked(value), kept = state.values.references.filter(ref => ids.includes(ref.id));
    edit(state, "references", [...kept, ...references.filter(ref => ids.includes(ref.id) && !kept.some(item => item.id === ref.id)).map(ref => ({ ...ref }))]);
  } else if (textFields.has(field) && typeof value === "string") edit(state, field as TextField, value);
}
/** Wires one scene's DOM to its state. Handlers only translate events; the rules live in state, execution and recommendation. */
export function bindScene(context: SceneContext): InteractionClient {
  const { root, state, recommendation, composer, thread, tools, refresh, action, begin, land, openTools, wide } = context;
  root.addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target as HTMLElement;
    if (form.matches("[data-ix-form]")) return;
    if (recommendation.composing) return;
    setDraft(state, composer.value);
    if (appendDraft(state)) { composer.value = ""; refresh(); land(root.querySelector('[data-ix-field="notes"]')); return; }
    if (state.draft.trim() && !["expired", "replaced", "cancelled"].includes(state.question)) state.notice = "这是演示：新消息不会发给模型。可以用对话里的卡片或输入框旁的下一步继续。";
    refresh();
  });
  const client = createInteractionClient(root, {
    onChange: change => { applyChange(state, change); refresh(); },
    onAction: id => action(id),
    // The demo's search: fixed sample materials by name, as `search.references` would offer real ones.
    references: (_source, query) => Promise.resolve({ items: references.filter(ref => ref.label.includes(query))
      .map(ref => ({ value: ref.id, label: ref.label, meta: `${ref.kind === "goal" ? "Goal" : "文档"} · 示例候选` })) }),
    onSubmit: begin,
    onStep: index => {
      const shown = recommendation.shown[index];
      if (!shown || !stepLive(recommendation, shown)) return;
      action(shown.action);
      adoptSteps(recommendation);
      refresh();
    },
  });
  // The demo's own buttons (`data-action`) are not part of the questionnaire.
  root.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>("button[data-action]");
    if (button && !button.disabled) action(button.dataset.action!);
  });
  root.addEventListener("input", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    if (!input.hasAttribute("data-composer")) return;
    setDraft(state, input.value);
    refresh();
  });
  composer.addEventListener("keydown", event => {
    const key = event as KeyboardEvent;
    if (composer instanceof HTMLTextAreaElement && key.key === "Enter" && !key.shiftKey && !key.isComposing && !recommendation.composing) {
      event.preventDefault();
      composer.form?.requestSubmit();
    }
  });
  composer.addEventListener("focus", () => { if (root.dataset.panel === "closed") { root.dataset.panel = "open"; refresh(); } });
  const row = find(root, "[data-composer-row]");
  const interaction = (kind: "focused" | "hovered" | "composing", value: boolean) => { setInteraction(recommendation, kind, value); refresh(); };
  row.addEventListener("focusin", () => interaction("focused", true));
  row.addEventListener("focusout", () => queueMicrotask(() => interaction("focused", row.contains(document.activeElement))));
  row.addEventListener("mouseenter", () => interaction("hovered", true));
  row.addEventListener("mouseleave", () => interaction("hovered", false));
  root.addEventListener("compositionstart", () => interaction("composing", true));
  root.addEventListener("compositionend", event => {
    // The questionnaire's own fields report at the end of a composition through the client; the composer keeps its words here.
    const input = event.target;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) { if (input.hasAttribute("data-composer")) setDraft(state, input.value); }
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
  return client;
}
