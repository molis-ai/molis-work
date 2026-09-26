import { SUPPORTED_RUNTIME_IDS } from "./installer/runtime-integration-contract.js";
import { createWorkActionHandlers, workManifest } from "@molis-ai/molis-work-plugin-work";
import { ActionError, resolveActionSubject, type ActionProviderRegistration, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SessionRuntimeService } from "./session-runtime-resources.js";

export function workActionProvider(projectId: string, sessions: SessionRuntimeService, client: ActionClient): ActionProviderRegistration {
  return { provider: { provider_id: workManifest.plugin_id, plugin_id: workManifest.plugin_id, title: workManifest.name, kind: "plugin", project_id: projectId },
    definitions: workManifest.actions!, handlers: createWorkActionHandlers(projectId, async () => ({ ...await sessions.resources(), supportedRuntimeIds: SUPPORTED_RUNTIME_IDS }), async (caller, action) => {
      await caller.validate_authority?.({ ...action, provider_id: workManifest.plugin_id });
      const current = (await client.discover(caller)).find(view => view.capability_id === action.capability_id && view.version === action.version && view.provider.provider_id === workManifest.plugin_id);
      if (!current) throw new ActionError("actions.missing", "Session 能力已不可访问");
      if (!current.availability.available) throw new ActionError(current.availability.code, current.availability.reason);
    }, async (subject, caller) => (await resolveActionSubject(client, caller, subject)).context),
    availability: () => sessions.configured ? { available: true } : { available: false, code: "actions.service_unavailable", reason: "Session 服务未配置或已关闭" },
  };
}
