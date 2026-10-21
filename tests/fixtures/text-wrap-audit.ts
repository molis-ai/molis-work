/**
 * The text-wrap audit (specs/visual-ui-experience §type-optics, VUX-04), evaluated in a page: what a reader would see as a
 * wrapping fault on the screen as it is drawn now.
 * - `heading`: a visible h1–h3 (or role=heading) on two or more lines whose last line is under a third of its longest.
 * - `orphan`: a visible paragraph, list item or quote on two or more lines whose last line is one CJK character (with any
 *   punctuation after it).
 * - `spill`: text drawn past the box that clips it (an ancestor whose overflow is not visible), with no ellipsis: a long
 *   word, path or URL that neither wraps nor is meant to scroll.
 * Code, inputs, scrollers that scroll on purpose (overflow auto/scroll, `data-overflow-fade`) and hidden text (a
 * screen-reader-only 1px box among it) are left out.
 */
export const TEXT_WRAP_AUDIT = `(() => {
  const issues = [];
  // A 1px box is the screen-reader-only technique: its words are for a screen reader, not drawn past anything.
  const shown = (el) => { const box = el.getBoundingClientRect(); if (!box.width || !box.height || (box.width <= 1 && box.height <= 1)) return false;
    const style = getComputedStyle(el); return style.visibility !== 'hidden' && style.display !== 'none' && !el.closest('[hidden], [inert], [aria-hidden=true]'); };
  const lines = (el) => { const rows = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) { if (!node.data.trim()) continue;
      for (let i = 0; i < node.length; i++) { range.setStart(node, i); range.setEnd(node, i + 1); const rect = range.getClientRects()[0]; if (!rect || !rect.width) continue;
        let row = rows.find(r => Math.abs(r.top - rect.top) < rect.height / 2); if (!row) { row = { top: rect.top, left: rect.left, right: rect.right, text: '' }; rows.push(row); }
        row.left = Math.min(row.left, rect.left); row.right = Math.max(row.right, rect.right); row.text += node.data[i]; } }
    return rows.sort((a, b) => a.top - b.top); };
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const skip = 'pre, code, kbd, samp, textarea, input, select, svg, [contenteditable=true], .mw-sr-only, [data-overflow-fade]';
  // An open dialog or menu marked data-audit-scope is read alone.
  const scope = document.querySelector('[data-audit-scope]') || document.body;
  for (const el of scope.querySelectorAll('h1, h2, h3, [role=heading]')) {
    if (!shown(el) || el.closest(skip)) continue; const rows = lines(el); if (rows.length < 2) continue;
    const widest = Math.max(...rows.map(r => r.right - r.left)), last = rows.at(-1);
    if ((last.right - last.left) < widest / 3) issues.push({ kind: 'heading', at: name(el), text: el.textContent.trim().slice(0, 60), last: last.text.trim() });
  }
  for (const el of scope.querySelectorAll('p, li, blockquote, figcaption')) {
    if (!shown(el) || el.closest(skip)) continue; const rows = lines(el); if (rows.length < 2) continue;
    const last = rows.at(-1).text.trim();
    if (/^[\\u3400-\\u9fff][\\u3000-\\u303f\\uff00-\\uffef]*$/.test(last)) issues.push({ kind: 'orphan', at: name(el), text: el.textContent.trim().slice(0, 60), last });
  }
  const clip = (el) => { for (let node = el.parentElement; node; node = node.parentElement) { const style = getComputedStyle(node);
    if (/auto|scroll/.test(style.overflowX)) return null; if (style.overflowX !== 'visible') return node; } return null; };
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT); const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement; if (!el || !node.data.trim() || el.closest(skip) || !shown(el)) continue;
    const box = clip(el); if (!box) continue;
    let ellipsis = false; for (let up = el; up && up !== box.parentElement; up = up.parentElement) if (getComputedStyle(up).textOverflow === 'ellipsis') ellipsis = true;
    if (ellipsis) continue;
    range.selectNodeContents(node); const edge = box.getBoundingClientRect(); const style = getComputedStyle(box);
    const right = edge.right - parseFloat(style.borderRightWidth), left = edge.left + parseFloat(style.borderLeftWidth);
    for (const rect of range.getClientRects()) if (rect.width && (rect.right > right + 1 || rect.left < left - 1)) { issues.push({ kind: 'spill', at: name(el), text: node.data.trim().slice(0, 60), by: Math.round(Math.max(rect.right - right, left - rect.left)) }); break; }
  }
  return issues; })()`;

export type TextWrapIssue = { kind: "heading" | "orphan" | "spill"; at: string; text: string; last?: string; by?: number };
