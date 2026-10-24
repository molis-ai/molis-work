import { TOUCH_TARGET_STYLES } from "./touch-targets.js";
import { ASSISTANT_STAGE_STYLES } from "./assistant-stage.js";
import { ASSISTANT_PROCESS_STYLES } from "./assistant-process.js";
import { DROPDOWN, MOTION_STYLES } from "./motion.js";
import { CRAFT_BAR_STYLES } from "./craft-finish-bar.js";
import { CRAFT_ASSISTANT_STYLES } from "./craft-finish-assistant.js";
import { CRAFT_PAGES_STYLES } from "./craft-finish-pages.js";

/** Soft Workbench finish: the last layer of every Molis Work page (module name kept from the craft pass).
 *
 * One spatial idea runs through it. The desk is pearl grey; the work is one continuous white surface
 * lying on it with soft 14px corners and a shadow you feel more than see. Plugin directories are
 * columns inside that surface, not a second chrome. Global navigation and the unified conversation
 * live in the resident bar under the surface; there is no global sidebar.
 *
 * Depth is tonal first. Ordinary content separates by spacing, weight and the occasional hairline;
 * only raised things — the composer, the current Dock item, menus, dialogs, sheets, toasts — cast a
 * diffuse shadow, and a floating layer never also draws a heavy outline. Graphite is the primary
 * action and the selected choice; copper marks focus, links and a selection's small detail.
 *
 * Movement answers the operation: a 130ms press that gives and springs back, 250ms state changes,
 * 420ms arrivals that rise a few pixels, menus that grow from their control, sheets from their edge.
 * `prefers-reduced-motion` and automation remove every movement here.
 *
 * Structure, density and domain ownership stay with the layers before this one; this layer owns
 * tone, depth, corners, the resident bar's geometry and motion.
 */


/** The finish layer's rules, in the order they cascade: the parts are cut between sections and joined as they were written. */
const CRAFT_BASE_STYLES = CRAFT_BAR_STYLES + CRAFT_ASSISTANT_STYLES + CRAFT_PAGES_STYLES;

/** Under automation (headless review, e2e) the layer holds still so geometry reads settle at once. */
const STILL_RESET = `
  html[data-craft-still] :is(.workbench-bar > *, .immersive-plugin-stage, .dock-overflow, .account-global-popover, .assistant-panel, .plugin-picker-popover, .immersive-home :is(.home-focus, .home-erow__slot), .tab-pane-body > [data-work-surface], .tab-workspace-exclusive > *, .home-tl__rows > *, .plugin-market-list > *,
    dialog[open], ${DROPDOWN}, details[open] > .navigator-project-menu-popover, .toast, .mw-check, .mw-radio, [data-graph-edge] path,
    [data-craft-celebrate] .goal-status--completed, [data-craft-celebrate] .goal-status--completed svg) { animation: none !important; }
  html[data-craft-still] :is(dialog[open], .mw-check:checked, .mw-radio:checked, .plugin-rail-items .immersive-plugin-link[aria-current], [data-craft-new])::after,
  html[data-craft-still] dialog[open]::backdrop,
  html[data-craft-still] :is(.goal-canvas-node, [data-graph-node], [data-kanban-card]) *::after { animation: none !important; }
  html[data-craft-still] [data-assistant-island] :is(*, *::before, *::after) { animation: none !important; }
  html[data-craft-still] :is(dialog, dialog::backdrop, iframe.tab-content-frame, [data-just-opened], [data-just-opened] > *, .is-arriving, .is-arriving *) { transition: none !important; animation: none !important; }
  /* Under automation nothing eases either, so a reading taken right after a change sees the settled value. */
  html[data-craft-still] *, html[data-craft-still] *::before, html[data-craft-still] *::after { transition-duration: 0s !important; transition-delay: 0s !important; }
`;

export const CRAFT_FINISH_STYLES = MOTION_STYLES + CRAFT_BASE_STYLES + TOUCH_TARGET_STYLES + ASSISTANT_STAGE_STYLES + ASSISTANT_PROCESS_STYLES + STILL_RESET;

/** Behaviour for the craft layer. Everything here is presentation: it never writes Goal state,
 * never moves focus and never cancels another handler. Without it the pages look the same, only
 * without tooltips, landing washes and the completion moment. */
export const CRAFT_FINISH_CLIENT_SCRIPT = `
(function craftFinish() {
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", craftFinish, { once: true }); return; }
  if (globalThis.__molisCraftFinish) return;
  globalThis.__molisCraftFinish = true;
  const root = document.documentElement;
  const body = document.body;
  if (!body) return;
  const still = navigator.webdriver === true;
  if (still) root.setAttribute("data-craft-still", "");
  const reduced = () => still || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const embedded = body.hasAttribute("data-pane-embedded");
  const workbench = body.classList.contains("immersive-workbench");

  /* Opening a project: the sheet and the bar settle in. Once per page. */
  if (workbench && !embedded && !reduced()) {
    body.classList.add("is-craft-opening");
    setTimeout(() => body.classList.remove("is-craft-opening"), 1400);
  }

  /* Arrival plays once per surface: the first time a work surface is revealed it carries \`is-arriving\` for one
   * arrival's length; showing it again later (a tab switch, a return) never replays the cascade. */
  const arrived = new WeakSet();
  const arrive = (surface) => {
    if (arrived.has(surface) || surface.hidden || reduced()) { arrived.add(surface); return; }
    arrived.add(surface);
    surface.classList.add("is-arriving");
    setTimeout(() => surface.classList.remove("is-arriving"), 900);
  };
  if (workbench) {
    document.querySelectorAll("[data-work-surface]").forEach((surface) => { if (!surface.hidden) arrive(surface); });
    new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target;
        if (node instanceof HTMLElement && node.hasAttribute("data-work-surface") && !node.hidden) arrive(node);
      }
    }).observe(body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  /* A disclosure lets its content settle in only when a person opened it; rendering one already open stays still. */
  let userToggleAt = 0;
  const noteToggle = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("summary, [data-home-open-event]")) userToggleAt = Date.now();
  };
  document.addEventListener("click", noteToggle, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") noteToggle(event); }, true);
  const settleOpened = (node) => {
    if (reduced() || !node) return;
    node.setAttribute("data-just-opened", "");
    setTimeout(() => node.removeAttribute("data-just-opened"), 420);
  };
  document.addEventListener("toggle", (event) => {
    const details = event.target;
    if (details instanceof HTMLDetailsElement && details.open && Date.now() - userToggleAt < 400) settleOpened(details);
  }, true);
  document.addEventListener("click", (event) => {
    const row = event.target instanceof Element ? event.target.closest("[data-home-open-event]") : null;
    if (row) requestAnimationFrame(() => settleOpened(document.querySelector(".immersive-home .home-erow-wrap.is-open .home-erow__slot")));
  });

  /* ⌥1…⌥9 open the first nine tools of the rail, Home first. Typing, terminals and menus keep their keys. */
  const railShortcuts = () => [...document.querySelectorAll(".dock-pins [data-dock-pin], .plugin-rail-items [data-plugin-id]")]
    .filter((node) => node.dataset.pluginId !== "plugin-builder" && node.getClientRects().length).slice(0, 9);
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.defaultPrevented) return;
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (!digit) return;
    const target = event.target;
    if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), .xterm, [data-tui-pane], dialog[open], [popover]:popover-open")) return;
    const node = railShortcuts()[Number(digit[1]) - 1];
    if (!node) return;
    event.preventDefault();
    node.click();
  });

  /* Tools zone: the three used last stay on the rail; 全部工具 opens the rest in place and closes
   * again once one is chosen. Presentation only — opening a tool is still the rail's own click. */
  const RECENT_KEY = "molis-work:rail-recent-tools";
  const railList = document.querySelector(".plugin-rail-items");
  if (railList) {
    const readRecent = () => {
      try { const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; }
      catch { return []; }
    };
    const paintRecent = () => {
      const recent = new Set(readRecent().slice(0, 3));
      railList.querySelectorAll('[data-rail-zone="tool"][data-plugin-id]').forEach((node) => node.classList.toggle("is-recent", recent.has(node.dataset.pluginId)));
    };
    const remember = (id) => {
      const list = readRecent();
      if (list[0] === id) return;
      try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...list.filter((item) => item !== id)].slice(0, 8))); } catch {}
      paintRecent();
    };
    const toggle = railList.querySelector("[data-rail-tools-toggle]");
    const toggleLabel = toggle && toggle.querySelector("span");
    const openText = toggleLabel ? toggleLabel.textContent : "";
    const closeText = (toggleLabel && toggleLabel.dataset.railToggleLabel) || openText;
    const setOpen = (open) => {
      railList.classList.toggle("is-tools-open", open);
      if (!toggle) return;
      const text = open ? closeText : openText;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", text);
      toggle.title = text;
      if (toggleLabel) toggleLabel.textContent = text;
    };
    if (toggle) toggle.addEventListener("click", () => setOpen(!railList.classList.contains("is-tools-open")));
    railList.addEventListener("click", (event) => {
      const chosen = event.target instanceof Element && event.target.closest('[data-rail-zone="tool"][data-plugin-id], [data-rail-zone="extend"]');
      if (!chosen) return;
      if (chosen.matches("[data-plugin-id]") && chosen.dataset.railZone === "tool") remember(chosen.dataset.pluginId);
      if (railList.classList.contains("is-tools-open")) requestAnimationFrame(() => setOpen(false));
    });
    // A tool opened any other way — search, a link, a restored tab — counts as used too.
    new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target;
        if (node instanceof Element && node.matches('[data-rail-zone="tool"][data-plugin-id][aria-current]')) remember(node.dataset.pluginId);
      }
    }).observe(railList, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    paintRecent();
  }

  /* The tooltip is its own program (browser/tip.ts); it reads the rail's shortcuts from here. */
  window.molisRailShortcuts = railShortcuts;

  /* Presentation of drag: the source leaves a faded hole; drop areas become visible. */
  const endDrag = () => {
    document.querySelectorAll("[data-craft-drag-source]").forEach((node) => node.removeAttribute("data-craft-drag-source"));
    body.removeAttribute("data-craft-dragging");
  };
  document.addEventListener("dragstart", (event) => {
    const source = event.target instanceof Element ? event.target.closest("[draggable='true']") : null;
    if (!source) return;
    requestAnimationFrame(() => {
      if (!source.matches(".tab-item, .tab-item *")) source.setAttribute("data-craft-drag-source", "");
      body.setAttribute("data-craft-dragging", "");
    });
  }, true);
  document.addEventListener("dragend", endDrag, true);
  document.addEventListener("drop", () => setTimeout(endDrag, 0), true);

  /* The completion moment: a ring and a handful of sparks from the mark that just turned done. */
  const celebrate = (mark) => {
    const host = mark;
    host.setAttribute("data-craft-celebrate", "");
    setTimeout(() => host.removeAttribute("data-craft-celebrate"), 900);
    if (reduced()) return;
    const box = (mark.querySelector(".goal-status--completed svg") || mark).getBoundingClientRect();
    if (!box.width) return;
    const burst = document.createElement("div");
    burst.className = "craft-burst";
    burst.setAttribute("aria-hidden", "true");
    burst.style.left = Math.round(box.left + box.width / 2) + "px";
    burst.style.top = Math.round(box.top + box.height / 2) + "px";
    const colours = ["var(--celebrate-a)", "var(--celebrate-b)", "var(--celebrate-c)", "var(--celebrate-a)"];
    let html = "<b></b>";
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 2 + Math.random() * .35;
      const distance = 26 + Math.random() * 34;
      html += '<i style="--x:' + Math.round(Math.cos(angle) * distance) + "px;--y:" + Math.round(Math.sin(angle) * distance - 8) + "px;--r:" + Math.round(Math.random() * 320 - 160) + "deg;--c:" + colours[index % colours.length] + ";--d:" + Math.round(640 + Math.random() * 360) + 'ms"></i>';
    }
    burst.innerHTML = html;
    body.append(burst);
    setTimeout(() => burst.remove(), 1200);
  };
  /* Something that just arrived: one wash from its leading edge. */
  const land = (node) => {
    if (!node || reduced()) return;
    node.setAttribute("data-craft-new", "");
    setTimeout(() => node.removeAttribute("data-craft-new"), 1700);
  };
  /* Plugins may mark their own finish and arrival moments; both are presentation only. */
  globalThis.molisCraft = Object.freeze({ celebrate, land });

  if (!workbench) return;

  /* Something new lands once: a created Goal, a pulled message, a new Inbox entry. */
  const LANDING = [
    { rows: ".tree-node[data-select-goal]", id: (node) => node.dataset.selectGoal,
      marks: (id) => '.tree-node[data-select-goal="' + CSS.escape(id) + '"], [data-kanban-card][data-goal-id="' + CSS.escape(id) + '"], [data-graph-node][data-goal-id="' + CSS.escape(id) + '"]' },
    { rows: "[data-feed-entry-id]", id: (node) => node.dataset.feedEntryId, marks: (id) => '[data-feed-entry-id="' + CSS.escape(id) + '"]' },
    { rows: "[data-inbox-entry-id]", id: (node) => node.dataset.inboxEntryId, marks: (id) => '[data-inbox-entry-id="' + CSS.escape(id) + '"]' },
  ];
  const known = LANDING.map((kind) => new Set([...document.querySelectorAll(kind.rows)].map(kind.id).filter(Boolean)));
  const settledAt = Date.now() + 2500;
  const landed = (kind, id) => document.querySelectorAll(kind.marks(id)).forEach(land);

  /* A Goal that finishes gets its moment where you are looking at it: the open Goal's own mark. */
  const FOCAL = "[data-workspace-goal-status], [data-frame-goal-status]";
  const finished = new Map();
  const focalKey = (mark) => mark.matches("[data-workspace-goal-status]")
    ? "goal:" + (document.querySelector("[data-goal-node-workspace]")?.dataset.expandedGoal || document.querySelector("[data-workspace-goal-title]")?.textContent?.trim() || "")
    : "frame:" + (document.querySelector("[data-frame-goal-title]")?.textContent?.trim() || "");
  const readFocal = () => {
    document.querySelectorAll(FOCAL).forEach((mark) => {
      const key = focalKey(mark);
      if (key.endsWith(":")) return;
      const done = !!mark.querySelector(".goal-status--completed");
      const before = finished.get(key);
      finished.set(key, done);
      if (done && before === false) celebrate(mark);
    });
  };

  let queued = 0;
  const settle = () => {
    queued = 0;
    readFocal();
    LANDING.forEach((kind, index) => {
      const fresh = [];
      document.querySelectorAll(kind.rows).forEach((node) => {
        const id = kind.id(node);
        if (id && !known[index].has(id)) { known[index].add(id); fresh.push(id); }
      });
      if (Date.now() > settledAt && fresh.length && fresh.length <= 3) fresh.forEach((id) => landed(kind, id));
    });
  };
  const QUIET = ".xterm, .terminal, [data-tui-pane], .goal-tui-pane, .craft-burst, .craft-tip";
  new MutationObserver((records) => {
    if (queued) return;
    const relevant = records.some((record) => {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return node && !node.closest(QUIET);
    });
    if (relevant) queued = setTimeout(settle, 160);
  }).observe(body, { childList: true, subtree: true });
  readFocal();
})();
`;
