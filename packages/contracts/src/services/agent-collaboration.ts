import type { ContractDescriptor } from "../platform/package.js";
import type { ActionDefinition } from "../platform/actions.js";

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
}

const SESSION_VIEWS_OUTPUT = {
  type: "object", required: ["sessions"], additionalProperties: false,
  properties: { sessions: { type: "array", items: { type: "object", required: ["session_id"], properties: { session_id: { type: "string" }, wait: { type: "object" }, continuation: { type: "object" } } } } },
} as const;

export interface AgentCollaborationReadInput { runtime_id: string; session_id?: string }
export type AgentCollaborationControlInput = AgentCollaborationControl & { runtime_id: string };

/** Read and control the project's waits; the long wait for a continuation to be ready is `agentHostCapabilities.awaitContinuations`. */
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
} as const;
