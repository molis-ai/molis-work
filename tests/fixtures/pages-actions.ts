import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesManifest, createPagesActionHandlers, createPagesContentHandlers, PAGES_ACTION_PERMISSIONS,
  type PagesStore, type PagesActionPorts } from "@molis-ai/molis-work-plugin-pages";

/** Isolated plugin tests still execute the production registry, validators and business handlers. */
export function pagesTestPorts(store: PagesStore, projectId: string, options: Pick<PagesActionPorts, "completeText" | "publishArtifact"> = {}) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: pagesManifest.plugin_id, title: "Pages", kind: "plugin", project_id: projectId },
    definitions: pagesManifest.actions!, handlers: [...createPagesActionHandlers({ withStore: run => run(store), ...options,
      modelAvailability: () => options.completeText ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型" },
    }), ...createPagesContentHandlers(service)] });
  return { projectId, actions: bindActionClient(service, () => ({ actor_id: "test", project_id: projectId, audience: "user", permissions: PAGES_ACTION_PERMISSIONS })) };
}
