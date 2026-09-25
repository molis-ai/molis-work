/** Shared wire shapes for workspace plugin actions; authority stays outside business input. */
export const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
export const text = { type: "string" }, id = { type: "string", minLength: 1 }, integer = { type: "integer", minimum: 0 }, version = { type: "integer", minimum: 1 }, boolean = { type: "boolean" };
export const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
export const path = { type: "array", minItems: 1, maxItems: 64, items: { type: "string", minLength: 1, maxLength: 255 } };
export const rootPath = { ...path, minItems: 0 };
export const reference = object({ artifact_id: id, version });
export const workspace = object({ workspace_id: id, name: text, handle: id });
export const snapshot = object({ workspace: object({ workspace_id: id, name: text }), path, text, start: integer, end: integer }, ["workspace", "path", "text"]);
export const fileMode = { enum: ["100644", "100755"] };
export const fileResult = { oneOf: [
  object({ outcome: { const: "directory" }, entries: { type: "array", items: object({ name: text, path, kind: { enum: ["file", "directory", "other"] } }) }, truncated: boolean }),
  object({ outcome: { const: "text" }, text, fingerprint: id, mode: fileMode }, ["outcome", "text", "fingerprint"]),
  object({ outcome: { const: "too-large" }, bytes: integer, limit: integer }),
  object({ outcome: { enum: ["binary", "unsupported", "missing", "denied", "changed"] } }),
] };
/** Full Artifact envelope remains owned/versioned by Artifacts; consumers need this fixed identity and origin. */
export const publication = object({ artifact: { type: "object", required: ["artifact_id", "version", "owner_actor_id", "created_by", "created_at", "payload"],
  properties: { artifact_id: id, version, owner_actor_id: id, created_by: id, created_at: id, payload: {} } }, observed_event_cursor: integer, replayed: boolean });
