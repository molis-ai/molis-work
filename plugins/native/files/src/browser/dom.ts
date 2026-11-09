import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { Translate } from "./types.js";

export const required = requiredQuery(selector => `Files page: ${selector} is missing`);

/** Words the Host or an action wrote (a refusal, a reason): the Host's dictionary translates them. */
export const said = (L: Translate, text: string) => L(text);
