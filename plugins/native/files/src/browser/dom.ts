import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Translate } from "./types.js";

export const required = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Files page: ${selector} is missing`);
  return node;
};

/** Words the Host or an action wrote (a refusal, a reason): the Host's dictionary translates them. */
export const said = (_readText: Translate, text: string) => uiText.text(text);
