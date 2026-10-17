import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { connectorAuthorizationInitiator, connectorAuthorizationStatus, pendingConnectorAuthorizationsForSession } from "../connector-authorization-status.js";
import { connectorManagementActions } from "../connector-management-actions.js";
import type { StoredWork } from "./assistant-store.js";

/** Current owner facts for this work; historical tool replies cannot describe a later intent hold. */
export function assistantSetupMaterial(home: string, work: StoredWork, offered: readonly ActionView[], previousWaitWithdrawn: boolean): AgentTextMaterial | undefined {
  const action = connectorManagementActions.authorization;
  if (!work.session_id || !offered.some(view => view.capability_id === action.capability_id && view.version === action.version
    && view.provider.provider_id === "system.connectors" && view.availability.available)) return undefined;
  const requests = pendingConnectorAuthorizationsForSession(home, work.session_id, work.actor_id).flatMap(({ id }) => {
    const initiator = connectorAuthorizationInitiator(home, id);
    if (initiator?.project_id !== (work.project_ref?.project_id ?? null)) return [];
    const status = connectorAuthorizationStatus(home, id);
    if (!status || !["prepared", "pending"].includes(status.status)) return [];
    return [{ authorization_id: id, display_name: status.setup?.display_name, status: status.status,
      intent_revision: status.intent_revision, commit_held: status.commit_held === true, completion_ready: status.completion_ready === true }];
  });
  if (!requests.length) return undefined;
  return { material_id: "connector-setups", source_artifact_id: work.work_id, source_version: work.revision,
    title: "本会话未完成的服务接入（当前状态）", text: JSON.stringify({ previous_wait_withdrawn: previousWaitWithdrawn, requests }) };
}
