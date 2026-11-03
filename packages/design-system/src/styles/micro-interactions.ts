import { COPY_FEEDBACK_STYLES } from "./copy-feedback.js";
import { DISCLOSURE_STYLES } from "./disclosure.js";
import { NUMBER_STYLES } from "./numbers.js";
import { OVERFLOW_FADE_STYLES } from "./overflow-fade.js";
import { SHOW_MORE_STYLES } from "../show-more.js";
import { MEDIA_ZOOM_STYLES } from "../media-zoom.js";
import { STREAM_TEXT_STYLES } from "../stream-text.js";
import { FIELD_FIT_STYLES } from "../field-fit.js";
import { FOLLOW_STYLES } from "../scroll-follow.js";

/** Micro-interactions, in the places where movement carries information.
 *
 * Borrowed from React Bits (reactbits.dev/c/micro) as behaviour, not as code: this product has no
 * React and no animation runtime, so each one is CSS driven by a few custom properties.
 *   Rubber Segment  → the segmented thumb travels and settles between slots.
 *   Glide Select    → the search highlight travels, so keyboard selection stays distinct from hover.
 *   Row Yield       → a list title gives way at the squeeze edge; Shelf also lets hover actions take width.
 * Everything degrades to the current static presentation when the client script does not run,
 * and `prefers-reduced-motion` removes the travel rather than merely shortening them.
 */

const SEGMENTED = ":is(.goal-board-switch, .settings-segmented, .locale-switch, .mw-toggle-group, .plugin-rail-items)";
const RAIL_SEGMENTED = ".plugin-rail-items";
const SEGMENT_CURRENT = ':is([aria-current="true"], [aria-current="page"], [aria-pressed="true"], .is-current, .is-active)';

export const MICRO_INTERACTION_STYLES = `
  :root, body { --ease-settle: var(--ease-spring); }

  /* Contained focus sits last in the design-system tail so leftover outer rings cannot win. */
  body.immersive-workbench :focus-visible,
  body.settings-page :focus-visible,
  body.project-preferences-page :focus-visible {
    outline: var(--focus-stroke);
    outline-offset: var(--focus-stroke-inset);
  }
  body.immersive-workbench :is(a:not([class]), .mw-btn--link):focus-visible,
  body.settings-page :is(a:not([class]), .mw-btn--link):focus-visible {
    outline-offset: 2px;
  }

  /* Rubber Segment: one thumb travels between slots instead of a chip blinking on and off. */
  body ${SEGMENTED}[data-seg-thumb] { position: relative; }
  body ${SEGMENTED}[data-seg-thumb]::before {
    content: "";
    position: absolute;
    z-index: 0;
    top: 0;
    left: 0;
    width: var(--seg-w, 0px);
    height: var(--seg-h, 0px);
    transform: translate(var(--seg-x, 0px), var(--seg-y, 0px));
    border-radius: 6px;
    background: var(--nav-raised);
    box-shadow: var(--surface-shadow), inset 0 0 0 1px var(--hairline), inset 0 1px 0 var(--edge-highlight);
    pointer-events: none;
  }
  body ${SEGMENTED}[data-seg-thumb][data-seg-ready]::before {
    transition:
      transform 250ms var(--ease-spring);
  }
  body ${SEGMENTED}[data-seg-thumb] > :is(button, a) { position: relative; z-index: 1; }
  body ${SEGMENTED}[data-seg-thumb] > ${SEGMENT_CURRENT},
  body.immersive-workbench .tree-pane .settings-segmented[data-seg-thumb] > ${SEGMENT_CURRENT} { background: transparent; box-shadow: none; }

  /* Plugin rail: the same travelling chip, tinted with the current plugin instead of a raised card. */
  body ${RAIL_SEGMENTED}[data-seg-thumb]::before {
    border-radius: 8px;
    background: color-mix(in srgb, var(--seg-tint, var(--plugin-tint, var(--ink))) 12%, transparent);
    box-shadow: none;
  }
  body.immersive-workbench ${RAIL_SEGMENTED}[data-seg-thumb] > .immersive-plugin-link:is(${SEGMENT_CURRENT}, [aria-expanded="true"]),
  body.immersive-workbench ${RAIL_SEGMENTED}[data-seg-thumb] > .immersive-plugin-link:is(${SEGMENT_CURRENT}, [aria-expanded="true"]):hover {
    background: transparent;
    box-shadow: none;
  }

  /* Glide Select: the keyboard selection is a travelling pill, so hover stops impersonating it. */
  body .global-search-body[data-search-glide] { position: relative; }
  body .global-search-body[data-search-glide]::before {
    content: "";
    position: absolute;
    z-index: 0;
    top: 0;
    left: 0;
    width: var(--hit-w, 0px);
    height: var(--hit-h, 0px);
    transform: translate(var(--hit-x, 0px), var(--hit-y, 0px));
    border-radius: 8px;
    background: var(--nav-active);
    pointer-events: none;
  }
  body .global-search-body[data-search-glide][data-search-ready]::before {
    transition: transform 130ms var(--ease-quint);
  }
  body .global-search-body[data-search-glide] .global-search-hit { position: relative; z-index: 1; }
  body.immersive-workbench .global-search-body[data-search-glide] .global-search-hit[aria-selected="true"],
  body.immersive-workbench .global-search-body[data-search-glide] .global-search-hit[aria-selected="true"]:hover { background: transparent; }
  body .global-search-body[data-search-glide] .global-search-hit:hover:not([aria-selected="true"]) { background: var(--nav-hover); }

  /* Row Yield: list hover is a 180ms tone step. Squeezed titles ellipsize in the title slot; do not mask the row, or trailing status gets cut. */
  body.immersive-workbench :is(.tree-entry, .feed-stage-entry, .source-list-item, .goal-collection-fold > summary) {
    transition:
      background-color 130ms var(--ease-quint),
      color 130ms var(--ease-quint);
  }


  /* A writing surface opts out of the field ring: it answers focus with tone, not a box. */
  body.immersive-workbench [data-plain-field]:focus-visible,
  body [data-plain-field]:focus-visible, body [data-plain-field]:focus {
    outline: none;
    border-color: transparent;
    /* A pen line under the text, not a box around it — and it still clears 3:1 on its own. */
    box-shadow: inset 0 -1px 0 var(--ink);
    background: var(--nav-hover);
  }


  /* A stage arrives once with the shared rise; menus grow from their control (keyframes: styles/motion.ts). */
  .plugin-stage-workspace.is-arriving,
  .is-arriving { animation: craft-rise var(--dur-arrive, 420ms) var(--ease-quint) both; }
  :is(.mw-menu, .mw-select-picker__menu, .assistant-composer):popover-open,
  .mw-select-picker__menu.is-open {
    animation: craft-drop var(--dur-move, 250ms) var(--ease-quint) both;
  }

  @media (prefers-reduced-motion: reduce) {
    body ${SEGMENTED}[data-seg-thumb][data-seg-ready]::before { transition: none; }
    body .global-search-body[data-search-glide][data-search-ready]::before { transition: none; }
    body.immersive-workbench :is(.tree-entry, .feed-stage-entry, .source-list-item, .goal-collection-fold > summary, .mw-dir-row, .mw-dir-row-wrap) { transition: none; }
    .plugin-stage-workspace.is-arriving, .is-arriving,
    :is(.mw-menu, .mw-select-picker__menu, .assistant-composer):popover-open,
    .mw-select-picker__menu.is-open { animation: none; }
  }
${OVERFLOW_FADE_STYLES}${COPY_FEEDBACK_STYLES}${DISCLOSURE_STYLES}${NUMBER_STYLES}${FOLLOW_STYLES}${SHOW_MORE_STYLES}${MEDIA_ZOOM_STYLES}${STREAM_TEXT_STYLES}${FIELD_FIT_STYLES}`;

/** The travelling thumb is positioned inside the scrollable track, so visible deltas are not enough. */
export function segmentThumbOffsets(
  slot: { left: number; top: number; width: number; height: number },
  box: { left: number; top: number },
  borderLeft: number,
  borderTop: number,
  scrollLeft: number,
  scrollTop: number,
) {
  return {
    x: slot.left - box.left - borderLeft + scrollLeft,
    y: slot.top - box.top - borderTop + scrollTop,
    w: slot.width,
    h: slot.height,
  };
}

/** Measures the three travelling marks. Absent, every surface keeps its static presentation. A changed mark is measured in
 * the next frame, once however many changes a click made, not in the click itself. A segmented track is measured again when
 * its own box changes (a pane resized, a hidden track shown), its labels change (another language) or fonts finish loading
 * (VUX-22), so the thumb always sits on the real current option. */
export const MICRO_INTERACTION_CLIENT_SCRIPT = `
(() => {
  const SEGMENTED = ${JSON.stringify(SEGMENTED)};
  const SEGMENT_CURRENT = ${JSON.stringify(SEGMENT_CURRENT)};
  const segmentThumbOffsets = ${segmentThumbOffsets.toString()};
  const tracked = new WeakSet();

  const place = (host, values, readyFlag) => {
    for (const [name, value] of Object.entries(values)) host.style.setProperty(name, value + "px");
    requestAnimationFrame(() => host.setAttribute(readyFlag, ""));
  };

  const syncSegment = (track) => {
    const current = track.querySelector(":scope > " + SEGMENT_CURRENT);
    const box = track.getBoundingClientRect();
    const slot = current && current.getBoundingClientRect();
    if (!current || !slot.width || !box.width) { track.removeAttribute("data-seg-thumb"); track.style.removeProperty("--seg-tint"); return; }
    const tint = getComputedStyle(current).getPropertyValue("--plugin-tint").trim();
    if (tint) track.style.setProperty("--seg-tint", tint);
    else track.style.removeProperty("--seg-tint");
    const style = getComputedStyle(track);
    const offsets = segmentThumbOffsets(slot, box, parseFloat(style.borderLeftWidth) || 0, parseFloat(style.borderTopWidth) || 0, track.scrollLeft, track.scrollTop);
    place(track, {
      "--seg-x": offsets.x,
      "--seg-y": offsets.y,
      "--seg-w": offsets.w,
      "--seg-h": offsets.h,
    }, "data-seg-ready");
    track.setAttribute("data-seg-thumb", "");
  };

  /** The dialog is the stable node; its result list is rebuilt on every query. */
  const syncSearch = (dialog) => {
    const list = dialog.querySelector(".global-search-body");
    if (!list) return;
    const current = list.querySelector('.global-search-hit[aria-selected="true"]');
    const box = list.getBoundingClientRect();
    const slot = current && current.getBoundingClientRect();
    if (!current || !slot?.height || !box.height) { list.removeAttribute("data-search-glide"); return; }
    const style = getComputedStyle(list);
    place(list, {
      "--hit-x": slot.left - box.left - parseFloat(style.borderLeftWidth) + list.scrollLeft,
      "--hit-y": slot.top - box.top - parseFloat(style.borderTopWidth) + list.scrollTop,
      "--hit-w": slot.width,
      "--hit-h": slot.height,
    }, "data-search-ready");
    list.setAttribute("data-search-glide", "");
  };

  const pending = new Map();
  const flush = () => { for (const [node, sync] of pending) { pending.delete(node); sync(node); } };
  const request = (node, sync) => { if (!pending.size) requestAnimationFrame(flush); pending.set(node, sync); };
  const sized = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => entries.forEach((entry) => request(entry.target, syncSegment))) : null;
  const watch = (node, sync, attributeFilter) => {
    if (tracked.has(node)) return;
    tracked.add(node);
    new MutationObserver(() => request(node, sync)).observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter });
    if (sync === syncSegment) sized?.observe(node);
    sync(node);
  };

  let queued = false;
  const scan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const track of document.querySelectorAll(SEGMENTED)) watch(track, syncSegment, ["aria-current", "aria-pressed", "aria-expanded", "class"]);
      for (const dialog of document.querySelectorAll(".global-search-dialog")) watch(dialog, syncSearch, ["aria-selected"]);
      for (const track of document.querySelectorAll(SEGMENTED + "[data-seg-thumb]")) syncSegment(track);
    });
  };

  /** Creation modals commit from the keyboard: the platform's Enter-with-modifier submits the form. */
  addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    const dialog = event.target instanceof Element && event.target.closest("dialog[open]");
    if (!dialog) return;
    const form = (event.target instanceof Element && event.target.closest("form")) || dialog.querySelector("form");
    if (!form) return;
    const enabledSubmit = (button) => button instanceof HTMLButtonElement && button.type === "submit" && !button.disabled && button.form === form;
    const focused = [document.activeElement, event.target].find((button) => enabledSubmit(button));
    const fallback = form.querySelector('button[type="submit"]:not(:disabled)');
    if (!fallback || fallback.form !== form) return;
    event.preventDefault();
    if (focused) form.requestSubmit(focused);
    else form.requestSubmit();
  });

  addEventListener("click", scan, true);
  addEventListener("focusin", scan, true);
  addEventListener("resize", scan);
  addEventListener("pageshow", scan);
  document.addEventListener("DOMContentLoaded", scan);
  document.fonts?.addEventListener?.("loadingdone", () => { for (const track of document.querySelectorAll(SEGMENTED)) if (tracked.has(track)) request(track, syncSegment); });
  scan();
})();
`;
