import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createTodoActionHandlers, openTodoStore, todoManifest } from "@molis-ai/molis-work-plugin-todo";

/** One Home provider: personal todos have no project, and opening a project must not create a second store or registry. */
export function todoActionProvider(home: string): ActionProviderRegistration {
  return {
    provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: todoManifest.name, kind: "plugin" },
    definitions: todoManifest.actions!,
    handlers: createTodoActionHandlers({
      withStore: run => { const store = openTodoStore(home); try { return run(store); } finally { store.close(); } },
    }),
  };
}
