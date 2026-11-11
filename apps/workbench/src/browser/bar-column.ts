/**
 * The bottom bar's input stands over the work, not over the window (specs/unified-input-voice §10.2, UIV-19): its column is
 * centred on the focused pane (or on the conversation column of the page in front that takes it) at the reading width (at most 680px, 24px in from each side of the pane), so its edges are the
 * page's. The Dock on the left keeps at least 150px and room for its switcher, 项目首页, one chosen plugin and its 「+N」; the
 * right group keeps what its buttons need. When the window is too narrow the input narrows around the same centre down to
 * 400px, and below that takes the room there is (the bar's own 200px at least) and leaves the centre. Below 761px wide the bar
 * keeps its own layout (`craft-finish-bar.ts`), and while nothing is measured the CSS columns stand.
 *
 * Bundled by esbuild into dist/bar-column-client.js and carried in workbench.js; the workbench's start calls the page global
 * `molisWorkBarColumn` once its shell is drawn (not in a pane-embedded page, which has no bar).
 */
const READING = 680, NARROW = 400, INSET = 24, START = 150, INPUT = 200;

export function placeBarColumn(): void {
  const bar = document.querySelector<HTMLElement>("[data-dock]");
  const stage = document.querySelector<HTMLElement>("[data-plugin-stage]");
  if (!bar || !stage || !("ResizeObserver" in window)) return;
  const end = bar.querySelector<HTMLElement>(".bar-end");
  // A page in front that takes the input names its conversation column (one input, O3): the input stands over that, not over the
  // whole pane with the page's own list beside it.
  const work = (): { left: number; width: number } | null => {
    const page = (globalThis as { molisBarReceivers?: { front(): { column(): { left: number; width: number } | null } | null } }).molisBarReceivers?.front()?.column();
    if (page && page.width > 0) return page;
    const pane = stage.querySelector<HTMLElement>(".tab-workspace-panes > [data-tab-pane].is-focused:not([hidden])");
    const box = (pane ?? stage).getBoundingClientRect();
    return box.width > 0 ? box : null;
  };
  // What the right group needs: its own max-content width (a folded tray counts as unfolded, as the CSS column does), read by
  // letting it size to its content for one measure.
  const endNeed = (): number => {
    if (!end) return 0;
    const had = end.style.width;
    end.style.width = "max-content";
    const need = end.getBoundingClientRect().width;
    end.style.width = had;
    return need;
  };
  // The Dock's least: everything before its pins (the switcher), 项目首页 with its margin, one plugin you chose, and the 「+N」 that
  // folds the rest (a pin's width), with the gaps and the group's own end; never under 150px.
  const startNeed = (): number => {
    const group = bar.querySelector<HTMLElement>(".bar-start"), pins = bar.querySelector<HTMLElement>(".dock-pins"), home = pins?.querySelector<HTMLElement>("[data-dock-pin]");
    if (!group || !pins || !home) return START;
    const before = pins.getBoundingClientRect().left - group.getBoundingClientRect().left;
    const pin = home.getBoundingClientRect().width, margin = parseFloat(getComputedStyle(home).marginRight) || 0;
    const between = parseFloat(getComputedStyle(pins).columnGap) || 0, after = group.getBoundingClientRect().right - pins.getBoundingClientRect().right;
    return Math.max(START, Math.ceil(before + pin + margin + 2 * (between + pin) + Math.max(after, 0) + 2));
  };
  const clear = (): void => {
    bar.removeAttribute("data-bar-column");
    bar.style.removeProperty("--bar-start-w");
    bar.style.removeProperty("--bar-column-w");
  };
  const place = (): void => {
    const pane = work();
    if (!pane || window.innerWidth < 761) { clear(); return; }
    const style = getComputedStyle(bar), rect = bar.getBoundingClientRect();
    const padLeft = parseFloat(style.paddingLeft) || 0, padRight = parseFloat(style.paddingRight) || 0;
    const left = rect.left + padLeft, inner = rect.width - padLeft - padRight;
    // The bar's own gap between its columns (it tightens in a smaller window).
    const gap = parseFloat(style.columnGap) || 0;
    const room = inner - 2 * gap - endNeed();
    const centre = pane.left + pane.width / 2 - left, least = startNeed();
    // Centred on the pane while the input keeps 400px: as wide as both sides allow around that centre; narrower than that, it
    // takes the room there is and leaves the centre.
    const half = Math.min(centre - gap - least, room - centre + gap);
    let width = Math.min(READING, pane.width - 2 * INSET, 2 * half);
    if (width < NARROW) width = Math.max(INPUT, Math.min(READING, pane.width - 2 * INSET, room - least));
    const start = Math.max(least, Math.min(centre - width / 2 - gap, room - width));
    bar.style.setProperty("--bar-start-w", Math.round(start) + "px");
    bar.style.setProperty("--bar-column-w", Math.round(width) + "px");
    bar.setAttribute("data-bar-column", "");
  };
  let frame = 0;
  const soon = (): void => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(); }); };
  const sizes = new ResizeObserver(soon);
  for (const node of [bar, stage, end]) if (node) sizes.observe(node);
  // Panes split, close and take focus by class and children; the window moves the stage without resizing it.
  new MutationObserver(soon).observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
  window.addEventListener("resize", soon);
  (globalThis as { molisWorkBarPlace?: () => void }).molisWorkBarPlace = soon;
  place();
}

(globalThis as { molisWorkBarColumn?: () => void }).molisWorkBarColumn = placeBarColumn;
