import type { StateMark, Words } from "./taskboard-types.js";
import type { Translate } from "./types.js";

/** Status words and marks follow the Goal list: an icon and a short label, coloured by tone. */
export function boardWords(L: Translate): Words {
  const state: Record<string, StateMark> = {
    "not-started": [L("coding.board.state.not-started"), "waiting", "idle"],
    ready: [L("coding.board.state.ready"), "ready", "ready"],
    running: [L("coding.filter.running"), "running", "progress"],
    succeeded: [L("coding.board.state.succeeded"), "done", "done"],
    failed: [L("coding.board.state.failed"), "failed", "blocked"],
    blocked: [L("coding.board.state.blocked"), "blocked", "blocked"],
    waiting: [L("coding.board.state.waiting"), "waiting", "progress"],
    "needs-reconciliation": [L("coding.board.state.needs-reconciliation"), "verify", "attention"],
    cancelled: [L("coding.state.cancelled"), "cancelled", "quiet"],
    skipped: [L("coding.board.state.skipped"), "cancelled", "quiet"],
    accepted: [L("coding.board.state.accepted"), "done", "accepted"],
    "needs-work": [L("coding.board.state.needs-work"), "blocked", "attention"],
    pending: [L("coding.board.state.pending"), "idle", "idle"],
  };
  const phase: Record<string, StateMark> = {
    starting: [L("coding.board.phase.starting"), "starting", "progress"],
    running: [L("coding.filter.running"), "running", "progress"],
    compacting: [L("coding.call.compact"), "running", "progress"],
    pausing: [L("coding.phase.pausing"), "paused", "attention"],
    paused: [L("coding.state.paused"), "paused", "attention"],
    "awaiting-input": [L("coding.state.waiting-answer"), "answer", "attention"],
    "awaiting-review": [L("coding.state.waiting-approval"), "approval", "attention"],
    completed: [L("coding.board.phase.completed"), "round-ended", "done"],
    failed: [L("coding.timeline.failed"), "failed", "blocked"],
    stopped: [L("coding.phase.stopped"), "stopped", "quiet"],
    cancelled: [L("coding.state.cancelled"), "cancelled", "quiet"],
    "reconcile-required": [L("coding.board.phase.reconcile"), "verify", "attention"],
  };
  const child: Record<string, StateMark> = {
    running: [L("coding.filter.running"), "running", "progress"],
    completed: [L("coding.board.child.completed"), "verify", "done"],
    failed: [L("coding.timeline.failed"), "failed", "blocked"],
    cancelled: [L("coding.state.cancelled"), "cancelled", "quiet"],
    stopped: [L("coding.phase.stopped"), "stopped", "quiet"],
  };
  return { state, phase, child };
}
