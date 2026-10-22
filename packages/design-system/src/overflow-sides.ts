/** Overflow fade (specs/visual-ui-experience §overflow-fade, VUX-27): the rule and the samples, shared by the stylesheet
 * (`styles/overflow-fade.ts`) and the sensor (`browser/overflow-fade.ts`).
 *
 * A horizontal scroller that hides its scrollbar (tab strips, chip rows, step rows) marks itself `data-overflow-fade`.
 * The sensor sets `data-more` to the inline sides that really have more (`start`, `end` or `both`) and removes it when
 * nothing overflows; the stylesheet then masks only those sides, over 28px with the eight alpha samples below. It is a
 * mask on the scroller, not a colour band over the page, so it works on every surface. Touching an edge clears that side;
 * a focused item scrolls clear of the feather; forced colours drop the mask and show the scrollbar instead.
 */

export const OVERFLOW_FADE_WIDTH = 28;
/** Alpha across the feather, from the edge (0) inward (1). Eight real samples, not a named number of steps. */
export const OVERFLOW_FADE_SAMPLES: readonly (readonly [number, number])[] = [[0, 0], [.15, .05], [.3, .15], [.45, .3], [.6, .5], [.75, .7], [.87, .85], [1, 1]];

/** Which inline sides have more, from the distance scrolled from the start and the scrollable range (CSS px, 1px rounding). */
export function overflowSides(scrolled: number, range: number) {
  if (range <= 1) return "";
  return scrolled <= 1 ? "end" : scrolled >= range - 1 ? "start" : "both";
}
