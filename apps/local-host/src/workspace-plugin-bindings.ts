import type { PluginPlatform } from "./plugin-platform.js";

/**
 * Install declared defaults only where nothing was previously chosen: a port that already reads another plugin's output or a
 * fixed 成果 version the person gave it keeps what it reads (installing a default would also drop that fixed version).
 */
export function bindWorkspaceCompanions(platform: PluginPlatform, projectId: string, actorId: string): void {
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
    const current = platform.wiring.view().plugins.find(plugin => plugin.plugin_id === targetId)?.ports.find(port => port.port === targetPort);
    if (current?.source || current?.artifact) continue;
    platform.wiring.bind({ project_id: projectId, actor_id: actorId, target_plugin_id: targetId, target_port: targetPort,
      source_plugin_id: sourceId, source_port: sourcePort, origin: "default" });
  }
  const diffId = prefix + "diff";
  if (platform.supervisor.manifest(diffId)?.ports?.input_groups?.some(group => group.group_id === "snapshots")
    && platform.wiring.selectedGroup(diffId) === undefined) platform.wiring.selectInputGroup(diffId, "snapshots");
  platform.wiring.evaluateAll();
}
