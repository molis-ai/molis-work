import { requiredQuery } from "@molis-ai/molis-work-plugin-sdk/browser";

/** An element the server drew; the page cannot work without it. */
export const required = requiredQuery(selector => `Issue page is missing ${selector}`);

export { isAbort, statusOf, codeOf } from "@molis-ai/molis-work-plugin-sdk/browser";
