import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { bindActionClient, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createWorkflowContentPorts, createWorkflowsActionHandlers, openWorkflowsStore, workflowsErrors, workflowsManifest } from "@molis-ai/molis-work-plugin-workflows";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { hostCompleteText, textModelAvailability, type HostCompleteText } from "./host-complete-text.js";

/** Workflows are stored in the Home but belong to one project; each station is reached through that project's action client. */
export function workflowsActionProvider(home: string, projectId: string, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return {
    provider: { provider_id: workflowsManifest.plugin_id, plugin_id: workflowsManifest.plugin_id, title: workflowsManifest.name, kind: "plugin", project_id: projectId },
    definitions: workflowsManifest.actions!,
    handlers: createWorkflowsActionHandlers(projectId, {
      withStore: async run => { const store = openWorkflowsStore(home); try { return await run(store); } finally { store.close(); } },
      content: caller => createWorkflowContentPorts(bindActionClient(actions, () => caller)),
      actions: caller => ({ discover: async () => actions.discover(caller), invoke: (reference, input) => actions.invoke(caller, reference, input) }),
      assertInput: assertActionInput,
      textModel: () => textModelAvailability(model, "还没有可用的文字模型"),
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model();
        // The model can go away between `textModel()` and this call: the same refusal the link's readiness gives, 400 with its message.
        if (!complete) throw workflowsErrors.not_ready("这一段还没接上：还没有可用的文字模型");
        return complete(resolveModelPrompt(home, prompt, "io.molis.work.native.workflows"), options);
      }),
    }),
  };
}
