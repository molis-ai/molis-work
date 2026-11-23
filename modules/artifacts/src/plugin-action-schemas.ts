// Shared by the artifact module actions and the plugin-facing artifact client.
import { arraySchema as array, nullableSchema as nullable, objectSchema as object } from "@molis-ai/molis-work-plugin-sdk";

export const text = { type: "string" } as const;
export const id = { type: "string", minLength: 1, pattern: "\\S" } as const;
export const version = { type: "integer", minimum: 1 } as const;
export const reference = object({ artifact_id: id, version });
export const consumerTypes = array(object({ artifact_type_id: id, schema_version: version }));
// Payload and metadata retain the producer's JSON contract, including unknown Artifact types.
const fixedFields = { artifact_id: id, version, project_id: id, artifact_type_id: id, schema_version: version,
  producer_plugin_id: id, producer_plugin_version: id, producer_binding_signature: id, owner_actor_id: id,
  content_kind: { enum: ["inline", "reference"] }, payload: {}, content_ref: nullable(text), content_digest: text,
  size_bytes: { type: "integer", minimum: 0 }, metadata: { type: "object" }, scope: { enum: ["personal", "team_project"] },
  availability: { enum: ["available", "unavailable"] }, unavailable_reason: nullable(text), lifecycle_state: { enum: ["active", "archived"] },
  supersedes_version: nullable(version), created_by: id, created_at: text, archived_at: nullable(text), archived_by: nullable(text) } as const;
/** Where a 成果 came from: a pinned work object or an imported file (artifact-positioning A1). */
export const origin = { oneOf: [
  object({ kind: { const: "pinned" }, subject: object({ kind: id, id }), revision: id }),
  object({ kind: { const: "imported" }, file_name: id }),
] } as const;
/** A process item (A2): exchange data between plugins, without a place in the 成果库. */
export const processRecord = object(fixedFields);
/** A 成果: what people keep and cite, with its origin, title, media type and the process items it came from. */
export const record = object({ ...fixedFields, origin, title: id, media_type: id, trace: array(reference) });
