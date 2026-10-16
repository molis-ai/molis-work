import { ActionError, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createTodoActionHandlers, openTodoStore, todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { hostCompleteText, textModelAvailability, type HostCompleteText } from "./host-complete-text.js";

/** One Home provider: personal todos have no project, and opening a project must not create a second store or registry. */
export function todoActionProvider(home: string, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return {
    provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: todoManifest.name, kind: "plugin" },
    definitions: todoManifest.actions!,
    handlers: createTodoActionHandlers({
      withStore: run => { const store = openTodoStore(home); try { return run(store); } finally { store.close(); } },
      modelAvailability: () => textModelAvailability(model, "请先配置可用的文字模型"),
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model();
        if (!complete) throw new ActionError("actions.connection_required", "请先配置可用的文字模型");
        return complete(resolveModelPrompt(home, prompt, "io.molis.work.todo"), options);
      }),
    }),
  };
}
