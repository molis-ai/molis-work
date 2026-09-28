import { ActionError, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionReference } from "./actions.js";

export const SUBJECT_REFERENCE_TYPE = "molis.subject-reference.v1";
export const SUBJECT_CONTEXT_TYPE = "molis.subject-context.v1";
export interface ActionSubject { kind: string; id: string }
export interface ActionSubjectContext {
  subject: ActionSubject;
  revision: string;
  title: string;
  content: string;
  truncated: boolean;
  goal_ids: string[];
  session_id: string | null;
  /** Where the person opens it: the workbench surface and item. Absent when the object has no page of its own. */
  open?: { surface: string; id: string };
}
const id = { type: "string", minLength: 1 };
export const ACTION_SUBJECT_SCHEMA = { type: "object", properties: { kind: id, id }, required: ["kind", "id"], additionalProperties: false };
export const SUBJECT_CONTEXT_INPUT_SCHEMA = { type: "object", properties: { subject_id: id }, required: ["subject_id"], additionalProperties: false };
const properties = { subject: ACTION_SUBJECT_SCHEMA, revision: id, title: { type: "string", maxLength: 1000 }, content: { type: "string", maxLength: 32000 },
  truncated: { type: "boolean" }, goal_ids: { type: "array", items: id, uniqueItems: true }, session_id: { type: ["string", "null"] } };
const open = { type: "object", properties: { surface: { ...id, pattern: "^[a-zA-Z0-9_-]+$" }, id }, required: ["surface", "id"], additionalProperties: false };
export const SUBJECT_CONTEXT_OUTPUT_SCHEMA = { type: "object", properties: { ...properties, open }, required: Object.keys(properties), additionalProperties: false };
/** The v1 output before `open` was added: readers declared with it keep working. */
export const SUBJECT_CONTEXT_OUTPUT_SCHEMA_WITHOUT_OPEN = { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
/**
 * A reader of one object kind's context. `scope` is where its objects live: a project's (the default), or the
 * person's own Home (a calendar, personal notes), so personal work can read them back too.
 */
export function defineSubjectContextAction(capabilityId: string, kind: string, title: string, permissions: string[], scope: "project" | "home" = "project"): ActionDefinition<{ subject_id: string }, ActionSubjectContext> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: `读取${title}的当前正文、版本及真实关联，供调用者明确引用。`,
    kind: "query", scope, scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions, subject_kinds: [kind],
    input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE, input_schema: SUBJECT_CONTEXT_INPUT_SCHEMA, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA } };
}
export function subjectContext(input: Omit<ActionSubjectContext, "truncated"> & { truncated?: boolean }): ActionSubjectContext {
  return { ...input, title: input.title.slice(0, 1000), content: input.content.slice(0, 32000), truncated: input.truncated === true || input.content.length > 32000,
    goal_ids: [...new Set(input.goal_ids)] };
}

/** The object a completed command created or changed, and its new revision, when the action says or shows it. */
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
