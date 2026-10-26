import { ActionError, requireSynchronous, type ActionExecutionContext, type ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_SCENES_PERMISSION, pluginErrors, type PluginInstanceRecord, type PluginManifest, type PluginSceneClient, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginAction, inPluginInstance, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";

/** What the Host gives `services.scenes` of one installation: the kernel's scene client for the project, and the questions every call asks. */
export interface PluginSceneServicePorts {
  readonly scenes: ActionSceneClient | undefined;
  readonly project_id: string;
  readonly assertActive: () => void;
  readonly record: () => PluginInstanceRecord | null;
}

const sceneKey = (sceneId: string, version: number) => `${sceneId}@${version}`;

/**
 * `services.scenes` (PG-032 P1, S-86): the consumption scenes this plugin's Manifest declares (`action_scenes`), reached from inside its
 * own running action as that action's original caller, with the kernel's checks of the function, the scene, the audience and the
 * permissions as they are for any caller. What this adds on top: the installation's `scenes:use` grant on every call and again
 * after it (a stopped, revoked or replaced installation is refused), the caller the plugin never passes, a scene that is not one of
 * the Manifest's (`plugin.scene_not_declared`, so the scenes of another plugin or of the Host cannot be bound or run, nor do they show up
 * in a list), and `bind` and `runScene` only from an action that may change things; `runScene` waits for a judgment, so only from a
 * concurrent one. Nothing here works outside a running action: not in `start`, a route, a timer or a scene callback.
 */
export function pluginScenesFor(manifest: PluginManifest, context: PluginStartContext, ports: PluginSceneServicePorts): PluginSceneClient | undefined {
  const declared = manifest.action_scenes ?? [];
  if (!ports.scenes || declared.length === 0 || !manifest.permissions.some(item => item.permission === PLUGIN_SCENES_PERMISSION)) return undefined;
  const scenes = ports.scenes, own = new Set(declared.map(scene => sceneKey(scene.scene_id, scene.version))), generation = ports.record()?.installation_generation;
  const holding = () => {
    ports.assertActive(); context.requireGrant(PLUGIN_SCENES_PERMISSION);
    const current = ports.record();
    if (!generation || current?.installation_generation !== generation || current.state !== "running" || !current.grants.includes(PLUGIN_SCENES_PERMISSION)) {
      throw new ActionError("actions.forbidden", "所属安装已停止或撤权");
    }
  };
  const declares = (sceneId: string, version: number) => {
    if (!own.has(sceneKey(sceneId, version))) throw pluginErrors.scene_not_declared(`场景 ${sceneKey(sceneId, version)} 不是这个插件在 Manifest 里声明的`);
  };
  /** The running action of this installation whose caller the call is made for; the grant first, so a revoked grant is said as one. */
  const originOf = () => {
    holding();
    const scope = currentPluginAction();
    if (!scope || !inPluginInstance(scope, context)) throw new ActionError("actions.forbidden", "场景只能由本插件正在执行的动作使用");
    if (scope.caller.project_id !== ports.project_id) throw new ActionError("actions.scope_mismatch", "调用所在的项目与插件实例不一致");
    return scope;
  };
  /** One call as the action's original caller: the grant and the caller's own last check before it and again after it. */
  const call = async <T>(change: "none" | "change" | "wait", run: (caller: ActionExecutionContext) => Promise<T> | T): Promise<T> => {
    const scope = originOf(), original = scope.caller;
    if (change !== "none" && pluginInvocationReadOnly(scope)) throw new ActionError("actions.forbidden", "只读调用不能修改场景");
    if (change === "wait" && scope.definition.action.scheduling !== "concurrent") throw new ActionError("actions.forbidden", "运行场景要等判断结果，只能由并行动作调用");
    const check = () => { holding(); requireSynchronous(original.assert_authority_current?.(), "最终授权检查必须同步完成"); };
    check();
    const result = await run({ ...original, delegated_by: manifest.plugin_id });
    check();
    return result;
  };
  return Object.freeze<PluginSceneClient>({
    discoverScenes: judgment => call("none", async caller => (await scenes.discoverScenes(caller, judgment))
      .filter(view => view.provider.plugin_id === manifest.plugin_id && own.has(sceneKey(view.definition.scene_id, view.definition.version)))),
    usages: judgment => call("none", async caller => (await scenes.usages(caller, judgment)).filter(usage => own.has(sceneKey(usage.scene_id, usage.scene_version)))),
    targets: (judgment, scene) => {
      if (scene) declares(scene.scene_id, scene.scene_version);
      return call("none", async caller => (await scenes.targets(caller, judgment, scene)).filter(target => own.has(sceneKey(target.scene_id, target.scene_version))));
    },
    bind: (binding, options) => {
      declares(binding.scene_id, binding.scene_version);
      return call("change", caller => scenes.bind(caller, binding, options));
    },
    runScene: (scene, bindingId, event) => {
      declares(scene.scene_id, scene.version);
      return call("wait", caller => scenes.runScene(caller, scene, bindingId, event));
    },
  });
}
