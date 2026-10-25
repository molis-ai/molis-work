import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindProjectArtifacts } from "@molis-ai/molis-work-app-local-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/** One producer a test installs in its project: what it writes to the 成果库, and what to the 过程项 store. */
export interface TestProducer { plugin_id: string; artifact_types?: readonly string[]; process_types?: readonly string[] }

/**
 * Makes the project whose database is `db` answer for these producers as installations in effect (S-75): a version store writes
 * for a producer only when the project's own supervisor says it is installed there, so a test that writes through a store with no
 * platform names its producers here. Each type is declared at schema version 1. Returns the way to let them go.
 */
export function installProducers(db: object, ...producers: readonly TestProducer[]): () => void {
  const manifests = producers.map((producer): PluginManifest => {
    const types = producer.artifact_types ?? [], previews = types.map(type => defineArtifactPreviewAction(`${type}.preview`, "预览", []));
    return { schema_version: 2, host_api_version: 2, plugin_id: producer.plugin_id, version: "1.0.0", name: producer.plugin_id, kind: "app",
      publisher: { publisher_id: "fixture", signature: `fixture-${producer.plugin_id}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [], capabilities: { provides: [], consumes: [] }, ui: { contributions: [], views: [] }, actions: previews,
      artifacts: { produces: types.map(type => ({ artifact_type_id: type, schema_version: 1, title: type, preview: { capability_id: `${type}.preview`, version: 1 } })), consumes: [] },
      ...producer.process_types?.length ? { process_items: { produces: producer.process_types.map(type => ({ artifact_type_id: type, schema_version: 1 })), consumes: [] } } : {} };
  });
  return bindProjectArtifacts(db, { alive: () => true, effectiveManifests: () => manifests, knownPluginIds: () => manifests.map(manifest => manifest.plugin_id) });
}
