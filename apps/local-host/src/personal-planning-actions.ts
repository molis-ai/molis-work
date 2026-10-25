import { randomUUID } from "node:crypto";
import { bindActionClient, type ActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/** Only bound after the local HTTP channel has passed origin/control-token checks. */
export function bindPersonalPlanningWebActions(client: ActionClient) {
  return bindActionClient(client, () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: null, audience: "user",
    permissions: ["goals:read", "goals:write"], user_action: { source: "web", conversation_ref: "web:personal-planning", message_ref: `web:${randomUUID()}` } }));
}
