import type { IncomingMessage } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { entryUserAction, webEntryMessage } from "./entry-user-action.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/**
 * Only bound after the local HTTP channel has passed origin/control-token checks. The person's Home-level calls: what they may do is
 * solved per request from the Manifests and installation grants, and where the act came from is this entry's to say (`entryUserAction`).
 */
export function bindPersonalPlanningWebActions(host: MolisWorkLocalHost, request: IncomingMessage): BoundActionClient {
  const message = webEntryMessage(request);
  return bindLocalWebActions(host, undefined, LOCAL_OWNER_PERMISSIONS, () => entryUserAction("web", "personal-planning", message));
}
