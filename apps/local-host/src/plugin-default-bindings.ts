import { portTypeKey } from "@molis-ai/molis-work-contracts/platform/plugin-wiring";
import type { PluginPlatform } from "./plugin-platform.js";

/**
 * Bind what the running plugins' Manifests declare as defaults (BL-087, W4-03): each input port's `default_source` and each
 * plugin's default input group. Only where nothing was previously chosen: a port that already reads another plugin's output or a
 * fixed 成果 version the person gave it keeps what it reads (installing a default would also drop that fixed version), and a
 * plugin whose group was selected keeps it. A default whose source is not running here, has no such output, or offers another
 * type is left unbound, as the person would find it.
 *
 * For now a default applies only between plugins that ship with the Host (`shipsWithHost`), as the table it replaces did: an
 * installed or generated plugin that names Coding's changesets or Shelf's material as its default would otherwise receive them
 * with nobody choosing to give them. Its declaration is read as if it were absent, its default group as well. Installed plugins may
 * not declare defaults (用户 2026-10-16 定：暂只在随宿主发的插件之间；装插件时的同意流程有了再议).
 */
export function bindDeclaredDefaults(platform: PluginPlatform, projectId: string, actorId: string): void {
  const running = platform.wiring.view().plugins;
  for (const target of running) {
    if (!platform.shipsWithHost(target.plugin_id)) continue;
    const manifest = platform.supervisor.manifest(target.plugin_id);
    for (const input of manifest?.ports?.inputs ?? []) {
      const source = input.default_source;
      if (!source || !platform.shipsWithHost(source.plugin_id)) continue;
      const output = platform.supervisor.manifest(source.plugin_id)?.ports?.outputs.find(port => port.port === source.port);
      if (!output || portTypeKey(output.artifact_type_id, output.schema_version) !== portTypeKey(input.artifact_type_id, input.schema_version)) continue;
      const current = target.ports.find(port => port.port === input.port);
      if (current?.source || current?.artifact) continue;
      platform.wiring.bind({ project_id: projectId, actor_id: actorId, target_plugin_id: target.plugin_id, target_port: input.port,
        source_plugin_id: source.plugin_id, source_port: source.port, origin: "default" });
    }
    const group = manifest?.ports?.input_groups?.find(candidate => candidate.default === true);
    if (group && platform.wiring.selectedGroup(target.plugin_id) === undefined) platform.wiring.selectInputGroup(target.plugin_id, group.group_id);
  }
  platform.wiring.evaluateAll();
}
