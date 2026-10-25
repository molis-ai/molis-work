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
