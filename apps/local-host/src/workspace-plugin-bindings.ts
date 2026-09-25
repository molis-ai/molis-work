import type { PluginPlatform } from "./plugin-platform.js";

/** Install declared defaults only where no source was previously chosen. */
export function bindWorkspaceCompanions(platform: PluginPlatform, boardId: string, actorId: string): void {
  const prefix = "io.molis.work.";
  for (const [target, targetPort, source, sourcePort] of [
    ["coding", "materials", "shelf", "material"],
    ["shelf", "coding-report", "coding", "report"],
    ["shelf", "coding-changeset", "coding", "changeset"],
    ["coding", "before", "files", "before"],
    ["coding", "after", "files", "after"],
    ["coding", "selection", "files", "selection"],
    ["coding", "git-changeset", "git", "changeset"],
    ["coding", "git-result", "git", "result"],
    ["diff", "git-changeset", "git", "changeset"],
    ["diff", "changeset", "coding", "changeset"],
    ["diff", "before", "files", "before"],
    ["diff", "after", "files", "after"],
    ["text-stats", "text", "files", "before"],
  ] as const) {
    const targetId = prefix + target;
    const sourceId = prefix + source;
    const targetManifest = platform.supervisor.manifest(targetId);
    const sourceManifest = platform.supervisor.manifest(sourceId);
    if (!targetManifest?.ports?.inputs.some(port => port.port === targetPort)
      || !sourceManifest?.ports?.outputs.some(port => port.port === sourcePort)) continue;
    if (platform.wiring.view().plugins.find(plugin => plugin.plugin_id === targetId)?.ports.find(port => port.port === targetPort)?.source) continue;
    platform.wiring.bind({ board_id: boardId, actor_id: actorId, target_plugin_id: targetId, target_port: targetPort,
      source_plugin_id: sourceId, source_port: sourcePort, origin: "default" });
  }
  const diffId = prefix + "diff";
  if (platform.supervisor.manifest(diffId)?.ports?.input_groups?.some(group => group.group_id === "snapshots")
    && platform.wiring.selectedGroup(diffId) === undefined) platform.wiring.selectInputGroup(diffId, "snapshots");
  platform.wiring.evaluateAll();
}
