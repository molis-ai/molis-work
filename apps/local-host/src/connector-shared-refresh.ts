import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";

// One refresh of a connection's tokens at a time, shared by the calls waiting on it (W5-11 §2.6, RAC-1085). It belongs to its
// participants, never to the call that started it: a participant whose call ends only takes itself out. Before the request is sent at
// least one participant must still be current, or it is not sent. Once sent it is not aborted because the participants left, only its
// own time limit ends it: a service that rotates its refresh token (Microsoft, Atlassian, X…) may already have retired the old one.
// What the answer may then write is `settle`'s to say, after the caller's own last check.

/**
 * What the answer of a sent refresh may write: `deliver`, everything as usual, to the participants still current; `write_back`, only the
 * rotated credentials of the connection, every participant having cancelled (the user's decision of 2026-10-27, "只存新令牌");
 * `discard`, nothing, a participant having left because its call lost its authority.
 */
export type SharedRefreshOutcome = "deliver" | "write_back" | "discard";

export interface SharedRefreshRun {
  /** The checks of the refresh's own request, before it is sent: one participant still current. It never aborts the sent request. */
  readonly control: ConnectorCallControl;
  /** After the answer: each remaining participant's `beforeEffect` and `current`, and from them what may be written. */
  settle(): Promise<SharedRefreshOutcome>;
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

/** Starts `run` with `first` as its first participant; `first` must still be current. */
export function startSharedRefresh<T>(first: ConnectorCallControl, run: (refresh: SharedRefreshRun) => Promise<T>): SharedRefresh<T> {
  type Participant = { control: ConnectorCallControl; leave: (withdrawn: boolean) => void };
  const participants = new Set<Participant>();
  let withdrawn = false;
  // A participant is still current when its call is not cancelled and still has its authority; one that lost it is a withdrawal.
  const live = (participant: Participant): boolean => {
    if (participant.control.signal.aborted) { participant.leave(false); return false; }
    try { participant.control.current(); return true; } catch { participant.leave(true); return false; }
  };
  const checked = async (participant: Participant): Promise<boolean> => {
    try { await participant.control.beforeEffect(); } catch { participant.leave(!participant.control.signal.aborted); return false; }
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
  const settle = async (): Promise<SharedRefreshOutcome> => {
    let delivered = false;
    for (const participant of [...participants]) if (await checked(participant)) delivered = true;
    return delivered ? "deliver" : withdrawn ? "discard" : "write_back";
  };
  // A participant leaves when its call is cancelled; it is answered once the refresh ends, and then by its own checks first.
  const enter = (call: ConnectorCallControl): Participant => {
    call.signal.throwIfAborted(); call.current();
    const participant: Participant = { control: call, leave: byWithdrawal => {
      if (!participants.delete(participant)) return;
      call.signal.removeEventListener("abort", cancelled);
      if (byWithdrawal) withdrawn = true;
    } };
    const cancelled = () => participant.leave(false);
    participants.add(participant);
    call.signal.addEventListener("abort", cancelled, { once: true });
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
  const result = run({ control, settle });
  const answer = answered(opening, result);
  // The first caller may leave before it awaits its answer; the refresh's own failure is its participants' to see.
  answer.catch(() => {});
  return { first: answer, join: async call => answered(enter(call), result), done: result.then(() => undefined, () => undefined) };
}
