import { FLOATING_MARGIN, pickSide, pinAt, placeFloating } from "./floating.js";

/**
 * The placement as source text, for the page programs that are strings (the toolbar next to a selection): the same functions the Pages
 * editor imports, so there is one way to place a layer. Kept out of `floating.ts` so a bundle that takes that leaf does not also take this
 * text. `placeFloating` closes over `pick` and the margin, so they come along under the names it uses.
 */
export const FLOATING_CLIENT_SOURCE = [`const MARGIN = ${FLOATING_MARGIN};`, pickSide, placeFloating, pinAt]
  .map(part => (typeof part === "string" ? part : part.toString().replace(/^[ \t]+/gm, ""))).join("\n");
