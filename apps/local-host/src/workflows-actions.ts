import { bindActionClient, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createWorkflowContentPorts, createWorkflowsActionHandlers, openWorkflowsStore, workflowsManifest } from "@molis-ai/molis-work-plugin-workflows";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";

/** Workflows are stored in the Home but belong to one project; each station is reached through that project's action client. */
export function workflowsActionProvider(home: string, projectId: string, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => {
    if (completion !== undefined) return completion ?? undefined;
    try { return hostCompleteText({ homeDirectory: home }); } catch { return undefined; }
  };
  return {
    provider: { provider_id: workflowsManifest.plugin_id, plugin_id: workflowsManifest.plugin_id, title: workflowsManifest.name, kind: "plugin", project_id: projectId },
    definitions: workflowsManifest.actions!,
    handlers: createWorkflowsActionHandlers(projectId, {
      withStore: async run => { const store = openWorkflowsStore(home); try { return await run(store); } finally { store.close(); } },
      content: caller => createWorkflowContentPorts(bindActionClient(actions, () => caller)),
      aiAvailable: () => Boolean(model()),
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model();
        if (!complete) throw new Error("还没有可用的文字模型");
        return complete(prompt, options);
      }),
    }),
  };
}
