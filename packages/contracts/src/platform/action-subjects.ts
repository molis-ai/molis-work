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
}
const id = { type: "string", minLength: 1 };
export const ACTION_SUBJECT_SCHEMA = { type: "object", properties: { kind: id, id }, required: ["kind", "id"], additionalProperties: false };
export const SUBJECT_CONTEXT_INPUT_SCHEMA = { type: "object", properties: { subject_id: id }, required: ["subject_id"], additionalProperties: false };
const properties = { subject: ACTION_SUBJECT_SCHEMA, revision: id, title: { type: "string", maxLength: 1000 }, content: { type: "string", maxLength: 32000 },
  truncated: { type: "boolean" }, goal_ids: { type: "array", items: id, uniqueItems: true }, session_id: { type: ["string", "null"] } };
export const SUBJECT_CONTEXT_OUTPUT_SCHEMA = { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
export function defineSubjectContextAction(capabilityId: string, kind: string, title: string, permissions: string[]): ActionDefinition<{ subject_id: string }, ActionSubjectContext> {
  return { capability_id: capabilityId, version: 1, operation: "query", action: { title, description: `读取${title}的当前正文、版本及真实关联，供调用者明确引用。`,
    kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions, subject_kinds: [kind],
    input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE, input_schema: SUBJECT_CONTEXT_INPUT_SCHEMA, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA } };
}
export function subjectContext(input: Omit<ActionSubjectContext, "truncated"> & { truncated?: boolean }): ActionSubjectContext {
  return { ...input, title: input.title.slice(0, 1000), content: input.content.slice(0, 32000), truncated: input.truncated === true || input.content.length > 32000,
    goal_ids: [...new Set(input.goal_ids)] };
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
