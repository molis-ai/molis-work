import type { AgentAnswerControl, AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { agentErrors } from "../errors.js";
import { childCallerTask } from "./prologue-session-opening.js";
import type { ChildOpeningFact } from "./prologue-session-index.js";
import type { Runtime, SubagentHandle, SubagentStartedObserver, ExactRef, ModelEvent, Session } from "@prologue/sdk";
import type {
  AgentFrozenSubagentRole,
  AgentRunRef,
  AgentSubagentAttemptSummary,
  AgentSubagentRetrySource,
  AgentSubagentView,
  AgentStartExecution,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { applyRunEvent, emptyPrologueStreamState } from "./prologue-stream.js";
import { subagentConversation } from "./prologue-subagent-conversation.js";
import { originalRunEvents } from "./prologue-original-inputs.js";
import type { PrologueRuntimePort } from "./prologue-ports.js";

export const SUBAGENT_DEFAULT_MAX_ATTEMPTS = 2;

export interface PrologueSubagentRoot {
  id: string;
  rootRef: ExactRef<"authorized-root">;
  path: string;
}

interface PrologueSubagentProvenance {
  path: string | null;
  roles: Array<[string, AgentFrozenSubagentRole]>;
  roots?: PrologueSubagentRoot[];
  errors?: Record<string, string>;
  child_openings?: ChildOpeningFact[];
  step_prefix?: string;
  budgets?: Record<string, { max_attempts: number }>;
  attempt_sources?: Record<string, AgentSubagentRetrySource>;
  attempt_reasons?: Record<string, string>;
  person_openings?: Record<string, string>;
  retry_openings?: Record<string, string>;
  nodes?: Record<string, string>;
}

export interface PrologueSubagentHooks {
  defaultMaxTurns?: number;
  readQuestion?(parent: AgentRunRef, child: SubagentHandle, id: string, revision: number): Promise<AgentPendingQuestion | null>;
  answerQuestion?(parent: AgentRunRef, child: SubagentHandle, answer: AgentAnswerControl): Promise<"delivered" | "queued">;
  extendBudget?(run: AgentRunRef, subagentId: string, addAttempts: number): Promise<void>;
  continueChild?(input: {
    parentRun: AgentRunRef;
    child: SubagentHandle;
    baseTask: string;
    reason?: string;
    source: AgentSubagentRetrySource;
    actorId: string;
    attemptNumber: number;
    requestKey: string;
    text?: string;
    queued?: string[];
    execution?: AgentStartExecution;
  }): Promise<AgentRunRef>;
}

const sameRoot = (a: ExactRef<"authorized-root">, b: ExactRef<"authorized-root">) => a.id === b.id && a.revision === b.revision;

export interface PrologueSubagentProjection {
  session: Session;
  attempts: { ref: ExactRef<"run">; events: readonly ModelEvent[] }[];
  view: AgentSubagentView;
  personOpenings?: Record<string, string>;
  retryOpenings?: Record<string, string>;
}

async function projectSubagentView(
  runtime: Runtime,
  run: AgentRunRef,
  child: SubagentHandle,
  provenance: PrologueSubagentProvenance,
  roles: ReadonlyMap<string, AgentFrozenSubagentRole>,
  defaultMaxTurns: number,
): Promise<PrologueSubagentProjection> {
  const session = await runtime.sessions.open(child.session);
  if (!session) throw new Error("子任务原始会话不可读取，不能当作空结果");
  const attemptRefs = child.attempts?.length ? child.attempts : [child.run];
  const attemptSummaries: AgentSubagentAttemptSummary[] = [];
  const attempts: PrologueSubagentProjection["attempts"] = [];
  let latestStream = emptyPrologueStreamState();

  for (const [idx, attemptRef] of attemptRefs.entries()) {
    const events = await originalRunEvents(session, attemptRef);
    attempts.push({ ref: attemptRef, events });
    const stream = emptyPrologueStreamState();
    for (const event of events) applyRunEvent(stream, event, null);
    if (idx === attemptRefs.length - 1) latestStream = stream;
    const terminalEvent = [...events].reverse().find(event => event.type === "completed" || event.type === "failed" || event.type === "cancelled");
    const state: AgentSubagentView["state"] = terminalEvent
      ? terminalEvent.type
      : idx === attemptRefs.length - 1
        ? child.state
        : "failed";
    const attemptSource = idx === 0 ? undefined : (provenance.attempt_sources?.[attemptRef.id] ?? "user-requested");
    const attemptReason = idx === 0 ? undefined : provenance.attempt_reasons?.[attemptRef.id];
    const attemptError = provenance.errors?.[attemptRef.id] ?? stream.stop_reason;
    attemptSummaries.push({
      attempt: idx + 1,
      run_id: attemptRef.id,
      state,
      ...(attemptSource ? { source: attemptSource } : {}),
      ...(attemptReason ? { reason: attemptReason } : {}),
      ...(stream.usage ? { usage: stream.usage } : {}),
      ...(attemptError ? { error: attemptError } : {}),
    });
  }

  const role = child.character ? roles.get(exactCharacterKey(child.character)) : undefined;
  if (!role) throw new Error("原子角色来源不可读取，不能猜测其权限与身份");
  const root = child.workspace && provenance.roots?.find(entry => entry.id === child.workspace!.id && sameRoot(entry.rootRef, child.workspace!.rootRef));
  if (child.workspace && !root || provenance.roots?.length && !root) throw new Error("子任务原目录来源不可读取，不能显示为主工作区");
  const firstRunRef = attemptRefs[0]!;
  const task = childCallerTask(provenance.child_openings ?? [], run.run_id, child.session, firstRunRef, attempts[0]!.events);
  const maxAttempts = Math.max(1, provenance.budgets?.[child.ref.id]?.max_attempts ?? SUBAGENT_DEFAULT_MAX_ATTEMPTS);
  const usedAttempts = attemptRefs.length;
  const latestRunId = attemptRefs[attemptRefs.length - 1]!.id;
  const latestRetrySource = usedAttempts > 1 ? (provenance.attempt_sources?.[latestRunId] ?? "user-requested") : undefined;
  const latestRetryReason = usedAttempts > 1 ? provenance.attempt_reasons?.[latestRunId] : undefined;
  const usedTokens = latestStream.usage
    ? (latestStream.usage.tokens.input ?? 0) + (latestStream.usage.tokens.output ?? 0)
    : undefined;
  const effectiveState = attemptSummaries.at(-1)?.state ?? child.state;
  const exhausted = usedAttempts >= maxAttempts && effectiveState !== "running" && effectiveState !== "completed";
  const rawNode = provenance.nodes?.[child.session.id];
  const nodeId = rawNode && provenance.step_prefix && rawNode.startsWith(`${provenance.step_prefix}.`)
    ? rawNode.slice(provenance.step_prefix.length + 1)
    : rawNode;

  const view: AgentSubagentView = {
    continuation_task: task === undefined ? { status: "unavailable" } : { status: "available", text: task },
    subagent_id: child.ref.id,
    parent_run: { ...run },
    child_run: { session_id: child.session.id, run_id: child.run.id },
    ...(nodeId ? { node_id: nodeId } : {}),
    role_id: role.role_id,
    role_version: role.version,
    execution: role.execution,
    role_name: role.name,
    task: task ?? "",
    state: effectiveState,
    result: latestStream.turns.filter(turn => turn.kind === "assistant").map(turn => turn.text).join("\n\n") || null,
    workspace_path: root?.path ?? provenance.path,
    activity: latestStream.activity,
    usage: latestStream.usage,
    host_tools: [...role.host_tools],
    budget: {
      attempt: usedAttempts,
      max_attempts: maxAttempts,
      max_turns: defaultMaxTurns,
      ...(usedTokens !== undefined ? { used_tokens: usedTokens } : {}),
      ...(exhausted ? { exhausted: true as const } : {}),
      ...(latestRetrySource ? { retry_source: latestRetrySource } : {}),
      ...(latestRetryReason ? { retry_reason: latestRetryReason } : {}),
      ...(attemptSummaries.length > 1 ? { prior_attempts: attemptSummaries.slice(0, -1) } : {}),
    },
    ...(provenance.errors?.[child.run.id] || latestStream.stop_reason ? { error: provenance.errors?.[child.run.id] ?? latestStream.stop_reason } : {}),
  };
  return { session, attempts, view, personOpenings: provenance.person_openings, retryOpenings: provenance.retry_openings };
}

/** SDK owns parent/child identity and the event ledger. This projects and governs subagent attempts and budgets (BL-051). */
export function createPrologueSubagents(
  runtime: Runtime,
  provenanceOf: (run: AgentRunRef) => Promise<PrologueSubagentProvenance>,
  hooks: PrologueSubagentHooks = {},
): NonNullable<PrologueRuntimePort["subagents"]> {
  const owned = (run: AgentRunRef) => runtime.subagents.list().filter(child => child.parentSession.id === run.session_id && child.parentRun.id === run.run_id);
  const defaultMaxTurns = hooks.defaultMaxTurns ?? 20;

  const childOf = (run: AgentRunRef, id: string) => {
    const child = owned(run).find(one => one.ref.id === id);
    if (!child) throw agentErrors.collaboration_unknown("子任务不属于这一轮执行");
    return child;
  };
  const project = async (run: AgentRunRef, child: SubagentHandle) => {
    const provenance = await provenanceOf(run);
    return projectSubagentView(runtime, run, child, provenance, new Map(provenance.roles), defaultMaxTurns);
  };
  const projectChildren = async (run: AgentRunRef, children: readonly SubagentHandle[]) => {
    const provenance = await provenanceOf(run), roles = new Map(provenance.roles);
    const result: AgentSubagentView[] = [];
    for (const child of children) {
      result.push((await projectSubagentView(runtime, run, child, provenance, roles, defaultMaxTurns)).view);
    }
    return result;
  };

  return {
    list: run => projectChildren(run, owned(run)),
    async listForRuns(parents, readParent) {
      const key = (sessionId: string, runId: string) => JSON.stringify([sessionId, runId]);
      const groups = new Map(parents.map(parent => [key(parent.session_id, parent.run_id), { parent, children: [] as SubagentHandle[] }]));
      for (const child of runtime.subagents.list()) {
        groups.get(key(child.parentSession.id, child.parentRun.id))?.children.push(child);
      }
      const views: AgentSubagentView[] = [];
      for (const { parent, children } of groups.values()) {
        if (!children.length) continue;
        await readParent(parent);
        views.push(...await projectChildren(parent, children));
      }
      return views;
    },
    sessionOf: (run, id) => childOf(run, id).session.id,
    resultCandidates: parentSessionIds => runtime.subagents.list().flatMap(child => {
      if (!parentSessionIds.has(child.parentSession.id)) return [];
      const parent_run = { session_id: child.parentSession.id, run_id: child.parentRun.id };
      const settled = ["completed", "failed", "cancelled"].includes(child.state);
      return (child.attempts ?? [child.run]).filter(attempt => settled || attempt.id !== child.run.id)
        .map(attempt => ({ parent_run, subagent_id: child.ref.id, attempt_run_id: attempt.id }));
    }),
    ...subagentConversation(runtime, childOf, project, hooks),
  };
}

/** Install the observer before dispatch, so unknown role references never reach a provider. */
export function verifySubagentStart(runtime: Runtime, roles: ReadonlyMap<string, AgentFrozenSubagentRole>, roots: readonly PrologueSubagentRoot[] = []): SubagentStartedObserver {
  return ({ parentSession, parentRun, childSession, run, workspace }) => {
    const child = runtime.subagents.list().find(child => child.parentSession.id === parentSession.id && child.parentRun.id === parentRun.id
      && child.session.id === childSession.ref.id && child.run.id === run.ref.id);
    const role = child?.character && roles.get(exactCharacterKey(child.character));
    // In the main workspace a child never writes files; one that runs commands (each a Host review) is allowed.
    const writesFiles = role?.host_tools.some(tool => tool === "write" || tool === "edit-file");
    if (!role || !roots.length && (role.execution === "text-edit" || writesFiles)) throw new Error("本轮没有授权这个子角色，未开始子任务模型请求");
    if (roots.length && (!workspace || !roots.some(root => root.id === workspace.id && sameRoot(root.rootRef, workspace.rootRef)))) throw new Error("本轮没有授权这个子目录，未开始子任务模型请求");
  };
}
export function exactCharacterKey(ref: ExactRef<"character">): string { return ref.id; }

/**
 * The runs above a subagent's run, nearest first, as the runtime's one register of dispatched children has them; empty for a run
 * nobody dispatched. A child is registered before its first model request (`verifySubagentStart` reads it there), so a request
 * always finds its parents. Bounded, so a malformed register cannot loop.
 */
export function runLineage(runtime: Runtime, runId: string, depth = 8): string[] {
  const lineage: string[] = [], children = runtime.subagents.list();
  for (let at = runId; lineage.length < depth;) {
    const child = children.find(one => one.run.id === at || one.attempts?.some(attempt => attempt.id === at));
    if (!child) break;
    lineage.push(at = child.parentRun.id);
  }
  return lineage;
}
