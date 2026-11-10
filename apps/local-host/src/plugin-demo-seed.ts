import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginCatalogFor } from "./home-side.js";

/** Classification comes from the Home's project owner, never a request or the plugin. No catalog means no demo authority. */
export async function isRegenerableDemo(home: string | undefined, projectId: string): Promise<boolean> {
  const catalog = home ? pluginCatalogFor(home) : undefined;
  return catalog ? catalog({ homeDirectory: home }, value => value.listProjects().some(project => project.project_id === projectId && project.data_class === "regenerable_demo")) : false;
}

/** Shared by every project platform, independent of publisher, package name and plugin implementation. */
export async function initializeDemoPlugins(input: {
  home?: string; projectId: string; actorId: string; client: ActionClient;
  entries: readonly { manifest: PluginManifest; providerId: string; current(): boolean }[];
  assertCurrent?(): void;
}): Promise<void> {
  if (!await isRegenerableDemo(input.home, input.projectId)) return;
  for (const entry of input.entries) {
    const ref = entry.manifest.demo_seed;
    if (!ref || !entry.current()) continue;
    const definition = entry.manifest.actions?.find(action => action.capability_id === ref.capability_id && action.version === ref.version);
    if (!definition) throw new ActionError("actions.unredeemed", "演示初始化动作未声明");
    const assertCurrent = async () => {
      input.assertCurrent?.();
      if (!entry.current() || !await isRegenerableDemo(input.home, input.projectId)) throw new ActionError("actions.forbidden", "演示项目或插件已经改变");
    };
    await assertCurrent();
    await input.client.invoke({ actor_id: input.actorId, project_id: input.projectId, audience: "workflow", permissions: [...definition.action.permissions],
      validate_authority: assertCurrent, assert_authority_current: () => { input.assertCurrent?.(); if (!entry.current()) throw new ActionError("actions.forbidden", "演示插件已经停止"); } }, { ...ref, provider_id: entry.providerId }, {});
  }
}
