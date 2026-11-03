import { GOALS_DOCUMENT_STYLES } from "./document-styles.js";
import { GOALS_EVENT_DOCUMENT_STYLES } from "./event-document-styles.js";
import { GOALS_DECISION_COMMON_STYLES, GOALS_DECISION_MOBILE_STYLES, GOALS_PROPOSAL_MOBILE_STYLES, GOALS_PROPOSAL_STYLES } from "./proposal-styles.js";
import { TRASH_GOAL_STYLES } from "./trash-document-styles.js";

/**
 * Goals' rules for the pages the shell draws (PG-060, T-115). Goals has no frame, so the shared workbench sheet carries this
 * whole sheet from the plugin's registration (`workbench.stylesheet`), beneath the shell's own layers, which restyle the Goal
 * document and its canvas (`stylesheetLayer: "beneath-shell"`). The order inside is the order these rules always had.
 */
export const GOALS_WORKBENCH_STYLESHEET = `${GOALS_DECISION_COMMON_STYLES}${GOALS_PROPOSAL_STYLES}${GOALS_EVENT_DOCUMENT_STYLES}`
  + `@media (max-width:760px){${GOALS_DECISION_MOBILE_STYLES}\n${GOALS_PROPOSAL_MOBILE_STYLES}}${GOALS_DOCUMENT_STYLES}${TRASH_GOAL_STYLES}`;
