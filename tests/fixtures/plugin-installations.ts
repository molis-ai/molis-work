import type { PluginInstanceRecord, PluginLifecycleState, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, createPluginRuntimeReleaseArtifact, type PluginRuntimeDatabase, type PluginRuntimeReleaseArtifactDatabase } from "@molis-ai/molis-work-plugin-runtime";

/**
 * The rows a Runtime start leaves in a project's library for one installation: the build in the release archive and the installation's
 * record. A test that composes a plugin's pieces over a library it opened itself (no Runtime start) uses this to have the platform see the
 * plugin installed, because what the platform reads of a plugin's Manifest (its `attention.inbox`, say) comes from these rows.
 */
export function recordInstallation(db: PluginRuntimeDatabase & PluginRuntimeReleaseArtifactDatabase, manifest: PluginManifest, state: PluginLifecycleState = "running", options: { archived?: boolean } = {}): void {
  const artifact = createPluginRuntimeReleaseArtifact(manifest, "export default {};");
  if (options.archived !== false) new SqlitePluginRuntimeReleaseArtifactRepository(db).save(artifact);
  const at = "2026-10-25T00:00:00.000Z";
  const record: PluginInstanceRecord = { install_id: `install-${manifest.plugin_id}`, installation_generation: "generation-1", plugin_id: manifest.plugin_id, version: manifest.version,
    publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature, manifest_digest: artifact.manifest_digest, deployment: "local",
    selected_entrypoint: "main", grants: [], execution: "host", state, recovery_count: 0, last_error_code: null, installed_at: at, updated_at: at, uninstalled_at: null, retain_private_data: true };
  new SqlitePluginRuntimeRepository(db).save(record);
}
