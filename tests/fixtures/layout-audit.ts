import assert from "node:assert/strict";

/**
 * A page-side audit of a laid-out screen, for the screens whose whole job is to fit a window: the way in (the chooser, the
 * opening, Welcome, the new-project journey) is fixed chrome around two scrolling regions, so a wrong width or a long
 * name shows up as one thing sitting on another, a control cut off, or a label that quietly stops. It reads geometry
 * only, in the page, after the screen has settled:
 *
 * - page-overflow-x / -y, body-overflow-x: the window itself must not scroll or grow sideways.
 * - offscreen-x: a control outside the window, outside any region that scrolls sideways.
 * - clipped: a control cut by an ancestor that hides its overflow (a scroller reveals what it hides, so it never counts).
 * - covered: the middle of a control's visible part belongs to something else, so a click would miss it.
 * - tiny-target: a control under 24 CSS px on its short side (links inside a sentence excepted).
 * - unnamed: a control a screen reader could not name (no label, no shown words, no title): an icon-only button on a phone.
 * - silent-clip: a box that hides what does not fit without an ellipsis.
 * - overlap: two controls, text lines or icons of different elements whose boxes cross by more than 2 px each way.
 *
 * Boxes are taken as seen: cut by every ancestor that clips or scrolls, and by the window.
 */
export const LAYOUT_AUDIT = String.raw`(() => {
  const root = document.documentElement;
  const vw = root.clientWidth, vh = root.clientHeight;
  const findings = [];
  const seen = new Set();
  const label = (el) => {
    if (!(el instanceof Element)) return String(el);
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + (text ? '「' + text + '」' : '');
  };
  const add = (kind, a, b, extra = {}) => {
    const key = kind + '|' + (a ? label(a) : '') + '|' + (b ? label(b) : '');
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ kind, a: a ? label(a) : undefined, b: b ? label(b) : undefined, ...extra });
  };
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const round = (n) => Math.round(n * 10) / 10;

  if (root.scrollWidth > vw + 1) add('page-overflow-x', document.body, null, { scrollWidth: root.scrollWidth, vw });
  if (root.scrollHeight > vh + 1) add('page-overflow-y', document.body, null, { scrollHeight: root.scrollHeight, vh });
  if (document.body.scrollWidth > vw + 1) add('body-overflow-x', document.body, null, { scrollWidth: document.body.scrollWidth, vw });

  const inSideScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  // What an ancestor that hides its overflow leaves of the element. Inside a scroller nothing is lost (it scrolls in).
  const hiddenClip = (el) => {
    const r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.position === 'fixed' || /(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) break;
      const clipX = /(hidden|clip)/.test(s.overflowX), clipY = /(hidden|clip)/.test(s.overflowY);
      if (!clipX && !clipY) continue;
      const pr = p.getBoundingClientRect();
      if (clipX) { left = Math.max(left, pr.left); right = Math.min(right, pr.right); }
      if (clipY) { top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); }
    }
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  };
  // What can be seen of a box: cut by every ancestor that clips or scrolls, and by the window.
  const seenRect = (el, base) => {
    const r = base || el.getBoundingClientRect();
    let L = r.left, T = r.top, R = r.right, B = r.bottom;
    for (let cur = el; cur && cur !== root; cur = cur.parentElement) {
      if (getComputedStyle(cur).position === 'fixed') break;
      const p = cur.parentElement;
      if (!p || p === root) break;
      const ps = getComputedStyle(p);
      const cx = ps.overflowX !== 'visible', cy = ps.overflowY !== 'visible';
      if (!cx && !cy) continue;
      const pr = p.getBoundingClientRect();
      if (cx) { L = Math.max(L, pr.left); R = Math.min(R, pr.right); }
      if (cy) { T = Math.max(T, pr.top); B = Math.min(B, pr.bottom); }
    }
    L = Math.max(L, 0); T = Math.max(T, 0); R = Math.min(R, vw); B = Math.min(B, vh);
    return { left: L, top: T, right: R, bottom: B, width: Math.max(0, R - L), height: Math.max(0, B - T) };
  };

  const interactive = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=option], [role=button], [role=tab], [tabindex]:not([tabindex="-1"])')]
    // A control hidden by the screen-reader-only technique (a 1px box) is not on the screen; its label is the target.
    .filter((el) => shown(el) && !el.closest('[inert], [hidden], template') && !(el.getBoundingClientRect().width <= 2 && el.getBoundingClientRect().height <= 2));

  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const area = r.width * r.height;
    if (hiddenClip(el) < area * 0.9 && !(r.bottom < 0 || r.top > vh)) add('clipped', el, null, { visible: round(hiddenClip(el) / area) });
    if (!inSideScroller(el) && (r.left < -1 || r.right > vw + 1)) add('offscreen-x', el, null, { left: round(r.left), right: round(r.right), vw });
    const v = seenRect(el);
    if (v.width > 3 && v.height > 3 && v.width * v.height >= area * 0.25) {
      const hit = document.elementFromPoint((v.left + v.right) / 2, (v.top + v.bottom) / 2);
      if (hit && !(el.contains(hit) || hit.contains(el) || hit.closest('label')?.contains(el))) add('covered', el, hit);
    }
    // What a screen reader would call it: its own label, the words it shows (a label a phone hides is not shown), or its title.
    const named = el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent?.trim())
      || (el.innerText || '').trim() || el.getAttribute('title') || el.labels?.length || (el.matches('input, textarea, select') && el.getAttribute('placeholder'));
    if (!named) add('unnamed', el, null);
    const small = Math.min(r.width, r.height);
    if (small < 24 && !el.matches('input[type=checkbox], input[type=radio], a') && !el.closest('p, li, .mw-kbd')) add('tiny-target', el, null, { w: round(r.width), h: round(r.height) });
  }

  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const s = getComputedStyle(el);
    if (!/(hidden|clip)/.test(s.overflowX) || s.textOverflow === 'ellipsis' || el.clientWidth <= 0) continue;
    if (el.scrollWidth > el.clientWidth + 1 && !el.closest('.mw-sr-only, .sr-only') && ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || el.children.length)) {
      add('silent-clip', el, null, { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }

  const boxes = [];
  const push = (el, rect, kind) => {
    const v = seenRect(el, rect);
    // Text is also cut by the box it sits in when that box hides its overflow (an ellipsis, a clamp).
    if (kind === 'text') {
      const own = getComputedStyle(el), box = el.getBoundingClientRect();
      if (own.overflowX !== 'visible') { v.left = Math.max(v.left, box.left); v.right = Math.min(v.right, box.right); v.width = Math.max(0, v.right - v.left); }
      if (own.overflowY !== 'visible') { v.top = Math.max(v.top, box.top); v.bottom = Math.min(v.bottom, box.bottom); v.height = Math.max(0, v.bottom - v.top); }
    }
    if (v.width > 1 && v.height > 1) boxes.push({ el, rect: v, kind });
  };
  const decorative = (el) => el.closest('[aria-hidden="true"]') && getComputedStyle(el).pointerEvents === 'none';
  for (const el of interactive) if (!decorative(el)) push(el, el.getBoundingClientRect(), 'control');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || !shown(el) || el.closest('script, style, template, noscript, [hidden]') || decorative(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const size = parseFloat(getComputedStyle(el).fontSize) || 14;
    for (const rect of range.getClientRects()) {
      // A text box is taller than its ink (display type most of all): shrink it to the height of the glyphs, 85% of the
      // font size, and take 1px off each side.
      const trim = Math.max(rect.height > 12 ? 2 : 0, (rect.height - size * 0.85) / 2);
      push(el, { left: rect.left + 1, right: rect.right - 1, top: rect.top + trim, bottom: rect.bottom - trim, width: rect.width - 2, height: rect.height - 2 * trim }, 'text');
    }
  }
  for (const svg of document.querySelectorAll('svg')) {
    if (!shown(svg) || svg.closest('template, [hidden], .icon-sprite') || decorative(svg)) continue;
    const r = svg.getBoundingClientRect();
    if (r.width >= 10 && r.height >= 10) push(svg, r, 'icon');
  }
  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (related(A.el, B.el)) continue;
      const ix = Math.min(A.rect.right, B.rect.right) - Math.max(A.rect.left, B.rect.left);
      const iy = Math.min(A.rect.bottom, B.rect.bottom) - Math.max(A.rect.top, B.rect.top);
      if (ix > 2 && iy > 2) add('overlap', A.el, B.el, { between: A.kind + '/' + B.kind, w: round(ix), h: round(iy) });
    }
  }
  return findings;
})()`;

export interface LayoutFinding { kind: string; a?: string; b?: string; [detail: string]: unknown }
type Evaluate = <T = unknown>(expression: string) => Promise<T>;

export const layoutFindings = (evaluate: Evaluate): Promise<LayoutFinding[]> => evaluate<LayoutFinding[]>(LAYOUT_AUDIT);

/** The screen, as it stands, has nothing sitting on anything else, cut off, or out of reach. `where` says which screen. */
export async function assertLayoutClean(evaluate: Evaluate, where: string, options: { allow?: (finding: LayoutFinding) => boolean } = {}): Promise<void> {
  const findings = (await layoutFindings(evaluate)).filter(finding => !options.allow?.(finding));
  assert.deepEqual(findings, [], `${where}: ${findings.length} layout problem(s)`);
}
