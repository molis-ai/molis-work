import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "./actions.js";
import { bindActionHandler, inputSchemaFor } from "./action-input.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import type { ItemAttachRelation } from "./item-intake.js";

/**
 * How a plugin lets the system move or copy one of its objects between locations (specs/archive/work-placement §7.1).
 * A location is a project partition; the personal space is the reserved project `personal`. The plugin keeps its own
 * store and rules; the system only calls these declared actions, with the person's own authority, in the object's
 * current project, and records the move or copy in its own ledger.
 */
export const PLACEMENT_MOVE_INPUT_TYPE = /* @version type.molis.placement.move.input "molis.placement.move.input.v{version}" */ "molis.placement.move.input.v1";
export const PLACEMENT_MOVE_OUTPUT_TYPE = /* @version type.molis.placement.move.output "molis.placement.move.output.v{version}" */ "molis.placement.move.output.v1";
export const PLACEMENT_COPY_INPUT_TYPE = /* @version type.molis.placement.copy.input "molis.placement.copy.input.v{version}" */ "molis.placement.copy.input.v1";
export const PLACEMENT_COPY_OUTPUT_TYPE = /* @version type.molis.placement.copy.output "molis.placement.copy.output.v{version}" */ "molis.placement.copy.output.v1";
/** The personal space is an ordinary project partition with this reserved identity. */
export const PERSONAL_SPACE_PROJECT_ID = "personal";

export interface PlacementMoveInput { subject: ActionSubject; to_project_id: string }
export interface PlacementCopyInput { subject: ActionSubject; to_project_id: string; request_id: string }
/** The object after the move (same identity) or the new copy, in its new partition, with the owner's revision. */
export interface PlacementResult { subject: ActionSubject; project_id: string; revision: string }

const projectId = { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$" } as const;
export const PLACEMENT_MOVE_INPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, to_project_id: projectId },
  required: ["subject", "to_project_id"], additionalProperties: false } as const;
export const PLACEMENT_COPY_INPUT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, to_project_id: projectId,
  request_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["subject", "to_project_id", "request_id"], additionalProperties: false } as const;
export const PLACEMENT_RESULT_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, project_id: projectId,
  revision: { type: "string", minLength: 1, maxLength: 200 } }, required: ["subject", "project_id", "revision"], additionalProperties: false };

/** Moving or copying changes who can read an object; only the person decides it, never an agent or a workflow. */
const metadata = (kinds: readonly string[], title: string, permissions: readonly string[], scope: "project" | "home" = "project") => ({
  title, kind: "operation" as const, scope, audiences: ["user" as const], permissions: [...permissions], subject_kinds: [...kinds],
});

/**
 * Move keeps the object's identity and every link to it; only where it belongs changes.
 * `project` (the default): the object lives in a project partition and the action runs there, moving it to another partition.
 * `home`: the plugin keeps its objects in the person's Home and records itself which project each belongs to (a todo list);
 * the action runs at Home and `to_project_id` is the new belonging — a project, or the personal space.
 */
export function defineObjectMoveAction(capabilityId: string, version: number, kinds: readonly string[], title: string, permissions: readonly string[],
  scope: "project" | "home" = "project"): ActionDefinition<PlacementMoveInput, PlacementResult> {
  return { capability_id: capabilityId, version: version, operation: "command", action: { ...metadata(kinds, title, permissions, scope),
    description: `把${title}移到另一个位置（个人空间或项目）；同一份内容，身份不变。`, effect: "write",
    input_type: PLACEMENT_MOVE_INPUT_TYPE, output_type: PLACEMENT_MOVE_OUTPUT_TYPE, input_schema: inputSchemaFor<PlacementMoveInput>()(PLACEMENT_MOVE_INPUT_SCHEMA), output_schema: PLACEMENT_RESULT_SCHEMA } };
}

/** Copy makes an independent object in the target partition; the same request_id always returns the same copy. */
export function defineObjectCopyAction(capabilityId: string, version: number, kinds: readonly string[], title: string, permissions: readonly string[]): ActionDefinition<PlacementCopyInput, PlacementResult> {
  return { capability_id: capabilityId, version: version, operation: "command", action: { ...metadata(kinds, title, permissions),
    description: `把${title}复制一份到另一个位置；之后两份互不影响。`, effect: "write",
    input_type: PLACEMENT_COPY_INPUT_TYPE, output_type: PLACEMENT_COPY_OUTPUT_TYPE, input_schema: inputSchemaFor<PlacementCopyInput>()(PLACEMENT_COPY_INPUT_SCHEMA), output_schema: PLACEMENT_RESULT_SCHEMA } };
}

export function isObjectMover(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === PLACEMENT_MOVE_INPUT_TYPE && action.output_type === PLACEMENT_MOVE_OUTPUT_TYPE;
}
export function isObjectCopier(action: { input_type?: string; output_type?: string }): boolean {
  return action.input_type === PLACEMENT_COPY_INPUT_TYPE && action.output_type === PLACEMENT_COPY_OUTPUT_TYPE;
}

/**
 * 「挂到…」 (batch 44 C1; specs/plugin-equal-standing/contract-design.md §2.2). An object is attached to a target another plugin keeps
 * (a document to a Goal; any plugin's object others hang theirs on). The owner declares the relation once, on the action that attaches
 * (`attach.relation` in item-intake); the parts it names speak these platform shapes, so placement names no plugin's fields.
 * - `bind`: the declaring action itself — attach it (what the person read, `read_revision`, goes with it so the owner can tell later
 *   whether the original changed).
 * - `list`: the targets one object is attached to now, by binding.
 * - `release`: take one binding off; the object itself is unchanged.
 * - `candidates`: the targets it can be attached to here, by page.
 * - `create`: make a new target from content (「建成…」), saying where the content came from.
 */
export const PLACEMENT_ATTACH_PARTS = ["bind", "list", "release", "candidates", "create"] as const;
export type PlacementAttachPart = (typeof PLACEMENT_ATTACH_PARTS)[number];
export const PLACEMENT_ATTACH_TYPE = /* @version type.molis.placement.attach "molis.placement.attach.v{version}" */ "molis.placement.attach.v1";
export interface PlacementAttachBinding { binding_id: string; target_id: string; created_at: string }
export interface PlacementAttachTarget { id: string; title: string }
export interface PlacementAttachParts {
  list: { input: { subject: ActionSubject }; output: { bindings: PlacementAttachBinding[] } };
  bind: { input: { target_id: string; subject: ActionSubject; title: string; read_revision?: string }; output: { binding: { binding_id: string } } };
  release: { input: { target_id: string; binding_id: string }; output: { released: boolean } };
  candidates: { input: { limit?: number; after_cursor?: string }; output: { targets: PlacementAttachTarget[]; next_cursor: string | null } };
  create: { input: { title: string; body: string; source: string; idempotency_key: string }; output: { target: { id: string } } };
}
const attachId = { type: "string", minLength: 1, maxLength: 200 } as const;
const attachObject = (properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)) =>
  ({ type: "object", properties, required: [...required], additionalProperties: false }) as const;
/** Each part's input and output schema; a plugin declares them as they are (the SDK compares). */
export const PLACEMENT_ATTACH_SCHEMAS: { readonly [P in PlacementAttachPart]: { readonly input: Record<string, unknown>; readonly output: Record<string, unknown> } } = {
  list: { input: attachObject({ subject: ACTION_SUBJECT_SCHEMA }),
    output: attachObject({ bindings: { type: "array", maxItems: 500, items: attachObject({ binding_id: attachId, target_id: attachId, created_at: { type: "string", minLength: 1, maxLength: 40 } }) } }) },
  bind: { input: attachObject({ target_id: attachId, subject: ACTION_SUBJECT_SCHEMA, title: { type: "string", minLength: 1, maxLength: 200 }, read_revision: attachId }, ["target_id", "subject", "title"]),
    output: attachObject({ binding: attachObject({ binding_id: attachId }) }) },
  release: { input: attachObject({ target_id: attachId, binding_id: attachId }), output: attachObject({ released: { type: "boolean" } }) },
  candidates: { input: attachObject({ limit: { type: "integer", minimum: 1, maximum: 100 }, after_cursor: { type: "string", minLength: 1, maxLength: 400 } }, []),
    output: attachObject({ targets: { type: "array", maxItems: 100, items: attachObject({ id: attachId, title: { type: "string", maxLength: 1000 } }) },
      next_cursor: { type: ["string", "null"], maxLength: 400 } }) },
  create: { input: attachObject({ title: { type: "string", minLength: 1, maxLength: 200 }, body: { type: "string", maxLength: 400000 }, source: { type: "string", maxLength: 400 },
    idempotency_key: attachId }), output: attachObject({ target: attachObject({ id: attachId }) }) },
};
/** Reading parts are queries; the others write. */
export const PLACEMENT_ATTACH_OPERATION: { readonly [P in PlacementAttachPart]: "query" | "command" } = { list: "query", candidates: "query", bind: "command", release: "command", create: "command" };
const ATTACH_WORDS: Record<PlacementAttachPart, string> = {
  list: "读取一个对象此刻挂在哪些对象上；只读。", bind: "把一个对象挂到这里的一个对象上；不复制、不移动原对象，重复挂接返回原记录。",
  release: "取下一条挂接；原对象不变。", candidates: "列出这里可以挂接的对象，按页读取。", create: "用一段内容新建一个可挂接的对象，并记下内容的来处。",
};
export const placementAttachType = (part: PlacementAttachPart, side: "input" | "output") => `${PLACEMENT_ATTACH_TYPE}.${part}.${side}`;
/** Whether an action is in the platform's shape for `part` of a 「挂到…」 relation (by its input and output types). */
export function isAttachRelationPart(action: { input_type?: string; output_type?: string }, part: PlacementAttachPart): boolean {
  return action.input_type === placementAttachType(part, "input") && action.output_type === placementAttachType(part, "output");
}

/** The words of the attach a relation is declared on: what the person reads in 「挂到…」 and the noun of the other end. */
export interface AttachRelationWords {
  readonly attach_id: string;
  readonly item_kind: string;
  readonly title: string;
  readonly verb: string;
  readonly describe: string;
  readonly relation: ItemAttachRelation;
}

/**
 * One part of an owner's 「挂到…」 relation, in the platform's shape. `bind` takes the relation's words (`attach`): the attach it
 * declares names the other parts. The person attaches; agents use the owner's own actions.
 */
export function defineAttachRelationAction<P extends PlacementAttachPart>(part: P, capabilityId: string, version: number, kinds: readonly string[], title: string,
  permissions: readonly string[], ...attach: P extends "bind" ? [AttachRelationWords] : []): ActionDefinition<PlacementAttachParts[P]["input"], PlacementAttachParts[P]["output"]> {
  const reads = PLACEMENT_ATTACH_OPERATION[part] === "query", words = attach[0];
  return { capability_id: capabilityId, version, operation: PLACEMENT_ATTACH_OPERATION[part], action: { title, description: ATTACH_WORDS[part],
    kind: reads ? "query" : "operation", scope: "project", effect: reads ? "read" : "write", audiences: ["user"], permissions: [...permissions], subject_kinds: [...kinds],
    ...(words ? { attach: { attach_id: words.attach_id, item_kind: words.item_kind, title: words.title, verb: words.verb, describe: words.describe,
      accepts: [{ kind: "object" as const }], relation: words.relation } } : {}),
    input_type: placementAttachType(part, "input"), output_type: placementAttachType(part, "output"),
    input_schema: PLACEMENT_ATTACH_SCHEMAS[part].input, output_schema: PLACEMENT_ATTACH_SCHEMAS[part].output } } as ActionDefinition<PlacementAttachParts[P]["input"], PlacementAttachParts[P]["output"]>;
}

/**
 * The parts of a relation as one shape for any relation and any owner (specs/work-mainline/contract-design.md §3): both ends are
 * `ActionSubject`s. `list` says what the object is related to now; `bind` and `release` add or take away one target; `candidates` are
 * the targets the person may pick, the current one first; `create` makes a new target named so and binds it. Each returns what the
 * object is related to after the call. A relation's owner declares its five parts with this, and placement finds them by
 * `placement_relation`, never by a capability id.
 */
export interface PlacementRelationSubjectInput { subject: ActionSubject }
export interface PlacementRelationTargetInput { subject: ActionSubject; target: ActionSubject }
export interface PlacementRelationCreateInput { subject: ActionSubject; name: string }
export interface PlacementRelationResult { targets: ActionSubject[] }
export interface PlacementRelationCandidates { targets: Array<{ subject: ActionSubject; current: boolean }> }
type RelationInput<R extends PlacementRelationRole> = R extends "bind" | "release" ? PlacementRelationTargetInput : R extends "create" ? PlacementRelationCreateInput : PlacementRelationSubjectInput;
type RelationOutput<R extends PlacementRelationRole> = R extends "candidates" ? PlacementRelationCandidates : PlacementRelationResult;
export const PLACEMENT_RELATION_LIMITS = { targets: 500, name: 120 } as const;

/**
 * The shapes a relation part takes and returns, built when a part is defined: top-level schema objects that read the limits would stay
 * in every page bundle that imports this module, used or not.
 */
function relationInput(role: PlacementRelationRole): object {
  if (role === "bind" || role === "release") return { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, target: ACTION_SUBJECT_SCHEMA }, required: ["subject", "target"], additionalProperties: false };
  if (role === "create") return { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, name: { type: "string", minLength: 1, maxLength: PLACEMENT_RELATION_LIMITS.name } },
    required: ["subject", "name"], additionalProperties: false };
  return { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA }, required: ["subject"], additionalProperties: false };
}
function relationOutput(role: PlacementRelationRole): object {
  const item = role === "candidates" ? { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, current: { type: "boolean" } }, required: ["subject", "current"], additionalProperties: false }
    : ACTION_SUBJECT_SCHEMA;
  return { type: "object", properties: { targets: { type: "array", maxItems: PLACEMENT_RELATION_LIMITS.targets, items: item } }, required: ["targets"], additionalProperties: false };
}

export interface PlacementRelationOptions {
  /** The kinds of object it relates; empty when any object the caller can read may be related. */
  kinds: readonly string[];
  title: string;
  description: string;
  permissions: readonly string[];
  /** The other end, on the `list` part only: its subject kind and the noun a person reads it by. */
  target?: { kind: string; noun: string };
  audiences?: readonly ("user" | "agent" | "workflow" | "mcp")[];
}

export function definePlacementRelationAction<R extends PlacementRelationRole>(relation: string, role: R, capabilityId: string, version: number,
  options: PlacementRelationOptions): ActionDefinition<RelationInput<R>, RelationOutput<R>> {
  const reads = role === "list" || role === "candidates";
  if (role === "list" && !options.target) throw new ActionError("actions.definition_invalid", "关联的 list 一步要写明另一端是什么");
  return { capability_id: capabilityId, version, operation: reads ? "query" : "command", action: { title: options.title, description: options.description,
    kind: reads ? "query" : "operation", scope: "project", scheduling: "concurrent", effect: reads ? "read" : "write",
    audiences: [...options.audiences ?? (reads ? ["user", "agent", "workflow", "mcp"] : ["user", "agent", "mcp"])], permissions: [...options.permissions], subject_kinds: [...options.kinds],
    placement_relation: { relation, role, ...(role === "list" ? { target: options.target! } : {}) },
    input_schema: inputSchemaFor<RelationInput<R>>()(relationInput(role) as never), output_schema: relationOutput(role) } } as ActionDefinition<RelationInput<R>, RelationOutput<R>>;
}

/** The source partition is the caller's project; moving to where it already is has nothing to do. */
export function placementSourceProject(caller: ActionCallContext, to: string): string {
  if (!caller.project_id) throw new ActionError("actions.project_required", "请在对象所在的位置里移动或复制");
  if (caller.project_id === to) throw new ActionError("placement.same_location", "它已经在这个位置");
  return caller.project_id;
}

export function bindObjectMoveHandler(definition: ActionDefinition<PlacementMoveInput, PlacementResult>,
  move: (input: PlacementMoveInput & { from_project_id: string }, caller: ActionExecutionContext) => PlacementResult | Promise<PlacementResult>): ActionHandlerBinding {
  return bindActionHandler(definition, (input, caller) => move({ ...input, from_project_id: placementSourceProject(caller, input.to_project_id) }, caller));
}

/** A Home-scoped mover (see defineObjectMoveAction): the plugin knows where the object belongs now; `to_project_id` is where it goes. */
export function bindHomeObjectMoveHandler(definition: ActionDefinition<PlacementMoveInput, PlacementResult>,
  move: (input: PlacementMoveInput, caller: ActionExecutionContext) => PlacementResult | Promise<PlacementResult>): ActionHandlerBinding {
  if (definition.action.scope !== "home") throw new ActionError("actions.definition_invalid", "Home 作用域的移动处理只能绑定 Home 作用域的放置动作");
  return bindActionHandler(definition, move);
}

export function bindObjectCopyHandler(definition: ActionDefinition<PlacementCopyInput, PlacementResult>,
  copy: (input: PlacementCopyInput & { from_project_id: string }, caller: ActionExecutionContext) => PlacementResult | Promise<PlacementResult>): ActionHandlerBinding {
  return bindActionHandler(definition, (input, caller) => {
    if (!caller.project_id) throw new ActionError("actions.project_required", "请在对象所在的位置里复制");
    return copy({ ...input, from_project_id: caller.project_id }, caller);
  });
}
