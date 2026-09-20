/** Micro-interactions, in the places where movement carries information.
 *
 * Borrowed from React Bits (reactbits.dev/c/micro) as behaviour, not as code: this product has no
 * React and no animation runtime, so each one is CSS driven by a few custom properties.
 *   Rubber Segment  → the segmented thumb travels and settles between slots.
 *   Glide Select    → the search highlight travels, so keyboard selection stays distinct from hover.
 *   Status Mark     → a focal Goal that is actually running shows an indeterminate arc.
 *   Row Yield       → a list title gives way at the squeeze edge; Shelf also lets hover actions take width.
 * Everything degrades to the current static presentation when the client script does not run,
 * and `prefers-reduced-motion` removes the travel and the arc rather than merely shortening them.
 */

const SEGMENTED = ":is(.goal-board-switch, .settings-segmented, .locale-switch, .mw-toggle-group)";
const SEGMENT_CURRENT = ':is([aria-current="true"], [aria-current="page"], [aria-pressed="true"], .is-current, .is-active)';

/** Statuses whose Goal is being worked on right now, per the shared status tone map. */
const RUNNING_STATUS =
  ":is(.goal-status--clarifying, .goal-status--executing, .goal-status--reviewing, .goal-status--revalidating, .goal-status--in_progress)";

/** Where exactly one status describes the open Goal. Lists and cards keep their static mark. */
const FOCAL_STATUS = ":is(.tui-owner-actions, .goal-node-toolbar, .reader-header, .frame-goal-heading, .goal-info-popover)";

export const MICRO_INTERACTION_STYLES = `
  :root, body { --ease-settle: cubic-bezier(.32, 1.22, .52, 1); }

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
      transform 240ms var(--ease-settle),
      width 240ms var(--ease-settle),
      height 120ms var(--ease-standard);
  }
  body ${SEGMENTED}[data-seg-thumb] > :is(button, a) { position: relative; z-index: 1; }
  body ${SEGMENTED}[data-seg-thumb] > ${SEGMENT_CURRENT},
  body.immersive-workbench .tree-pane .settings-segmented[data-seg-thumb] > ${SEGMENT_CURRENT} { background: transparent; box-shadow: none; }

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
    transition: transform 190ms var(--ease-standard), width 190ms var(--ease-standard), height 120ms var(--ease-standard);
  }
  body .global-search-body[data-search-glide] .global-search-hit { position: relative; z-index: 1; }
  body.immersive-workbench .global-search-body[data-search-glide] .global-search-hit[aria-selected="true"],
  body.immersive-workbench .global-search-body[data-search-glide] .global-search-hit[aria-selected="true"]:hover { background: transparent; }
  body .global-search-body[data-search-glide] .global-search-hit:hover:not([aria-selected="true"]) { background: var(--nav-hover); }

  /* Row Yield: list hover is a 180ms tone step. Squeezed titles ellipsize in the title slot; do not mask the row, or trailing status gets cut. */
  body.immersive-workbench :is(.tree-entry, .feed-stage-entry, .source-list-item, .goal-collection-fold > summary) {
    transition:
      background-color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1)),
      color 180ms var(--ease-out, cubic-bezier(.16, 1, .3, 1));
  }


  /* A writing surface opts out of the field ring: it answers focus with tone, not a box. */
  body [data-plain-field]:focus-visible, body [data-plain-field]:focus {
    outline: none;
    border-color: transparent;
    /* A pen line under the text, not a box around it — and it still clears 3:1 on its own. */
    box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--focus) 88%, transparent);
    background: var(--nav-hover);
  }

  /* Status Mark: a Goal that is running says so with an indeterminate arc, not a still glyph. */
  body ${FOCAL_STATUS} .goal-status${RUNNING_STATUS} > svg { display: none; }
  body ${FOCAL_STATUS} .goal-status${RUNNING_STATUS}::before {
    content: "";
    flex: none;
    width: 12px;
    height: 12px;
    box-sizing: border-box;
    border: 1.7px solid color-mix(in srgb, currentColor 26%, transparent);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: mw-status-arc 1150ms linear infinite;
  }
  @keyframes mw-status-arc { to { transform: rotate(1turn); } }

  @media (prefers-reduced-motion: reduce) {
    body ${SEGMENTED}[data-seg-thumb][data-seg-ready]::before { transition: none; }
    body .global-search-body[data-search-glide][data-search-ready]::before { transition: none; }
    body.immersive-workbench :is(.tree-entry, .feed-stage-entry, .source-list-item, .goal-collection-fold > summary, .mw-dir-row, .mw-dir-row-wrap) { transition: none; }
    body ${FOCAL_STATUS} .goal-status${RUNNING_STATUS} > svg { display: inline; }
    body ${FOCAL_STATUS} .goal-status${RUNNING_STATUS}::before { content: none; animation: none; }
  }
`;

/** Measures the three travelling marks. Absent, every surface keeps its static presentation. */
export const MICRO_INTERACTION_CLIENT_SCRIPT = `
(() => {
  const SEGMENTED = ${JSON.stringify(SEGMENTED)};
  const SEGMENT_CURRENT = ${JSON.stringify(SEGMENT_CURRENT)};
  const tracked = new WeakSet();

  const place = (host, values, readyFlag) => {
    for (const [name, value] of Object.entries(values)) host.style.setProperty(name, value + "px");
    requestAnimationFrame(() => host.setAttribute(readyFlag, ""));
  };

  const syncSegment = (track) => {
    const current = track.querySelector(":scope > " + SEGMENT_CURRENT);
    const box = track.getBoundingClientRect();
    const slot = current && current.getBoundingClientRect();
    if (!current || !slot.width || !box.width) { track.removeAttribute("data-seg-thumb"); return; }
    const style = getComputedStyle(track);
    place(track, {
      "--seg-x": slot.left - box.left - parseFloat(style.borderLeftWidth),
      "--seg-y": slot.top - box.top - parseFloat(style.borderTopWidth),
      "--seg-w": slot.width,
      "--seg-h": slot.height,
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

  const watch = (node, sync, attributeFilter) => {
    if (tracked.has(node)) return;
    tracked.add(node);
    new MutationObserver(() => sync(node)).observe(node, { subtree: true, childList: true, attributes: true, attributeFilter });
    sync(node);
  };

  let queued = false;
  const scan = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      for (const track of document.querySelectorAll(SEGMENTED)) watch(track, syncSegment, ["aria-current", "aria-pressed", "class"]);
      for (const dialog of document.querySelectorAll(".global-search-dialog")) watch(dialog, syncSearch, ["aria-selected"]);
      for (const track of document.querySelectorAll(SEGMENTED + "[data-seg-thumb]")) syncSegment(track);
    });
  };

  /** Creation modals commit from the keyboard: the platform's Enter-with-modifier submits the form. */
  addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    const dialog = event.target instanceof Element && event.target.closest("dialog[open]");
    if (!dialog) return;
    const form = event.target.closest("form") || dialog.querySelector("form");
    if (!form || !form.querySelector('button[type="submit"]:not(:disabled)')) return;
    event.preventDefault();
    form.requestSubmit();
  });

  addEventListener("click", scan, true);
  addEventListener("focusin", scan, true);
  addEventListener("resize", scan);
  addEventListener("pageshow", scan);
  document.addEventListener("DOMContentLoaded", scan);
  scan();
})();
`;
