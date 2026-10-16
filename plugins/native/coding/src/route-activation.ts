import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentRunView, AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { delegationViewOf } from "./delegation-view.js";
import type { CodingSessionState } from "./projection.js";
import { codingRouteEntry } from "./route-entry.js";
import type { CodingExecutionPorts } from "./routes.js";
import { summaryCache } from "./session-window.js";
import { startRound } from "./start-round.js";
import { codingWakeLoop } from "./wake-loop.js";

export type Capabilities = NonNullable<NonNullable<PluginStartContext["services"]>["capabilities"]>;

/**
 * One started Coding activation: what its routes share. The routes of each resource (routes-*.ts) take it; nothing
 * else keeps per-activation state. A newer activation of the same install and project stops the older one's loops.
 */
export interface CodingActivation {
  readonly context: PluginStartContext;
  readonly ports: CodingExecutionPorts | undefined;
  readonly projectId: string;
  /** Aborted when the plugin stops or a newer activation starts. */
  readonly stopped: AbortController;
  /** Sessions with a send (or a delivery being taken) under way. */
  readonly busy: Set<string>;
  readonly summaries: ReturnType<typeof summaryCache>;
  readonly fileIndexes: Map<string, { at: number; value: Promise<{ files: string[]; truncated: boolean }> }>;
  /** The follower of each session's latest round, by session. */
  readonly following: Map<string, symbol>;
  /** The directory read under way, and the one queued behind it (coding.state). */
  readonly state: { read: Promise<unknown> | null; next: Promise<unknown> | null };
  readonly route: ReturnType<typeof codingRouteEntry>;
  readonly waits: ReturnType<typeof codingWakeLoop<CodingExecutionPorts>>;
  /** Resolves after `ms`, or as soon as the activation stops; never keeps the process alive on its own. */
  pause(ms: number): Promise<void>;
}

/** What each started Coding activation runs in the background (the loop taking up fired waits), to stop with it. */
const activations = new Map<string, AbortController>();
const activationKey = (context: PluginStartContext) => `${context.install_id}:${context.project_id ?? ""}`;
/** The plugin stops: its background loops end. */
export function stopCodingSurface(context: PluginStartContext): void {
  activations.get(activationKey(context))?.abort();
  activations.delete(activationKey(context));
}

/** `failure` turns a route's error into its answer (routes.ts). */
export function startCodingActivation(context: PluginStartContext, ports: CodingExecutionPorts | undefined, actions: ActionHandlerBinding[],
  failure: (error: unknown) => { status: number; body: unknown }): CodingActivation {
  const projectId = context.project_id ?? "";
  activations.get(activationKey(context))?.abort();
  const stopped = new AbortController();
  activations.set(activationKey(context), stopped);
  const pause = (ms: number) => new Promise<void>(resolve => {
    if (stopped.signal.aborted) { resolve(); return; }
    const timer = setTimeout(() => { stopped.signal.removeEventListener("abort", done); resolve(); }, ms);
    // A loop waiting to look again does not keep the process alive on its own.
    (timer as { unref?: () => void }).unref?.();
    const done = () => { clearTimeout(timer); resolve(); };
    stopped.signal.addEventListener("abort", done, { once: true });
  });
  const busy = new Set<string>();
  // A session's step that waits, and the loop that takes up its continuation once the wait is over (wake-loop.ts). The
  // loop belongs to this activation: it reads and starts with the activation's own capabilities and execution ports.
  const waits = codingWakeLoop<CodingExecutionPorts>({ context, projectId, busy, stopped: stopped.signal, pause, records: execution => execution.sessions.list(projectId),
    record: (execution, id) => execution.sessions.get(projectId, id), activation: execution => ports ?? execution,
    startRound: (record, body, actor, api, execution, beforeWrite) => startRound(activation, record, body, actor, api, execution, beforeWrite) });
  const activation: CodingActivation = { context, ports, projectId, stopped, busy, summaries: summaryCache(), fileIndexes: new Map(), following: new Map(),
    state: { read: null, next: null }, route: codingRouteEntry(context, ports, actions, () => !stopped.signal.aborted, failure), waits, pause };
  // Recovery after a restart: only a project with sessions tied to an Agent run starts the Agent runtime here. Starting the
  // plugin (or discovering its actions) must not initialize the runtime's storage when there is nothing to wake.
  const resumable = () => new Set(ports!.sessions.list(projectId).filter(record => record.runtime_session_id).map(record => record.runtime_id));
  if (ports && context.services?.capabilities && resumable().size) void ports.ready().then(() => {
    if (stopped.signal.aborted) return;
    for (const runtimeId of resumable()) waits.wakeLoop(context.services!.capabilities!, ports, runtimeId);
  }).catch(() => undefined);
  return activation;
}

export function sessionState(run: Pick<AgentRunView, "phase">): CodingSessionState {
  if (run.phase === "completed") return "done";
  if (run.phase === "awaiting-input") return "waiting-answer";
  if (run.phase === "awaiting-review") return "waiting-approval";
  if (run.phase === "paused") return "paused";
  if (["failed", "stopped", "cancelled", "reconcile-required"].includes(run.phase)) return run.phase as CodingSessionState;
  return "running";
}

/** The session a route names (`:sessionId`). */
export const selected = (a: CodingActivation, request: PluginRouteRequest, execution: CodingExecutionPorts) =>
  execution.sessions.get(a.projectId, request.params.sessionId ?? "");

export const sessionTitle = (a: CodingActivation, execution: CodingExecutionPorts) => (id: string) => { try { return execution.sessions.get(a.projectId, id).title; } catch { return undefined; } };

/** Every fixed output of this project's Coding sessions, with the session it came from. */
export const sessionOutputs = (execution: CodingExecutionPorts) => [...execution.reportReferences?.() ?? [], ...execution.changeSetReferences?.() ?? [], ...execution.planReferences?.() ?? []]
  .flatMap(reference => { const [, encoded] = reference.artifact_id.split(":"); return encoded ? [{ reference, session_id: decodeURIComponent(encoded) }] : []; });

const sideOf = (a: CodingActivation, execution: CodingExecutionPorts, id: string | null) => {
  if (!id) return null;
  try { const record = execution.sessions.get(a.projectId, id); return { session_id: id, title: record.title, state: record.state, updated_at: record.updated_at }; }
  catch { return { session_id: id, title: null, state: null, updated_at: null }; }
};

/** The page's view of one delegation letter; the two ends are named as this project's Coding sessions. */
export const delegationView = (a: CodingActivation, execution: CodingExecutionPorts, letter: AgentSessionMessage, letters: AgentSessionMessage[]) =>
  delegationViewOf(letter, letters, { codingOf: runtime => execution.sessions.byRuntimeSession(a.projectId, runtime)?.session_id ?? null, sideOf: id => sideOf(a, execution, id) });

export const savedBudget = (a: CodingActivation, sessionId: string): { tokens: number } | null => {
  const saved = a.context.services?.storage?.get(`budget:${sessionId}`);
  return typeof saved === "string" ? JSON.parse(saved) as { tokens: number } : null;
};

/** What the model calls that wrote this session's digests used: the session's cost, though not a round of it. */
export const savedDigestUsage = (a: CodingActivation, sessionId: string): { calls: number; tokens: { input: number; output: number } } | null => {
  const saved = a.context.services?.storage?.get(`digest-usage:${sessionId}`);
  return typeof saved === "string" ? JSON.parse(saved) as { calls: number; tokens: { input: number; output: number } } : null;
};

/** Marked the priority by the person (kept with the plugin: a mark on the directory, not an execution state). */
export const priorityOf = (a: CodingActivation, sessionId: string) => Boolean(a.context.services?.storage?.get(`priority:${sessionId}`));
