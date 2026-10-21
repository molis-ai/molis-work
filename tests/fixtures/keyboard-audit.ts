/**
 * The keyboard audit (specs/visual-ui-experience §adaptive-focus, VUX-28), run against a page with real key presses.
 * `KEYBOARD_GROUPS` tags each shown semantic group (tablist, radiogroup, toolbar, menu, menubar, listbox whose options take
 * focus) with `data-kbd-audit` and says what it holds; the test then presses keys and reads `KEYBOARD_FOCUS` after each.
 * A listbox driven from an input (`aria-activedescendant`) keeps focus in the input and is left out.
 */
export const KEYBOARD_GROUPS = `(() => {
  const shown = (el) => { const box = el.getBoundingClientRect(); if (!box.width || !box.height) return false;
    const style = getComputedStyle(el); return style.visibility !== 'hidden' && !el.closest('[hidden], [inert], [aria-hidden=true]'); };
  const items = { tablist: '[role=tab]', radiogroup: '[role=radio]', menu: '[role^=menuitem]', menubar: '[role^=menuitem]', listbox: '[role=option]',
    toolbar: 'button, [role=button], a[href], input, select, [tabindex]' };
  const groups = [];
  document.querySelectorAll('[data-kbd-audit]').forEach(el => el.removeAttribute('data-kbd-audit'));
  for (const el of document.querySelectorAll(Object.keys(items).map(role => '[role=' + role + ']').join(','))) {
    if (!shown(el)) continue;
    const role = el.getAttribute('role');
    const own = [...el.querySelectorAll(items[role])].filter(item => item.closest('[role=' + role + ']') === el && shown(item) && !item.matches(':disabled, [aria-disabled=true]'));
    if (role === 'listbox' && (el.hasAttribute('aria-activedescendant') || document.querySelector('[aria-controls="' + el.id + '"][aria-activedescendant]') || !own.some(item => item.tabIndex >= -1 && item.matches('[tabindex], button, a[href]')))) continue;
    if (own.length < 2) continue;
    const index = groups.length; el.dataset.kbdAudit = String(index); el.parentElement?.setAttribute('data-kbd-audit-parent', String(index));
    own.forEach((item, i) => { item.dataset.kbdItem = index + ':' + i; });
    const vertical = (el.getAttribute('aria-orientation') ?? (role === 'menu' || role === 'listbox' ? 'vertical' : 'horizontal')) === 'vertical';
    const name = el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby') ?? el.className.toString().trim().split(/\\s+/).slice(0, 2).join('.');
    groups.push({ index, role, name, vertical, count: own.length, stops: own.filter(item => item.tabIndex >= 0).length });
  }
  return groups; })()`;

/** Where focus is now, as `group:item` read again from the live page (a tab strip draws its tabs again when one is chosen),
 * else a description of the element; and the page's scroll. A redrawn group is known by its parent. */
export const KEYBOARD_FOCUS = `(() => { const el = document.activeElement;
  const items = { tablist: '[role=tab]', radiogroup: '[role=radio]', menu: '[role^=menuitem]', menubar: '[role^=menuitem]', listbox: '[role=option]',
    toolbar: 'button, [role=button], a[href], input, select, [tabindex]' };
  const group = el?.closest(Object.keys(items).map(role => '[role=' + role + ']').join(','));
  let at = el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') : 'none';
  if (group) { const role = group.getAttribute('role');
    const own = [...group.querySelectorAll(items[role])].filter(item => item.closest('[role=' + role + ']') === group && item.getClientRects().length && !item.matches(':disabled, [aria-disabled=true]'));
    const known = group.dataset.kbdAudit ?? group.parentElement?.dataset.kbdAuditParent;
    if (own.includes(el)) at = (known ?? '?') + ':' + own.indexOf(el); }
  return { at, page: document.scrollingElement?.scrollTop ?? 0 }; })()`;

export type KeyboardGroup = { index: number; role: string; name: string; vertical: boolean; count: number; stops: number };
