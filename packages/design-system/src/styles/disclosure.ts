import { disclosureHeight } from "@molis-ai/molis-work-plugin-sdk/ui";

/** The other folds with the shared chevron hold several children, so the one-row grid does not fit them. Where the engine
 * can animate to `auto` (`interpolate-size`), their content opens to its natural height on the same clock as the chevron
 * instead of snapping open under a turning chevron; elsewhere it opens at once, as before. */
const CHEVRON_FOLDS = ":is(.mw-disclosure,.form-disclosure:not(.mw-collapsible),.record-templates,.form-export-panel,.characters-location,.feed-task-extra,.artifact-raw,.coding-checkpoints)";
const naturalFold = `@supports (interpolate-size:allow-keywords){${CHEVRON_FOLDS}{interpolate-size:allow-keywords}${CHEVRON_FOLDS}::details-content{block-size:0;overflow:clip;transition:block-size var(--dur-move) var(--ease-quint),content-visibility var(--dur-move) allow-discrete}${CHEVRON_FOLDS}[open]::details-content{block-size:auto}@media (prefers-reduced-motion:reduce){${CHEVRON_FOLDS}::details-content{transition:none}}}`;
export const DISCLOSURE_STYLES = `${disclosureHeight(".mw-collapsible", ".mw-collapsible>.mw-collapsible__body")}.mw-collapsible>.mw-collapsible__body{padding:0 0 12px}${naturalFold}`;
