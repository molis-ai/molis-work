import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "./actions.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";

/**
 * How a plugin lets the system move or copy one of its objects between locations (specs/work-placement §7.1).
 * A location is a project partition; the personal space is the reserved project `personal`. The plugin keeps its own
 * store and rules; the system only calls these declared actions, with the person's own authority, in the object's
 * current project, and records the move or copy in its own ledger.
 */
export const PLACEMENT_MOVE_INPUT_TYPE = "molis.placement.move.input.v1";
export const PLACEMENT_MOVE_OUTPUT_TYPE = "molis.placement.move.output.v1";
export const PLACEMENT_COPY_INPUT_TYPE = "molis.placement.copy.input.v1";
export const PLACEMENT_COPY_OUTPUT_TYPE = "molis.placement.copy.output.v1";
/** The personal space is an ordinary project partition with this reserved identity. */
export const PERSONAL_SPACE_PROJECT_ID = "personal";

export interface PlacementMoveInput { subject: ActionSubject; to_project_id: string }
export interface PlacementCopyInput { subject: ActionSubject; to_project_id: string; request_id: string }
/** The object after the move (same identity) or the new copy, in its new partition, with the owner's revision. */
export interface PlacementResult { subject: ActionSubject; project_id: string; revision: string }

const projectId = { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$" };
export const PLACEMENT_MOVE_INPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, to_project_id: projectId },
  required: ["subject", "to_project_id"], additionalProperties: false };
export const PLACEMENT_COPY_INPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, to_project_id: projectId,
  request_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["subject", "to_project_id", "request_id"], additionalProperties: false };
export const PLACEMENT_RESULT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, project_id: projectId,
  revision: { type: "string", minLength: 1, maxLength: 200 } }, required: ["subject", "project_id", "revision"], additionalProperties: false };

/** Moving or copying changes who can read an object; only the person decides it, never an agent or a workflow. */
const metadata = (kinds: readonly string[], title: string, permissions: readonly string[]) => ({
  title, kind: "operation" as const, scope: "project" as const, audiences: ["user" as const], permissions: [...permissions], subject_kinds: [...kinds],
});

/** Move keeps the object's identity and every link to it; only its partition changes. */
export function defineObjectMoveAction(capabilityId: string, kinds: readonly string[], title: string, permissions: readonly string[]): ActionDefinition<PlacementMoveInput, PlacementResult> {
  return { capability_id: capabilityId, version: 1, operation: "command", action: { ...metadata(kinds, title, permissions),
    description: `把${title}移到另一个位置（个人空间或项目）；同一份内容，身份不变。`, effect: "write",
    input_type: PLACEMENT_MOVE_INPUT_TYPE, output_type: PLACEMENT_MOVE_OUTPUT_TYPE, input_schema: PLACEMENT_MOVE_INPUT_SCHEMA, output_schema: PLACEMENT_RESULT_SCHEMA } };
}

/** Copy makes an independent object in the target partition; the same request_id always returns the same copy. */
export function defineObjectCopyAction(capabilityId: string, kinds: readonly string[], title: string, permissions: readonly string[]): ActionDefinition<PlacementCopyInput, PlacementResult> {
  return { capability_id: capabilityId, version: 1, operation: "command", action: { ...metadata(kinds, title, permissions),
    description: `把${title}复制一份到另一个位置；之后两份互不影响。`, effect: "write",
    input_type: PLACEMENT_COPY_INPUT_TYPE, output_type: PLACEMENT_COPY_OUTPUT_TYPE, input_schema: PLACEMENT_COPY_INPUT_SCHEMA, output_schema: PLACEMENT_RESULT_SCHEMA } };
}

export function isObjectMover(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === PLACEMENT_MOVE_INPUT_TYPE && action.output_type === PLACEMENT_MOVE_OUTPUT_TYPE;
}
export function isObjectCopier(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === PLACEMENT_COPY_INPUT_TYPE && action.output_type === PLACEMENT_COPY_OUTPUT_TYPE;
}

/** The source partition is the caller's project; moving to where it already is has nothing to do. */
export function placementSourceProject(caller: ActionCallContext, to: string): string {
  if (!caller.project_id) throw new ActionError("actions.project_required", "请在对象所在的位置里移动或复制");
  if (caller.project_id === to) throw new ActionError("placement.same_location", "它已经在这个位置");
  return caller.project_id;
}

export function bindObjectMoveHandler(definition: ActionDefinition<PlacementMoveInput, PlacementResult>,
  move: (input: PlacementMoveInput & { from_project_id: string }, caller: ActionCallContext) => PlacementResult | Promise<PlacementResult>): ActionHandlerBinding {
  return { capability_id: definition.capability_id, version: definition.version,
    handle: (caller, input) => { const value = input as PlacementMoveInput; return move({ ...value, from_project_id: placementSourceProject(caller, value.to_project_id) }, caller); } };
}

export function bindObjectCopyHandler(definition: ActionDefinition<PlacementCopyInput, PlacementResult>,
  copy: (input: PlacementCopyInput & { from_project_id: string }, caller: ActionCallContext) => PlacementResult | Promise<PlacementResult>): ActionHandlerBinding {
  return { capability_id: definition.capability_id, version: definition.version,
    handle: (caller, input) => {
      const value = input as PlacementCopyInput;
      if (!caller.project_id) throw new ActionError("actions.project_required", "请在对象所在的位置里复制");
      return copy({ ...value, from_project_id: caller.project_id }, caller);
    } };
}

/** Manifest-level check shared by inspectActionDeclarations. Returns problems, never throws. */
export function placementDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  const mover = isObjectMover(action as { input_type?: string; output_type?: string });
  const copier = isObjectCopier(action as { input_type?: string; output_type?: string });
  const mentions = [PLACEMENT_MOVE_INPUT_TYPE, PLACEMENT_MOVE_OUTPUT_TYPE, PLACEMENT_COPY_INPUT_TYPE, PLACEMENT_COPY_OUTPUT_TYPE]
    .some(type => action.input_type === type || action.output_type === type);
  if (!mentions) return [];
  const schema = mover ? PLACEMENT_MOVE_INPUT_SCHEMA : copier ? PLACEMENT_COPY_INPUT_SCHEMA : null;
  const audiences = Array.isArray(action.audiences) ? action.audiences as unknown[] : [];
  const kinds = Array.isArray(action.subject_kinds) ? action.subject_kinds as unknown[] : [];
  if (!schema || operation !== "command" || action.kind !== "operation" || action.scope !== "project" || kinds.length === 0
    || audiences.length !== 1 || audiences[0] !== "user"
    || canonical(action.input_schema) !== canonical(schema) || canonical(action.output_schema) !== canonical(PLACEMENT_RESULT_SCHEMA)) {
    return [`能力 ${key} 没有兑现放置协议 v1：需要规范输入输出、项目作用域、只对本机用户开放的操作，以及对象种类`];
  }
  return [];
}
