/**
 * The truncation audit (specs/visual-ui-experience §type-optics, VUX-05), evaluated in a page as drawn: every shown text
 * cut short by an ellipsis or a line clamp, whether the whole of it can be found again, and whether it is something that
 * must never be cut.
 * Every cut text, an action's label, an error and a status among them, must be recoverable (the spec forbids only cuts that
 * cannot be undone): each is tagged `data-cut-audit` so the test can point at it and read the tooltip.
 * - `keyboard`: a control or row holds it but nothing in or around it takes keyboard focus, so a keyboard never reaches it.
 * A cut text nothing holds (a heading) is shown to a pointer or a finger; it is not a place keyboard focus goes.
 * Inside the element marked `data-audit-scope` only, when there is one (an open dialog or menu).
 */
export const TRUNCATION_AUDIT = `(() => {
  const HOLDERS = 'a[href], button, summary, [role=button], [role=tab], [role=option], [role=menuitem], [role=treeitem], [role=row], [tabindex]:not([tabindex="-1"]), li';
  const FOCUSABLE = 'a[href], button:not([disabled]), summary, input:not([disabled]), select, textarea, [tabindex]';
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !el.closest('[inert], [aria-hidden=true]');
  document.querySelectorAll('[data-cut-audit]').forEach(el => el.removeAttribute('data-cut-audit'));
  const found = [], held = [];
  for (const el of (document.querySelector('[data-audit-scope]') || document.body).querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || !el.textContent.trim() || el.closest('pre, code, textarea, input, select, [contenteditable=true], .craft-tip')) continue;
    const style = getComputedStyle(el);
    const clamped = style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '' && el.scrollHeight > el.clientHeight + 1;
    const ellipsis = style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1;
    if (!(clamped || ellipsis) || !shown(el)) continue;
    const text = el.textContent.replace(/\\s+/g, ' ').trim();
    const at = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '');
    const holder = el.closest(HOLDERS);
    const reachable = (node) => node.matches(FOCUSABLE) || node.querySelector(FOCUSABLE) || node.closest('[role=tablist], [role=listbox], [role=menu], [role=toolbar], [role=radiogroup], [role=tree], [role=grid]');
    // A summary drawn as one picture (role=img, its name in its label) is one unit; its parts are not keyboard stops.
    if (holder && !holder.closest('[role=img]') && ![holder, holder.parentElement?.closest(HOLDERS)].some(node => node && reachable(node))) found.push({ kind: 'keyboard', at, text: text.slice(0, 60) });
    el.dataset.cutAudit = String(held.length); held.push({ index: held.length, at, text });
  }
  return { found, held }; })()`;

/**
 * Seeded names are short, so few texts are cut as drawn. Every shown text whose own style says it may be cut (an ellipsis
 * on one line, or a line clamp) is lengthened in place, in its last text, so each place that can cut is checked cut.
 * Returns how many were lengthened.
 */
export const TRUNCATION_STRESS = `(() => {
  const LONG = '，再加上一段很长的说明，长到任何一行都放不下，这样才能看出截断之后还找不找得回来';
  let count = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || el.dataset.cutStressed != null || el.closest('pre, code, textarea, input, select, svg, [contenteditable=true], .craft-tip')) continue;
    const style = getComputedStyle(el);
    if (style.textOverflow !== 'ellipsis' && (style.webkitLineClamp === 'none' || style.webkitLineClamp === '')) continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (node) => node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
    let last = null; while (walker.nextNode()) last = walker.currentNode;
    if (!last) continue;
    last.nodeValue = last.nodeValue.replace(/\s+$/, '') + LONG;
    el.dataset.cutStressed = ''; count++;
  }
  return count; })()`;

export type TruncationIssue = { kind: "keyboard"; at: string; text: string };
export type TruncationHeld = { index: number; at: string; text: string };
