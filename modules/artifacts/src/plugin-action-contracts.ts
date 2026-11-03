import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginArtifactPublishInput, PluginProcessItemInput } from "@molis-ai/molis-work-contracts/platform/plugin";
import { id, version, text, object, nullable, record, processRecord, reference, origin, array } from "./plugin-action-schemas.js";

const versionInput = object({ artifact_id: id, version, artifact_type_id: id, schema_version: version,
  content: { oneOf: [object({ kind: { const: "inline" }, payload: {} }), object({ kind: { const: "reference" }, content_ref: id,
    digest: id, size_bytes: { type: "integer", minimum: 0 }, observed_digest: nullable(text), available: { type: "boolean" } },
    ["kind", "content_ref", "digest", "size_bytes"])] }, metadata: { type: "object" }, supersedes_version: nullable(version) },
  ["artifact_id", "version", "artifact_type_id", "schema_version", "content"]);
const result = (artifact: unknown) => object({ artifact, observed_event_cursor: { type: "integer", minimum: 0 }, replayed: { type: "boolean" } });
const versionProperties = (versionInput as { properties: Record<string, unknown> }).properties;
const publishInput = object({ ...versionProperties, origin, title: id, media_type: id, trace: array(reference) },
  ["artifact_id", "version", "artifact_type_id", "schema_version", "content", "origin", "title", "media_type"]);

/** One schema per operation, used by both the Kernel boundary and direct owner operations. */
export const pluginArtifactContracts = {
  read: { input: reference, output: nullable({ anyOf: [record, processRecord] }) },
  head: { input: object({ artifact_id: id }), output: nullable(object({ version, source_revision: nullable({ type: "integer", minimum: 0 }) })) },
  own: { input: reference, output: nullable(record) },
  publish: { input: publishInput, output: result(record) },
  record: { input: versionInput, output: result(processRecord) },
  "process-head": { input: object({ artifact_id: id }), output: nullable(object({ version })) },
  "process-own": { input: reference, output: nullable(processRecord) },
  list: { input: object({}), output: array(object({ artifact_id: id, version, kind: { enum: ["artifact", "process_item"] },
    artifact_type_id: id, schema_version: version, title: nullable(text) })) },
};

// Project before validating: Javascript callers cannot replace trusted identity or add authority.
export const referenceInput = (value: ArtifactReference): ArtifactReference => ({ artifact_id: value.artifact_id, version: value.version });
export const processInput = (value: PluginProcessItemInput): PluginProcessItemInput => ({ ...referenceInput(value),
  artifact_type_id: value.artifact_type_id, schema_version: value.schema_version, content: value.content,
  ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
  ...(value.supersedes_version === undefined ? {} : { supersedes_version: value.supersedes_version }) });
export const artifactInput = (value: PluginArtifactPublishInput): PluginArtifactPublishInput => ({ ...processInput(value),
  origin: value.origin, title: value.title, media_type: value.media_type,
  ...(value.trace === undefined ? {} : { trace: value.trace }) });
