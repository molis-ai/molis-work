import { GOALS_DIALOGS_CLIENT_FACTORY_SCRIPT, GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT } from "./dialogs-client.js";
import { GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT } from "./document-client.js";
import { GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT } from "./event-document-client.js";
import { GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT } from "./momentum-client.js";
import { GOALS_NAVIGATION_CLIENT_FACTORY_SCRIPT } from "./navigation-client.js";
import { GOALS_PANELS_CLIENT_FACTORY_SCRIPT } from "./panels-client.js";
import { GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT } from "./proposal-client.js";
import { GOALS_REFRESH_CLIENT_FACTORY_SCRIPT } from "./refresh-client.js";
import { GOALS_RELATION_CLIENT_FACTORY_SCRIPT } from "./relation-client.js";
import { GOALS_TREE_CLIENT_FACTORY_SCRIPT } from "./tree-client.js";

/**
 * The factories the Goals page the shell draws calls, by name (PG-060, T-115). Goals has no frame: the shell's page script
 * takes each from this plugin's registration (`workbench.pageClients`) and hands it the page's ports. The names carry the
 * plugin's name, so a page script that reads one names it whole.
 */
export const GOALS_PAGE_CLIENTS = {
  goalsDialogs: GOALS_DIALOGS_CLIENT_FACTORY_SCRIPT,
  goalsLifecycle: GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT,
  goalsDocument: GOALS_DOCUMENT_CLIENT_FACTORY_SCRIPT,
  goalsEventDocument: GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT,
  goalsMomentum: GOALS_MOMENTUM_CLIENT_FACTORY_SCRIPT,
  goalsNavigation: GOALS_NAVIGATION_CLIENT_FACTORY_SCRIPT,
  goalsPanels: GOALS_PANELS_CLIENT_FACTORY_SCRIPT,
  goalsProposal: GOALS_PROPOSAL_CLIENT_FACTORY_SCRIPT,
  goalsRefresh: GOALS_REFRESH_CLIENT_FACTORY_SCRIPT,
  goalsRelation: GOALS_RELATION_CLIENT_FACTORY_SCRIPT,
  goalsTree: GOALS_TREE_CLIENT_FACTORY_SCRIPT,
} as const;
