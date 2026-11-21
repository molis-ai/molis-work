/**
 * How the work line and the task panel sit (specs/work-line §4.1, §4.5, §4.9, §4.10; rules in styles/work-line.ts), in one
 * place for the component board's frame and the product's line: which capsule gives up its note, how much room the counts
 * take from the words, how wide the information column is, how far a long input rises, and where the task float stands. Call it after each draw of a line or a dialog under `root`; it keeps itself right when sizes change.
 * It reads no data and changes no state but scroll positions, a count, and the attributes and properties the sheet reads.
 */
/** The narrowest a float is drawn: a task card's facts and a conversation's input need this much. */
const FLOAT_MIN = 320;
/**
 * Run on the next frame, once however many sizes changed: what rises over the input changes the box its observer measures (a
 * Coding stage loops its ResizeObservers otherwise); the line's other observers mark in place.
 */
const nextFrame = (run: () => void): (() => void) => {
  let frame = 0;
  return () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; run(); }); };
};

/** A capsule that cannot hold its name whole drops its note first: the name and the state word say more. */
function fitEvents(scope: ParentNode): void {
  const events = [...scope.querySelectorAll<HTMLElement>(".work-event")]
    .flatMap((event) => { const name = event.querySelector<HTMLElement>(".work-event-name"); return name && event.querySelector(".work-event-note") ? [{ event, name }] : []; });
  // Every write, then every read, then every write: one layout for the lot.
  for (const { event } of events) event.removeAttribute("data-tight");
  const tight = events.map(({ name }) => name.scrollWidth > name.clientWidth + 1);
  events.forEach(({ event }, index) => event.toggleAttribute("data-tight", tight[index]));
}

/**
 * A task's card and a sub-agent's conversation take the information column's place (specs/work-line §2「后台任务在哪看」,
 * decision 49): over the column while the conversation is open, and where the column would stand — right above the card
 * stack and as wide — while it is closed. A column narrower than the float needs (it stands inside the conversation under
 * 960px) lets the float grow leftwards from its right edge. A dialog with no information column (Home's Assistant) keeps the
 * float beside it, top edges level, or over its right side where there is no room. The sheet places it from these properties;
 * on a phone the sheet makes it a layer that stands clear of the line (`--line-clear`) and ignores the others. It stops
 * watching once the float is gone from the page.
 */
export function installTaskFloatLayout(float: HTMLElement): () => void {
  if (installed.has(float)) return () => {};
  const dialog = document.getElementById(float.dataset.workTaskFloat ?? "");
  if (!dialog) return () => {};
  installed.add(float);
  // A fixed box is placed in the viewport, or in the nearest ancestor that says it frames it (the component board's stage).
  const frame = float.closest<HTMLElement>("[data-work-float-frame]");
  // The line may be drawn after the dialog: it is looked up at each placing, and watched once found.
  let line: HTMLElement | null = null;
  const watch = new ResizeObserver(() => place());
  const stop = () => { watch.disconnect(); changed.disconnect(); window.removeEventListener("resize", place); installed.delete(float); };
  const place = (): void => {
    if (!float.isConnected || !dialog.isConnected) { stop(); return; }
    const found = (frame ?? document).querySelector<HTMLElement>(".work-line[data-work-line], .arrival-bar[data-dock]");
    if (found !== line) { if (line) watch.unobserve(line); line = found; if (line) watch.observe(line); }
    const within = frame?.getBoundingClientRect() ?? new DOMRect(0, 0, document.documentElement.clientWidth, document.documentElement.clientHeight);
    const shut = dialog.hidden, box = (shut ? dialog.parentElement ?? dialog : dialog).getBoundingClientRect(), panel = float.getBoundingClientRect();
    const column = shut ? null : dialog.querySelector<HTMLElement>("[data-assistant-side]"), stack = shut ? line?.querySelector<HTMLElement>(".work-side") : null;
    // In the column the float stands under its tabs, inside its 12px margin: the tabs stay in reach while a task is open.
    const tabs = column?.offsetWidth ? column.querySelector<HTMLElement>("[data-info-tabs]") : null, whole = column?.offsetWidth ? column.getBoundingClientRect() : null;
    const under = whole && tabs?.offsetHeight ? tabs.getBoundingClientRect().bottom + 8 : 0;
    const at = whole ? under ? new DOMRect(whole.left + 12, under, whole.width - 24, Math.max(120, whole.bottom - 12 - under)) : whole : stack?.offsetWidth ? stack.getBoundingClientRect() : null;
    if (at) {
      const width = Math.min(Math.max(at.width, FLOAT_MIN), within.width - 20);
      float.style.setProperty("--col-left", `${Math.max(10, at.right - width - within.left)}px`);
      float.style.setProperty("--col-width", `${width}px`);
      float.style.setProperty("--col-top", `${at.top - within.top}px`);
      float.style.setProperty("--col-height", `${at.height}px`);
      float.style.setProperty("--col-bottom", `${within.bottom - at.top + 12}px`);
    }
    // With no column to stand in: closed, above the input with its right edge on the composer's (WLN-35); open, beside the dialog or over its right side.
    float.dataset.place = at ? column?.offsetWidth ? "column" : "stack" : shut ? "closed" : within.right - box.right >= (panel.width || 340) + 12 ? "beside" : "over";
    float.style.setProperty("--dialog-top", `${box.top - within.top}px`);
    float.style.setProperty("--dialog-right", `${box.right - within.left}px`);
    float.style.setProperty("--dialog-inset", `${within.right - box.right + 8}px`);
    // Over the dialog the panel ends inside it: what is at its foot (reconnecting, when the connection is lost) stays in reach.
    float.style.setProperty("--dialog-room", `${Math.max(160, box.height - 60)}px`);
    // On a phone the panel is a layer above the line: it never lies over the track or the composer (WLN-18).
    float.style.setProperty("--line-clear", `${line ? Math.max(0, within.bottom - line.getBoundingClientRect().top) : 0}px`);
  };
  const changed = new MutationObserver(place);
  place();
  watch.observe(dialog); watch.observe(float); watch.observe(frame ?? document.documentElement);
  changed.observe(dialog, { attributes: true, attributeFilter: ["hidden", "data-max", "data-side"] });
  // The viewport growing taller or shorter moves a dialog fixed to its bottom without resizing anything watched.
  window.addEventListener("resize", place, { passive: true });
  return stop;
}

/** The work surface and the side: what stands above the line in the shell. */
const ABOVE = ":scope>:is([data-plugin-stage],[data-side-panel],.side-panel-divider)";

/**
 * The line keeps its height (WLN-01): an input written past one line grows up out of it, and what it then lies over (the work
 * surface, the side, the divider between them) gives up the same height at its foot (WLN-02). The foot's row holds the input's
 * height at rest, so the account bar and the stack stay as they are and the input stands out above the row (WLN-01 as §16
 * rewrote it).
 */
function installRise(slot: HTMLElement): void {
  const bar = slot.closest<HTMLElement>("[data-work-bar]"), shell = bar?.parentElement, row = slot.parentElement;
  if (!bar || !shell || !row) return;
  const fineDesktop = window.matchMedia("(min-width: 960px) and (hover: hover) and (pointer: fine)");
  let lastWide = fineDesktop.matches;
  const measure = () => {
    // The row keeps the input's height at rest (74px on fine desktop even when a draft loads; measured on narrow/coarse): a longer input stands out above it.
    if (fineDesktop.matches) {
      row.style.setProperty("--foot-rest", "74px");
    } else {
      if (lastWide) row.style.removeProperty("--foot-rest");
      if (slot.querySelector(".mw-composer[data-rest]")) row.style.setProperty("--foot-rest", `${slot.offsetHeight}px`);
    }
    lastWide = fineDesktop.matches;
    const box = slot.getBoundingClientRect(), rise = Math.max(0, Math.round(row.getBoundingClientRect().top - box.top));
    shell.style.setProperty("--line-rise", `${rise}px`);
    for (const part of shell.querySelectorAll<HTMLElement>(ABOVE)) {
      const at = part.getBoundingClientRect();
      part.toggleAttribute("data-line-yield", rise > 0 && at.width > 0 && at.left < box.right && at.right > box.left);
    }
  };
  measure();
  // What it marks (the work surface yielding) resizes what the surface's own observers watch: measured on the next frame.
  const watch = new ResizeObserver(nextFrame(measure));
  watch.observe(slot); watch.observe(row);
  window.addEventListener("resize", measure, { passive: true });
}

/**
 * The words in the input wrap before the counts in its top right (13th version): the room they leave is the counts' own width,
 * which changes with 该你 N, a count's digits and a finger's 44px keys, so it is measured, not guessed. While the conversation
 * is open the three counts are the information column's tabs and only the expand key stays; the room keeps its last width so
 * the words do not move sideways when the conversation opens or a message is sent (VUX-16).
 */
function installCountsRoom(slot: HTMLElement): void {
  const counts = slot.querySelector<HTMLElement>("[data-work-counts]"), line = slot.closest<HTMLElement>("[data-work-line]");
  if (!counts) return;
  let rest = 0;
  let lastTop = "";
  let lastLeft = "";
  const noAnchor = !globalThis.CSS?.supports?.("anchor-name", "--x");
  const measure = () => {
    if (!line?.hasAttribute("data-dialog-open") || !rest) rest = counts.offsetWidth;
    slot.style.setProperty("--counts-room", `${Math.ceil(Math.max(rest, counts.offsetWidth)) + 16}px`);
    if (noAnchor) {
      const text = slot.querySelector<HTMLElement>(".mw-composer__text");
      if (text) {
        const at = slot.getBoundingClientRect(), box = text.getBoundingClientRect();
        const top = `${Math.max(0, Math.round(box.top - at.top))}px`;
        const left = `${Math.max(0, Math.round(box.left - at.left))}px`;
        if (top !== lastTop) {
          lastTop = top;
          slot.style.setProperty("--counts-top", top);
        }
        if (left !== lastLeft) {
          lastLeft = left;
          slot.style.setProperty("--counts-left", left);
        }
      }
    }
  };
  measure();
  const run = nextFrame(measure);
  const watch = new ResizeObserver(run);
  watch.observe(counts);
  if (noAnchor) {
    watch.observe(slot);
    const text = slot.querySelector<HTMLElement>(".mw-composer__text");
    if (text) watch.observe(text);
    new MutationObserver(run).observe(slot, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "data-rest"] });
  }
}

/** The information column is as wide as the card stack it stands over (POLISH-72): the stack's own width, said to the dialog. */
function installInfoWidth(line: HTMLElement): void {
  const side = line.querySelector<HTMLElement>(".work-side");
  if (!side) return;
  const measure = () => { if (side.offsetWidth) line.style.setProperty("--info-w", `${side.offsetWidth}px`); else line.style.removeProperty("--info-w"); };
  measure();
  new ResizeObserver(nextFrame(measure)).observe(side);
}

const installed = new WeakSet<Element>();

export function installWorkLineLayout(root: ParentNode = document): void {
  const each = (selector: string, install: (node: HTMLElement) => void) => {
    for (const node of root.querySelectorAll<HTMLElement>(selector)) {
      if (installed.has(node)) continue;
      installed.add(node); install(node);
    }
  };
  fitEvents(root);
  each(".work-line[data-work-line]", installInfoWidth);
  for (const node of root.querySelectorAll<HTMLElement>("[data-work-task-float]")) installTaskFloatLayout(node);
  each(".work-line-slot", (slot) => { installRise(slot); installCountsRoom(slot); });
}
