/**
 * Reading behaviour for a stream that keeps growing while it is being read.
 *
 * The rule is one sentence: **follow new content while the reader is at the
 * bottom, and never take the scroll away once they have moved up.** A
 * conversation that yanks itself down mid-sentence is unreadable, and a user
 * who scrolled up did so on purpose.
 */

export interface ScrollPosition {
  /** Pixels scrolled from the top. */
  offset: number;
  /** Height of the visible area. */
  viewport: number;
  /** Total scrollable height. */
  content: number;
}

/** How close to the bottom still counts as "at the bottom". */
export const STICK_THRESHOLD_PX = 24;

export function atBottom(position: ScrollPosition): boolean {
  const remaining = position.content - (position.offset + position.viewport);
  return remaining <= STICK_THRESHOLD_PX;
}

export interface StickDecision {
  /** Whether to scroll down to the newest content. */
  follow: boolean;
  /** Whether to offer a way back to the newest content. */
  show_jump_to_latest: boolean;
}

/**
 * Decide what to do when new content arrives.
 *
 * `pinned` is what the reader last established: it starts true and turns false
 * the moment they scroll up. It does not turn back on by itself — only
 * returning to the bottom does that, which is the reader's own action.
 */
export function onContentAppended(input: {
  position: ScrollPosition;
  pinned: boolean;
}): StickDecision {
  const follow = input.pinned && atBottom(input.position);
  return { follow, show_jump_to_latest: !follow };
}

/** Recompute the pin after the reader scrolled. Reaching the bottom re-pins. */
export function onReaderScrolled(position: ScrollPosition): boolean {
  return atBottom(position);
}
