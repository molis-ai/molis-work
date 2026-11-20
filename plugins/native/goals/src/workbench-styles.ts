import { GOAL_CANVAS_STYLES } from "./canvas-styles.js";
import { GOALS_DOCUMENT_STYLES } from "./document-styles.js";
import { GOALS_EVENT_DOCUMENT_STYLES } from "./event-document-styles.js";
import { GOALS_MOMENTUM_STYLES } from "./momentum-styles.js";
import { GOALS_DECISION_COMMON_STYLES, GOALS_DECISION_MOBILE_STYLES, GOALS_PROPOSAL_MOBILE_STYLES, GOALS_PROPOSAL_STYLES } from "./proposal-styles.js";
import { GOALS_BASE_STYLES, GOALS_OVERLAY_STYLES } from "./shell-styles.js";
import { TRASH_GOAL_STYLES } from "./trash-document-styles.js";

/**
 * Goals' complete stylesheet (PEQ-08, PG-070): base rules, documents, proposals, momentum, canvas, and workbench overrides
 * all travel with the Goals plugin package and split into `/assets/molis-work-plugins/goals.css` for projects that enable Goals.
 */
export const GOALS_WORKBENCH_STYLESHEET = `${GOALS_BASE_STYLES}${GOALS_DECISION_COMMON_STYLES}${GOALS_PROPOSAL_STYLES}${GOALS_EVENT_DOCUMENT_STYLES}`
  + `@media (max-width:760px){${GOALS_DECISION_MOBILE_STYLES}\n${GOALS_PROPOSAL_MOBILE_STYLES}}${GOALS_DOCUMENT_STYLES}${TRASH_GOAL_STYLES}${GOALS_MOMENTUM_STYLES}${GOAL_CANVAS_STYLES}${GOALS_OVERLAY_STYLES}`;
