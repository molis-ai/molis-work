import type { Translate } from "./types.js";

export const escText = (value: unknown): string => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export const escapeAttr = (value: unknown): string => escText(value).replaceAll('"', "&quot;");

export function bufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

/** Words the Host or this plugin's routes wrote (a recipe's name, a reason, a refusal) go through the translator here, and only here. */
export const said = (L: Translate, text: string): string => L(text);

export const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** The nearest element of the event's target that matches `selector`. */
export const closest = (event: Event, selector: string): HTMLElement | null => {
  const node = event.target as Element | null;
  return node?.closest?.(selector) as HTMLElement | null ?? null;
};

export function setText(root: ParentNode, selector: string, value: string): void {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

export const fileName = (path: string): string => path.split("/").pop() ?? path;
