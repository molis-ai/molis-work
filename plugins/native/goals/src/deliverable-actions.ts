import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ContextAccess, ContextEdge, ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ARTIFACTS_READ_PERMISSION, CONTEXT_LEDGER_WRITE_PERMISSION, goalAction, goalActor, usingServices } from "./action-contract.js";
import { text, identifier, boolean, array, object, nullable } from "@molis-ai/molis-work-contracts/modules/goal-actions";

/**
 * A version in the 成果库 a Goal hands in (specs/artifact-positioning A5), as callers see it. `proposed`: an assistant,
 * Coding, a workflow or MCP suggested it and the person has not confirmed it yet; it is not a deliverable until they do.
 */
export interface GoalDeliverable {
  goal_id: string;
  reference: ArtifactReference;
  title: string;
  artifact_type_id: string;
  recorded_at: string;
  proposed: boolean;
  /** Why it was proposed, in the proposer's words; null for confirmed deliverables. */
  reason: string | null;
}
/**
 * The two ways a Goal links an exact version in the 成果库: handing it in (`goal.output`) and taking it as an input
 * (`goal.input`, A4b). Both follow the same rules; each has its own proposal edge and error codes.
 */
interface LinkRole { readonly type: string; readonly proposal: string; readonly code: string; readonly noun: string; readonly item: string; readonly items: string }
const OUTPUT_ROLE: LinkRole = { type: "goal.output", proposal: "goal.output.proposal", code: "goals.deliverable", noun: "交付物", item: "deliverable", items: "deliverables" };
const INPUT_ROLE: LinkRole = { type: "goal.input", proposal: "goal.input.proposal", code: "goals.artifact_input", noun: "输入", item: "input", items: "inputs" };
const reference = object({ artifact_id: identifier, version: { type: "integer", minimum: 1 } });
const subject = object({ kind: identifier, id: identifier });
/** A link is written to the ledger and the version is read from its owner as the caller: both are asked of the caller's grants (see `usingServices`). */
const linking = <Input, Output>(definition: ActionDefinition<Input, Output>): ActionDefinition<Input, Output> =>
  usingServices(definition, [CONTEXT_LEDGER_WRITE_PERMISSION, ARTIFACTS_READ_PERMISSION]);
const reading = <Input, Output>(definition: ActionDefinition<Input, Output>): ActionDefinition<Input, Output> =>
  usingServices(definition, [ARTIFACTS_READ_PERMISSION]);
const deliverable = object({ goal_id: text, reference, title: text, artifact_type_id: text, recorded_at: text, proposed: boolean, reason: nullable(text) });
const reason = { type: "string", minLength: 1, maxLength: 300 };

/**
 * A Goal's deliverables are `goal.output` links in the context ledger, from the Goal to exact versions in the 成果库
 * (specs/artifact-positioning A5). Recording one neither copies nor changes the version; removing keeps it as history.
 * Only the person records deliverables; anyone else's call records a `goal.output.proposal` they confirm or turn down.
 */
export const goalsDeliverableActions = {
  add: linking(goalAction<{ goal_id: string; reference: ArtifactReference; reason?: string }, { deliverable: GoalDeliverable; replayed: boolean }>("goals.deliverables.add",
    "记下目标的交付物", "把成果库里的一版记为目标的交付物；不复制、不改动这一版，重复记录返回原记录。由助理、Coding、工作流或 MCP 调用时只记为提议（附理由），等用户在收尾时确认", "command",
    object({ goal_id: identifier, reference, reason }, ["goal_id", "reference"]), object({ deliverable, replayed: boolean }))),
  remove: linking(goalAction<{ goal_id: string; reference: ArtifactReference }, { removed: boolean }>("goals.deliverables.remove",
    "移除目标的交付物", "不再把这一版算作目标的交付物，或撤回、拒绝对它的提议；成果本身不受影响，记录保留为历史。只有用户能移除已确认的交付物", "command",
    object({ goal_id: identifier, reference }), object({ removed: boolean }))),
  list: reading(goalAction<{ goal_id: string }, { deliverables: GoalDeliverable[] }>("goals.deliverables.list",
    "目标的交付物", "列出目标交付的成果版本，以及还在等用户确认的提议（proposed）", "query", object({ goal_id: identifier }), object({ deliverables: array(deliverable) }))),
  pin: linking(goalAction<{ goal_id: string; subject: { kind: string; id: string }; reason?: string }, { deliverable: GoalDeliverable; replayed: boolean }>("goals.deliverables.pin",
    "固定并交付", "把一份资料（文档、问卷、演示稿、数据表）的当前内容固定为成果库里的一版，并记为目标的交付物；每次固定都是新的一版，原对象之后仍可修改。由助理等调用时只记为提议", "command",
    object({ goal_id: identifier, subject, reason }, ["goal_id", "subject"]), object({ deliverable, replayed: boolean }))),
  candidates: goalAction<{ goal_id: string }, { objects: Array<{ subject: { kind: string; id: string }; title: string }> }>("goals.deliverables.candidates",
    "可以当场固定的资料", "列出目标绑定的资料里，能当场固定为成果的那些", "query", object({ goal_id: identifier }), object({ objects: array(object({ subject, title: text })) })),
} as const;

/** A version in the 成果库 a Goal takes as an input (A4b, 「作为 Goal 的输入」); same rules as deliverables. */
export const goalsArtifactInputActions = {
  add: linking(goalAction<{ goal_id: string; reference: ArtifactReference; reason?: string }, { input: GoalDeliverable; replayed: boolean }>("goals.artifact_inputs.add",
    "把成果作为目标的输入", "把成果库里的一版记为目标的输入；不复制、不改动这一版，重复记录返回原记录。由助理、Coding、工作流或 MCP 调用时只记为提议（附理由），等用户确认", "command",
    object({ goal_id: identifier, reference, reason }, ["goal_id", "reference"]), object({ input: deliverable, replayed: boolean }))),
  remove: linking(goalAction<{ goal_id: string; reference: ArtifactReference }, { removed: boolean }>("goals.artifact_inputs.remove",
    "移除目标的成果输入", "不再把这一版算作目标的输入，或撤回、拒绝对它的提议；成果本身不受影响。只有用户能移除已确认的输入", "command",
    object({ goal_id: identifier, reference }), object({ removed: boolean }))),
  list: reading(goalAction<{ goal_id: string }, { inputs: GoalDeliverable[] }>("goals.artifact_inputs.list",
    "目标的成果输入", "列出目标作为输入的成果版本，以及还在等用户确认的提议（proposed）", "query", object({ goal_id: identifier }), object({ inputs: array(deliverable) }))),
  /** 「固定这一版」 when a Goal takes an object as input (one entry for both kinds, artifact-positioning 五.1). */
  pin: linking(goalAction<{ goal_id: string; subject: { kind: string; id: string }; reason?: string }, { input: GoalDeliverable; replayed: boolean }>("goals.artifact_inputs.pin",
    "固定这一版作为输入", "把一份资料（文档、问卷、演示稿、数据表）的当前内容固定为成果库里的一版，并记为目标的输入；目标认的是这一版，原对象之后仍可修改。由助理等调用时只记为提议", "command",
    object({ goal_id: identifier, subject, reason }, ["goal_id", "subject"]), object({ input: deliverable, replayed: boolean }))),
} as const;

/** What the 成果库 says of one version, as far as a deliverable shows it. */
export interface GoalArtifactHeader { title: string; artifact_type_id: string; availability: string; lifecycle_state: string }

export interface GoalDeliverablePorts {
  readonly projectId: string;
  /** Current directory membership; archived or trashed Goals are unavailable. */
  goalExists(goalId: string): boolean;
  /** A version in the 成果库 (never a process item); null when it is not there. Asked outside any database window: it may wait. */
  readArtifact(caller: ActionExecutionContext, reference: ArtifactReference): Promise<GoalArtifactHeader | null>;
  readonly ledger: ContextLedgerApi;
  /** Runs a synchronous body that only reads Goals' own rows and the ledger. */
  read<T>(body: () => T): T;
  /** Runs a synchronous body that writes, in the one transaction the caller's authority is asked for first (`beforeEffect`). */
  write<T>(caller: ActionExecutionContext, body: () => T): Promise<T>;
  /** Fixes the object's current revision through its owner, as a new version in the 成果库. */
  pin(caller: ActionExecutionContext, subject: { kind: string; id: string }): Promise<ArtifactReference>;
  /** The kinds of object some owner can pin for this caller. */
  pinnableKinds(caller: ActionExecutionContext): Promise<readonly string[]>;
  /** The Goal's confirmed bound materials (its input bindings). */
  boundObjects(goalId: string): ReadonlyArray<{ subject: { kind: string; id: string }; title: string }>;
}

export function createGoalsDeliverableActionHandlers(ports: GoalDeliverablePorts): ActionHandlerBinding[] {
  const access = (caller: ActionCallContext): ContextAccess => ({ actor_id: goalActor(caller).actor_id, scope: { kind: "personal", id: ports.projectId } });
  const active = (at: ContextAccess, key: string) => { const edge = ports.ledger.query.get(at, key); return edge?.state === "active" ? edge : null; };
  const requireGoal = (goalId: string) => { if (!ports.goalExists(goalId)) throw new ActionError("goals.not_found", "找不到这个目标"); };
  type Headers = ReadonlyMap<string, GoalArtifactHeader | null>;
  const headersOf = async (caller: ActionExecutionContext, references: readonly ArtifactReference[]): Promise<Headers> => new Map(await Promise.all(
    [...new Map(references.map(reference => [artifactSubjectId(reference), reference])).values()].map(async reference => [artifactSubjectId(reference), await ports.readArtifact(caller, reference)] as const)));
  const links = (role: LinkRole) => {
    const keyOf = (goalId: string, ref: ArtifactReference, type = role.type) => `${type}:${goalId}:${artifactSubjectId(ref)}`;
    const refOf = (edge: ContextEdge): ArtifactReference => ({ artifact_id: edge.target.id, version: edge.target.version! });
    const shown = (edge: ContextEdge) => (edge.type === role.type || edge.type === role.proposal) && edge.source.module === "goals" && edge.target.module === "artifacts" && edge.target.version != null;
    const view = (edge: ContextEdge, headers: Headers): GoalDeliverable | null => {
      if (!shown(edge)) return null;
      const ref = refOf(edge), artifact = headers.get(artifactSubjectId(ref)) ?? null, proposed = edge.type === role.proposal;
      return { goal_id: edge.source.id, reference: ref, title: artifact?.title ?? edge.target.id, artifact_type_id: artifact?.artifact_type_id ?? "", recorded_at: edge.recorded_at,
        proposed, reason: proposed && edge.cause !== `${role.code}_proposed` ? edge.cause : null };
    };
    const record = (caller: ActionCallContext, goalId: string, ref: ArtifactReference, reason: string | undefined, headers: Headers) => {
      const artifact = headers.get(artifactSubjectId(ref)) ?? null;
      if (!artifact) throw new ActionError(`${role.code}_missing`, "成果库里没有这一版");
      if (artifact.availability !== "available" || artifact.lifecycle_state !== "active") throw new ActionError(`${role.code}_unavailable`, `这一版已归档或不可用，不能作为${role.noun}`);
      const at = access(caller), linked = active(at, keyOf(goalId, ref));
      if (linked) return { [role.item]: view(linked, headers)!, replayed: true };
      // The person decides what a Goal used and delivered; everyone else proposes, and confirming retires the proposal.
      const type = caller.audience === "user" ? role.type : role.proposal, proposal = active(at, keyOf(goalId, ref, role.proposal));
      if (type === role.proposal && proposal) return { [role.item]: view(proposal, headers)!, replayed: true };
      const edge = ports.ledger.commands.put(at, { key: keyOf(goalId, ref, type), type, cause: type === role.type ? role.code : reason?.trim() || `${role.code}_proposed`,
        source: { module: "goals", id: goalId, version: null, scope: at.scope },
        target: { module: "artifacts", id: ref.artifact_id, version: ref.version, scope: at.scope } });
      if (type === role.type && proposal) ports.ledger.commands.remove(at, proposal.key, `${role.code}_confirmed`);
      return { [role.item]: view(edge, headers)!, replayed: false };
    };
    const remove = (caller: ActionCallContext, goalId: string, ref: ArtifactReference) => {
      const at = access(caller), linked = active(at, keyOf(goalId, ref)), proposal = active(at, keyOf(goalId, ref, role.proposal));
      // Others withdraw their proposals; only the person takes back a confirmed link or turns a proposal down.
      if (caller.audience !== "user" && linked && !proposal) throw new ActionError(`${role.code}_confirmed`, `已确认的${role.noun}只能由用户移除`);
      const removed = [caller.audience === "user" ? linked : null, proposal].filter((edge): edge is ContextEdge => edge !== null)
        .map(edge => ports.ledger.commands.remove(at, edge.key, edge.type === role.type ? `${role.code}_removed` : `${role.code}_declined`));
      return { removed: removed.some(Boolean) };
    };
    const edges = (caller: ActionCallContext, goalId: string) => [role.type, role.proposal].flatMap(type => ports.ledger.query.list(access(caller), { type }))
      .filter(edge => edge.state === "active" && edge.source.module === "goals" && edge.source.id === goalId && shown(edge));
    /** The listing's versions are only known once the edges are read, so their headers are asked after, outside the read. */
    const list = async (caller: ActionExecutionContext, goalId: string) => {
      const found = ports.read(() => { requireGoal(goalId); return edges(caller, goalId); });
      const headers = await headersOf(caller, found.map(refOf));
      return { [role.items]: found.map(edge => view(edge, headers)).filter((item): item is GoalDeliverable => item !== null) };
    };
    return { record, remove, list };
  };
  const outputs = links(OUTPUT_ROLE), inputs = links(INPUT_ROLE);
  type Ref = { goal_id: string; reference: ArtifactReference; reason?: string };
  type Pin = { goal_id: string; subject: { kind: string; id: string }; reason?: string };
  const bindLinks = (actions: Pick<typeof goalsArtifactInputActions | typeof goalsDeliverableActions, "add" | "remove" | "list">, role: ReturnType<typeof links>): ActionHandlerBinding[] => [
    { ...actions.add, handle: async (caller, input) => {
      const value = input as Ref;
      ports.read(() => requireGoal(value.goal_id));
      const headers = await headersOf(caller, [value.reference]);
      return ports.write(caller, () => { requireGoal(value.goal_id); return role.record(caller, value.goal_id, value.reference, value.reason, headers); });
    } },
    { ...actions.remove, handle: (caller, input) => { const value = input as Ref; return ports.write(caller, () => { requireGoal(value.goal_id); return role.remove(caller, value.goal_id, value.reference); }); } },
    { ...actions.list, handle: (caller, input) => role.list(caller, (input as { goal_id: string }).goal_id) },
  ];
  /** Fixing goes through the owner of the object (it may wait), and the link is written after, once the caller is still allowed to. */
  const bindPin = (action: typeof goalsDeliverableActions.pin | typeof goalsArtifactInputActions.pin, role: ReturnType<typeof links>): ActionHandlerBinding => ({ ...action, handle: async (caller, input) => {
    const value = input as Pin;
    ports.read(() => requireGoal(value.goal_id));
    const reference = await ports.pin(caller, value.subject);
    const headers = await headersOf(caller, [reference]);
    caller.assert_authority_current?.(); caller.signal?.throwIfAborted();
    return ports.write(caller, () => { requireGoal(value.goal_id); return role.record(caller, value.goal_id, reference, value.reason, headers); });
  } });
  return [
    ...bindLinks(goalsDeliverableActions, outputs),
    ...bindLinks(goalsArtifactInputActions, inputs),
    bindPin(goalsDeliverableActions.pin, outputs),
    bindPin(goalsArtifactInputActions.pin, inputs),
    { ...goalsDeliverableActions.candidates, handle: async (caller, input) => {
      const value = input as { goal_id: string };
      const bound = ports.read(() => { requireGoal(value.goal_id); return ports.boundObjects(value.goal_id); });
      const kinds = new Set(await ports.pinnableKinds(caller));
      return { objects: bound.filter(item => kinds.has(item.subject.kind)).map(item => ({ subject: item.subject, title: item.title })) };
    } },
  ];
}
