import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { createPluginArtifactOperations, pluginArtifactErrors, type PluginArtifactOperationsInput } from "@molis-ai/molis-work-module-artifacts";
import { assertPluginActionCurrent, currentPluginInvocation, inPluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import type { CopyOutTypes } from "./artifact-type-registry.js";

/** The 成果库 and process items of one open project, as the Host holds them; undefined while that project is not open. */
export type HomeProjectArtifactStores = (projectId: string) => Pick<PluginArtifactOperationsInput, "api" | "process"> | undefined;

/**
 * What a Home instance reads of the 成果 and process items it consumes (44B): those of the project the running action was called for,
 * resolved on each call, so the Home instance holds no project of its own. Only `read` and `listConsumable`, under the same rules as a
 * project instance (the Manifest's `artifacts.consumes` / `process_items.consumes`, `artifact:read`, the caller still current). A Home
 * instance pins nothing into a project: what it produces is its own Home store's. Undefined when the Manifest consumes nothing.
 * A platform part that takes text out of projects (`copyOut`, Shelf) consumes, on each call, the types their producers mark `copy_out`,
 * and sees a version only when its own producer marked the type (another producer of the same process item type did not consent).
 */
export function homePluginArtifactsFor(declared: PluginManifest, context: PluginStartContext, stores: HomeProjectArtifactStores | undefined,
  assertActive: () => void, copyOut?: () => CopyOutTypes): PluginArtifactClient | undefined {
  if (!stores || !copyOut && !declared.artifacts.consumes.length && !declared.process_items?.consumes.length) return undefined;
  const forCall = () => {
    assertActive();
    const scope = currentPluginInvocation();
    if (!inPluginInstance(scope, context)) throw new ActionError("actions.forbidden", "项目成果只能在本插件正在执行的动作里读取");
    const projectId = scope!.caller.project_id;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "读取项目成果需要调用方的项目");
    const open = stores(projectId);
    if (!open) throw new ActionError("actions.unavailable", "这个项目还没有打开");
    const copy = copyOut?.();
    const manifest: PluginManifest = copy ? { ...declared, artifacts: { ...declared.artifacts, consumes: copy.artifacts },
      process_items: { produces: declared.process_items?.produces ?? [], consumes: copy.process_items } } : declared;
    const client = createPluginArtifactOperations({ ...open, manifest, project_id: projectId, actor_id: scope!.caller.actor_id, assertInput: assertActionInput,
      authorize: permission => context.requireGrant(permission), assertCallerCurrent: () => assertPluginActionCurrent(context) }).client;
    return { client, allows: copy ? copy.allows : () => true };
  };
  const refused = (): never => { throw pluginArtifactErrors.plugin_denied("Home 插件只读取调用方项目的成果，不往项目里固定版本"); };
  return Object.freeze<PluginArtifactClient>({
    // A version its producer did not mark reads as absent, as one of another project would.
    read: reference => {
      const { client, allows } = forCall(), record = client.read(reference);
      return record && allows(record) ? record : null;
    },
    listConsumable: filter => {
      const { client, allows } = forCall();
      return client.listConsumable(filter).filter(allows);
    },
    publish: refused, head: refused, readOwn: refused });
}
