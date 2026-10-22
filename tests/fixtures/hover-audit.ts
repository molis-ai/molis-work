/**
 * The hover-action audit (specs/visual-ui-experience §geometry-boundaries and §adaptive-focus, VUX-06, VUX-29): an action
 * drawn invisible until a pointer rests on it or its row must also show to keyboard focus and on a device without hover.
 * `HOVER_HIDDEN` tags each laid-out control that is drawn invisible (opacity near 0, or `visibility: hidden`, on itself or
 * an ancestor of its row) with `data-hover-audit`; `HOVER_SHOWN` reads one again after the test focused it or switched the
 * page to touch. A control kept out of the tab order on purpose passes when its row declares the key that does the same
 * (`aria-keyshortcuts`, which a screen reader announces too); the test then focuses the row.
 */
const SEEN = `const CONTROLS = 'button, a[href], summary, [role=button], [role=menuitem], [tabindex]:not([tabindex="-1"])';
  const ROWS = 'li, [role=row], [role=option], [role=treeitem], [role=listitem], tr, article';
  // How much of a control is drawn: the product of the opacities above it, and whether visibility hides it.
  const drawn = (el) => { let alpha = 1; for (let up = el; up && up !== document.body; up = up.parentElement) alpha *= Number(getComputedStyle(up).opacity);
    return getComputedStyle(el).visibility === 'hidden' ? 0 : alpha; };`;

export const HOVER_HIDDEN = `(() => { ${SEEN}
  document.querySelectorAll('[data-hover-audit]').forEach(el => el.removeAttribute('data-hover-audit'));
  const found = [];
  for (const el of document.querySelectorAll(CONTROLS)) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || box.right < 0 || box.bottom < 0 || box.left > innerWidth || box.top > innerHeight) continue;
    if (!el.checkVisibility({ checkVisibilityCSS: false }) || el.closest('[hidden], [inert], [aria-hidden=true], dialog:not([open]), details:not([open]) > :not(summary)')) continue;
    if (el.matches(':disabled, [aria-disabled=true]') || drawn(el) > 0.1) continue;
    const row = el.closest(ROWS) ?? el.parentElement;
    const index = found.length; el.dataset.hoverAudit = String(index);
    found.push({ index, name: (el.getAttribute('aria-label') || el.textContent || el.className.toString()).trim().replace(/\\s+/g, ' ').slice(0, 40),
      at: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : ''),
      row: row ? row.tagName.toLowerCase() + (typeof row.className === 'string' && row.className.trim() ? '.' + row.className.trim().split(/\\s+/)[0] : '') : '',
      focusable: el.tabIndex >= 0 && getComputedStyle(el).visibility !== 'hidden' });
  }
  return found; })()`;

/** How much of the tagged control is drawn now. */
export const hoverShown = (index: number) => `(() => { ${SEEN} const el = document.querySelector('[data-hover-audit="${index}"]'); return el ? drawn(el) : -1; })()`;

/** Focus the control by keyboard, or, when visibility keeps it out of reach, the first control of its row. */
export const hoverFocus = (index: number) => `(() => { ${SEEN} const el = document.querySelector('[data-hover-audit="${index}"]'); if (!el) return '';
  if (el.tabIndex >= 0 && getComputedStyle(el).visibility !== 'hidden') { el.focus({ preventScroll: true }); return document.activeElement === el ? 'self' : ''; }
  const row = el.closest(ROWS) ?? el.parentElement;
  if (row.tabIndex >= 0) { row.focus({ preventScroll: true }); return document.activeElement === row ? 'row' : ''; }
  const first = [...row.querySelectorAll(CONTROLS)].find(node => node !== el && node.tabIndex >= 0 && getComputedStyle(node).visibility !== 'hidden');
  if (first) { first.focus({ preventScroll: true }); return document.activeElement === first ? 'row' : ''; }
  // A control kept out of the tab order on purpose (a roving item's own button) is reached by the key its row declares.
  const keyed = row.querySelector('[aria-keyshortcuts]');
  if (!keyed) return ''; keyed.focus({ preventScroll: true }); return document.activeElement === keyed ? 'shortcut ' + keyed.getAttribute('aria-keyshortcuts') : ''; })()`;

export type HoverHidden = { index: number; name: string; at: string; row: string; focusable: boolean };

/**
 * The same rule read from the page's stylesheets, so a row that is not drawn with the seeded data is still checked: each
 * selector that draws something on `:hover` (opacity 1 or visibility visible) needs the same selector with `:focus-within`,
 * `:focus-visible` or `:focus` in its place, and the rule that hides it must apply only where there is hover
 * (`(hover: hover)` or `(pointer: fine)`), or another rule must draw it under `(hover: none)` or `(pointer: coarse)`, or
 * the row shows it once chosen or focused by a tap. `checked` lists every hover selector looked at, so a rule cleared on
 * one page (where its row is drawn) is not held against it on another.
 */
export const HOVER_RULES = `(() => {
  const rules = [];
  const walk = (list, media) => { for (const rule of list) {
    if (rule instanceof CSSStyleRule) { rules.push({ rule, media }); if (rule.cssRules?.length) walk(rule.cssRules, media); }
    else if (rule instanceof CSSMediaRule) walk(rule.cssRules, media + ' ' + rule.conditionText);
    else if (rule.cssRules) walk(rule.cssRules, media); } };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules, ''); } catch {} }
  const split = (text) => { const out = []; let depth = 0, from = 0; for (let i = 0; i < text.length; i++) { const c = text[i];
    if (c === '(') depth++; else if (c === ')') depth--; else if (c === ',' && !depth) { out.push(text.slice(from, i).trim()); from = i + 1; } } out.push(text.slice(from).trim()); return out; };
  const shows = (style) => style.opacity === '1' || style.visibility === 'visible';
  const hides = (style) => style.opacity === '0' || style.visibility === 'hidden';
  const last = (selector) => (selector.split(/[\\s>+~]+/).pop() ?? '').replace(/:[\\w-]+(\\([^)]*\\))?/g, '');
  const hoverLess = (media) => /hover:\\s*none|pointer:\\s*coarse/.test(media);
  const onlyHover = (media) => /hover:\\s*hover|pointer:\\s*fine/.test(media);
  const reveals = new Set(), touchReveals = new Set(), found = [], checked = [];
  for (const { rule, media } of rules) if (shows(rule.style)) for (const selector of split(rule.selectorText)) {
    reveals.add(selector); if (hoverLess(media)) touchReveals.add(last(selector)); }
  for (const { rule, media } of rules) if (shows(rule.style) && !hoverLess(media)) for (const selector of split(rule.selectorText)) {
    // A reveal on what is not hovered (:not(:hover)) and a decoration drawn as a pseudo-element are not hidden actions.
    if (!selector.includes(':hover') || /:not\\([^)]*:hover/.test(selector) || /::?(after|before)$/.test(selector)) continue;
    const target = last(selector);
    const hiding = rules.filter(({ rule: other }) => hides(other.style) && split(other.selectorText).some(s => !s.includes(':hover') && last(s) === target));
    if (!hiding.length) continue;
    const focused = (s) => /:focus(-within|-visible)?\\b/.test(s);
    const keyboard = focused(selector) || [...reveals].some(s => focused(s) && last(s) === target);
    // A row that shows its tools once it is chosen (selected, current, on) is reached on touch by tapping it.
    const chosen = (s) => /\\.is-(on|selected|current)\\b|\\[aria-(current|selected)|\\[data-current\\]/.test(s);
    // A row that takes focus itself (tabindex) is focused by a tap, so a \`:focus-within\` reveal reaches touch too; only a row
    // drawn on this page can tell.
    const row = selector.split(/[\\s>+~]+/).find(part => part.includes(':hover'))?.replace(/:hover/g, '').replace(/:is\\(\\s*,?\\s*/g, ':is(');
    const tapped = () => { try { const node = row && document.querySelector(row.replace(/:is\\(\\)/g, '')); return !!node && node.tabIndex >= 0 && [...reveals].some(s => s.includes(':focus-within') && last(s) === target); } catch { return false; } };
    const touch = hiding.every(({ media: m }) => onlyHover(m)) || touchReveals.has(target) || chosen(selector) || [...reveals].some(s => chosen(s) && last(s) === target) || tapped();
    checked.push(selector);
    if (!keyboard || !touch) found.push({ selector, keyboard, touch });
  }
  return { found, checked, count: rules.length }; })()`;

export type HoverRule = { selector: string; keyboard: boolean; touch: boolean };
