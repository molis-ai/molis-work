import { MENTIONS_MARKER, digestTask } from "../../continuation.js";
import type { Page } from "./page.js";

/** The name a session's unsent draft is kept under in this browser. */
export function draftKey(page: Page, id: string): string {
  return "molis-coding-draft:" + page.root.dataset.codingPrefix + ":" + id;
}

/** Puts the cursor in the composer (or in `node`, when one is given). */
export function toInput(page: Page, node?: HTMLElement | null) {
  (node || page.input).focus({ preventScroll: true });
}

/** A round's state as the ring of the state mark draws it. */
export function phaseRing(phase: string): string {
  const rings: Readonly<Record<string, string>> = {
    starting: "starting", running: "running", compacting: "running", pausing: "paused", paused: "paused", "awaiting-input": "answer", "awaiting-review": "approval",
    completed: "round-ended", failed: "failed", stopped: "stopped", cancelled: "cancelled", "reconcile-required": "verify",
  };
  return rings[phase] || "idle";
}

/** The conversation follows the newest round while the reader has not scrolled away. */
export function following(page: Page): boolean {
  return page.s.follow.state === "following";
}

/** Draws the Host's review cards for some rounds in a container, for as long as the session stays on show. */
export function showReviews(page: Page, container: Element, refs: readonly { readonly run_id: string }[], sessionId?: string | null, workspaceId?: string | null, scope?: { readonly runSession: string; readonly limit: number }) {
  return page.host.showReviews?.(container, refs, sessionId, workspaceId, scope, { lifetime: page.lifetime, signal: page.s.viewSignal });
}

/** The person's own task, read out of the text a round was sent. */
export function ownTask(text: string): string {
  const own = digestTask(text), at = own.indexOf(MENTIONS_MARKER);
  return at < 0 ? own : own.slice(0, at);
}

/** Forgets the rounds held for the open session, so the next read starts from the newest. */
export function resetWindow(page: Page) {
  const { s } = page;
  s.earlierRuns = [];
  s.earlierFingerprint = "";
  s.olderViews = new Map();
  s.olderPlanEntries = [];
  s.olderSubagents = [];
  s.windowRuns = [];
  s.allRuns = [];
  s.pageLoading = false;
}
