/** Drop zones (specs/visual-ui-experience §composer-mentions, VUX-18): what `browser/drop-zone.ts` takes. */
/** Shows or hides a zone's "drop here" state; zones that share one are one place. */
export type DropMark = (on: boolean) => void;
/** What a drag carries that a browser lets a page read while it is still over the page: its types, and each item's kind
 * (`file` or `string`) and MIME type. File names and contents stay hidden until the drop. */
export type DropItem = { readonly kind: string; readonly type: string };
export type DropAccepts = (types: readonly string[], items: readonly DropItem[]) => boolean;
declare global {
  /** `window.molisDropZone(zone, mark, accepts, reason)`: `mark(true)` while a drag `accepts` takes (files, unless said) is over the
   * zone (an element, or a selector for zones drawn again). A zone given a `reason` (its words, already translated) also says "not
   * this" while a drag it does not take, and that came from outside the page, is over it. */
  interface Window { molisDropZone?: (zone: Element | string, mark: DropMark, accepts?: DropAccepts, reason?: string) => void }
}
