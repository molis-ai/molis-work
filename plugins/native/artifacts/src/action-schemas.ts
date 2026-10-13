import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

export const text = { type: "string" }, id = { type: "string", minLength: 1, pattern: "\\S" }, version = { type: "integer", minimum: 1 };
export const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
export const array = (items: unknown) => ({ type: "array", items });
export const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });
export const reference = object({ artifact_id: id, version });
export const consumerTypes = array(object({ artifact_type_id: id, schema_version: version }));
// Payload and metadata retain the producer's JSON contract, including unknown Artifact types.
const fixedFields = { artifact_id: id, version, project_id: id, artifact_type_id: id, schema_version: version,
  producer_plugin_id: id, producer_plugin_version: id, producer_binding_signature: id, owner_actor_id: id,
  content_kind: { enum: ["inline", "reference"] }, payload: {}, content_ref: nullable(text), content_digest: text,
  size_bytes: { type: "integer", minimum: 0 }, metadata: { type: "object" }, scope: { enum: ["personal", "team_project"] },
  availability: { enum: ["available", "unavailable"] }, unavailable_reason: nullable(text), lifecycle_state: { enum: ["active", "archived"] },
  supersedes_version: nullable(version), created_by: id, created_at: text, archived_at: nullable(text), archived_by: nullable(text) };
/** Where a 成果 came from: a pinned work object or an imported file (artifact-positioning A1). */
export const origin = { oneOf: [
  object({ kind: { const: "pinned" }, subject: object({ kind: id, id }), revision: id }),
  object({ kind: { const: "imported" }, file_name: id }),
] };
/** A process item (A2): exchange data between plugins, without a place in the 成果库. */
export const processRecord = object(fixedFields);
/** A 成果: what people keep and cite, with its origin, title, media type and the process items it came from. */
export const record = object({ ...fixedFields, origin, title: id, media_type: id, trace: array(reference) });
