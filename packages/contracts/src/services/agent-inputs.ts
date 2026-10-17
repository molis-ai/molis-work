import type { ContractDescriptor } from "../platform/package.js";
import type { ActionDefinition } from "../platform/actions.js";
import type { AgentRunRef } from "./agent-host.js";

/**
 * What a person, or the Host on their behalf, tells a running Agent round, and what the round's runtime says became of
 * it (specs/ai-input-receipts §3, §6.2). The runtime owns the facts (received, in the context, read, not read,
 * withdrawn); this file describes them in Molis's words. Nothing here carries authority: a supplement is information to
 * the model, never an approval.
 */
export const servicesAgentInputsContract = {
  contractId: "io.molis.work.service.agent-inputs.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/ai-input-receipts/spec.md",
} as const satisfies ContractDescriptor;

/**
 * Who wrote a supplement. Only `person` is the person's own words. `host` is the Host relaying something on their behalf
 * (a review note, a board update): the model receives it as data, and the run shows it as a note, never as their words.
 */
export type AgentInputSource = "person" | "host";

/**
 * When a supplement reaches the model (specs/ai-input-receipts §4.1). `next-boundary`: after the reply or batch of tools
 * under way. `interrupt`: the reply being written is dropped and the round goes on with this at once; what already ran
 * stays done. `after-run`: it waits in the session for the next round, which never starts on its own.
 */
export type AgentSteerMode = "next-boundary" | "interrupt" | "after-run";
export const AGENT_STEER_MODES: readonly AgentSteerMode[] = ["next-boundary", "interrupt", "after-run"];

/** Characters an input key may use, so it can name the input in the runtime's own references. */
export const AGENT_INPUT_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$";

/** A supplement to a round: it reaches the model at its next boundary, beside what it is already doing. */
export interface AgentInputSend {
  text: string;
  /** `person` when absent. */
  source?: AgentInputSource;
  /**
   * The caller's idempotency key (`AGENT_INPUT_KEY_PATTERN`): the same key with the same text counts once across the
   * whole session, the same key with other text is refused. A page that lost the answer sends again with the same key.
   */
  key?: string;
  /** `next-boundary` when absent. */
  mode?: AgentSteerMode;
}

/**
 * What became of a supplement the Host took. `run`: the round under way takes it. `queued`: it waits in the session for
 * the next round — asked for (`after-run`), or the round had just ended when it arrived.
 */
export interface AgentSteerReceipt {
  input_id: string;
  /** The same key and text came before: this is that supplement, and nothing was added. */
  replayed: boolean;
  delivered: "run" | "queued";
}

/** Whether a round takes the supplements waiting in its session: all, none, or the ones named. */
export type AgentQueuedInputs = "carry" | "leave" | readonly string[];

/**
 * A supplement waiting in the session for a round to take it (specs/ai-input-receipts §4.8): sent for the next round, or
 * left unread when its round ended. The runtime's input record is its only owner; this is that record as the Host reads it.
 */
export interface AgentQueuedInput {
  input_id: string;
  text: string;
  /** `peer`: another session's Agent said it. */
  source: AgentInputSource | "peer";
  key?: string;
  /** The round that ended without reading it; `applied`: it was in the context, but no reply came. Absent when it was sent straight to the session. */
  left_by?: { run_id: string; applied: boolean };
}

/**
 * The runtime's side. `beforeQueue` runs right before a supplement is kept in the session, once the round turned out to
 * have ended: the caller checks there that it may still write.
 */
export interface AgentInputsPort {
  send(run: AgentRunRef, input: AgentInputSend, beforeQueue?: () => void): Promise<AgentSteerReceipt>;
}

/** One input as the runtime's ledger knows it: whose session it belongs to and its id there. */
export interface AgentInputRef { session_id: string; input_id: string }

/** How the model says it will treat an input it read (closed set, the runtime's S3 vocabulary). */
export type AgentInputTreatment = "apply-now" | "later-step" | "new-task" | "needs-clarification" | "not-adopted" | "answered" | "noted" | "merged";
/** What kind of input the model takes it to be. */
export type AgentInputKind = "supplement" | "correction" | "constraint" | "request" | "question";
/** What the model says the input changes; declared, not observed. */
export type AgentInputImpact = "objective" | "scope" | "priority" | "approach" | "acceptance" | "outputs" | "constraint";
/** What a statement points at: another input, an app reference, a node of a board, an item of the round's list, a question. */
export type AgentInputTarget = { kind: "input" | "app-ref" | "todo" | "pending"; id: string } | { kind: "board-node"; board: string; id: string };

/**
 * The model's own latest statement about an input it read (specs/ai-input-receipts §3.4, SDK S3). It is a claim: the
 * runtime checked only that it names inputs the round read and valid targets; nothing was done because of it, it does not
 * move the receipt's state, and it is not what the Host observed. Pages show it as what the AI says.
 */
export interface AgentInputModelClaim {
  treatment: AgentInputTreatment;
  kind?: AgentInputKind;
  targets: AgentInputTarget[];
  impacts: AgentInputImpact[];
  note?: string;
  /** The model call whose reply made the statement, and the tool call that carried it. */
  call_id?: string;
  tool_call_id?: string;
  /** How many statements the model made about it; the latest stands. */
  revisions: number;
}

/** A question the round asked about an input. `unresolved`: the round ended with no settlement on its ledger. */
export interface AgentInputQuestion { pending_id: string; state: "open" | "settled" | "expired" | "cancelled" | "unresolved" }

/**
 * A supplement's receipt on its turn, projected by the runtime's own `projectInputReceipts` from the round's ledger.
 * `state` is what happened to it; `model_claim` is only what the model says about it.
 */
export interface AgentTurnSteer {
  id: string;
  /** received: taken, not yet in the context; applied: in the context; read: a kept reply was made with it (not compliance); unread: the round ended before that. */
  state: "received" | "applied" | "read" | "unread" | "withdrawn";
  /** The key it was sent under (`AGENT_INPUT_KEY_PATTERN`), so the page that sent it knows it here even when its answer was lost. */
  key?: string;
  model_claim?: AgentInputModelClaim;
  /** Questions asked about it, in the order asked. */
  questions?: AgentInputQuestion[];
}

export type AgentInputSendRequest = AgentInputSend & { runtime_id: string; session_id: string; run_id: string };

const id = { type: "string", minLength: 1 } as const;

/** The one way a plugin speaks to a round of its sessions; the Assistant, inside the Host, uses the runtime's port. */
export const agentInputActions = {
  send: {
    capability_id: "agent.inputs.send.v1", version: 1, operation: "command",
    action: { title: "向一轮补充要求", description: "把一段话交给这个项目里一个会话的一轮：下一个边界读进上下文、打断当前回复，或留到下一轮。回执说这一轮收下了，还是留在会话里等下一轮；同键同文只算一次。只给插件调用。", kind: "operation", scope: "project", effect: "write", scheduling: "concurrent",
      audiences: ["plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", required: ["runtime_id", "session_id", "run_id", "text"], additionalProperties: false, properties: {
        runtime_id: id, session_id: id, run_id: id, text: { type: "string", minLength: 1, maxLength: 100_000, pattern: "\\S" },
        source: { enum: ["person", "host"] }, key: { type: "string", pattern: AGENT_INPUT_KEY_PATTERN }, mode: { enum: [...AGENT_STEER_MODES] } } },
      output_schema: { type: "object", required: ["input_id", "replayed", "delivered"], additionalProperties: false, properties: {
        input_id: { type: "string" }, replayed: { type: "boolean" }, delivered: { enum: ["run", "queued"] } } } },
  } as ActionDefinition<AgentInputSendRequest, AgentSteerReceipt>,
} as const;
