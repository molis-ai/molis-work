import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MATERIALS_PROVIDER_ID } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE, parseFileSnapshot } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { bindPluginActionRoute, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";

/** The id, project key and only input of the probe below. */
export const SNAPSHOT_READER = { plugin_id: "com.example.snapshot-reader", project_plugin_id: "snapshot-reader", port: "text" } as const;

/** What the probe read: `waiting` before any input, `unavailable` when the bound record is not readable, `ready` with the text it got. */
export interface SnapshotReaderView { phase: "waiting" | "unavailable" | "ready"; text?: string; path?: readonly string[]; content_version?: number }

export const snapshotReaderState = {
  capability_id: "snapshot-reader.state", version: 1, operation: "query",
  action: { kind: "query", scope: "project", audiences: ["user", "agent", "workflow", "mcp", "plugin"], subject_kinds: ["artifact"],
    title: "读取绑定的快照", description: "只读当前绑定的固定快照", permissions: ["artifact:read"],
    input_schema: object({}), output_schema: object({ view: object({ phase: { enum: ["waiting", "unavailable", "ready"] }, text: { type: "string" },
      path: { type: "array", items: { type: "string" } }, content_version: { type: "integer", minimum: 1 } }, ["phase"]) }, ["view"]) },
} as ActionDefinition<Record<string, never>, { view: SnapshotReaderView }>;

/**
 * The smallest app the platform's port wiring needs, and nothing else (no UI, no storage, no Host Capability): one **required**
 * file-snapshot input whose default source is the platform's materials (`system.materials.before`), and a state action that says
 * what it was handed. Tests of startup (`kind: "app"`), required inputs, default bindings and the companions worked out from the
 * Manifests use it in place of a built-in plugin. It is a test fixture: it is never registered in the built-in catalog.
 */
export const snapshotReaderManifest: PluginManifest = {
  schema_version: 1, host_api_version: 1, plugin_id: SNAPSHOT_READER.plugin_id, version: "1.0.0", name: "快照读取", kind: "app",
  publisher: { publisher_id: "molis", signature: "probe-snapshot-reader" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: [{ permission: "artifact:read", required: true, reason: "读取已固定的文本版本" }], capabilities: { provides: [], consumes: [] },
  actions: [snapshotReaderState], artifacts: { produces: [], consumes: [] },
  process_items: { produces: [], consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }] },
  ports: { inputs: [{ port: SNAPSHOT_READER.port, artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION,
    default_source: { plugin_id: MATERIALS_PROVIDER_ID, port: "before" } }], outputs: [] },
  routes: [{ route_id: "snapshot-reader.state", method: "GET", path: "/state" }],
  ui: { contributions: [] },
};

function readView(context: PluginStartContext): SnapshotReaderView {
  try {
    const record = context.services?.inputs?.read(SNAPSHOT_READER.port);
    if (!record) {
      const state = context.services?.inputs?.status();
      return { phase: state?.status === "missing" && state.reason?.code === "content_unavailable" ? "unavailable" : "waiting" };
    }
    // A record the Host could not make available, or one that was archived, is not an input: its retained payload is not read.
    if (record.availability !== "available" || record.lifecycle_state !== "active") return { phase: "unavailable" };
    const snapshot = parseFileSnapshot(record.payload);
    return { phase: "ready", text: snapshot.text, path: snapshot.path, content_version: record.version };
  } catch { return { phase: "unavailable" }; }
}

export function snapshotReaderPlugin(): PluginDefinition {
  return {
    manifest: snapshotReaderManifest,
    async start(context) {
      context.requireGrant("artifact:read");
      // The state is read when asked for, so a delivery or a withdrawal needs no work here; an app with an input still redeems both.
      return { kind: "app", views: [], actions: [{ ...snapshotReaderState, handle: () => ({ view: readView(context) }) }],
        routes: [bindPluginActionRoute(context, snapshotReaderState, () => ({}))], onUpstreamReady: () => {}, onUpstreamUnavailable: () => {} };
    },
  };
}
