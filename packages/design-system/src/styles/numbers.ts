/** Live numbers (specs/visual-ui-experience VUX-42–VUX-45): a counter, elapsed time or position that changes while it is read
 * is `<span class="mw-num" data-num-ghost="<widest value of its range>">value</span>`: fixed-width digits, and the widest
 * value laid out once more under it with no height and no visibility. The box is as wide as the wider of the two in whichever
 * font is in effect, so 9 → 10, 59 秒 → 1 分 0 秒 or a font that loads or switches mid-count never moves the controls beside it,
 * and no script measures anything. The ghost is not text: copying, reading aloud and `textContent` see only the value. Past
 * the ghost's range the box grows once per extra digit; nothing is cut or shrunk. `[data-align=end]` right-aligns. */
export const NUMBER_STYLES = `.mw-num{display:inline-flex;flex-direction:column;font-variant-numeric:tabular-nums;white-space:nowrap}.mw-num[data-align=end]{align-items:flex-end}.mw-num::after{content:attr(data-num-ghost);height:0;overflow:hidden;visibility:hidden}`;
