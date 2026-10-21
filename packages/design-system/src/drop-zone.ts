/** Drop zones (specs/visual-ui-experience §composer-mentions, VUX-18): what `browser/drop-zone.ts` takes. */
/** Shows or hides a zone's "drop here" state; zones that share one are one place. */
export type DropMark = (on: boolean) => void;
declare global {
  /** `window.molisDropZone(zone, mark, accepts)`: `mark(true)` while a drag `accepts` takes (files, unless said) is over the zone
   * (an element, or a selector for zones drawn again). */
  interface Window { molisDropZone?: (zone: Element | string, mark: DropMark, accepts?: (types: readonly string[]) => boolean) => void }
}
