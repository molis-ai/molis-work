import type { PagesBody } from "./contract.js";

/** The body of a new, empty document. Kept apart from `document.ts`, which raises errors: the editor's browser bundle imports this one. */
export const EMPTY_PAGES_BODY: PagesBody = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
