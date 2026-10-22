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
// Git's wire shapes, shared by the Git plugin's own actions and the Host actions it calls (PG-035), so both check one shape.
const limited = (max: number) => ({ type: "string", maxLength: max });
/** The caller's own name for one reviewed operation, which makes asking twice the same review. */
export const operationId = { type: "string", pattern: "^[a-zA-Z0-9-]{8,80}$" };
/** One Git operation a person asks for (`GitOperation`). */
export const gitOperation = { oneOf: [
  object({ action: { const: "commit" }, message: limited(5_000) }),
  object({ action: { const: "branch-create" }, name: limited(200), checkout: boolean }),
  object({ action: { const: "branch-switch" }, name: limited(200) }),
  object({ action: { const: "push" }, remote: limited(200), set_upstream: boolean }),
  object({ action: { const: "pr-create" }, base: limited(200), title: limited(256), body: limited(20_000), draft: boolean }),
  object({ action: { const: "merge" }, branch: limited(200) }),
  object({ action: { const: "pull" } }),
  object({ action: { const: "resolve" }, path: limited(1000), content: limited(1024 * 1024) }),
  object({ action: { const: "merge-abort" } }),
] };
/** What became of one Git operation (`GitOperationRecord`). */
export const gitOperationRecord = object({ operation_id: id, review_id: id, tool: text, summary: text,
  outcome: { enum: ["pending", "running", "succeeded", "failed", "denied", "cancelled", "expired", "unknown"] }, detail: text, failure_reason: text,
  requested_at: text, decided_by: nullable(text), decided_at: nullable(text) }, ["operation_id", "review_id", "tool", "summary", "outcome", "requested_at", "decided_by", "decided_at"]);
/** A settled stage or unstage with its Host review (`GitReviewedResult`). */
export const gitReviewedResult = object({ workspace_id: id, operation_id: id, outcome: { enum: ["succeeded", "failed", "denied", "cancelled", "expired", "reconcile", "conflict"] }, summary: text,
  review: object({ review_id: id, action: { enum: ["stage", "unstage"] }, paths: { type: "array", items: text }, requested_at: text,
    decided_by: nullable(text), decided_at: nullable(text), failure_reason: text, reconciliation_reason: text,
    reconciliation: object({ actor_id: id, at: text, reason: text }) }, ["review_id", "action", "paths", "requested_at", "decided_by", "decided_at"]) });
// Parallel writers' wire shapes (PG-035): the Host actions Coding calls for a writer's own worktree and to bring a child's result back.
/** A writer's directory under the main workspace (`PreparedWriterDirectory`). */
export const writerDirectory = object({ worktree_id: id, branch: text, base_commit: text, canonical_path: id, workspace_id: nullable(id), problem: text },
  ["worktree_id", "branch", "base_commit", "canonical_path", "workspace_id"]);
/** Whose child, in which run of which session (`WriterIntegrationSource`). */
export const writerSource = { session_id: id, run_id: id, subagent_id: id };
/** One file a child changed, and whether it can be brought back as it is (`WriterIntegrationFile`). */
export const writerIntegrationFile = object({ path: { type: "array", items: text }, target: { enum: ["added", "modified", "deleted"] }, selectable: boolean, reason: text, revision: text,
  before_text: nullable(text), after_text: nullable(text), before_mode: nullable(fileMode), after_mode: nullable(fileMode),
  conflict: object({ base_text: nullable(text), merged_text: text, clean: boolean, markers: integer }) }, ["path", "target", "selectable"]);
/** What a child's worktree would bring back to the main workspace (`WriterIntegrationView`). */
export const writerIntegrationView = object({ workspace_id: id, writer_workspace_id: id, source_path: id, target_path: id, branch: text, base_commit: text,
  files: { type: "array", items: writerIntegrationFile } });
/** The files a person chose, each at the revision they saw; `resolution` is their finished three-way merge, at most 256 KiB. */
export const writerIntegrationChoice = object({ path, revision: id, resolution: limited(262_144) }, ["path", "revision"]);
