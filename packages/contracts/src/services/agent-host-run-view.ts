/** The agent-host contract (`services/agent-host`): a started run's handle and controls, and what a run and a session show. */
import type { AgentRunRef, AgentRunPhase, AgentSessionRef } from "./agent-host-runtime.js";
import type { AgentFrozenStart, AgentSessionOwner } from "./agent-host-start.js";
import type { AgentAnswerControl, AgentPendingQuestion } from "./agent-interaction.js";
import type { AgentStepBoard } from "./agent-host-session.js";
import type { AgentMemoryRecallFact } from "./agent-host-memory.js";
import type { AgentRunOffer } from "./agent-host-offers.js";

export interface AgentRunHandle {
  ref: AgentRunRef;
  frozen: AgentFrozenStart;
}

export type AgentRunControl =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "cancel" }
  /**
   * Send this Run's later model calls to another configured model, from its next model call. History, tools,
   * permissions and budget stay as they are; refused when the model cannot carry what the Run was started with.
   */
  | { kind: "switch-model"; provider_id: string; model_id: string }
  /**
   * Answer one question the Run is stopped on.
   *
   * Deliberately not `steer`: an answer is addressed to a specific pending
   * question and closes it. Sending it as a free instruction would leave the
   * question open while the Run reads the text as unrelated guidance.
   */
  | AgentAnswerControl;

export type AgentTurnKind = "user" | "assistant" | "system" | "notice";

export interface AgentTurnView {
  turn_id: string;
  kind: AgentTurnKind;
  text: string;
  /** Observation time; null when the original replay has no recorded time. */
  at: string | null;
  /** Relative presentation order within this Run, reconstructed from its events. */
  sequence?: number;
  /** Run-owned supplemental input and its receipt, from the run's ledger. */
  steer?: import("./agent-inputs.js").AgentTurnSteer;
}

export type AgentToolActivityState = "started" | "completed" | "failed" | "unknown";

export interface AgentToolActivity {
  call_id: string;
  name: string;
  /** Safe target summary (path, command, query). Never raw credentials. */
  target: string;
  state: AgentToolActivityState;
  summary: string;
  /** Bounded execution evidence, shown only when the user expands the activity. */
  output?: string;
  output_truncated?: boolean;
  /** On a display copy only: lines of output left out because the surface never shows them. */
  output_hidden_lines?: number;
  /** Last observation time; null when absent from the original replay. */
  at: string | null;
  /** Position of the original call; a result updates it without moving it. */
  sequence?: number;
}

export interface AgentTokenCount {
  input: number;
  output: number;
  cached_input?: number;
  cache_creation?: number;
  reasoning?: number;
}

/** Partial values are known subtotals; estimated values are not provider bills. */
export type AgentUsageCoverage = "unknown" | "reported" | "estimated" | "partial" | "partial-estimated";

export interface AgentRunUsage {
  /** These totals include attributed calls; incomplete operations may lack final receipts. */
  compaction?: { recorded_calls: number; incomplete: boolean };
  tokens: AgentTokenCount;
  cost_usd?: number;
  /** Per-field provenance; absent when the runtime reports none. Unknown numeric placeholders must not be displayed. */
  coverage?: Record<"input" | "output" | "cached_input" | "cache_creation" | "cost_usd", AgentUsageCoverage>;
  /** Missing, interrupted or estimated scope; known subtotals remain readable with this warning. */
  unavailable_reason?: string;
  /**
   * How much of the model's window the latest main call used: its whole prompt as the provider counted it (cached
   * parts included). Absent until a call is recorded; compaction calls never count.
   */
  context?: { tokens: number; coverage: AgentUsageCoverage };
}

export interface AgentCommandOutputRef {
  call_id: string;
  /** The run that produced it: a call id is only unique within its run. */
  run_id: string;
}

export interface AgentCommandOutput {
  ref: AgentCommandOutputRef;
  command: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timed_out?: boolean;
  cancelled?: boolean;
  stop_reason?: "cancelled" | "timed-out";
}

/** One step of a Run's own list, as the runtime keeps it. */
export interface AgentTodoItem {
  id: string;
  text: string;
  state: "pending" | "in-progress" | "done" | "abandoned";
}

/**
 * A model call the runtime is about to try again: the wall-clock time it will (`until`), the attempt that failed and why —
 * the provider limited the rate, was unavailable after the request went out, or the request was never sent. The page counts
 * down to `until`; it never retries on its own.
 */
export interface AgentRetryWait {
  until: string;
  reason: "rate-limited" | "unavailable" | "not-sent";
  attempt: number;
}

export interface AgentRunView {
  step_board?: AgentStepBoard;
  step_board_error?: string;
  ref: AgentRunRef;
  phase: AgentRunPhase;
  frozen: AgentFrozenStart;
  turns: AgentTurnView[];
  activity: AgentToolActivity[];
  /** References to durable command facts, not inferred from assistant text. */
  command_outputs?: AgentCommandOutputRef[];
  usage: AgentRunUsage;
  /**
   * Questions this Run is stopped on. Empty while it is running.
   *
   * The phase alone was not enough: a surface could see `awaiting-input` but
   * had no way to show what was being asked, so the Run stalled with the user
   * unable to act.
   */
  awaiting_input: readonly AgentPendingQuestion[];
  /** Content-free reason when the Run stopped, failed or needs reconciliation. */
  stop_reason?: string;
  /** What the Run took from memory at its start (references only), when it was given memory. */
  memory_recalled?: AgentMemoryRecallFact;
  /** The steps this Run keeps for itself (the runtime's todo list), the latest list as a whole; absent when it keeps none. */
  todo?: readonly AgentTodoItem[];
  /**
   * Files this Run really wrote, turn by turn, as the runtime computed them from its write receipts (never from what
   * the model said). A turn that only read has no entry. Absent until a turn writes.
   */
  turn_changes?: readonly AgentTurnChanges[];
  /**
   * Present while the Run sleeps on its own until this time and then goes on by itself. It stays `running`: stop and
   * cancel act at once, an added instruction waits for it to wake. The wait counts against its time budget.
   */
  sleeping_until?: string;
  /** While a model call waits to try again (the runtime's `retry-waiting`): when, and why. Gone once a call answers or the Run ends. */
  retry_wait?: AgentRetryWait;
  /**
   * The person switched this Run's model: `now` is where its calls go since (`frozen.model_id` stays the start), and
   * `requested` one asked for that takes effect at the next model call. Context tidying keeps the start model.
   */
  model_switch?: { now?: string; requested?: string };
  /**
   * What this Run suggested to the person from its own frozen actions (`role.host_tools` grants `suggest-action`), in
   * the order it suggested them. Each is the Host's record, checked against the action as it was then; nothing ran.
   * The caller that shows them owns what becomes of each (specs/ai-interaction-experience D25). Absent: none.
   */
  offers?: readonly AgentRunOffer[];
  started_at: string;
  ended_at: string | null;
}

/** What one turn of a Run wrote: each file's size, the SHA-256 of its bytes on disk, and the checkpoint before it. */
export interface AgentTurnChanges {
  /** The runtime's turn number within the Run, from 0. */
  turn: number;
  /** Position among this Run's visible entries. */
  sequence: number;
  at: string | null;
  files: ReadonlyArray<{ path: string; byte_length: number; digest: string; checkpoint_id: string }>;
}

export interface AgentSessionView {
  /** Immutable session mode; missing historical values mean required. */
  workspace?: "required" | "none" | "business";
  /** A manual rewind is in progress or has an unresolved execution outcome. */
  checkpoint_busy?: boolean;
  /** Persisted work exists but is not safe to continue automatically. */
  recovery?: { required: true; reason: string };
  owner: AgentSessionOwner;
  session: AgentSessionRef;
  title: string;
  runs: AgentRunRef[];
  latest_run: AgentRunView | null;
  /**
   * Supplements waiting for the next round, read only while no round is live (ended, or stopped for checking) (specs/ai-input-receipts
   * D31). Absent: not read this time, so nothing is known; `[]`: read, and none wait.
   */
  queued_inputs?: import("./agent-inputs.js").AgentQueuedInput[];
}

/** Where a session stands, without its rounds: enough for a directory of many sessions. */
export interface AgentSessionStatus {
  session_id: string;
  /** The latest round's phase; null before the first round. */
  latest_phase: AgentRunPhase | null;
  /** Persisted work exists but is not safe to continue automatically. */
  recovery: boolean;
  checkpoint_busy: boolean;
  /** Unfinished steps on the session's latest unfinished plan graph, by who holds them; absent when there are none. */
  steps?: { mine: number; subtasks: number; unowned: number };
}
