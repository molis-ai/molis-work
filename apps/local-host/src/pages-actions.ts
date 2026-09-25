import { migrateLegacyPagesProject } from "./pages-legacy-project.js";
import { ActionError, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesManifest, createPagesActionHandlers, createPagesContentHandlers, openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";
import { registerPagesArtifactVersion, readPagesArtifactVersion } from "./pages-artifact.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

export function pagesActionProvider(home: string, runtime: MolisWorkProjectRuntime, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  const withStore = <T>(run: (store: ReturnType<typeof openPagesStore>) => T): T => {
    const store = openPagesStore(home);
    try { migrateLegacyPagesProject(home, runtime, store); return run(store); } finally { store.close(); }
  };
  return {
    availability: () => {
      try { withStore(() => undefined); return { available: true }; }
      catch (error) { return { available: false, code: error instanceof Error && "code" in error ? String(error.code) : "pages.unavailable", reason: error instanceof Error ? error.message : "文稿存储不可用" }; }
    },
    provider: { provider_id: pagesManifest.plugin_id, plugin_id: pagesManifest.plugin_id, title: pagesManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: pagesManifest.actions!,
    handlers: [...createPagesActionHandlers({
      withStore,
      publishArtifact: (input, caller) => registerPagesArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
      readArtifact: (input, caller) => readPagesArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
      modelAvailability: () => {
        try { return model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型，再使用写作助手" }; }
        catch { return { available: false, code: "actions.connection_required", reason: "文字模型配置无效，请检查服务连接" }; }
      },
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model();
        if (!complete) throw new ActionError("actions.connection_required", "请先配置文字模型，再使用写作助手");
        return complete(prompt, options);
      }),
    }), ...createPagesContentHandlers(actions)],
  };
}
