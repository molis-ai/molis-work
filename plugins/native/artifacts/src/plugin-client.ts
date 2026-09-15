import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginArtifactClient, PluginManifest, PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

export class PluginArtifactAccessError extends Error {
  constructor(
    readonly code: "plugin_artifact_denied" | "plugin_artifact_incompatible",
    message: string,
  ) { super(message); this.name = "PluginArtifactAccessError"; }
}

/** Created by the trusted Host for one installation; authors receive only the returned client. */
export function createPluginArtifactClient(input: {
  api: ArtifactsApplicationApi;
  manifest: PluginManifest;
  context: PluginStartContext;
  board_id: string;
  actor_id: string;
}): PluginArtifactClient {
  const { api, context, board_id, actor_id } = input;
  const manifest = structuredClone(input.manifest);
  if (manifest.plugin_id !== context.plugin_id || manifest.version !== context.version) {
    throw new PluginArtifactAccessError("plugin_artifact_denied", "Host 的 Plugin Manifest 与安装上下文不匹配");
  }
  function requirePermission(permission: string): void {
    if (!manifest.permissions.some(item => item.permission === permission)) {
      throw new PluginArtifactAccessError("plugin_artifact_denied", "Manifest 未声明该 Artifact 权限");
    }
    context.requireGrant(permission);
  }
  return {
    publish(value) {
      requirePermission("artifact:write");
      if (!manifest.artifacts.produces.some(type => type.artifact_type_id === value.artifact_type_id
        && type.schema_version === value.schema_version)) {
        throw new PluginArtifactAccessError("plugin_artifact_incompatible", "Manifest 未声明生产此 Artifact type/schema");
      }
      // Pick fields explicitly: runtime JavaScript must not override bound identity or share authority.
      return api.commands.registerVersion({
        board_id, actor_id, artifact_id: value.artifact_id, version: value.version,
        artifact_type_id: value.artifact_type_id, schema_version: value.schema_version,
        content: value.content, metadata: value.metadata, supersedes_version: value.supersedes_version,
        producer: { plugin_id: manifest.plugin_id, plugin_version: manifest.version,
          binding_signature: manifest.publisher.signature },
        scope: "personal",
      });
    },
    read(reference) {
      requirePermission("artifact:read");
      const artifact = api.query.getArtifactVersion(board_id, reference);
      if (!artifact) return null;
      if (artifact.scope === "personal" && artifact.owner_actor_id !== actor_id) {
        throw new PluginArtifactAccessError("plugin_artifact_denied", "不能读取其他用户的个人 Artifact");
      }
      const compatibility = api.query.consumptionCompatibility(board_id, reference, manifest.artifacts.consumes);
      if (!compatibility.consumable) {
        throw new PluginArtifactAccessError("plugin_artifact_incompatible", compatibility.reason);
      }
      return artifact;
    },
  };
}
