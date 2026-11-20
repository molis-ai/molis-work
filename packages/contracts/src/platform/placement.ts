import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "./actions.js";
import { bindActionHandler, inputSchemaFor } from "./action-input.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import type { MaterialRef } from "./project-materials.js";
import type { TextRef } from "./ui-text.js";

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
 * A relation between an object and a target its owner keeps (a document's Goal, the work item that holds it), which placement lists, binds and
 * releases for the person (PG-032; 「挂到…」, specs/plugin-equal-standing/contract-design.md §2.2). Each action of the owner says which part it
 * plays with `placement_relation`; placement finds them in the directory by that declaration, never by a capability id, so the relation's
 * owner is whoever declares it. `target` is on the `list` role only: the subject kind of the other end and the noun a person reads it by
 * (`noun_text` when the owner's words have it, `noun` as written otherwise).
 */
export const PLACEMENT_RELATION_ROLES = ["list", "bind", "release", "candidates", "create"] as const;
export type PlacementRelationRole = (typeof PLACEMENT_RELATION_ROLES)[number];
export interface PlacementRelationTarget { readonly kind: string; readonly noun: string; readonly noun_text?: TextRef }
export interface PlacementRelationDeclaration {
  readonly relation: string;
  readonly role: PlacementRelationRole;
  readonly target?: PlacementRelationTarget;
}
export function isPlacementRelation(action: { placement_relation?: PlacementRelationDeclaration }, relation: string, role: PlacementRelationRole): boolean {
  return action.placement_relation?.relation === relation && action.placement_relation.role === role;
}

/**
 * The type names of a part in the platform's shape (`definePlacementRelationAction`), so placement can tell a part it may call with that
 * shape from a relation kept in another (a background task's `serves`, which the mainline service calls itself).
 */
export const PLACEMENT_RELATION_TYPE = /* @version type.molis.placement.relation "molis.placement.relation.v{version}" */ "molis.placement.relation.v1";
export const placementRelationType = (role: PlacementRelationRole, side: "input" | "output") => `${PLACEMENT_RELATION_TYPE}.${role}.${side}`;
export function isPlacementRelationPart(action: { input_type?: string; output_type?: string }, role: PlacementRelationRole): boolean {
  return action.input_type === placementRelationType(role, "input") && action.output_type === placementRelationType(role, "output");
}

/**
 * The parts of a relation as one shape for any relation and any owner (specs/work-mainline/contract-design.md §3): both ends are
 * `ActionSubject`s. `list` says what the object is related to now; `bind` and `release` add or take away one target; `candidates` are
 * the targets the person may pick, the current one first; `create` makes a new target named so and binds it. Each returns what the
 * object is related to after the call; `create` names the target it made first (or made before for the same `request_id`). A relation's owner declares its five parts with this, and placement finds them by
 * `placement_relation`, never by a capability id.
 */
export interface PlacementRelationSubjectInput { subject: ActionSubject }
export interface PlacementRelationTargetInput { subject: ActionSubject; target: ActionSubject }
/**
 * What the person had in hand when they related it, as the caller read it under the person's authority (placement reads the object
 * first): the owner may name the object by `title` and tell later whether it changed since (`revision`); `excerpt` is the start of its
 * content, for a target made from it. An owner that reads the object itself ignores it.
 */
export interface PlacementRelationRead { title: string; revision?: string; excerpt?: string }
export interface PlacementRelationBindInput extends PlacementRelationTargetInput {
  read?: PlacementRelationRead;
  /** `"live"` (default): follow the object as it changes; `"fixed"`: bind an immutable version (artifact or captured snapshot). */
  mode?: "live" | "fixed";
  /** For `"fixed"` binds of a project-folder file captured by the platform materials service: the exact snapshot ref. */
  material_ref?: MaterialRef;
}
/** `request_id`: the same request makes the same target again, so a retry after a cancel or a conflict adds none. */
export interface PlacementRelationCreateInput { subject: ActionSubject; name: string; request_id?: string; read?: PlacementRelationRead }
export interface PlacementRelationResult { targets: ActionSubject[] }
export interface PlacementRelationCandidates { targets: Array<{ subject: ActionSubject; current: boolean }> }
type RelationInput<R extends PlacementRelationRole> = R extends "bind" ? PlacementRelationBindInput : R extends "release" ? PlacementRelationTargetInput
  : R extends "create" ? PlacementRelationCreateInput : PlacementRelationSubjectInput;
type RelationOutput<R extends PlacementRelationRole> = R extends "candidates" ? PlacementRelationCandidates : PlacementRelationResult;
export const PLACEMENT_RELATION_LIMITS = { targets: 500, name: 120, title: 200, revision: 200, excerpt: 2000, request_id: 200 } as const;

/**
 * The shapes a relation part takes and returns, built when a part is defined: top-level schema objects that read the limits would stay
 * in every page bundle that imports this module, used or not.
 */
function relationMaterialRefSchema(): object {
  const version = { type: "object", properties: { artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } }, required: ["artifact_id", "version"], additionalProperties: false };
  return { type: "object", properties: {
    subject: { type: "object", properties: { kind: { type: "string", minLength: 1, maxLength: 200 }, id: { type: "string", minLength: 1, maxLength: 16_584 } }, required: ["kind", "id"], additionalProperties: false },
    pin: { oneOf: [
      { type: "object", properties: { mode: { const: "current" }, read_revision: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["mode", "read_revision"], additionalProperties: false },
      { type: "object", properties: { mode: { const: "fixed" }, version }, required: ["mode", "version"], additionalProperties: false },
      { type: "object", properties: { mode: { const: "snapshot" }, version }, required: ["mode", "version"], additionalProperties: false },
    ] },
    range: { type: "object", properties: { anchor: { type: "string", minLength: 1, maxLength: 200 }, line: { type: "integer", minimum: 1 }, length: { type: "integer", minimum: 1 }, page: { type: "integer", minimum: 1 } }, additionalProperties: false, minProperties: 1 },
  }, required: ["subject", "pin"], additionalProperties: false };
}

function relationInput(role: PlacementRelationRole): object {
  const read = { type: "object", properties: { title: { type: "string", maxLength: PLACEMENT_RELATION_LIMITS.title },
    revision: { type: "string", minLength: 1, maxLength: PLACEMENT_RELATION_LIMITS.revision }, excerpt: { type: "string", maxLength: PLACEMENT_RELATION_LIMITS.excerpt } },
  required: ["title"], additionalProperties: false };
  if (role === "release") return { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, target: ACTION_SUBJECT_SCHEMA }, required: ["subject", "target"], additionalProperties: false };
  if (role === "bind") return { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, target: ACTION_SUBJECT_SCHEMA, read, mode: { enum: ["live", "fixed"] }, material_ref: relationMaterialRefSchema() }, required: ["subject", "target"], additionalProperties: false };
  if (role === "create") return { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, name: { type: "string", minLength: 1, maxLength: PLACEMENT_RELATION_LIMITS.name },
    request_id: { type: "string", minLength: 1, maxLength: PLACEMENT_RELATION_LIMITS.request_id }, read }, required: ["subject", "name"], additionalProperties: false };
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
  target?: PlacementRelationTarget;
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
    input_type: placementRelationType(role, "input"), output_type: placementRelationType(role, "output"),
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
