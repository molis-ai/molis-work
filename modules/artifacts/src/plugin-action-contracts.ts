import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginConsumableFilter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { arraySchema as array, nullableSchema as nullable, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";
import { id, version, text, record, processRecord, reference, origin } from "./plugin-action-schemas.js";

const versionProperties = { artifact_id: id, version, artifact_type_id: id, schema_version: version,
  content: { oneOf: [object({ kind: { const: "inline" }, payload: {} }), object({ kind: { const: "reference" }, content_ref: id,
    digest: id, size_bytes: { type: "integer", minimum: 0 }, observed_digest: nullable(text), available: { type: "boolean" } },
    ["kind", "content_ref", "digest", "size_bytes"])] }, metadata: { type: "object" }, supersedes_version: nullable(version) } as const;
const versionRequired = ["artifact_id", "version", "artifact_type_id", "schema_version", "content"] as const;
const result = (artifact: unknown) => object({ artifact, observed_event_cursor: { type: "integer", minimum: 0 }, replayed: { type: "boolean" } });
const publishInput = object({ ...versionProperties, origin, title: id, media_type: id, trace: array(reference) },
  [...versionRequired, "origin", "title", "media_type"]);

/** One schema per operation, used by both the Kernel boundary and direct owner operations. */
export const pluginArtifactContracts = {
  read: { input: reference, output: nullable({ anyOf: [record, processRecord] }) },
  head: { input: object({ artifact_id: id }), output: nullable(object({ version, source_revision: nullable({ type: "integer", minimum: 0 }) })) },
  own: { input: reference, output: nullable(record) },
  publish: { input: publishInput, output: result(record) },
  record: { input: object(versionProperties, versionRequired), output: result(processRecord) },
  "process-head": { input: object({ artifact_id: id }), output: nullable(object({ version })) },
  "process-own": { input: reference, output: nullable(processRecord) },
  list: { input: object({ artifact_type_id: id, producer_plugin_id: id }, []), output: array(object({ artifact_id: id, version, kind: { enum: ["artifact", "process_item"] },
    artifact_type_id: id, schema_version: version, title: nullable(text), producer_plugin_id: id })) },
};

export type PluginArtifactActionInput<Operation extends keyof typeof pluginArtifactContracts> = InferActionInput<typeof pluginArtifactContracts[Operation]["input"]>;

// Project before validating: Javascript callers cannot replace trusted identity or add authority.
export const referenceInput = (value: ArtifactReference): ArtifactReference => ({ artifact_id: value.artifact_id, version: value.version });
const CONSUMABLE_FILTER_KEYS = new Set(["artifact_type_id", "producer_plugin_id"]);

/** Strips `undefined` values from declared optional filter keys before schema validation while keeping invalid or undeclared fields intact. */
export function normalizeConsumableFilter(value: unknown): unknown {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined && CONSUMABLE_FILTER_KEYS.has(key)) continue;
    normalized[key] = entry;
  }
  return normalized;
}

// Copies only the filter's own declared fields after the closed schema has validated the input.
export const filterInput = (value: PluginConsumableFilter = {}): PluginConsumableFilter => ({
  ...(Object.hasOwn(value, "artifact_type_id") && value.artifact_type_id !== undefined ? { artifact_type_id: value.artifact_type_id } : {}),
  ...(Object.hasOwn(value, "producer_plugin_id") && value.producer_plugin_id !== undefined ? { producer_plugin_id: value.producer_plugin_id } : {}),
});
export const processInput = (value: PluginArtifactActionInput<"record">): PluginArtifactActionInput<"record"> => ({ ...referenceInput(value),
  artifact_type_id: value.artifact_type_id, schema_version: value.schema_version, content: value.content,
  ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
  ...(value.supersedes_version === undefined ? {} : { supersedes_version: value.supersedes_version }) });
export const artifactInput = (value: PluginArtifactActionInput<"publish">): PluginArtifactActionInput<"publish"> => ({ ...processInput(value),
  origin: value.origin, title: value.title, media_type: value.media_type,
  ...(value.trace === undefined ? {} : { trace: value.trace }) });
