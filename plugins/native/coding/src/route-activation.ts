import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginKeptJob, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentRunView, AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { delegationViewOf } from "./delegation-view.js";
import type { CodingSessionState } from "./projection.js";
import { codingRouteEntry } from "./route-entry.js";
import type { CodingExecution } from "./routes.js";
import { summaryCache } from "./session-window.js";
import { startRound } from "./start-round.js";
import { codingWakeLoop } from "./wake-loop.js";
import { codingText } from "./words.js";

export type Capabilities = NonNullable<NonNullable<PluginStartContext["services"]>["actions"]>;

/**
 * One started Coding activation: what its routes share. The routes of each resource (routes-*.ts) take it; nothing
 * else keeps per-activation state. What runs on after a request (a round's follower, the loop taking up fired waits) is a
 * job the platform keeps for this activation (PG-038), and stops with it.
 */
export interface CodingActivation {
  readonly context: PluginStartContext;
  /** What this activation runs with: the session store it opened and the platform services and public actions Coding reads models, Goal titles and Characters through. */
  readonly execution: CodingExecution;
  readonly projectId: string;
  /** Sessions with a send (or a delivery being taken) under way. */
  readonly busy: Set<string>;
  readonly summaries: ReturnType<typeof summaryCache>;
  readonly fileIndexes: Map<string, { at: number; value: Promise<{ files: string[]; truncated: boolean }> }>;
  /** The follower of each session's latest round, by session (start-round.ts). */
  readonly following: Map<string, PluginKeptJob>;
  /** The directory read under way, and the one queued behind it (coding.state). */
  readonly state: { read: Promise<unknown> | null; next: Promise<unknown> | null };
  readonly route: ReturnType<typeof codingRouteEntry>;
  readonly waits: ReturnType<typeof codingWakeLoop<CodingExecution>>;
}

/** `failure` turns a route's error into its answer (routes.ts). */
export function startCodingActivation(context: PluginStartContext, execution: CodingExecution, actions: ActionHandlerBinding[],
  failure: (error: unknown) => { status: number; body: unknown }): CodingActivation {
  const projectId = context.project_id ?? "";
  const busy = new Set<string>();
  // A session's step that waits, and the loop that takes up its continuation once the wait is over (wake-loop.ts). The
  // loop belongs to this activation: it reads and starts with the activation's own capabilities and execution (the store is
  // the activation's too, so a loop a request set off never reads through that request's execution).
  const waits = codingWakeLoop<CodingExecution>({ context, projectId, busy, records: from => from.sessions.list(projectId).filter(record => !from.sessions.lifecycle.pending(projectId, record.session_id)),
    record: (from, id) => from.sessions.get(projectId, id),
    startRound: (record, body, api, from, beforeWrite) => startRound(activation, record, body, api, from, beforeWrite) });
  const activation: CodingActivation = { context, execution, projectId, busy, summaries: summaryCache(), fileIndexes: new Map(), following: new Map(),
    state: { read: null, next: null }, route: codingRouteEntry(context, execution, actions, failure), waits };
  // The loops' job is kept while the activation starts, the one place outside a command it may be kept from: a later
  // `coding.state` read only wakes it. Idle, it asks the Agent runtime nothing.
  waits.keep();
  // Recovery after a restart: only a project with sessions tied to an Agent run starts the Agent runtime here. Starting the
  // plugin (or discovering its actions) must not initialize the runtime's storage when there is nothing to wake. Coding does not
  // wait for the runtime to be ready first: the Agent capability handlers initialize it themselves (agent-host-composition.ts),
  // so the loop's first read does that. If that first read fails, the loop ends instead of retrying (wake-loop.ts, `recovery`);
  // the next `coding.state` read or round starts it again.
  const resumed = new Set(execution.sessions.list(projectId).filter(record => record.runtime_session_id && !execution.sessions.lifecycle.pending(projectId, record.session_id)).map(record => record.runtime_id));
  if (context.services?.actions && resumed.size) for (const runtimeId of resumed) waits.wakeLoop(context.services.actions, execution, runtimeId, true);
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
export const selected = (a: CodingActivation, request: PluginRouteRequest, execution: CodingExecution) =>
  execution.sessions.get(a.projectId, request.params.sessionId ?? "");

const sideOf = (a: CodingActivation, execution: CodingExecution, id: string | null) => {
  if (!id) return null;
  try { const record = execution.sessions.get(a.projectId, id); return { session_id: id, title: record.title, state: record.state, updated_at: record.updated_at }; }
  catch { return { session_id: id, title: null, state: null, updated_at: null }; }
};

/** The page's view of one delegation letter; the two ends are named as this project's Coding sessions. */
export const delegationView = (a: CodingActivation, execution: CodingExecution, letter: AgentSessionMessage, letters: AgentSessionMessage[]) =>
  delegationViewOf(letter, letters, { codingOf: runtime => execution.sessions.byRuntimeSession(a.projectId, runtime)?.session_id ?? null, sideOf: id => sideOf(a, execution, id) }, codingText(execution.locale));

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
