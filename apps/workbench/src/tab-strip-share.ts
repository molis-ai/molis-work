/** Chrome-like tab widths: hug content until the strip overflows, then share equally.
 *  Stringified into the browser factory — keep parameter lists type-annotation-free. */

export const TAB_SHARE_MAX = 172;
export const TAB_SHARE_MIN = 72;
/** Narrow/touch close is 44px; 72 cannot hold icon + close. */
export const TAB_SHARE_MIN_TOUCH = 96;

/** Remaining px after chrome, and each flexible tab's content width. Null means hug. */
export const tabShareWidth = (available: number, hugWidths: number[], min = TAB_SHARE_MIN) => {
  const count = hugWidths.length;
  if (count <= 0) return null;
  if (available <= 0) return min;
  const hug = hugWidths.reduce((sum, width) => sum + width, 0);
  if (hug <= available + 0.5) return null;
  return Math.max(min, Math.floor(available / count));
};

export const tabShareMin = (touch: boolean) => (touch ? TAB_SHARE_MIN_TOUCH : TAB_SHARE_MIN);

/** Space `.tab-scroll` may occupy: strip minus add/split/other chrome and gaps.
 *  Pass the spacer's min-width in siblingChrome, not its stretched used width. */
export const tabScrollAllotment = (stripWidth: number, siblingChrome: number, gap: number, childCount: number) => {
  if (stripWidth <= 0) return 0;
  return Math.max(0, stripWidth - siblingChrome - gap * Math.max(0, childCount - 1));
};
