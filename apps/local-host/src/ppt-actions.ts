import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { ActionError, bindActionClient, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { pptManifest, createPptActionHandlers, createPptContentHandlers, openPptStore, type PptStore } from "@molis-ai/molis-work-plugin-ppt";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";
import { registerPptArtifactVersion, readPptArtifactVersion, pptArtifactLineHead } from "./creative-artifacts.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

export function pptActionProvider(home: string, runtime: MolisWorkProjectRuntime, completion?: HostCompleteText | null, actions?: ActionClient): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  const withStore = <T>(run: (store: PptStore) => T): T => { const store = openPptStore(home); try { return run(store); } finally { store.close(); } };
  return {
    provider: { provider_id: pptManifest.plugin_id, plugin_id: pptManifest.plugin_id, title: pptManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: pptManifest.actions!,
    handlers: [...createPptActionHandlers({
      withStore,
      publishArtifact: (input, caller) => registerPptArtifactVersion(runtime.coordinator, runtime.project_id, runtime.project_id, caller.actor_id)(input),
      readArtifact: input => readPptArtifactVersion(runtime.coordinator, runtime.project_id, runtime.project_id)(input),
      lineHead: input => pptArtifactLineHead(runtime.coordinator, runtime.project_id, runtime.project_id)(input),
      modelAvailability: () => {
        try { return model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" }; }
        catch { return { available: false, code: "actions.connection_required", reason: "文字模型配置无效，请检查服务连接" }; }
      },
      // Pages documents come through Pages' own content actions with the caller's authority; PPT never opens Pages' store.
      ...(actions ? {
        listPages: async caller => (await bindActionClient(actions, () => caller).invoke(pagesContentActions.list, {}))
          .map(item => ({ id: item.item_id, title: item.title, updated_at: item.at })),
        readPage: async (pageId, caller) => {
          const page = await bindActionClient(actions, () => caller).invoke(pagesContentActions.read, { item_id: pageId });
          return { title: page.title, body: page.body };
        },
      } : {}),
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model(); if (!complete) throw new ActionError("actions.connection_required", "请先配置可用的文字模型");
        return complete(resolveModelPrompt(home, prompt, "io.molis.work.ppt"), options);
      }),
    }), ...createPptContentHandlers(withStore)],
  };
}
