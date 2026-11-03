import { projectInputReceipts, type InputReceipt, type ModelEvent } from "@prologue/sdk";
import type { AgentRunRef, AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputSend, AgentInputsPort, AgentInputWithdrawal, AgentSteerReceipt, AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { agentErrors } from "../errors.js";

/**
 * A supplement's receipt in the run view, from the run's own ledger (specs/ai-input-receipts §3.2, §3.3, §3.4).
 *
 * The runtime projects its ledger itself (`projectInputReceipts`): received, in the context, read, withdrawn, unread when
 * the round ended before either; the model's own statement about an input; the questions asked about it. That function
 * reads a whole ledger, while the run view is built one event at a time, so the round keeps the events that projection
 * reads and projects them again whenever one arrives — one projection, the runtime's, never a second one here. The Host
 * adds a single fact the ledger cannot hold: a round it closed because its record stopped short (restored without an
 * ending) read nothing more. Read is not compliance, and the model's statement is a claim, not what the Host observed.
 */

/** The ledger events `projectInputReceipts` reads; the rest never change a receipt. */
const INPUT_EVENTS = new Set(["prompt", "steer-applied", "steer-read", "steer-withdrawn", "inputs-acknowledged", "awaiting-input",
  "pending-settled", "pending-expired", "pending-cancelled", "completed", "failed", "cancelled", "tripped", "circuit-tripped"]);

/** The part of the run projection these facts touch. */
interface InputLedger {
  turns: AgentTurnView[];
  /** The round's ledger events that bear on its inputs, in order. */
  input_events: ModelEvent[];
  /** The Host closed the round on a record that stopped short of its ending. */
  inputs_closed?: true;
}

/** A user prompt that carries a supplement's id starts its receipt. */
export function steerOf(role: string, steerId: string | undefined): Pick<AgentTurnView, "steer"> {
  return role === "user" && steerId !== undefined ? { steer: { id: steerId, state: "received" } } : {};
}

function steerView(receipt: InputReceipt, closed: boolean): AgentTurnSteer {
  const ended = closed && (receipt.state === "accepted" || receipt.state === "applied");
  const state = ended ? "unread" : receipt.state === "accepted" ? "received" : receipt.state;
  const claim = receipt.handling;
  return { id: receipt.steerId, state, source: receipt.source === "app" ? "host" : receipt.source,
    ...(receipt.original ? { original: { ...receipt.original } } : {}),
    ...(receipt.acceptedAtMs === undefined ? {} : { accepted_at_ms: receipt.acceptedAtMs }), ...(receipt.key === undefined ? {} : { key: receipt.key }), ...(receipt.about === undefined ? {} : { about: receipt.about }),
    ...(claim ? { model_claim: { treatment: claim.treatment, ...(claim.kind ? { kind: claim.kind } : {}), targets: claim.targets.map(target => ({ ...target })),
      impacts: [...claim.impacts], ...(claim.note ? { note: claim.note } : {}), ...(claim.callId ? { call_id: claim.callId } : {}),
      ...(claim.toolCallId ? { tool_call_id: claim.toolCallId } : {}), revisions: receipt.handlingRevisions ?? 1 } } : {}),
    ...(receipt.questions ? { questions: receipt.questions.map(question => ({ pending_id: question.pending, state: closed && question.state === "open" ? "unresolved" : question.state })) } : {}) };
}

/** Projects the kept events again and puts each receipt on its turn; true when a turn changed. */
function projectInputs(state: InputLedger): boolean {
  const receipts = new Map(projectInputReceipts(state.input_events).map(receipt => [receipt.steerId, receipt]));
  let changed = false;
  state.turns = state.turns.map(turn => {
    const receipt = turn.steer && receipts.get(turn.steer.id);
    if (!receipt) return turn;
    const steer = steerView(receipt, state.inputs_closed === true);
    if (JSON.stringify(steer) === JSON.stringify(turn.steer)) return turn;
    changed = true;
    return { ...turn, steer };
  });
  return changed;
}

/** Keeps an event that bears on the round's inputs and projects them again; true when a receipt changed. */
export function noteInputEvent(state: InputLedger, event: { type: string }): boolean {
  if (!INPUT_EVENTS.has(event.type)) return false;
  if (event.type === "prompt" && (event as { steerId?: unknown }).steerId === undefined) return false;
  // The runtime's `failed` always carries its error; a frame without one is not its ledger, and is not projected.
  if (event.type === "failed" && (event as { error?: unknown }).error === undefined) return false;
  state.input_events.push(event as ModelEvent);
  return projectInputs(state);
}

/** The Host closed the round on a record that stopped short of its ending: what it had not read stays unread. */
export function closeInputs(state: InputLedger): void {
  state.inputs_closed = true;
  projectInputs(state);
}

/** A supplement as the runtime takes it; `app` is the Host speaking, never the person. */
export interface SteerInput { original?: import("@prologue/sdk").InputOriginal; text: string; source?: "person" | "app"; key?: string; interrupt?: boolean; about?: string }
/** The session's own queue: what waits there for the next round, under the same keys the round's supplements use. */
type QueueInput = (input: Omit<SteerInput, "interrupt">) => Promise<{ inputId: string; replayed: boolean }>;
/** A live round's supplements: hand one over, or take back one it has not put in the context; a restored round has no withdraw. */
export interface RoundInputs { steer(input: SteerInput): Promise<{ steerId: string; replayed: boolean }>; withdrawSteer?(steerId: string): Promise<void> }
/** The session's queue as the runtime keeps it, session by session. */
export interface SessionQueue { add(sessionId: string, input: Parameters<QueueInput>[0]): ReturnType<QueueInput>; withdraw(sessionId: string, inputId: string): Promise<void> }

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

/**
 * A supplement to a round. When the round has already ended, is asked to leave it for the next one, or ends between the
 * Host's read and the runtime taking it (`RUN_NOT_RUNNING`), it waits in the session under the same key — so one the round
 * did take is answered with its own id and never lands twice (specs/ai-input-receipts §7). Nothing starts a round here.
 */
export async function deliverSteer(input: AgentInputSend, ended: boolean, steer: (input: SteerInput) => Promise<{ steerId: string; replayed: boolean }>,
  queue: QueueInput | undefined, beforeQueue?: () => void): Promise<AgentSteerReceipt> {
  const one = { ...(input.original ? { original: { ...input.original } } : {}), text: input.text, ...(input.source === "host" ? { source: "app" as const } : {}), ...(input.key ? { key: input.key } : {}), ...(input.about ? { about: input.about } : {}) };
  const keep = async (): Promise<AgentSteerReceipt> => {
    if (!queue) throw agentErrors.capability_unavailable(ended ? "这一轮已经结束，当前运行时不能把补充留到下一轮" : "当前运行时不能把补充留到下一轮");
    beforeQueue?.();
    const kept = await queue(one);
    return { input_id: kept.inputId, replayed: kept.replayed, delivered: "queued" };
  };
  if (ended || input.mode === "after-run") return keep();
  beforeQueue?.();
  try {
    const taken = await steer({ ...one, ...(input.mode === "interrupt" ? { interrupt: true } : {}) });
    return { input_id: taken.steerId, replayed: taken.replayed, delivered: "run" };
  } catch (error) {
    if (codeOf(error) !== "RUN_NOT_RUNNING") throw error;
    return keep();
  }
}

/** A round as `inputsPort` needs it, read anew for each call: whether it ended, its control, and its receipts so far. */
interface LiveRound { ended: boolean; control: RoundInputs; turns: readonly AgentTurnView[] }

/**
 * Takes a supplement back before the model saw it (specs/ai-input-receipts §4.6). The round under way gives it up while it
 * has not put it in the context; once there, the model has seen it and only a correction changes course. One the round
 * does not hold — it ended, or the supplement went straight to the session — is the session's, while it still waits there.
 * Taking back one already taken back answers the same. `beforeWithdraw` runs right before each request to give it back.
 */
async function withdrawInput(inputId: string, live: LiveRound, queue: ((inputId: string) => Promise<void>) | undefined, beforeWithdraw?: () => void): Promise<AgentInputWithdrawal> {
  const held = live.turns.find(turn => turn.steer?.id === inputId)?.steer?.state;
  if (held === "withdrawn") return { input_id: inputId, from: "run" };
  if (held === "read" || (!live.ended && held === "applied")) throw agentErrors.input_applied("这条补充已经放进上下文，撤不回了；要改口可以发一条纠正");
  if (!live.ended && live.control.withdrawSteer) {
    beforeWithdraw?.();
    try { await live.control.withdrawSteer(inputId); return { input_id: inputId, from: "run" }; } catch (error) {
      if (codeOf(error) === "AGENT_STEER_ALREADY_APPLIED") throw agentErrors.input_applied("这条补充已经放进上下文，撤不回了；要改口可以发一条纠正");
      if (codeOf(error) !== "AGENT_STEER_NOT_FOUND" && codeOf(error) !== "RUN_NOT_RUNNING") throw error;
    }
  }
  if (!queue) throw agentErrors.capability_unavailable("当前运行时不能撤回排在会话里的补充");
  beforeWithdraw?.();
  try { await queue(inputId); return { input_id: inputId, from: "queued" }; } catch (error) {
    if (codeOf(error) === "SESSION_INPUT_NOT_QUEUED") throw agentErrors.input_not_queued("这条补充已经不在等着：它被带进了一轮，或会话里没有这一条");
    throw error;
  }
}

/** The adapter's `inputs`: reads the round, hands the supplement over or takes it back, and publishes the run's view whatever came of it. */
export function inputsPort(round: (run: AgentRunRef) => Promise<LiveRound>, queue: () => SessionQueue | undefined, publish: (runId: string) => void): AgentInputsPort {
  return {
    send: async (run, input, beforeQueue) => {
      input = structuredClone(input);
      const live = await round(run), keep = queue();
      try { return await deliverSteer(input, live.ended, one => live.control.steer(one), keep && (one => keep.add(run.session_id, one)), beforeQueue); } finally { publish(run.run_id); }
    },
    withdraw: async (run, inputId, beforeWithdraw) => {
      const live = await round(run), keep = queue();
      try { return await withdrawInput(inputId, live, keep && (id => keep.withdraw(run.session_id, id)), beforeWithdraw); } finally { publish(run.run_id); }
    },
  };
}
