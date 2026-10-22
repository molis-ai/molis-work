/** No scrollbar is drawn anywhere: every region still scrolls by wheel, touch, keys and focus, and the shared
 * edge fade (`data-overflow-fade`) says where more is. Under forced colours the system's own scrollbars come back,
 * because there the fade is dropped and the bar is the only cue. This is the only place a page sets
 * `scrollbar-width` or styles `::-webkit-scrollbar`; `tests/scrollbars-hidden.test.ts` keeps it that way. */
export const HIDDEN_SCROLLBAR_STYLES = "@media not (forced-colors:active){*{scrollbar-width:none}*::-webkit-scrollbar{display:none;width:0;height:0}}";
