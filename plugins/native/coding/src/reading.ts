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
  // Only the reader un-pins. Content that grew below the fold since the last paint (a card loading,
  // a section opening) did not move the reader, so it must not stop the follow either.
  const follow = input.pinned;
  return { follow, show_jump_to_latest: !follow };
}

/** How long after a wheel, touch, pointer or key a scroll still counts as the reader's own. */
export const READER_INTENT_MS = 800;

/**
 * Recompute the pin after a scroll. Reaching the bottom re-pins; only a scroll
 * the reader made un-pins. A card re-rendering above the fold, a panel keeping
 * its anchor, or content shrinking also fire scroll events — none of those is
 * the reader moving up, so they must not stop the follow.
 */
export function onReaderScrolled(position: ScrollPosition, input: { pinned: boolean; by_reader: boolean } = { pinned: false, by_reader: true }): boolean {
  if (atBottom(position)) return true;
  return input.by_reader ? false : input.pinned;
}
