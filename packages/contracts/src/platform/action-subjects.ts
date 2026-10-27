import { ActionError, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionReference } from "./actions.js";

export const SUBJECT_REFERENCE_TYPE = "molis.subject-reference.v1";
export const SUBJECT_CONTEXT_TYPE = "molis.subject-context.v1";
export const SUBJECT_RETENTION_REQUEST_TYPE = "molis.subject-retention-request.v1";
export const SUBJECT_RETENTION_TYPE = "molis.subject-retention.v2";
export interface ActionSubject { kind: string; id: string }
export interface SubjectRetentionRequest { readonly subject_id: string }
/** The owner supplies lifecycle facts only. Installation identity comes from the Runtime's provider metadata. */
export type ActionSubjectRetention = {
  readonly subject: ActionSubject;
} & (
  | { readonly state: "active"; readonly retained: { readonly content_revision: string | null; readonly restoration_operation_id: string } | null }
  | { readonly state: "temporarily_archived"; readonly retained: { readonly content_revision: string | null; readonly restoration_operation_id: null } }
  | { readonly state: "deleted"; readonly retained: null }
);
export interface ActionSubjectContext {
  subject: ActionSubject;
  revision: string;
  title: string;
  content: string;
  truncated: boolean;
  /** Goals the owner itself attaches the object to (a document's “挂到 Goal”). Left out when it keeps no such relation; placement lists these as kept elsewhere. */
  goal_ids?: string[];
  /** Where the person opens it: the workbench surface and item. Absent when the object has no page of its own. */
  open?: { surface: string; id: string };
  /**
   * Only for objects kept in the person's Home that belong to a project (a todo of that project): which project.
   * Objects stored in a project partition leave it out — the partition says where they are (specs/archive/work-placement §7.2).
   */
  project_id?: string | null;
  /**
   * Where `content` starts in the object's whole text and how long that text is. A reader gives both when it reads a page
   * past the first (`offset` in its input; specs/project-knowledge §4.4); a reader that leaves them out gives only the first page.
   */
  offset?: number;
  length?: number;
}
/** What one reader call gives at most; a longer text is read page by page from `offset` by a reader that takes it. */
export const SUBJECT_CONTEXT_PAGE_CHARS = 32_000;
export interface SubjectContextRequest { subject_id: string; offset?: number }
const id = { type: "string", minLength: 1 };
const position = { type: "integer", minimum: 0 };
export const ACTION_SUBJECT_SCHEMA = { type: "object", properties: { kind: id, id }, required: ["kind", "id"], additionalProperties: false };
export const SUBJECT_RETENTION_INPUT_SCHEMA = { type: "object", properties: { subject_id: id }, required: ["subject_id"], additionalProperties: false };
const retainedContent = { type: "object", properties: { content_revision: { anyOf: [id, { type: "null" }] }, restoration_operation_id: id },
  required: ["content_revision", "restoration_operation_id"], additionalProperties: false };
export const SUBJECT_RETENTION_OUTPUT_SCHEMA = { oneOf: [
  { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, state: { const: "active" }, retained: { anyOf: [retainedContent, { type: "null" }] } },
    required: ["subject", "state", "retained"], additionalProperties: false },
  { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, state: { const: "temporarily_archived" },
    retained: { ...retainedContent, properties: { content_revision: { anyOf: [id, { type: "null" }] }, restoration_operation_id: { type: "null" } } } },
    required: ["subject", "state", "retained"], additionalProperties: false },
  { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, state: { const: "deleted" }, retained: { type: "null" } },
    required: ["subject", "state", "retained"], additionalProperties: false },
] };
export const SUBJECT_CONTEXT_INPUT_SCHEMA = { type: "object", properties: { subject_id: id, offset: position }, required: ["subject_id"], additionalProperties: false };
const required = { subject: ACTION_SUBJECT_SCHEMA, revision: id, title: { type: "string", maxLength: 1000 }, content: { type: "string", maxLength: SUBJECT_CONTEXT_PAGE_CHARS },
  truncated: { type: "boolean" } };
const properties = { ...required, goal_ids: { type: "array", items: id, uniqueItems: true } };
const paging = { offset: position, length: position };
const open = { type: "object", properties: { surface: { ...id, pattern: "^[a-zA-Z0-9_-]+$" }, id }, required: ["surface", "id"], additionalProperties: false };
const belongsTo = { type: ["string", "null"], maxLength: 120 };
export const SUBJECT_CONTEXT_OUTPUT_SCHEMA = { type: "object", properties: { ...properties, open, project_id: belongsTo, ...paging }, required: Object.keys(required), additionalProperties: false };
/** The v1 output before `project_id` was added: readers declared with it keep working. */
export const SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_PROJECT = { type: "object", properties: { ...properties, open }, required: Object.keys(required), additionalProperties: false };
/** The v1 output before `open` was added: readers declared with it keep working. */
export const SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN = { type: "object", properties, required: Object.keys(required), additionalProperties: false };
/**
 * A reader of one object kind's context. `scope` is where its objects live: a project's (the default), or the
 * person's own Home (a calendar, personal notes), so personal work can read them back too. Version 2: `goal_ids` left the required output
 * (an object that belongs to no Goal gives none), so a reference pinned to the version-1 reader meets this other contract and is refused.
 */
export function defineSubjectContextAction(capabilityId: string, kind: string, title: string, permissions: string[], scope: "project" | "home" = "project"): ActionDefinition<SubjectContextRequest, ActionSubjectContext> {
  return { capability_id: capabilityId, version: 2, operation: "query", action: { title: `读取${/^[A-Za-z]/.test(title) ? " " : ""}${title}${/[A-Za-z]$/.test(title) ? " " : ""}的正文与关联`, description: `读取${title}的当前正文、版本及真实关联，供调用者明确引用。`,
    kind: "query", scope, scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions, subject_kinds: [kind],
    input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE, input_schema: SUBJECT_CONTEXT_INPUT_SCHEMA, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA } };
}
/**
 * One page of an object's context. A reader that passes its own `request` reads from `request.offset` and says where the page
 * starts and how long the whole text is, so a long object is read page by page; without it the first page is all there is.
 */
export function subjectContext(input: Omit<ActionSubjectContext, "truncated" | "offset" | "length"> & { truncated?: boolean }, request?: Pick<SubjectContextRequest, "offset">): ActionSubjectContext {
  const offset = Math.min(Math.max(0, Math.floor(request?.offset ?? 0)), input.content.length);
  const content = input.content.slice(offset, offset + SUBJECT_CONTEXT_PAGE_CHARS);
  return { ...input, title: input.title.slice(0, 1000), content, truncated: input.truncated === true || offset + content.length < input.content.length,
    ...(input.goal_ids?.length ? { goal_ids: [...new Set(input.goal_ids)] } : {}), ...(request ? { offset, length: input.content.length } : {}) };
}

/**
 * The object a completed command created or changed, and its new revision, when the action says or shows it.
 * Only an action that is neither a query nor a navigation and names exactly one subject kind has one. Declared, `result_subject` names where the id (and revision) are in
 * the output. Undeclared, the rule is: the output itself when it has a string `id`, else its only top-level field that is an object
 * with a string `id`; the revision is that object's `version`, else its `revision`. When the output shows no such object, the input
 * decides: an input that has a string `id` names the object, with no revision. Nothing checks that this reads the right object, so
 * an action that writes should declare `result_subject` (docs/platform/PLUGIN-DEVELOPMENT.md).
 */
export function actionResultSubject(action: Pick<ActionDefinition["action"], "kind" | "subject_kinds" | "result_subject">, input: unknown, output: unknown):
  { subject: ActionSubject; revision: string | null } | null {
  if (action.kind === "query" || action.kind === "navigation" || action.subject_kinds.length !== 1) return null;
  const kind = action.subject_kinds[0]!;
  const at = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((node, key) => node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined, value);
  const token = (value: unknown): string | null => typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" && value ? value : null;
  if (action.result_subject) {
    const id = at(output, action.result_subject.id);
    return typeof id === "string" && id ? { subject: { kind, id }, revision: action.result_subject.revision ? token(at(output, action.result_subject.revision)) : null } : null;
  }
  // Undeclared: the output itself, or its one nested record, when it carries an id and a version or revision.
  const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>).id === "string" ? value as Record<string, unknown> : null;
  const nested = output && typeof output === "object" ? Object.values(output as Record<string, unknown>).map(record).filter(Boolean) : [];
  const found = record(output) ?? (nested.length === 1 ? nested[0]! : null);
  if (found) return { subject: { kind, id: String(found.id) }, revision: token(found.version ?? found.revision) };
  const named = record(input);
  return named ? { subject: { kind, id: String(named.id) }, revision: null } : null;
}

/** An action that reads one object's context by the shared subject protocol. */
export function isSubjectReader(action: Pick<ActionDefinition["action"], "input_type" | "output_type">): boolean {
  return action.input_type === SUBJECT_REFERENCE_TYPE && action.output_type === SUBJECT_CONTEXT_TYPE;
}
/** Protocol discovery confers no authority; invocation keeps the original caller and exact provider. */
export async function resolveActionSubject(client: ActionClient, caller: ActionCallContext, subject: ActionSubject): Promise<{ context: ActionSubjectContext; reader: ActionReference }> {
  const matches = (await client.discover(caller)).filter(view => view.action.input_type === SUBJECT_REFERENCE_TYPE
    && view.action.output_type === SUBJECT_CONTEXT_TYPE && view.action.subject_kinds.includes(subject.kind));
  const available = matches.filter(view => view.availability.available);
  if (available.length > 1) throw new ActionError("actions.subject_ambiguous", "有多个能力提供此对象上下文，不能任意选择提供方");
  const selected = available[0];
  if (!selected) {
    const state = matches[0]?.availability;
    throw new ActionError(state && !state.available ? state.code : "actions.subject_unavailable", state && !state.available ? state.reason : "此对象尚未提供可读取的上下文");
  }
  const reader = { capability_id: selected.capability_id, version: selected.version, provider_id: selected.provider.provider_id };
  const context = await client.invoke(caller, reader, { subject_id: subject.id }) as ActionSubjectContext;
  if (context.subject.id !== subject.id || context.subject.kind !== subject.kind) throw new ActionError("actions.subject_mismatch", "对象上下文与当前选择不一致");
  return { context, reader };
}
