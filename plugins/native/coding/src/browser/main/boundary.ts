import type { createCodingCodePaint } from "../../code-paint-client.js";
import type { createCodingTurnChanges } from "../../turn-changes-client.js";

/**
 * Code painting and the turn-changes row are written to be injected as text (`toString()`, which the browser tests still do),
 * so they are typed by the few fields they touch, not by the DOM. These are the one place the page's real nodes meet those types.
 */
export type PaintElement = Parameters<ReturnType<typeof createCodingCodePaint>["paintInto"]>[0];
type ChangesNode = Parameters<ReturnType<typeof createCodingTurnChanges>["place"]>[0];

export const paintable = (node: HTMLElement): PaintElement => node;

export const changesBlock = (node: HTMLElement): ChangesNode => node as ChangesNode;

/** The row the turn-changes script made: a real element, as it makes it with `document.createElement`. */
export function changesRow(node: ChangesNode): HTMLElement {
  if (!(node instanceof HTMLElement)) throw new Error("The turn changes row is not an element");
  return node;
}
