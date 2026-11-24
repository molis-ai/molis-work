import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalActionGatewayClient } from "./action-gateway.js";
import { continuityActionsFrom, memberClientId } from "@molis-ai/molis-work-server";
import type { ActionFactory } from "@molis-ai/molis-work-server";
import { shippedParts } from "./plugin-registry.js";

/** Continuity actions discovered from registered plugins implementing `WORK_PROGRESS_CONTINUITY_PROTOCOL`, plus base platform actions. */
export function hostContinuityActions(): readonly ActionReference[] {
  return continuityActionsFrom(shippedParts().map(entry => ({
    plugin_id: entry.manifest.plugin_id,
    actions: entry.manifest.actions,
  })));
}

/** No model runtime: dispatches only to the already-running local Action Host. */
export function gatewayFactory(options: { url: string; homeDirectory: string; allowedActions?: readonly ActionReference[] }): ActionFactory {
  const allowedActions = options.allowedActions ?? hostContinuityActions();
  return ({ projectId, memberId, validate, signal }) => {
    const clientId = memberClientId(memberId);
    return { client: new LocalActionGatewayClient({ ...options, clientId, projectId }), caller: { actor_id: clientId, project_id: projectId, audience: "mcp",
      permissions: [], allowed_actions: allowedActions, validate_authority: validate, signal } };
  };
}
