import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { parseWorkspaceFileSubjectId, WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MATERIAL_REF_LIMITS, type MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { PRESENTATION_FORM_KINDS, type FormKind, type PresentationObject } from "@molis-ai/molis-work-contracts/platform/presentation";

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
function subject(value: unknown): string {
  const named = closed(value, "subject", ["kind", "id"]);
  text(named.kind, "subject.kind", MATERIAL_REF_LIMITS.subject_kind);
  text(named.id, "subject.id", MATERIAL_REF_LIMITS.subject_id);
  if (named.kind === WORKSPACE_FILE_SUBJECT_KIND) {
    const file = parseWorkspaceFileSubjectId(named.id);
    // The folder id is what `projects.directories.map_source@1` names (at most 200, no control characters): a longer one could never be mapped back.
    if (!file || file.workspace_id.length > WORKSPACE_FOLDER_ID_MAX || hasControlCharacter(file.workspace_id)) throw refused("subject.id");
  }
  return named.kind;
}
const WORKSPACE_FOLDER_ID_MAX = 200;
const hasControlCharacter = (value: string) => [...value].some(character => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f);
/** A local file's revision: 64 hex digits are the sha256 of its bytes, the same as `knowledge.read`'s `revision`; `size:<bytes>` is its size alone, when its content cannot be read. */
const WORKSPACE_FILE_REVISION = /^(?:[0-9a-f]{64}|size:\d+)$/u;
function pin(value: unknown, kind: string): void {
  const mode = closed(value, "pin", ["mode", "read_revision", "version"]).mode;
  if (mode === "current") {
    const revision = closed(value, "pin", ["mode", "read_revision"]).read_revision;
    text(revision, "pin.read_revision", MATERIAL_REF_LIMITS.revision);
    if (kind === WORKSPACE_FILE_SUBJECT_KIND && !WORKSPACE_FILE_REVISION.test(revision)) throw refused("pin.read_revision");
  } else if (mode === "fixed" || mode === "snapshot") version(closed(value, "pin", ["mode", "version"]).version);
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
 * someone else. Stricter than `MATERIAL_REF_SCHEMA`: a workspace file's id has to name a path inside its folder, and its current pin has to carry a file revision. A reference that passes
 * is well formed, nothing more: whether the caller may read it is decided when it is read.
 */
export function assertMaterialRef(value: unknown): asserts value is MaterialRef {
  const ref = closed(value, "引用", ["subject", "pin", "range"]);
  pin(ref.pin, subject(ref.subject));
  if (ref.range !== undefined) range(ref.range);
}

/**
 * The form an object is drawn in where `form` is asked for, and the fields to ask its owner's values action for: what the composition
 * service and a page drawing one form on its own (MLN-23) both use. A form the object does not declare steps down to the next simpler one
 * it does (IUI-03); null when none is left, and the platform draws its fallback of icon, name, owner and 「打开」 (IUI-02). The status
 * field comes with every form, because every form shows the state and its attention mark.
 */
export function presentationFormFields(object: PresentationObject, form: FormKind): { readonly form: FormKind; readonly fields: readonly string[] } | null {
  for (const kind of PRESENTATION_FORM_KINDS.slice(0, PRESENTATION_FORM_KINDS.indexOf(form) + 1).reverse()) {
    const declared = object.forms[kind];
    if (declared) return { form: kind, fields: [...new Set([...declared.fields, ...(object.status ? [object.status.field] : [])])] };
  }
  return null;
}
