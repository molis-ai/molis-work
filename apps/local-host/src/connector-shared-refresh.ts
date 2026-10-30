import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { actionErrorKind } from "@molis-ai/molis-work-plugin-sdk";

// One refresh of a connection's tokens at a time, shared by the calls waiting on it (W5-11 §2.6, RAC-1085). It belongs to its
// participants, never to the call that started it: a participant whose call ends only takes itself out. Before the request is sent at
// least one participant must still be current, or it is not sent. Once sent it is not aborted because the participants left, only its
// own time limit ends it: a service that rotates its refresh token (Microsoft, Atlassian, X…) may already have retired the old one.
// What the answer may then write is `outcome`'s to say, asked after `settle` and the caller's own last `await`, right before it writes:
// a participant that passed its check may lose its authority while another's check is awaited, or while the caller awaits its own.

/**
 * What the answer of a sent refresh may write: `deliver`, everything as usual, to the participants still current; `write_back`, only the
 * rotated credentials of the connection, every participant having cancelled (the user's decision of 2026-10-27, "只存新令牌");
 * `discard`, nothing, a participant having left because its call lost its authority (`cancelledBy` says which is which).
 */
export type SharedRefreshOutcome = "deliver" | "write_back" | "discard";

export interface SharedRefreshRun {
  /** The checks of the refresh's own request, before it is sent: one participant still current. It never aborts the sent request. */
  readonly control: ConnectorCallControl;
  /**
   * After the answer: each remaining participant's `beforeEffect`, one after another, leaving the ones that no longer pass. It says
   * nothing of what may be written: a participant that passed may lose its authority while a later one's check is out, and a withdrawal
   * already queued runs before the caller resumes, so the caller asks `outcome` after its own last `await` (S-95, #1479 统筹裁定 T-063).
   */
  settle(): Promise<void>;
  /**
   * What may be written now: every remaining participant's `current`, synchronously. The caller asks it after its own last `await` and
   * writes in the same synchronous run, so no participant can lose its authority between this answer and the write (S-95).
   */
  outcome(): SharedRefreshOutcome;
}

export interface SharedRefresh<T> {
  /** The first participant's answer: the refresh's result once its own call passes its checks again. */
  readonly first: Promise<T>;
  /** One more participant, answered the same way. */
  join(control: ConnectorCallControl): Promise<T>;
  /** Settles when the refresh itself has ended, whatever the participants did. */
  readonly done: Promise<void>;
}

const NO_PARTICIPANT = "没有调用在等这次刷新，不再发出";

/**
 * Whether a call that ended was cancelled: aborted for `cancelled` or `timeout` (the action gateway when its caller goes, a time limit),
 * or with an `AbortError` or `TimeoutError`. The platform also withdraws a call by aborting it (a plugin instance stopped, an authority
 * the call's monitor saw lost, a connection changed under it), so any other reason, and a failed check with no abort, is a withdrawal
 * (second review of #1479).
 */
function cancelledBy(signal: AbortSignal): boolean {
  if (!signal.aborted) return false;
  const reason: unknown = signal.reason;
  if (reason instanceof DOMException) return reason.name === "AbortError" || reason.name === "TimeoutError";
  const kind = actionErrorKind(reason);
  return kind === "cancelled" || kind === "timeout";
}

/** Starts `run` with `first` as its first participant; `first` must still be current. */
export function startSharedRefresh<T>(first: ConnectorCallControl, run: (refresh: SharedRefreshRun) => Promise<T>): SharedRefresh<T> {
  type Participant = { control: ConnectorCallControl; leave: (withdrawn: boolean) => void };
  const participants = new Set<Participant>();
  let withdrawn = false;
  // A participant is still current when its call is not aborted and still has its authority; one that is not leaves, as a withdrawal
  // unless it was cancelled.
  const ended = (participant: Participant): false => { participant.leave(!cancelledBy(participant.control.signal)); return false; };
  const live = (participant: Participant): boolean => {
    if (participant.control.signal.aborted) return ended(participant);
    try { participant.control.current(); return true; } catch { return ended(participant); }
  };
  const checked = async (participant: Participant): Promise<boolean> => {
    try { await participant.control.beforeEffect(); } catch { return ended(participant); }
    return live(participant);
  };
  const control: ConnectorCallControl = {
    signal: new AbortController().signal,
    async beforeEffect() {
      for (const participant of [...participants]) if (await checked(participant)) return;
      throw new Error(NO_PARTICIPANT);
    },
    current() {
      for (const participant of [...participants]) if (live(participant)) return;
      throw new Error(NO_PARTICIPANT);
    },
  };
  // Every participant still in is asked again, each check leaving the ones that no longer pass; then whoever is left decides.
  const outcome = (): SharedRefreshOutcome => {
    let delivered = false;
    for (const participant of [...participants]) if (live(participant)) delivered = true;
    return delivered ? "deliver" : withdrawn ? "discard" : "write_back";
  };
  // A participant that passed its `beforeEffect` may lose its authority while the next one's is awaited: none of these answers counts
  // until `outcome` asks them all again, in the caller's write's own synchronous run.
  const settle = async (): Promise<void> => {
    for (const participant of [...participants]) await checked(participant);
  };
  // A participant leaves when its call is aborted; it is answered once the refresh ends, and then by its own checks first.
  const enter = (call: ConnectorCallControl): Participant => {
    call.signal.throwIfAborted(); call.current();
    const participant: Participant = { control: call, leave: byWithdrawal => {
      if (!participants.delete(participant)) return;
      call.signal.removeEventListener("abort", aborted);
      if (byWithdrawal) withdrawn = true;
    } };
    const aborted = () => participant.leave(!cancelledBy(call.signal));
    participants.add(participant);
    call.signal.addEventListener("abort", aborted, { once: true });
    return participant;
  };
  const answered = async (participant: Participant, result: Promise<T>): Promise<T> => {
    const call = participant.control;
    try {
      const value = await result;
      await call.beforeEffect(); call.current(); call.signal.throwIfAborted();
      return value;
    } catch (error) {
      await call.beforeEffect(); call.current(); call.signal.throwIfAborted();
      throw error;
    } finally { participant.leave(false); }
  };
  // The first participant is in before the run starts, so the run's first check already has it.
  const opening = enter(first);
  const result = run({ control, settle, outcome });
  const answer = answered(opening, result);
  // The first caller may leave before it awaits its answer; the refresh's own failure is its participants' to see.
  answer.catch(() => {});
  return { first: answer, join: async call => answered(enter(call), result), done: result.then(() => undefined, () => undefined) };
}
