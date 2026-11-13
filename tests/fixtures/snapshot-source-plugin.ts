import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_SCHEMA_VERSION, FILE_TEXT_SELECTION_TYPE, FILES_COLLECTION_SCHEMA_VERSION,
  FILES_COLLECTION_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

/** The id and publisher of the probe below. */
export const SNAPSHOT_SOURCE = { plugin_id: "io.molis.work.example.snapshots", signature: "probe-snapshots" } as const;

/**
 * A plugin that hands on file snapshots at its output ports and does nothing else: the source tests of wiring, default bindings and
 * consent need, with the ports and process-item types the retired Files plugin declared (a folder collection at `files`, snapshots at
 * `before` and `after`, a text selection at `selection`). Whether it is the Host's own is the caller's `trust`, as for any plugin.
 */
export function snapshotSourcePlugin(options: { readonly plugin_id?: string; readonly signature?: string } = {}): PluginDefinition {
  const snapshot = { artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION };
  const selection = { artifact_type_id: FILE_TEXT_SELECTION_TYPE, schema_version: FILE_TEXT_SELECTION_SCHEMA_VERSION };
  const collection = { artifact_type_id: FILES_COLLECTION_TYPE, schema_version: FILES_COLLECTION_SCHEMA_VERSION };
  return {
    manifest: { schema_version: 1, host_api_version: 1, plugin_id: options.plugin_id ?? SNAPSHOT_SOURCE.plugin_id, version: "1.0.0", name: "快照来源", kind: "app",
      publisher: { publisher_id: "molis", signature: options.signature ?? SNAPSHOT_SOURCE.signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
      permissions: [{ permission: "artifact:write", required: true, reason: "发布固定的快照与选区" }], capabilities: { provides: [], consumes: [] },
      artifacts: { produces: [], consumes: [] }, process_items: { produces: [collection, snapshot, selection], consumes: [] }, ui: { contributions: [] },
      ports: { inputs: [], outputs: [{ port: "files", ...collection }, { port: "before", ...snapshot }, { port: "after", ...snapshot }, { port: "selection", ...selection }] } },
    async start() { return { kind: "app", views: [] }; },
  };
}
