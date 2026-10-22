/**
 * Streamed text (specs/visual-ui-experience §stream-rendering, VUX-14/15): what `browser/stream-text.ts` takes and gives,
 * the one place fresh text starts, and its styles.
 */
export type StreamTextOptions = {
  /** Whether text that arrived with this update is shown arriving. Only a reply still being written; never a restore, a redraw or history. */
  reveal?: boolean;
  /**
   * A block with the same tag that changed and would otherwise be put in again whole (a code block the page has coloured and
   * given a copy button, a figure whose attributes carry its text) is offered to its owner first: `kept` is the node on the
   * page, `next` what the renderer gave now. Returning true means the owner found it only grew and brought `kept` up to `next`
   * itself, from where it ended (VUX-33: a streamed code block is coloured from its last line, not again from the top); false
   * puts `next` in as before.
   */
  grow?: (kept: Element, next: Element) => boolean;
};
export type StreamTextResult = {
  /** Top-level blocks kept as the same nodes (their selection, focus and listeners stay). */
  kept: number;
  /** Blocks put in: the tail that grew, a block rewritten, and the new ones. */
  replaced: number;
  /** Pieces of fresh text being shown arriving. */
  fresh: number;
  /** Blocks their owner brought up to date in place (`grow`), counted among neither the kept nor the replaced. */
  grown: number;
};
declare global {
  /** `window.molisStreamText(container, html, options)`: put a streamed reply's latest HTML in, keeping the blocks that did not change. */
  interface Window { molisStreamText?: (container: HTMLElement, html: string, options?: StreamTextOptions) => StreamTextResult }
}

/**
 * Where fresh text starts in `text` when `from` characters of it were shown before: `from`, moved back to the start of the
 * grapheme it would cut, so a reveal never splits an emoji sequence, a surrogate pair or an accent from its base. Without a
 * segmenter it is `from` itself.
 */
export function freshStart(text: string, from: number, segments?: (text: string) => Iterable<{ index: number; segment: string }>): number {
  if (from <= 0 || from >= text.length || !segments) return Math.max(0, Math.min(from, text.length));
  // Only the graphemes around the boundary matter; a cluster is never longer than this in practice.
  const start = Math.max(0, from - 32);
  for (const { index, segment } of segments(text.slice(start, Math.min(text.length, from + 32)))) {
    const at = start + index;
    if (at <= from && from < at + segment.length) return at;
  }
  return from;
}

/**
 * A piece of fresh text eases in once on the reveal tokens (90 ms, out-cubic): opacity from 0 and a 2 px blur, the lighter
 * of the two compared on the component board (6 px is the upper bound and reads as a smear on CJK). Only `.mw-fresh` may
 * animate `filter`; reduced motion shows it at once. A reply written while it streamed wraps greedily: `balance` and
 * `pretty` may move earlier lines as text is added (WebKit lays out the whole paragraph), so they wait for the reply to be
 * opened again from history.
 */
export const STREAM_TEXT_STYLES = `[data-streamed] :is(h1,h2,h3,p,blockquote,li,figcaption){text-wrap:wrap}.mw-fresh{animation:mw-fresh var(--dur-reveal) var(--ease-reveal) both}@keyframes mw-fresh{from{opacity:0;filter:blur(2px)}}@media (prefers-reduced-motion:reduce){.mw-fresh{animation:none}}`;
