import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";
/** An element the server drew; the page cannot work without it. */
export const required = requiredQuery(selector => `Dataset page is missing ${selector}`);

export { textCell } from "@molis-ai/molis-work-plugin-sdk/browser";
