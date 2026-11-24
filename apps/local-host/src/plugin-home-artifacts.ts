import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { createPluginArtifactOperations, pluginArtifactErrors, type PluginArtifactOperationsInput } from "@molis-ai/molis-work-module-artifacts";
import { assertPluginActionCurrent, currentPluginInvocation, inPluginInstance } from "@molis-ai/molis-work-plugin-runtime";

/** The 成果库 and process items of one open project, as the Host holds them; undefined while that project is not open. */
export type HomeProjectArtifactStores = (projectId: string) => Pick<PluginArtifactOperationsInput, "api" | "process"> | undefined;

/**
 * What a Home instance reads of the 成果 and process items it consumes (44B): those of the project the running action was called for,
 * resolved on each call, so the Home instance holds no project of its own. Only `read` and `listConsumable`, under the same rules as a
 * project instance (the Manifest's `artifacts.consumes` / `process_items.consumes`, `artifact:read`, the caller still current). A Home
 * instance pins nothing into a project: what it produces is its own Home store's. Undefined when the Manifest consumes nothing.
 */
export function homePluginArtifactsFor(manifest: PluginManifest, context: PluginStartContext, stores: HomeProjectArtifactStores | undefined,
  assertActive: () => void): PluginArtifactClient | undefined {
  if (!stores || !manifest.artifacts.consumes.length && !manifest.process_items?.consumes.length) return undefined;
  const forCall = () => {
    assertActive();
    const scope = currentPluginInvocation();
    if (!inPluginInstance(scope, context)) throw new ActionError("actions.forbidden", "项目成果只能在本插件正在执行的动作里读取");
    const projectId = scope!.caller.project_id;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "读取项目成果需要调用方的项目");
    const open = stores(projectId);
    if (!open) throw new ActionError("actions.unavailable", "这个项目还没有打开");
    return createPluginArtifactOperations({ ...open, manifest, project_id: projectId, actor_id: scope!.caller.actor_id, assertInput: assertActionInput,
      authorize: permission => context.requireGrant(permission), assertCallerCurrent: () => assertPluginActionCurrent(context) }).client;
  };
  const refused = (): never => { throw pluginArtifactErrors.plugin_denied("Home 插件只读取调用方项目的成果，不往项目里固定版本"); };
  return Object.freeze<PluginArtifactClient>({ read: reference => forCall().read(reference), listConsumable: filter => forCall().listConsumable(filter),
    publish: refused, head: refused, readOwn: refused });
}
