export { STYLES } from "./styles/base.js";
export { PROJECT_RULES_CLIENT_SCRIPT, PROJECT_RULES_SETTINGS_STYLES } from "@molis-ai/molis-work-plugin-goals";
export { MORE_STYLES } from "./styles/workbench.js";
export { RESPONSIVE_STYLES } from "./styles/responsive.js";
export { PROJECT_INDEX_STYLES } from "./styles/project-index.js";
export {
  CONTROL_CLIENT_SCRIPT,
  ONBOARDING_CLIENT_SCRIPT,
  PROJECT_INDEX_CLIENT_SCRIPT,
} from "./scripts/control.js";
export {
  PROJECT_GUIDANCE_SETTINGS_STYLES,
  SETTINGS_STYLES,
  SETTINGS_IA_NAV_STYLES,
} from "./styles/settings.js";
export {
  PROJECT_GUIDANCE_CLIENT_SCRIPT,
  SETTINGS_CLIENT_SCRIPT,
} from "./scripts/settings.js";
export { WORK_TAB_VISIBILITY_CLIENT_SCRIPT } from "./scripts/work-tabs.js";

import { CLIENT_BOOTSTRAP_SCRIPT } from "./scripts/client/bootstrap.js";
import { CLIENT_DOCUMENTS_STATE_SCRIPT } from "./scripts/client/documents-state.js";
import { CLIENT_EDITING_GRAPH_SCRIPT } from "./scripts/client/editing-graph.js";
import { CLIENT_EVENTS_ACCESSIBILITY_SCRIPT } from "./scripts/client/events-accessibility.js";
import { CLIENT_EVENTS_PRIMARY_SCRIPT } from "./scripts/client/events-primary.js";
import { CLIENT_EVENTS_SECONDARY_SCRIPT } from "./scripts/client/events-secondary.js";
import { CLIENT_INITIALIZATION_SCRIPT } from "./scripts/client/initialization.js";
import { CLIENT_NAVIGATION_FEED_SCRIPT } from "./scripts/client/navigation-feed.js";
import { CLIENT_NAVIGATION_INBOX_SCRIPT } from "./scripts/client/navigation-inbox.js";
import { CLIENT_REFRESH_DECISIONS_SCRIPT } from "./scripts/client/refresh-decisions.js";

/** Stable concatenation order preserves the existing browser program byte for byte. */
export const CLIENT_SCRIPT = [
  "\n",
  CLIENT_BOOTSTRAP_SCRIPT,
  CLIENT_NAVIGATION_FEED_SCRIPT,
  CLIENT_NAVIGATION_INBOX_SCRIPT,
  CLIENT_EDITING_GRAPH_SCRIPT,
  CLIENT_DOCUMENTS_STATE_SCRIPT,
  CLIENT_REFRESH_DECISIONS_SCRIPT,
  CLIENT_EVENTS_PRIMARY_SCRIPT,
  CLIENT_EVENTS_SECONDARY_SCRIPT,
  CLIENT_EVENTS_ACCESSIBILITY_SCRIPT,
  CLIENT_INITIALIZATION_SCRIPT,
].join("");
