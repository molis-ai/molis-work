/** Show More (specs/visual-ui-experience §assistant-information, VUX-08): what `browser/show-more.ts` takes, and its rule. */
export type ShowMoreOptions = {
  /** Names the list for the page's life: revealed once, it stays revealed when drawn again under this key. */
  key: string;
  /** The button's words, with `{n}` for how many are tucked away (「再显示 {n} 项」). */
  label: string;
  /** How many items stay in sight; 5 unless said. */
  limit?: number;
  /** Items matching this selector (a failure) are never tucked away. */
  keep?: string;
};
declare global {
  /** `window.molisShowMore(list, options)`: keeps a long list's first items in sight and the rest behind one button. */
  interface Window { molisShowMore?: (list: HTMLElement, options: ShowMoreOptions) => void }
}

/** The button sits under the list at its own width, not stretched across it. */
export const SHOW_MORE_STYLES = `.mw-show-more{align-self:flex-start;justify-self:start}[data-mw-tucked]{display:none!important}`;
