import type { Translate } from "./types.js";

export function required<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Files page: ${selector} is missing`);
  return node;
}

export const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Words the Host or an action wrote (a refusal, a reason): the Host's dictionary translates them. */
export const said = (L: Translate, text: string) => L(text);
