import type { AgentRunRef, AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputSend, AgentInputsPort, AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { agentErrors } from "../errors.js";

/**
 * A supplement's receipt in the run view, from the run's own ledger (specs/ai-input-receipts §3.2 L1, §3.3).
 *
 * The SDK records each fact as an event; this module only follows them, so the state a person sees is the runtime's,
 * never a guess: `received` when the supplement became a turn, `applied` when it went into the model's context, `read`
 * when a reply the model produced with it was kept, `withdrawn` when it was taken back before it reached the model,
 * and `unread` when the round ended before either. Read is not compliance: what the model did with it is told by its
 * own account and the receipts of what it did.
 */
export type InputEvent =
  | { type: "steer-applied"; steerId: string }
  | { type: "steer-read"; steerIds: readonly string[]; callId: string }
  | { type: "steer-withdrawn"; steerId: string };

type SteerState = NonNullable<AgentTurnView["steer"]>["state"];

/** The part of the run projection these facts touch. */
interface InputTurns {
  turns: AgentTurnView[];
}

/** A user prompt that carries a supplement's id starts its receipt. */
export function steerOf(role: string, steerId: string | undefined): Pick<AgentTurnView, "steer"> {
  return role === "user" && steerId !== undefined ? { steer: { id: steerId, state: "received" } } : {};
}

/** Moves the named supplements forward; a fact never moves a receipt back, and a withdrawn one stays withdrawn. */
function advance(state: InputTurns, ids: readonly string[], to: SteerState): boolean {
  const rank: Record<SteerState, number> = { received: 0, applied: 1, read: 2, unread: 2, withdrawn: 2 };
  let changed = false;
  state.turns = state.turns.map(turn => {
    if (!turn.steer || !ids.includes(turn.steer.id) || rank[turn.steer.state] >= rank[to]) return turn;
    changed = true;
    return { ...turn, steer: { ...turn.steer, state: to } };
  });
  return changed;
}

export function applySteerApplied(state: InputTurns, event: Extract<InputEvent, { type: "steer-applied" }>): boolean {
  return advance(state, [event.steerId], "applied");
}

export function applySteerRead(state: InputTurns, event: Extract<InputEvent, { type: "steer-read" }>): boolean {
  return advance(state, event.steerIds, "read");
}

export function applySteerWithdrawn(state: InputTurns, event: Extract<InputEvent, { type: "steer-withdrawn" }>): boolean {
  return advance(state, [event.steerId], "withdrawn");
}

/** The round ended: every supplement no reply was kept with is `unread`, whether it reached the context or not. */
export function closeUnreadSteers(state: InputTurns): void {
  state.turns = state.turns.map(turn => turn.steer?.state === "received" || turn.steer?.state === "applied"
    ? { ...turn, steer: { ...turn.steer, state: "unread" } } : turn);
}

/** A supplement as the runtime takes it; `app` is the Host speaking, never the person. */
export interface SteerInput { text: string; source?: "person" | "app"; key?: string; interrupt?: boolean }
/** The session's own queue: what waits there for the next round, under the same keys the round's supplements use. */
export type QueueInput = (input: Omit<SteerInput, "interrupt">) => Promise<{ inputId: string; replayed: boolean }>;

/**
 * A supplement to a round. When the round has already ended, is asked to leave it for the next one, or ends between the
 * Host's read and the runtime taking it (`RUN_NOT_RUNNING`), it waits in the session under the same key — so one the round
 * did take is answered with its own id and never lands twice (specs/ai-input-receipts §7). Nothing starts a round here.
 */
export async function deliverSteer(input: AgentInputSend, ended: boolean, steer: (input: SteerInput) => Promise<{ steerId: string; replayed: boolean }>,
  queue: QueueInput | undefined, beforeQueue?: () => void): Promise<AgentSteerReceipt> {
  const one = { text: input.text, ...(input.source === "host" ? { source: "app" as const } : {}), ...(input.key ? { key: input.key } : {}) };
  const keep = async (): Promise<AgentSteerReceipt> => {
    if (!queue) throw agentErrors.capability_unavailable(ended ? "这一轮已经结束，当前运行时不能把补充留到下一轮" : "当前运行时不能把补充留到下一轮");
    beforeQueue?.();
    const kept = await queue(one);
    return { input_id: kept.inputId, replayed: kept.replayed, delivered: "queued" };
  };
  if (ended || input.mode === "after-run") return keep();
  try {
    const taken = await steer({ ...one, ...(input.mode === "interrupt" ? { interrupt: true } : {}) });
    return { input_id: taken.steerId, replayed: taken.replayed, delivered: "run" };
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code !== "RUN_NOT_RUNNING") throw error;
    return keep();
  }
}

/** A round as `inputsPort` needs it, read anew for each supplement. */
interface LiveRound { ended: boolean; steer(input: SteerInput): Promise<{ steerId: string; replayed: boolean }> }

/** The adapter's `inputs`: reads the round, hands the supplement over, and publishes the run's view whatever came of it. */
export function inputsPort(round: (run: AgentRunRef) => Promise<LiveRound>, queue: () => ((sessionId: string, input: Parameters<QueueInput>[0]) => ReturnType<QueueInput>) | undefined,
  publish: (runId: string) => void): AgentInputsPort {
  return { send: async (run, input, beforeQueue) => {
    const live = await round(run), keep = queue();
    try { return await deliverSteer(input, live.ended, one => live.steer(one), keep && (one => keep(run.session_id, one)), beforeQueue); } finally { publish(run.run_id); }
  } };
}
