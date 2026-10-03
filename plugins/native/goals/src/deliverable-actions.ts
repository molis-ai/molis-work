import { ActionError, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ContextAccess, ContextEdge, ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { goalAction, goalActor } from "./action-contract.js";
import { text, identifier, boolean, array, object } from "./event-action-schemas.js";

/** A version in the 成果库 a Goal hands in (specs/artifact-positioning A5), as callers see it. */
export interface GoalDeliverable {
  goal_id: string;
  reference: ArtifactReference;
  title: string;
  artifact_type_id: string;
  recorded_at: string;
}
const reference = object({ artifact_id: identifier, version: { type: "integer", minimum: 1 } });
const subject = object({ kind: identifier, id: identifier });
const deliverable = object({ goal_id: text, reference, title: text, artifact_type_id: text, recorded_at: text });

/**
 * A Goal's deliverables are `goal.output` links in the context ledger, from the Goal to exact versions in the 成果库
 * (specs/artifact-positioning A5). Recording one neither copies nor changes the version; removing keeps it as history.
 */
export const goalsDeliverableActions = {
  add: goalAction<{ goal_id: string; reference: ArtifactReference }, { deliverable: GoalDeliverable; replayed: boolean }>("goals.deliverables.add",
    "记下目标的交付物", "把成果库里的一版记为目标的交付物；不复制、不改动这一版，重复记录返回原记录", "command",
    object({ goal_id: identifier, reference }), object({ deliverable, replayed: boolean })),
  remove: goalAction<{ goal_id: string; reference: ArtifactReference }, { removed: boolean }>("goals.deliverables.remove",
    "移除目标的交付物", "不再把这一版算作目标的交付物；成果本身不受影响，记录保留为历史", "command",
    object({ goal_id: identifier, reference }), object({ removed: boolean })),
  list: goalAction<{ goal_id: string }, { deliverables: GoalDeliverable[] }>("goals.deliverables.list",
    "目标的交付物", "列出目标交付的成果版本", "query", object({ goal_id: identifier }), object({ deliverables: array(deliverable) })),
  pin: goalAction<{ goal_id: string; subject: { kind: string; id: string } }, { deliverable: GoalDeliverable; replayed: boolean }>("goals.deliverables.pin",
    "固定并交付", "把一份资料（文档、问卷、演示稿、数据表）的当前内容固定为成果库里的一版，并记为目标的交付物；每次固定都是新的一版，原对象之后仍可修改", "command",
    object({ goal_id: identifier, subject }), object({ deliverable, replayed: boolean })),
  candidates: goalAction<{ goal_id: string }, { objects: Array<{ subject: { kind: string; id: string }; title: string }> }>("goals.deliverables.candidates",
    "可以当场固定的资料", "列出目标绑定的资料里，能当场固定为成果的那些", "query", object({ goal_id: identifier }), object({ objects: array(object({ subject, title: text })) })),
} as const;

export interface GoalDeliverablePorts {
  readonly boardId: string;
  goalExists(goalId: string): boolean;
  /** A version in the 成果库 (never a process item); null when it is not there. */
  readArtifact(reference: ArtifactReference): { title: string; artifact_type_id: string; availability: string; lifecycle_state: string } | null;
  readonly ledger: ContextLedgerApi;
  /** Fixes the object's current revision through its owner, as a new version in the 成果库. */
  pin(caller: ActionCallContext, subject: { kind: string; id: string }): Promise<ArtifactReference>;
  /** The kinds of object some owner can pin for this caller. */
  pinnableKinds(caller: ActionCallContext): Promise<readonly string[]>;
  /** The Goal's confirmed bound materials (its input bindings). */
  boundObjects(goalId: string): ReadonlyArray<{ subject: { kind: string; id: string }; title: string }>;
}

export function createGoalsDeliverableActionHandlers(ports: GoalDeliverablePorts): ActionHandlerBinding[] {
  const access = (caller: ActionCallContext): ContextAccess => ({ actor_id: goalActor(caller).actor_id, scope: { kind: "personal", id: ports.boardId } });
  const keyOf = (goalId: string, ref: ArtifactReference) => `goal.output:${goalId}:${artifactSubjectId(ref)}`;
  const view = (edge: ContextEdge): GoalDeliverable | null => {
    if (edge.type !== "goal.output" || edge.source.module !== "goals" || edge.target.module !== "artifacts" || edge.target.version == null) return null;
    const ref = { artifact_id: edge.target.id, version: edge.target.version };
    const artifact = ports.readArtifact(ref);
    return { goal_id: edge.source.id, reference: ref, title: artifact?.title ?? edge.target.id, artifact_type_id: artifact?.artifact_type_id ?? "", recorded_at: edge.recorded_at };
  };
  const requireGoal = (goalId: string) => { if (!ports.goalExists(goalId)) throw new ActionError("goals.not_found", "找不到这个目标"); };
  const deliver = (caller: ActionCallContext, goalId: string, ref: ArtifactReference) => {
    const artifact = ports.readArtifact(ref);
    if (!artifact) throw new ActionError("goals.deliverable_missing", "成果库里没有这一版");
    if (artifact.availability !== "available" || artifact.lifecycle_state !== "active") throw new ActionError("goals.deliverable_unavailable", "这一版已归档或不可用，不能作为交付物");
    const key = keyOf(goalId, ref), at = access(caller);
    const existing = ports.ledger.query.get(at, key);
    if (existing?.state === "active") return { deliverable: view(existing)!, replayed: true };
    const edge = ports.ledger.commands.put(at, { key, type: "goal.output", cause: "goals.deliverable",
      source: { module: "goals", id: goalId, version: null, scope: at.scope },
      target: { module: "artifacts", id: ref.artifact_id, version: ref.version, scope: at.scope } });
    return { deliverable: view(edge)!, replayed: false };
  };
  return [
    { ...goalsDeliverableActions.add, handle: (caller, input) => {
      const value = input as { goal_id: string; reference: ArtifactReference };
      requireGoal(value.goal_id);
      return deliver(caller, value.goal_id, value.reference);
    } },
    { ...goalsDeliverableActions.pin, handle: async (caller, input) => {
      const value = input as { goal_id: string; subject: { kind: string; id: string } };
      requireGoal(value.goal_id);
      return deliver(caller, value.goal_id, await ports.pin(caller, value.subject));
    } },
    { ...goalsDeliverableActions.candidates, handle: async (caller, input) => {
      const value = input as { goal_id: string };
      requireGoal(value.goal_id);
      const kinds = new Set(await ports.pinnableKinds(caller));
      return { objects: ports.boundObjects(value.goal_id).filter(item => kinds.has(item.subject.kind)).map(item => ({ subject: item.subject, title: item.title })) };
    } },
    { ...goalsDeliverableActions.remove, handle: (caller, input) => {
      const value = input as { goal_id: string; reference: ArtifactReference };
      requireGoal(value.goal_id);
      const at = access(caller), key = keyOf(value.goal_id, value.reference);
      if (ports.ledger.query.get(at, key)?.state !== "active") return { removed: false };
      return { removed: Boolean(ports.ledger.commands.remove(at, key, "goals.deliverable_removed")) };
    } },
    { ...goalsDeliverableActions.list, handle: (caller, input) => {
      const value = input as { goal_id: string };
      requireGoal(value.goal_id);
      return { deliverables: ports.ledger.query.list(access(caller), { type: "goal.output" })
        .filter(edge => edge.state === "active" && edge.source.module === "goals" && edge.source.id === value.goal_id)
        .map(view).filter((item): item is GoalDeliverable => item !== null) };
    } },
  ];
}
