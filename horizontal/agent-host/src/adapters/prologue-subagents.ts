import { agentErrors } from "../errors.js";
import { childCallerTask } from "./prologue-session-opening.js";
import type { ChildOpeningFact } from "./prologue-session-index.js";
import type { Runtime, SubagentHandle, SubagentStartedObserver, ExactRef } from "@prologue/sdk";
import type {
  AgentFrozenSubagentRole,
  AgentRunRef,
  AgentSubagentAttemptSummary,
  AgentSubagentRetrySource,
  AgentSubagentsCapability,
  AgentSubagentView,
  AgentStartExecution,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { applyRunEvent, emptyPrologueStreamState } from "./prologue-stream.js";
import { subagentConversation } from "./prologue-subagent-conversation.js";
import { originalRunEvents } from "./prologue-original-inputs.js";

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
  nodes?: Record<string, string>;
}

export interface PrologueSubagentHooks {
  defaultMaxTurns?: number;
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
    execution?: AgentStartExecution;
  }): Promise<AgentRunRef>;
}

const sameRoot = (a: ExactRef<"authorized-root">, b: ExactRef<"authorized-root">) => a.id === b.id && a.revision === b.revision;

async function projectSubagentView(
  runtime: Runtime,
  run: AgentRunRef,
  child: SubagentHandle,
  provenance: PrologueSubagentProvenance,
  roles: ReadonlyMap<string, AgentFrozenSubagentRole>,
  defaultMaxTurns: number,
): Promise<AgentSubagentView> {
  const session = await runtime.sessions.open(child.session);
  if (!session) throw new Error("子任务原始会话不可读取，不能当作空结果");
  const attemptRefs = child.attempts?.length ? child.attempts : [child.run];
  const attemptSummaries: AgentSubagentAttemptSummary[] = [];
  let firstAttemptEvents: Awaited<ReturnType<typeof session.replay>> | undefined;
  let latestStream = emptyPrologueStreamState();

  for (const [idx, attemptRef] of attemptRefs.entries()) {
    const events = await originalRunEvents(session, attemptRef);
    if (idx === 0) firstAttemptEvents = events;
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
  const task = firstAttemptEvents
    ? childCallerTask(provenance.child_openings ?? [], run.run_id, child.session, firstRunRef, firstAttemptEvents)
    : undefined;
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

  return {
    continuation_task: task === undefined ? { status: "unavailable" } : { status: "available", text: task },
    subagent_id: child.ref.id,
    parent_run: { ...run },
    child_run: { session_id: child.session.id, run_id: child.run.id },
    ...(nodeId ? { node_id: nodeId } : {}),
    role_id: role.role_id,
    role_name: role.name,
    task: latestStream.turns.filter(turn => turn.kind === "user" && !turn.steer).map(turn => turn.text).join("\n\n"),
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
}

/** SDK owns parent/child identity and the event ledger. This projects and governs subagent attempts and budgets (BL-051). */
export function createPrologueSubagents(
  runtime: Runtime,
  provenanceOf: (run: AgentRunRef) => Promise<PrologueSubagentProvenance>,
  hooks: PrologueSubagentHooks = {},
): AgentSubagentsCapability {
  const owned = (run: AgentRunRef) => runtime.subagents.list().filter(child => child.parentSession.id === run.session_id && child.parentRun.id === run.run_id);
  const defaultMaxTurns = hooks.defaultMaxTurns ?? 20;

  const list: AgentSubagentsCapability["list"] = async run => {
    const provenance = await provenanceOf(run), roles = new Map(provenance.roles);
    const result: AgentSubagentView[] = [];
    for (const child of owned(run)) {
      result.push(await projectSubagentView(runtime, run, child, provenance, roles, defaultMaxTurns));
    }
    return result;
  };

  return {
    list,
    ...subagentConversation(runtime, (run, id) => {
      const child = owned(run).find(one => one.ref.id === id);
      if (!child) throw agentErrors.collaboration_unknown("子任务不属于这一轮执行");
      return child;
    }, list, hooks),

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
