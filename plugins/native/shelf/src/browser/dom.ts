import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

export const escText = escapeHtml;
export const escapeAttr = escapeHtml;

export function bufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

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
