/** Disclosure height (specs/visual-ui-experience §disclosure-segmented, VUX-22). A collapsible opens to its natural height:
 * the details content is a one-row grid that goes 0fr → 1fr, its body is the row (min-height 0, clipped) and the body's
 * bottom space travels with it, so no max-height is guessed, a body that grows while open just grows, and a reversal midway
 * continues from the height it reached. The chevron turns on the same `[open]`. Closed, the body is skipped and cannot take
 * focus. Without `::details-content` (older engines) it opens at once, as before. */
export const DISCLOSURE_STYLES = `.mw-collapsible::details-content{display:grid;grid-template-rows:0fr;transition:grid-template-rows var(--motion-normal) var(--ease-quint),content-visibility var(--motion-normal) allow-discrete}.mw-collapsible[open]::details-content{grid-template-rows:1fr}.mw-collapsible>.mw-collapsible__body{min-height:0;overflow:clip;padding:0;transition:padding-bottom var(--motion-normal) var(--ease-quint)}.mw-collapsible[open]>.mw-collapsible__body{padding-bottom:12px}@media (prefers-reduced-motion:reduce){.mw-collapsible::details-content,.mw-collapsible>*{transition:none}}`;
