import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { StateMark, Words } from "./taskboard-types.js";
import type { Translate } from "./types.js";

const liveMarks = (entries: Readonly<Record<string, readonly [key: string, icon: string, tone: string]>>): Record<string, StateMark> => {
  const map: Record<string, StateMark> = {};
  for (const [name, [key, icon, tone]] of Object.entries(entries)) {
    Object.defineProperty(map, name, {
      enumerable: true,
      get: (): StateMark => [uiText.text(key), icon, tone],
    });
  }
  return map;
};

/** Status words and marks follow the Goal list: an icon and a short label, coloured by tone. */
export function boardWords(_L: Translate): Words {
  const state = liveMarks({
    "not-started": ["coding.board.state.not-started", "waiting", "idle"],
    ready: ["coding.board.state.ready", "ready", "ready"],
    running: ["coding.filter.running", "running", "progress"],
    succeeded: ["coding.board.state.succeeded", "done", "done"],
    failed: ["coding.board.state.failed", "failed", "blocked"],
    blocked: ["coding.board.state.blocked", "blocked", "blocked"],
    waiting: ["coding.board.state.waiting", "waiting", "progress"],
    "needs-reconciliation": ["coding.board.state.needs-reconciliation", "verify", "attention"],
    cancelled: ["coding.state.cancelled", "cancelled", "quiet"],
    skipped: ["coding.board.state.skipped", "cancelled", "quiet"],
    accepted: ["coding.board.state.accepted", "done", "accepted"],
    "needs-work": ["coding.board.state.needs-work", "blocked", "attention"],
    pending: ["coding.board.state.pending", "idle", "idle"],
  });
  const phase = liveMarks({
    starting: ["coding.board.phase.starting", "starting", "progress"],
    running: ["coding.filter.running", "running", "progress"],
    compacting: ["coding.call.compact", "running", "progress"],
    pausing: ["coding.phase.pausing", "paused", "attention"],
    paused: ["coding.state.paused", "paused", "attention"],
    "awaiting-input": ["coding.state.waiting-answer", "answer", "attention"],
    "awaiting-review": ["coding.state.waiting-approval", "approval", "attention"],
    completed: ["coding.board.phase.completed", "round-ended", "done"],
    failed: ["coding.timeline.failed", "failed", "blocked"],
    stopped: ["coding.phase.stopped", "stopped", "quiet"],
    cancelled: ["coding.state.cancelled", "cancelled", "quiet"],
    "reconcile-required": ["coding.board.phase.reconcile", "verify", "attention"],
  });
  const child = liveMarks({
    running: ["coding.filter.running", "running", "progress"],
    completed: ["coding.board.child.completed", "verify", "done"],
    failed: ["coding.timeline.failed", "failed", "blocked"],
    cancelled: ["coding.state.cancelled", "cancelled", "quiet"],
    stopped: ["coding.phase.stopped", "stopped", "quiet"],
  });
  return { state, phase, child };
}
