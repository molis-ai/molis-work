import type { ContractDescriptor } from "../platform/package.js";
import type { ActionDefinition, ExactActionReference } from "../platform/actions.js";
import type { AgentRunRef } from "./agent-host-runtime.js";
import type { AgentStepAmendment, AgentStepBoard } from "./agent-host-session.js";

/**
 * What a session waits for and how it goes on, as Molis shows it (specs/prologue-adoption §4.6.9, §4.6.10). The SDK's
 * task graph owns the wait, its observations and the one continuation of the step it hangs on; this file describes them
 * to Molis in Molis's words. Nothing here is a second record: every view is read from the graph when asked.
 *
 * A wait hangs on a step of a task graph: the round bound to that step registered it (the model, with `board-wait` or
 * the `wait` / `park` shorthands), or the Host did on the person's behalf (a round queued behind another session's
 * work). Once the wait is over the step's continuation is eligible, and the session's next round, started under the
 * continuation's request key, takes it up.
 */
export const servicesAgentCollaborationContract = {
  contractId: "io.molis.work.service.agent-collaboration.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/prologue-adoption/spec.md",
} as const satisfies ContractDescriptor;

/** What was last seen of one condition: not yet, yes (with grounds), it failed, or it could not be told. */
export type AgentCollaborationObservation = "pending" | "satisfied" | "failed" | "unknown";

export interface AgentCollaborationCondition {
  kind: "node" | "envelope" | "command" | "pending" | "external";
  /** What it points at, as its owner names it: `board/node`, an envelope, a background command, a question. */
  ref: string;
  /** For a person: "会话「A」的答复", "后台命令 npm test", "「A」那一轮". */
  label: string;
  last: { status: AgentCollaborationObservation; at: string; note?: string; checker_error?: string };
}

export type AgentCollaborationWaitState = "waiting" | "satisfied" | "failed" | "expired" | "cancelled" | "needs-reconciliation";

export interface AgentCollaborationWait {
  wait_id: string;
  session_id: string;
  /** The round that registered it; none when the Host did, for the person. */
  run_id?: string;
  /** The task graph the waiting step is on (for Coding, the project's work board), and the step. */
  graph_id: string;
  node_id: string;
  /** "agent": the model waits; "app": the Host waits for the person (a round queued behind another). */
  by: "agent" | "app";
  /** What it waits for, in the words of whoever registered it. */
  reason: string;
  mode: "all" | "any";
  until: "success" | "settled";
  on_failure: "block" | "continue";
  deadline_at: string;
  conditions: AgentCollaborationCondition[];
  state: AgentCollaborationWaitState;
  /** The person went on before it was over: nothing it waited for is counted as done. */
  continued?: true;
  created_at: string;
  settled_at?: string;
  note?: string;
}

export type AgentContinuationState = "armed" | "eligible" | "claimed" | "started" | "blocked" | "cancelled" | "needs-reconciliation";

/** How the step goes on after its wait: ready to (eligible), taken up (claimed, started), or held for a person. */
export interface AgentContinuationView {
  graph_id: string;
  node_id: string;
  /** The session that goes on. */
  session_id: string;
  /** Stable for the wait; the next round of that session is started under it, and only once. */
  request_key: string;
  state: AgentContinuationState;
  /** Whether it may go on by itself once the wait is over; when not, it stays eligible for the person. */
  auto: boolean;
  /** The round that took it up. */
  run_id?: string;
  reason?: { code: string; note?: string };
}

/** One session's wait (the open one, or the last one whose continuation was not taken up yet) and its continuation. */
export interface AgentCollaborationSessionView {
  session_id: string;
  wait?: AgentCollaborationWait;
  continuation?: AgentContinuationView;
}

export type AgentCollaborationControl =
  /**
   * The person gives the wait up: the step stops waiting and its continuation is cancelled. A wait already over whose
   * step is held for the person (it failed, expired, or needs reconciling) gives the step back instead.
   */
  | { kind: "cancel-wait"; wait_id: string; note?: string }
  /**
   * The person goes on before it is over: the continuation is eligible at once and nothing waited for is counted as
   * done. Whether the steps it waited on keep going was frozen when the wait was registered.
   */
  | { kind: "continue-now"; wait_id: string; note?: string };

/** The Agent Host runtime's side: the project's waits and continuations, read and controlled; the views are always read anew. */
export interface AgentCollaborationPort {
  read(project: string, sessionId?: string): Promise<AgentCollaborationSessionView[]>;
  /** Continuations that are eligible, or held for a person, but for `exclude` (request keys); waits up to `timeoutMs` for one. */
  awaitReady(project: string, timeoutMs: number, exclude?: string[], signal?: AbortSignal): Promise<AgentCollaborationSessionView[]>;
  control(project: string, control: AgentCollaborationControl, actorId: string): Promise<AgentCollaborationSessionView>;
  /** A person changes a round's plan on the graph; `expectedVersion` is the board version they saw. */
  revise(run: AgentRunRef, amendment: AgentStepAmendment, expectedVersion: number, actorId: string): Promise<AgentStepBoard>;
  /** The Host's own works on their own graphs (an Assistant Work and the parts it hands out); absent where the runtime keeps none. */
  works?: AgentWorkGraphPort;
}

/** A step of a work's own graph as the work's owner reads it: the SDK's state, who holds it, and whether a person ended it. */
export interface AgentWorkNode {
  node_id: string;
  /** The step it hangs under; the work's root has none. */
  parent?: string;
  title: string;
  state: "not-started" | "ready" | "running" | "waiting" | "blocked" | "needs-reconciliation" | "succeeded" | "failed" | "cancelled";
  session_id?: string;
  /** Set when a person ended it before it was done: when, and what they said. */
  ended_by_person?: { at: string; note: string };
  /** When it ended. */
  ended_at?: string;
  /** What goes on after the step's wait (the root's, while the work waits for its parts): the key its round starts under. */
  continuation?: { request_key: string; state: AgentContinuationState };
  /**
   * A job the work started (`follow`): its id at its owner, when it began to be followed, the owner's latest word for
   * its state, and, once its step has ended, how and when: done, failed, past its deadline, or no longer checkable (the
   * work's authority refused the query, it failed too often in a row, or the step was ended otherwise).
   */
  job?: { job_id: string; started_at: string; ended?: "done" | "failed" | "expired" | "unchecked"; ended_at?: string };
}

/**
 * How a job the work started is looked at (specs/prologue-adoption §6.0o): its owner's read-only status query, the input
 * that names the job, where the answer says the state, and which states mean done or failed. The Host asks it again on
 * the SDK's bounded schedule, as the work's authority allows at that look.
 */
export interface AgentWorkJobQuery {
  action: ExactActionReference;
  input: Record<string, unknown>;
  /** Field names leading to the state in the query's answer. */
  path: string[];
  done: string[];
  failed: string[];
}

/**
 * One standing graph per work (specs/prologue-adoption §6.0k): its root, held by the work's session, and the parts the
 * work hands to other sessions, each a step under the root (or under another part) held by that session. A round of a
 * session that holds an unfinished step on its work's graph stands on that step. A part's step ends with the round that
 * stands on it, as that round ended; the root stays open while the work goes on. The graph owns states, holders and
 * generations; the work keeps only the graph's id, and a part only its step.
 *
 * Hand-back (§6.0n): the root waits, by the Host, for every unfinished part under it: a part is a step a session holds,
 * so a job the work follows (§6.0o) is not one. Once they have all ended the root's
 * continuation may go on: a round of the work running then takes it at its next model boundary; otherwise the work's next
 * round is started under the continuation's request key, which takes it up. One step has one continuation: the Host
 * changes only the waits it armed, and hands nothing out while the root waits on one its round armed.
 */
export interface AgentWorkGraphPort {
  /** The work's graph and its root, held by `session_id`; the same key gives the same graph. */
  open(input: { key: string; session_id: string; title: string }): Promise<{ graph_id: string }>;
  /**
   * A part handed to `session_id`: a step under `under`, or under the root when absent. Adding it again changes nothing.
   * With `wait_reason` the work waits for it: the root's wait is armed again on every unfinished part under it. Refused
   * (`agent.collaboration_conflict`, with nothing added) while no round of the work runs, while that round is taking up
   * the last wait's result, or while the root waits on a wait its round armed. When the wait cannot be armed after the
   * step was added, the step is ended again (`cancelled`), the root waits again for what it waited for, and the error is thrown.
   */
  add(input: { graph_id: string; node_id: string; under?: string; session_id: string; title: string; wait_reason?: string }): Promise<void>;
  read(graph_id: string): Promise<AgentWorkNode[]>;
  /** `listener` hears every change of the graph until the returned function is called. */
  watch(graph_id: string, listener: () => void): () => void;
  /**
   * End a step that is not done: as the person `actor_id` did, or (without one) as its holder gave it up. With `if_ready`,
   * only while no round has started on it (`ready`): the state is checked and the step ended against the same read of
   * the graph, so a step a round took up in between is left to that round, and a change in between fails the end.
   */
  end(input: { graph_id: string; node_id: string; note: string; actor_id?: string; if_ready?: true }): Promise<void>;
  /** The person stopped the work: the wait the Host armed ends, and its continuation, if it may go on, is held for the person. */
  hold(input: { graph_id: string; note: string }): Promise<void>;
  /** Each time a work's root may go on (the wait on it is over), and at once for each that may go on now. */
  onReady(listener: (ready: { graph_id: string; request_key: string }) => void): () => void;
  /**
   * Follow a job the work started (§6.0o): a step `job.<key>` under the root that no session holds and no round runs,
   * ended by the Host's wait on `query` the way the job ended: done → succeeded; failed, or not done within
   * `deadline_ms` → failed; no longer checkable → needs-reconciliation. The query is asked first after `every.first_ms`,
   * then twice as long each time, at most every `every.max_ms` (within the runtime's bounds). Nothing goes on from it,
   * and neither the work's wait for its parts nor its rounds take it. Following the same key again changes nothing.
   */
  follow(input: { graph_id: string; key: string; job_id: string; title: string; query: AgentWorkJobQuery; deadline_ms: number; every: { first_ms: number; max_ms: number } }): Promise<{ node_id: string }>;
  /** Each time a followed job's step ends, and at once for each that has ended. */
  onJobEnded(listener: (ended: { graph_id: string; node_id: string }) => void): () => void;
}

const SESSION_VIEWS_OUTPUT = {
  type: "object", required: ["sessions"], additionalProperties: false,
  properties: { sessions: { type: "array", items: { type: "object", required: ["session_id"], properties: { session_id: { type: "string" }, wait: { type: "object" }, continuation: { type: "object" } } } } },
} as const;

export interface AgentCollaborationReadInput { runtime_id: string; session_id?: string }
export type AgentCollaborationControlInput = AgentCollaborationControl & { runtime_id: string };
export interface AgentCollaborationReviseInput { runtime_id: string; session_id: string; run_id: string; amendment: AgentStepAmendment; expected_version: number }

/** A step of the round's plan: a confirmed step (`step-N`) or one a person inserted (`user-N`). */
const STEP = { type: "string", pattern: "^(step|user)-\\d{1,3}$" } as const;
const WORDS = (maxLength: number) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" }) as const;
/** One person's change, each kind with exactly its own fields (`AgentStepAmendment`). */
const AMENDMENT = { oneOf: [
  { type: "object", required: ["kind", "node", "reason"], additionalProperties: false, properties: { kind: { const: "skip" }, node: STEP, reason: WORDS(300) } },
  { type: "object", required: ["kind", "after", "title", "acceptance"], additionalProperties: false,
    properties: { kind: { const: "insert" }, after: STEP, title: WORDS(120), acceptance: WORDS(300), mine: { const: true }, origin: { type: "string", minLength: 1, maxLength: 200 } } },
  { type: "object", required: ["kind", "node", "note"], additionalProperties: false, properties: { kind: { const: "unblock" }, node: STEP, note: WORDS(500) } },
  { type: "object", required: ["kind", "node", "direction"], additionalProperties: false, properties: { kind: { const: "move" }, node: STEP, direction: { enum: ["up", "down"] } } },
  { type: "object", required: ["kind", "node", "to"], additionalProperties: false, properties: { kind: { const: "assign" }, node: STEP, to: { enum: ["me", "session"] } } },
  { type: "object", required: ["kind", "node", "state", "note"], additionalProperties: false,
    properties: { kind: { const: "resolve" }, node: STEP, state: { enum: ["succeeded", "failed"] }, note: WORDS(500) } },
] } as const;

/** Read and control the project's waits; waiting for a continuation to be ready is the `agentHostCapabilities.awaitContinuations` action. */
export const agentCollaborationActions = {
  read: {
    capability_id: "agent.collaboration.read.v1", version: 1, operation: "query",
    action: { title: "读取会话的等待与接续", description: "读取这个项目的会话在等什么、等到哪了，以及等完之后怎样接着做；只读。", kind: "query", scope: "project", scheduling: "concurrent",
      audiences: ["plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", required: ["runtime_id"], additionalProperties: false, properties: { runtime_id: { type: "string", minLength: 1 }, session_id: { type: "string", minLength: 1 } } },
      output_schema: SESSION_VIEWS_OUTPUT },
  } as ActionDefinition<AgentCollaborationReadInput, { sessions: AgentCollaborationSessionView[] }>,
  control: {
    capability_id: "agent.collaboration.control.v1", version: 1, operation: "command",
    action: { title: "取消等待或提前接着做", description: "用户放弃一个会话的等待，或不等了直接接着做；只改等待与接续，不碰它在等的那件事。", kind: "operation", scope: "project", effect: "write", scheduling: "concurrent",
      audiences: ["plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", required: ["runtime_id", "kind", "wait_id"], additionalProperties: false, properties: {
        runtime_id: { type: "string", minLength: 1 }, kind: { enum: ["cancel-wait", "continue-now"] }, wait_id: { type: "string", minLength: 1 },
        note: { type: "string", maxLength: 400 } } },
      output_schema: { type: "object", required: ["session"], additionalProperties: false, properties: { session: { type: "object", required: ["session_id"] } } } },
  } as ActionDefinition<AgentCollaborationControlInput, { session: AgentCollaborationSessionView }>,
  /** The person changes a round's plan: the change is a report on the graph itself; the confirmed plan is never rewritten. */
  revise: {
    capability_id: "agent.collaboration.revise.v2", version: 2, operation: "command",
    action: { title: "调整一轮的计划", description: "用户在任务图上调整这一轮的计划：跳过、插入、调顺序、改派、给受阻的步骤做决定、报自己负责的步骤的结果；按看到的版本提交，别人先改了就拒绝。", kind: "operation", scope: "project", effect: "write", scheduling: "concurrent",
      audiences: ["plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", required: ["runtime_id", "session_id", "run_id", "amendment", "expected_version"], additionalProperties: false, properties: {
        runtime_id: { type: "string", minLength: 1 }, session_id: { type: "string", minLength: 1 }, run_id: { type: "string", minLength: 1 },
        amendment: AMENDMENT, expected_version: { type: "integer", minimum: 1 } } },
      output_schema: { type: "object", required: ["board"], additionalProperties: false, properties: { board: { type: "object", required: ["version", "nodes"] } } } },
  } as ActionDefinition<AgentCollaborationReviseInput, { board: AgentStepBoard }>,
} as const;
