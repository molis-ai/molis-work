import type { Translate } from "./types.js";
import type { WorkflowLinkKind } from "../model.js";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]!);
export const ico = (name: string) => `<svg aria-hidden="true"><use href="#icon-${esc(name)}"></use></svg>`;

/** Words the Host or another plugin wrote (a plugin's name, a reason, what an action returned), or one of our own keys carried in a reason: the Host's dictionary translates them. */
export const said = (L: Translate, text: string) => L(text);

export const kindName = (L: Translate, kind: WorkflowLinkKind) =>
  kind === "judgment" ? L("workflows.kind.judgment") : kind === "function" ? L("workflows.kind.function") : kind === "manual" ? L("workflows.kind.manual") : "AI";
export const kindHelp = (L: Translate, kind: WorkflowLinkKind) =>
  kind === "judgment" ? L("workflows.kind.judgment-help") : kind === "function" ? L("workflows.kind.function-help") : kind === "manual" ? L("workflows.kind.manual-help") : L("workflows.kind.ai-help");

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "") ? "⌘" : "Ctrl";

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
export const when = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso), lang = document.documentElement.lang || undefined;
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(lang, { month: "short", day: "numeric" });
};

export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Workflows page: ${selector} is missing`);
  return node;
}

/** A copy that shares nothing with the original (the page edits plain data only). */
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);
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
