import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { PluginWiringError, portTypeKey } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ArtifactPluginInput } from "@molis-ai/molis-work-plugin-artifacts";
import type { PluginPlatform } from "./plugin-platform.js";
import { bindWorkspaceCompanions } from "./workspace-plugin-bindings.js";

/** The enabled plugins' input ports that take this version's type, and what each reads now (artifact-positioning, 2026-10-04). */
export function artifactPluginInputs(platform: PluginPlatform | null, artifact: ArtifactVersionRecord): ArtifactPluginInput[] {
  if (!platform) return [];
  const view = platform.wiring.view(), wanted = portTypeKey(artifact.artifact_type_id, artifact.schema_version);
  const title = (pluginId: string) => view.plugins.find(plugin => plugin.plugin_id === pluginId)?.title ?? platform.supervisor.manifest(pluginId)?.name ?? pluginId;
  return view.plugins.flatMap(plugin => plugin.ports.filter(port => portTypeKey(port.artifact_type_id, port.schema_version) === wanted).map(port => ({
    plugin_id: plugin.plugin_id, plugin_title: plugin.title, port: port.port,
    source: port.artifact ? (port.artifact.artifact_id === artifact.artifact_id && port.artifact.version === artifact.version ? "this" as const : "another-version" as const)
      : port.source ? "plugin" as const : "none" as const,
    source_title: port.source ? title(port.source.source_plugin_id) : null,
  })));
}

/**
 * Give one input port this version, or put back its former source: the port is cleared and the Host's default wiring
 * fills it again, as when the plugins were first set up. The consumer is re-evaluated either way.
 */
export function bindArtifactPluginInput(platform: PluginPlatform | null, artifact: ArtifactVersionRecord,
  input: { plugin_id: string; port: string; restore: boolean }, actorId: string, projectId: string): ArtifactPluginInput[] {
  if (!platform) throw new ActionError("artifacts.unavailable", "这里没有运行中的插件，不能改插件的输入");
  if (!artifactPluginInputs(platform, artifact).some(row => row.plugin_id === input.plugin_id && row.port === input.port)) {
    throw new ActionError("actions.invalid_input", "这个插件输入不接收这一版的类型");
  }
  try {
    if (input.restore) {
      platform.wiring.unbind(input.plugin_id, input.port);
      bindWorkspaceCompanions(platform, projectId, actorId);
    } else {
      platform.wiring.bindArtifact({ target_plugin_id: input.plugin_id, target_port: input.port, artifact_id: artifact.artifact_id, version: artifact.version, actor_id: actorId });
      platform.wiring.evaluate(input.plugin_id);
    }
  } catch (error) {
    if (error instanceof PluginWiringError) throw new ActionError("actions.invalid_input", error.message);
    throw error;
  }
  return artifactPluginInputs(platform, artifact);
}
