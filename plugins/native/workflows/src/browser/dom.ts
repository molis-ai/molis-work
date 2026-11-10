import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import { escapeHtml as esc } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { WorkflowLinkKind } from "../model.js";

const uiText = globalThis.t;

export const ico = (name: string) => `<svg aria-hidden="true"><use href="#icon-${esc(name)}"></use></svg>`;

export const kindName = (kind: WorkflowLinkKind) =>
  kind === "judgment" ? uiText.text("workflows.kind.judgment") : kind === "function" ? uiText.text("workflows.kind.function") : kind === "manual" ? uiText.text("workflows.kind.manual") : "AI";
export const kindHelp = (kind: WorkflowLinkKind) =>
  kind === "judgment" ? uiText.text("workflows.kind.judgment-help") : kind === "function" ? uiText.text("workflows.kind.function-help") : kind === "manual" ? uiText.text("workflows.kind.manual-help") : uiText.text("workflows.kind.ai-help");

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "") ? "⌘" : "Ctrl";

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
export const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  return uiText.text("common.generated.formatted", { value: dateArg(iso, date.toDateString() === new Date().toDateString() ? "time" : "month-day") });
};

export const required = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Workflows page: ${selector} is missing`);
  return node;
};

/** A copy that shares nothing with the original (the page edits plain data only). */
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const statusOf = (error: unknown) => (error as { status?: unknown }).status;

/** Motion: nothing moves for a person who asked for less of it. */
export const calm = () => Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
export const EASE_OUT = "cubic-bezier(.16, 1, .3, 1)";
export const EASE_SETTLE = "cubic-bezier(.32, 1.22, .52, 1)";
export const EASE_STANDARD = "cubic-bezier(.32, .72, 0, 1)";
export const motion = (node: Element | null | undefined, frames: Keyframe[], options: KeyframeAnimationOptions) =>
  (!node || !node.animate || calm()) ? null : node.animate(frames, { easing: EASE_OUT, ...options });
export const arrive = (node: HTMLElement | null) => {
  if (!node || calm()) return;
  node.classList.remove("is-arriving"); void node.offsetWidth; node.classList.add("is-arriving");
  node.addEventListener("animationend", () => node.classList.remove("is-arriving"), { once: true });
};
export const settle = (node: Element | null | undefined) => motion(node, [{ opacity: 0, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 160 });

/** The element an event came from (a node of this document), or null for a document, window or text node. */
export const targetOf = (event: Event): Element | null => {
  const target = event.target as Partial<Element> | null;
  return target && typeof target.closest === "function" ? event.target as Element : null;
};
