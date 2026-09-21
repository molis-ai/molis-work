import type { PluginPlatform } from "./plugin-platform.js";

/** Install declared defaults only where no source was previously chosen. */
export function bindWorkspaceCompanions(platform: PluginPlatform, boardId: string, actorId: string): void {
  const prefix = "io.molis.work.";
  for (const [target, targetPort, source, sourcePort] of [
    ["files", "workspace", "workspace", "workspace"],
    ["coding", "materials", "shelf", "material"],
    ["coding", "before", "files", "before"],
    ["coding", "after", "files", "after"],
    ["coding", "selection", "files", "selection"],
    ["coding", "git-changeset", "git", "changeset"],
    ["coding", "git-result", "git", "result"],
    ["git", "workspace", "workspace", "workspace"],
    ["diff", "git_changeset", "git", "changeset"],
    ["diff", "changeset", "coding", "changeset"],
    ["diff", "before", "files", "before"],
    ["diff", "after", "files", "after"],
    ["text-stats", "text", "files", "before"],
  ] as const) {
    const targetId = prefix + target;
    if (platform.wiring.view().plugins.find(plugin => plugin.plugin_id === targetId)?.ports.find(port => port.port === targetPort)?.source) continue;
    platform.wiring.bind({ board_id: boardId, actor_id: actorId, target_plugin_id: targetId, target_port: targetPort,
      source_plugin_id: prefix + source, source_port: sourcePort, origin: "default" });
  }
  if (platform.wiring.selectedGroup(prefix + "diff") === undefined) platform.wiring.selectInputGroup(prefix + "diff", "snapshots");
  platform.wiring.evaluateAll();
}
