import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pptManifest, createPptActionHandlers, PPT_ACTION_PERMISSIONS, type PptStore, type PptActionPorts } from "@molis-ai/molis-work-plugin-ppt";

export function pptTestPorts(store: PptStore, projectId: string, options: Partial<Omit<PptActionPorts, "withStore">> = {}) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: pptManifest.plugin_id, title: "Ppt", kind: "plugin", project_id: projectId }, definitions: pptManifest.actions!,
    handlers: createPptActionHandlers({ withStore: run => run(store), ...options }) });
  return { projectId, actions: bindActionClient(service, () => ({ actor_id: "test", project_id: projectId, audience: "user", permissions: PPT_ACTION_PERMISSIONS })) };
}
