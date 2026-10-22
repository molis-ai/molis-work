/**
 * The overlay audit (specs/visual-ui-experience §adaptive-focus, VUX-29), run with real clicks and keys.
 * `OVERLAY_TRIGGERS` tags each shown control that opens a layer (`aria-haspopup`, `popovertarget`) with `data-ov-trigger`
 * (a closed `<details>` whose content floats counts too). `OVERLAY_BEFORE` marks what is on screen, the test presses the
 * trigger, `OVERLAY_OPEN` finds the layer that came up and its box against the screen, and `OVERLAY_AFTER` reads it again after Escape.
 */
export const OVERLAY_TRIGGERS = `(() => {
  const shown = (el) => { const box = el.getBoundingClientRect(); if (!box.width || !box.height) return false;
    const style = getComputedStyle(el); return style.visibility !== 'hidden' && !el.closest('[hidden], [inert], [aria-hidden=true]')
      && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight; };
  document.querySelectorAll('[data-ov-trigger]').forEach(el => el.removeAttribute('data-ov-trigger'));
  const triggers = [];
  const floats = (el) => { const pos = getComputedStyle(el).position; return pos === 'absolute' || pos === 'fixed'; };
  const summaries = [...document.querySelectorAll('details:not([open]) > summary')].filter(summary => [...summary.parentElement.children].some(child => child !== summary && floats(child)));
  for (const el of [...document.querySelectorAll('[aria-haspopup]:not([aria-haspopup=false]), [popovertarget]'), ...summaries]) {
    if (el.dataset.ovTrigger) continue;
    if (!shown(el) || el.matches(':disabled, [aria-disabled=true]')) continue;
    const index = triggers.length; el.dataset.ovTrigger = String(index);
    triggers.push({ index, name: (el.getAttribute('aria-label') || el.textContent || el.className.toString()).trim().replace(/\\s+/g, ' ').slice(0, 40), kind: el.getAttribute('aria-haspopup') ?? (el.matches('summary') ? 'details' : 'popover') });
  }
  return triggers; })()`;

/** Layers on screen now: open popovers and dialogs, and any shown element that floats (fixed or absolute) with a box of
 * its own; a layer inside another counts as part of it. */
const LAYERS = `const layers = () => [...document.querySelectorAll('body *')]
    .filter(el => { if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
      if (el.matches(':popover-open, dialog[open]') || (el.parentElement?.matches('details[open]') && !el.matches('summary'))) return true; const style = getComputedStyle(el);
      if (style.position !== 'absolute' && style.position !== 'fixed') return false;
      const box = el.getBoundingClientRect(); return box.width > 40 && box.height > 24 && style.visibility !== 'hidden' && style.opacity !== '0' && !el.closest('[hidden]'); });`;

/** Marks the layers already on screen, before the trigger is pressed. */
export const OVERLAY_BEFORE = `(() => { ${LAYERS} document.querySelectorAll('[data-ov-before]').forEach(el => el.removeAttribute('data-ov-before'));
  layers().forEach(el => { el.dataset.ovBefore = ''; }); })()`;

/** The layer that opened (the last new one), its box against the screen, and where focus is. */
export const OVERLAY_OPEN = `(() => { ${LAYERS}
  const fresh = layers().filter(el => !el.hasAttribute('data-ov-before'));
  const layer = fresh.filter(el => !fresh.some(other => other !== el && other.contains(el))).at(-1);
  if (!layer) return null;
  document.querySelectorAll('[data-ov-layer]').forEach(el => el.removeAttribute('data-ov-layer')); layer.dataset.ovLayer = '';
  const box = layer.getBoundingClientRect(), trigger = document.querySelector('[data-ov-active]')?.getBoundingClientRect();
  // Which side of its trigger the layer came up on, and which side its transform-origin grows from (y of the origin).
  const side = !trigger ? 'none' : box.bottom <= trigger.top + 2 ? 'above' : box.top >= trigger.bottom - 2 ? 'below' : 'beside';
  const originY = parseFloat(getComputedStyle(layer).transformOrigin.split(' ')[1]) / (box.height || 1);
  return { side, originY: Math.round(originY * 100) / 100, animated: getComputedStyle(layer).animationName !== 'none' || /transform/.test(getComputedStyle(layer).transitionProperty), tag: layer.tagName.toLowerCase() + (layer.className && typeof layer.className === 'string' ? '.' + layer.className.trim().split(/\\s+/)[0] : ''),
    left: Math.round(box.left), top: Math.round(box.top), right: Math.round(innerWidth - box.right), bottom: Math.round(innerHeight - box.bottom),
    focusInside: layer.contains(document.activeElement), modal: layer.matches('dialog:modal') }; })()`;

/** After Escape: is the layer still shown, and is focus back on the trigger. */
export const OVERLAY_AFTER = `(() => { const layer = document.querySelector('[data-ov-layer]'), trigger = document.querySelector('[data-ov-active]');
  const box = layer?.isConnected ? layer.getBoundingClientRect() : null;
  return { open: !!box && box.width > 0 && box.height > 0 && getComputedStyle(layer).visibility !== 'hidden' && !layer.closest('[hidden]') && (!layer.parentElement?.matches('details') || layer.parentElement.open),
    back: !!trigger && (trigger === document.activeElement || trigger.contains(document.activeElement)), on: document.activeElement?.outerHTML.slice(0, 80) ?? 'none' }; })()`;

export type OverlayTrigger = { index: number; name: string; kind: string };
export type OverlayLayer = { side: string; originY: number; animated: boolean; tag: string; left: number; top: number; right: number; bottom: number; focusInside: boolean; modal: boolean };
