import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { parseWorkspaceFileSubjectId, WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MATERIAL_REF_LIMITS, type MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { PRESENTATION_FORM_KINDS, type FieldRole, type FormKind, type OwnedPresentationObject, type PresentationObject, type PresentationOverview,
  type PresentationOverviewDeclaration, type PresentationValueItem, type PresentationValues, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef, TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "./json-value.js";
import { PLATFORM_TEXT_OWNER } from "./message-declarations.js";
import { say } from "./ui/text.js";
import { tryOwnedTextRef } from "./ui/text-ref.js";

export { presentationCatalog, validatePresentationDeclaration, type PresentationCatalog,
  type PresentationCatalogAnswer } from "./presentation-declaration.js";
export { assertSurfaceDescription, type CheckedSurfaceDescription, type SurfaceDrop } from "./surface-description.js";

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

const subjectKey = (subject: { readonly kind: string; readonly id: string }) => `${subject.kind}\u0000${subject.id}`;

/**
 * What is wrong with an owner's answer to a values call, beyond its schema: an object not asked for or answered twice, a field not asked for,
 * values on an object the caller may not read or that is gone, and a `stale` item without `read_at` (SSC-13), which a page would then show
 * as current. `bindPresentationValuesHandler` already trims what an owner gives; the composition service and a page reading values run this
 * on every answer, from any owner alike, and show an item with a problem as unreadable. Each problem names the item by its position only.
 * An object asked for and not answered is no problem here, as there is no item to name: the page shows a missing object as unreadable too.
 */
export function presentationValuesProblems(input: PresentationValuesInput, values: PresentationValues): string[] {
  const asked = new Set(input.subjects.map(subjectKey));
  const fields = new Set(input.fields);
  const answered = new Set<string>();
  return values.items.flatMap((item, index) => {
    const at = `items[${index}]`;
    const key = subjectKey(item.subject);
    const problems: string[] = !asked.has(key) ? [`${at} 不是问到的对象`] : answered.has(key) ? [`${at} 重复回答了同一个对象`] : [];
    answered.add(key);
    if ((item.state === "forbidden" || item.state === "deleted") && (item.values !== undefined || item.read_at !== undefined)) problems.push(`${at} 是 ${item.state}，只能给状态`);
    if (Object.keys(item.values ?? {}).some(field => !fields.has(field))) problems.push(`${at} 给了没有问到的字段`);
    if (item.state === "stale" && item.read_at === undefined) problems.push(`${at} 是 stale，要写 read_at`);
    return problems;
  });
}

/**
 * SSC-18's runtime half: the `start` an overview action returns only picks among its declaration's `start`, each once. The composition
 * service runs it on every overview it reads and an author runs it in its tests; the output's shape is the action's schema's to check.
 */
export function presentationOverviewProblems(declaration: PresentationOverviewDeclaration, overview: PresentationOverview): string[] {
  const offered = new Set((declaration.start ?? []).map(entry => `${entry.capability_id}@${entry.version}`));
  const seen = new Set<string>();
  return overview.start.flatMap((entry, index) => {
    const key = `${entry.capability_id}@${entry.version}`;
    const problem = !offered.has(key) ? `start[${index}] ${key} 不在声明的 overview.start 里` : seen.has(key) ? `start[${index}] ${key} 重复` : null;
    seen.add(key);
    return problem ? [problem] : [];
  });
}

/** What a word the owner cannot have written shows as: the platform's own, never the key (a-section §2.3). */
const UNAVAILABLE: OwnedTextRef = { owner: PLATFORM_TEXT_OWNER, key: "common.text.unavailable" };
/** The mark on values the owner could not read now, so they are never read as current (IUI-10). The key is the workbench's. */
const staleMark = (at: string): OwnedTextRef =>
  ({ owner: PLATFORM_TEXT_OWNER, key: "common.presentation.stale", args: [{ name: "at", kind: "date", at, style: "relative" }], fallback: "以下是之前读到的值" });

function valueText(role: FieldRole, value: unknown, words: (ref: unknown) => string): string | null {
  if (role === "activity") return value === undefined || value === null ? null : words(value);
  if (role === "judgment") return isRecord(value) ? `${words(value.label)}${value.reason === undefined ? "" : `（${words(value.reason)}）`}` : null;
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean" ? String(value) : null;
}

/**
 * The text form of one object for an external Agent, a terminal or a notification (IUI §4.5): one line per key of its `text.lines`, written
 * `label：value` from the same values the drawn forms read, after a line saying when they were read if the owner gave them `stale`. A word
 * in the values (`activity`, `judgment`) is bound to the object's owner without throwing, so one under another owner's prefix or of a wrong
 * shape shows as unavailable (a-section §2.3); a field with no value is left out. `locale: null` asks for the owner's default language
 * (a-section §5.2). A `forbidden` or `deleted` object has no text: what to say instead is the caller's. Plain text, unescaped: never
 * interpolate it into HTML.
 */
export function presentationText(object: OwnedPresentationObject, item: PresentationValueItem, locale: string | null): string {
  if (item.state === "forbidden" || item.state === "deleted") return "";
  const words = (ref: unknown) => say.text((isRecord(ref) ? tryOwnedTextRef(ref as TextRef, object.owner) : null) ?? UNAVAILABLE, { locale });
  const lines = (object.text?.lines ?? []).flatMap(key => {
    const field = object.fields.find(entry => entry.key === key);
    const shown = field ? valueText(field.role, item.values?.[key], words) : null;
    if (!field || shown === null) return [];
    return [field.label ? `${words(field.label)}：${shown}` : shown];
  });
  return [...(item.state === "stale" && item.read_at ? [say.text(staleMark(item.read_at), { locale })] : []), ...lines].join("\n");
}
