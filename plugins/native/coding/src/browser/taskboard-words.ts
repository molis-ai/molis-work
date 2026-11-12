import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { StateMark, Words } from "./taskboard-types.js";
import type { Translate } from "./types.js";

/** Status words and marks follow the Goal list: an icon and a short label, coloured by tone. */
export function boardWords(_L: Translate): Words {
  const state: Record<string, StateMark> = {
    "not-started": [uiText.text("coding.board.state.not-started"), "waiting", "idle"],
    ready: [uiText.text("coding.board.state.ready"), "ready", "ready"],
    running: [uiText.text("coding.filter.running"), "running", "progress"],
    succeeded: [uiText.text("coding.board.state.succeeded"), "done", "done"],
    failed: [uiText.text("coding.board.state.failed"), "failed", "blocked"],
    blocked: [uiText.text("coding.board.state.blocked"), "blocked", "blocked"],
    waiting: [uiText.text("coding.board.state.waiting"), "waiting", "progress"],
    "needs-reconciliation": [uiText.text("coding.board.state.needs-reconciliation"), "verify", "attention"],
    cancelled: [uiText.text("coding.state.cancelled"), "cancelled", "quiet"],
    skipped: [uiText.text("coding.board.state.skipped"), "cancelled", "quiet"],
    accepted: [uiText.text("coding.board.state.accepted"), "done", "accepted"],
    "needs-work": [uiText.text("coding.board.state.needs-work"), "blocked", "attention"],
    pending: [uiText.text("coding.board.state.pending"), "idle", "idle"],
  };
  const phase: Record<string, StateMark> = {
    starting: [uiText.text("coding.board.phase.starting"), "starting", "progress"],
    running: [uiText.text("coding.filter.running"), "running", "progress"],
    compacting: [uiText.text("coding.call.compact"), "running", "progress"],
    pausing: [uiText.text("coding.phase.pausing"), "paused", "attention"],
    paused: [uiText.text("coding.state.paused"), "paused", "attention"],
    "awaiting-input": [uiText.text("coding.state.waiting-answer"), "answer", "attention"],
    "awaiting-review": [uiText.text("coding.state.waiting-approval"), "approval", "attention"],
    completed: [uiText.text("coding.board.phase.completed"), "round-ended", "done"],
    failed: [uiText.text("coding.timeline.failed"), "failed", "blocked"],
    stopped: [uiText.text("coding.phase.stopped"), "stopped", "quiet"],
    cancelled: [uiText.text("coding.state.cancelled"), "cancelled", "quiet"],
    "reconcile-required": [uiText.text("coding.board.phase.reconcile"), "verify", "attention"],
  };
  const child: Record<string, StateMark> = {
    running: [uiText.text("coding.filter.running"), "running", "progress"],
    completed: [uiText.text("coding.board.child.completed"), "verify", "done"],
    failed: [uiText.text("coding.timeline.failed"), "failed", "blocked"],
    cancelled: [uiText.text("coding.state.cancelled"), "cancelled", "quiet"],
    stopped: [uiText.text("coding.phase.stopped"), "stopped", "quiet"],
  };
  return { state, phase, child };
}
