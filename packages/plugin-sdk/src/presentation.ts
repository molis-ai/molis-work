import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { parseWorkspaceFileSubjectId, WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MATERIAL_REF_LIMITS, type MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";

// The message names the part that is wrong and never echoes a value: a reference can carry another owner's id or a local path.
const refused = (part: string) => new ActionError("actions.input_invalid", `资料引用无效：${part}`);

/** An object with only these keys. A key outside the contract is refused, so a reference cannot claim an owner, a project or an installation. */
function closed(value: unknown, part: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw refused(part);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key))) throw refused(part);
  return record;
}
function text(value: unknown, part: string, limit: number): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > limit) throw refused(part);
}
function positive(value: unknown, part: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw refused(part);
}
function version(value: unknown): void {
  const reference = closed(value, "pin.version", ["artifact_id", "version"]);
  text(reference.artifact_id, "pin.version.artifact_id", MATERIAL_REF_LIMITS.artifact_id);
  positive(reference.version, "pin.version.version");
}
function subject(value: unknown): void {
  const named = closed(value, "subject", ["kind", "id"]);
  text(named.kind, "subject.kind", MATERIAL_REF_LIMITS.subject_kind);
  text(named.id, "subject.id", MATERIAL_REF_LIMITS.subject_id);
  if (named.kind === WORKSPACE_FILE_SUBJECT_KIND && !parseWorkspaceFileSubjectId(named.id)) throw refused("subject.id");
}
function pin(value: unknown): void {
  const mode = closed(value, "pin", ["mode", "read_revision", "version"]).mode;
  if (mode === "current") text(closed(value, "pin", ["mode", "read_revision"]).read_revision, "pin.read_revision", MATERIAL_REF_LIMITS.revision);
  else if (mode === "fixed" || mode === "snapshot") version(closed(value, "pin", ["mode", "version"]).version);
  else throw refused("pin.mode");
}
function range(value: unknown): void {
  const selected = closed(value, "range", ["anchor", "line", "length", "page"]);
  if (Object.keys(selected).length === 0) throw refused("range");
  if (selected.anchor !== undefined) text(selected.anchor, "range.anchor", MATERIAL_REF_LIMITS.anchor);
  for (const key of ["line", "length", "page"]) if (selected[key] !== undefined) positive(selected[key], `range.${key}`);
}

/**
 * Whether this is a `MaterialRef`, for the platform when a reference enters a conversation or a task and for a plugin handed one by
 * someone else. Stricter than `MATERIAL_REF_SCHEMA`: a workspace file's id has to name a path inside its folder. A reference that passes
 * is well formed, nothing more: whether the caller may read it is decided when it is read.
 */
export function assertMaterialRef(value: unknown): asserts value is MaterialRef {
  const ref = closed(value, "引用", ["subject", "pin", "range"]);
  subject(ref.subject);
  pin(ref.pin);
  if (ref.range !== undefined) range(ref.range);
}
