/** Scroll ownership (specs/visual-ui-experience §scroll-ownership, VUX-26): the numbers the follower (`browser/scroll-follow.ts`)
 * and its tests share. */
/** Within this distance of the end a scroller counts as at the bottom: the current behaviour's 48px, one value everywhere. */
export const FOLLOW_NEAR_PX = 48;
/** For this long after a person's own scroll input the follower does not pin, so it never fights the hand. */
export const FOLLOW_COOLDOWN_MS = 150;
/** A scroll this soon after a person's input (wheel, touch, keys, scrollbar) is theirs; any other scroll is the page's own. */
export const FOLLOW_INPUT_WINDOW_MS = 700;

/** How far the end of the content is below the bottom of the view. */
export const followDistance = (box: { scrollHeight: number; scrollTop: number; clientHeight: number }) => box.scrollHeight - box.scrollTop - box.clientHeight;

/**
 * While following, the pin owns every shift, so the browser's own anchoring stands aside. Detached, one owner keeps the reading
 * place: the browser's anchoring, or, on a surface that compensates by hand (IM, Coding: a redraw, earlier pages, a restored
 * place), that compensation with `overflow-anchor: none` on its scroller, so a shift is never moved twice. A WebView without
 * scroll anchoring (WKWebView before Safari 27) relies on the hand.
 */
export const FOLLOW_STYLES = `[data-follow=following]{overflow-anchor:none}`;

