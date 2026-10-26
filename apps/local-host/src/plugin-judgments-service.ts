import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  PLUGIN_JUDGMENTS_READ_PERMISSION, PLUGIN_JUDGMENTS_WRITE_PERMISSION, pluginErrors,
  type PluginInstanceRecord, type PluginJudgmentInput, type PluginJudgmentsClient, type PluginManifest, type PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { publishedFunctionKey } from "@molis-ai/molis-work-module-functions";
import { withFunctionsService } from "./functions-host.js";
import { gateFor } from "./plugin-attention-service.js";

/** What the Host gives `services.judgments` of one installation: the Home whose Functions library holds the ledger, the project, and the questions every call asks. */
export interface PluginJudgmentsServicePorts {
  readonly home_directory: string;
  readonly project_id: string;
  readonly assertActive: () => void;
  readonly record: () => PluginInstanceRecord | null;
}

const declared = (manifest: PluginManifest, permission: string) => manifest.permissions.some(entry => entry.permission === permission);

/**
 * `services.judgments` (PG-032 P2, S-90): the judgment ledger of the consumption scenes this plugin's Manifest declares, for this project.
 * Reading needs `judgments:read`; recording needs `judgments:write` and a writable call (the gate `services.attention` writes through: a
 * concurrent action that declares the permission, a kept job, or a callback of the plugin's own scene that declares it once its
 * `beforeEffect` returned), and asks the original caller again right before the row is written, so a cancelled, revoked or stopped call
 * records nothing, not even a failure. The scene must be one the Manifest declares (`plugin.scene_not_declared`), the subject must be of
 * this project and of a kind the scene declares, and the function key is made from the function the plugin names, never passed.
 * The ledger is the Home's Functions library: a row commits there by itself and is not part of the plugin's project transaction.
 */
export function pluginJudgmentsFor(manifest: PluginManifest, context: PluginStartContext, ports: PluginJudgmentsServicePorts): PluginJudgmentsClient | undefined {
  const scenes = manifest.action_scenes ?? [];
  if (scenes.length === 0 || !declared(manifest, PLUGIN_JUDGMENTS_READ_PERMISSION) && !declared(manifest, PLUGIN_JUDGMENTS_WRITE_PERMISSION)) return undefined;
  const gate = gateFor(context, ports.project_id, ports.assertActive, ports.record);
  const kindsOf = (sceneId: string): ReadonlySet<string> => {
    const own = scenes.filter(scene => scene.scene_id === sceneId);
    if (own.length === 0) throw pluginErrors.scene_not_declared(`场景 ${sceneId} 不是这个插件在 Manifest 里声明的`);
    return new Set(own.flatMap(scene => scene.subject_kinds));
  };
  const ledger = <T>(run: Parameters<typeof withFunctionsService<T>>[1]): T => withFunctionsService(ports.home_directory, run);
  return Object.freeze<PluginJudgmentsClient>({
    latest: sceneId => {
      gate.read(PLUGIN_JUDGMENTS_READ_PERMISSION); kindsOf(sceneId);
      return ledger(service => service.latestSceneJudgments(ports.project_id, sceneId));
    },
    record: (input: PluginJudgmentInput) => {
      gate.write(PLUGIN_JUDGMENTS_WRITE_PERMISSION);
      if (!kindsOf(input.scene_id).has(input.subject.kind)) throw new ActionError("actions.forbidden", "场景没有声明这种对象");
      if (input.subject.project_id !== ports.project_id) throw new ActionError("actions.scope_mismatch", "判断的对象不属于这个项目");
      return ledger(service => service.recordSceneJudgment({
        function_key: publishedFunctionKey(input.function) ?? input.function.capability_id, function_version: input.function.version,
        subject: input.subject, scene_id: input.scene_id, scene_provenance: input.scene_provenance,
        outcome: input.outcome, suggested_behavior_ids: input.suggested_behavior_ids, error_code: input.error_code,
      }));
    },
  });
}
