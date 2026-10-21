/** Neighbours making room and closing up (specs/visual-ui-experience §drag-split FLIP, VUX-16, VUX-18): what `browser/reflow.ts` takes. */
declare global {
  /** `window.molisReflow(list, change)`: runs `change` (which adds, removes or redraws the list's children in place) and eases
   * the children that stayed from where they were seen to where they now are; a new child grows in. */
  interface Window { molisReflow?: (list: Element, change: () => void) => void }
}
export {};
