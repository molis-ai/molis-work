import { clampTo, FLOATING_GAP, FLOATING_MARGIN, pickSide, pinAt, placeStacked } from "@molis-ai/molis-work-plugin-sdk/browser";

/**
 * The placement as source text, for the page programs that are strings (the toolbar next to a selection): the same functions the Pages
 * editor imports, so there is one way to place a layer. Kept out of `floating.ts` so a bundle that takes that leaf does not also take this
 * text. `placeStacked` (above or below, the part a toolbar needs) closes over `pick`, `clampTo`, the margin and the gap, so they come along under the names it uses.
 */
export const FLOATING_CLIENT_SOURCE = [`const MARGIN = ${FLOATING_MARGIN}, GAP = ${FLOATING_GAP};`, pickSide, clampTo, placeStacked, pinAt]
  .map(part => (typeof part === "string" ? part : part.toString().replace(/^[ \t]+/gm, ""))).join("\n");
