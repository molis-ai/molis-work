/** Intrinsic sizing (specs/visual-ui-experience §composer-mentions, VUX-16): the rule shared by the stylesheet and the
 * fallback in `browser/field-fit.ts`.
 *
 * A text field that grows with what is written marks itself `data-fit`. Its height is `min(max(content, min), max)`: it
 * starts at its own min-height, grows line by line, falls back when lines are deleted, and past its max it scrolls inside
 * with the caret kept in view. The max is `--fit-max` (240px unless the field says) and never more than 40% of the frame it
 * sits in, so a narrow split or a short window is not eaten by the field. `field-sizing: content` does it where the engine
 * has it; elsewhere the fallback measures `scrollHeight` after putting the height down to its min, so the field also shrinks.
 * It starts at two lines and its padding (16px unless the field says), the multi-line sample's start. Styles have zero
 * specificity: a field's own min-height, padding or a smaller max set by its page wins.
 */
export const FIELD_FIT_MAX = 240;
/** The share of the frame's height a field may take at most. */
export const FIELD_FIT_ROOM = 0.4;

/** The field's height from its content height and its bounds (CSS px). */
export function fieldHeight(content: number, min: number, max: number) {
  return Math.min(Math.max(content, min), Math.max(min, max));
}

/** No grip on a field that sizes itself (over `.mw-textarea`'s), unless its page asks for one with a rule of its own. The
 * numbers are FIELD_FIT_MAX and FIELD_FIT_ROOM written out, so the fallback's bundle can leave the string behind. */
export const FIELD_FIT_STYLES = `textarea[data-fit]{resize:none}:where(textarea[data-fit]){field-sizing:content;overflow-y:auto;min-height:calc(2lh + 16px);max-height:min(var(--fit-max,240px),40vh)}`;
