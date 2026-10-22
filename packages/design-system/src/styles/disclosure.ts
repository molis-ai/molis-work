/** Disclosure height (specs/visual-ui-experience §disclosure-segmented, VUX-22). A collapsible opens to its natural height:
 * the details content is a one-row grid that goes 0fr → 1fr and clips, its body is the row (min-height 0, clipped) with its
 * bottom space fixed inside it, so only the row moves (no padding is animated), no max-height is guessed, a body that grows while open just grows, and a reversal midway
 * continues from the height it reached. The chevron turns on the same `[open]`. Closed, the body is skipped and cannot take
 * focus. Without `::details-content` (older engines) it opens at once, as before. Another disclosure whose details hold one
 * body opens the same way through `disclosureHeight(details, body)`. */
export const disclosureHeight = (details: string, body: string) => `${details}::details-content{display:grid;grid-template-rows:0fr;overflow:clip;transition:grid-template-rows var(--motion-normal) var(--ease-quint),content-visibility var(--motion-normal) allow-discrete}${details}[open]::details-content{grid-template-rows:1fr}${body}{min-height:0;overflow:clip}@media (prefers-reduced-motion:reduce){${details}::details-content,${details}>*{transition:none}}`;
/** The other folds with the shared chevron hold several children, so the one-row grid does not fit them. Where the engine
 * can animate to `auto` (`interpolate-size`), their content opens to its natural height on the same clock as the chevron
 * instead of snapping open under a turning chevron; elsewhere it opens at once, as before. */
const CHEVRON_FOLDS = ":is(.mw-disclosure,.form-disclosure:not(.mw-collapsible),.record-templates,.form-export-panel,.characters-location,.feed-task-extra,.artifact-raw,.coding-checkpoints)";
const naturalFold = `@supports (interpolate-size:allow-keywords){${CHEVRON_FOLDS}{interpolate-size:allow-keywords}${CHEVRON_FOLDS}::details-content{block-size:0;overflow:clip;transition:block-size var(--motion-normal) var(--ease-quint),content-visibility var(--motion-normal) allow-discrete}${CHEVRON_FOLDS}[open]::details-content{block-size:auto}@media (prefers-reduced-motion:reduce){${CHEVRON_FOLDS}::details-content{transition:none}}}`;
export const DISCLOSURE_STYLES = `${disclosureHeight(".mw-collapsible", ".mw-collapsible>.mw-collapsible__body")}.mw-collapsible>.mw-collapsible__body{padding:0 0 12px}${naturalFold}`;
