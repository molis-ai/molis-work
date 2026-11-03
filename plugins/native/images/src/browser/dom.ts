import type { Failure } from "./types.js";

/** An element the server drew; the page cannot work without it. */
export function required<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Images page is missing ${selector}`);
  return node;
}

export function text<K extends keyof HTMLElementTagNameMap>(tag: K, value: unknown, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = String(value || "");
  if (className) node.className = className;
  return node;
}

export function button(label: string, attr: string, value: string, variant = "ghost"): HTMLButtonElement {
  const node = text("button", label, `mw-btn mw-btn--${variant}`);
  node.type = "button";
  node.setAttribute(attr, value || "");
  return node;
}

/** A write to this device's storage that cannot be kept still leaves the page working. */
export function remembered(write: () => void): void {
  try { write(); } catch { return; }
}

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
export const statusOf = (error: unknown): number | undefined => (error as Failure | null)?.status;

export function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString(document.documentElement.lang || undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The first `max` characters of `value`, for names and titles a person reads. One character can be two UTF-16 units (an emoji, say); a cut by
 * units can end between them, and encodeURIComponent on a name that ends on half of one throws. */
export const firstCharacters = (value: string, max: number): string => [...value].slice(0, max).join("");
