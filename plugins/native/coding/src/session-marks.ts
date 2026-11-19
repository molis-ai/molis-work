import type { CodingSessionState } from "./projection.js";

/**
 * How a session's state reads in the directory: its words (a message key) and its state ring (`data-mw-state`). One table for
 * the Host's first paint (ui.ts) and the page's live list (client.ts), so the row the page draws over the first paint is the
 * same row (specs/visual-ui-experience VUX-31, VUX-39).
 */
export const CODING_SESSION_MARKS: Record<CodingSessionState, { readonly label: string; readonly ring: string }> = {
  "idle": { label: "coding.state.idle", ring: "idle" },
  "running": { label: "coding.state.running", ring: "running" },
  "paused": { label: "coding.state.paused", ring: "paused" },
  "waiting-answer": { label: "coding.state.waiting-answer", ring: "answer" },
  "waiting-approval": { label: "coding.state.waiting-approval", ring: "approval" },
  "failed": { label: "coding.state.failed", ring: "failed" },
  "stopped": { label: "coding.phase.stopped", ring: "stopped" },
  "cancelled": { label: "coding.state.cancelled", ring: "cancelled" },
  "reconcile-required": { label: "coding.session.reconcile", ring: "verify" },
  "queued": { label: "coding.state.queued", ring: "idle" },
  "done": { label: "coding.state.done", ring: "idle" },
};

/**
 * The states that ask something of the person: waiting on them, or failed. In the directory only these say so, in the short
 * word given here (a message key); every other state is its ring alone, so the session's name has the line (screen-polish
 * §6.1, POLISH-23). The state's full words stay the chip's title and what a screen reader hears.
 */
export const CODING_SESSION_ASKS: Readonly<Record<string, string>> = {
  "paused": "coding.session.short.paused",
  "waiting-answer": "coding.session.short.waiting",
  "waiting-approval": "coding.session.short.waiting",
  "failed": "coding.session.short.failed",
  "reconcile-required": "coding.session.short.reconcile",
};
