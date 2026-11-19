/**
 * How the work line and the task panel sit (specs/work-line §4.1, §4.5, §4.9, §4.10; rules in styles/work-line.ts), in one
 * place for the component board's frame and the product's line: where a wing rests, which of its events show, how the hidden
 * ones are reached, where the phone's track rests, which capsule gives up its note, which dialog tab stays in sight, and where
 * the task panel floats. Call it after each draw of a line or a dialog under `root`; it keeps itself right when sizes change.
 * It reads no data and changes no state but scroll positions, a count, and the attributes and properties the sheet reads.
 */
const FADE = 24;
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

function installTabs(tabs: HTMLElement): void {
  const rest = () => {
    const current = tabs.querySelector<HTMLElement>(".assistant-tab[data-current]");
    if (!current) return;
    const box = tabs.getBoundingClientRect(), tab = current.getBoundingClientRect();
    if (tab.right > box.right) tabs.scrollLeft += tab.right - box.right + FADE;
    else if (tab.left < box.left) tabs.scrollLeft -= box.left - tab.left + FADE;
  };
  rest(); new ResizeObserver(rest).observe(tabs);
}

/**
 * The task panel floats beside its dialog, top edges level; where there is no room beside it, it lies over the dialog's right
 * side under the tab bar. The sheet places it from these properties; on a phone the sheet makes it a layer that stands clear
 * of the line (`--line-clear`) and ignores the others. It stops watching once the panel is gone from the page.
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
    // With the dialog closed the panel stands above the input, its right edge on the composer's (WLN-35).
    float.dataset.place = shut ? "closed" : within.right - box.right >= (panel.width || 340) + 12 ? "beside" : "over";
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
  changed.observe(dialog, { attributes: true, attributeFilter: ["hidden"] });
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
  const measure = () => {
    // The row keeps the input's height at rest (74px; taller where its rows are a finger's): a longer input stands out above it.
    if (slot.querySelector(".mw-composer[data-rest]")) row.style.setProperty("--foot-rest", `${slot.offsetHeight}px`);
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
 * which changes with 该你 N, a count's digits and a finger's 44px keys, so it is measured, not guessed.
 */
function installCountsRoom(slot: HTMLElement): void {
  const counts = slot.querySelector<HTMLElement>("[data-work-counts]");
  if (!counts) return;
  const measure = () => slot.style.setProperty("--counts-room", `${Math.ceil(counts.offsetWidth) + 16}px`);
  measure();
  new ResizeObserver(nextFrame(measure)).observe(counts);
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
  each(".assistant-tabs[data-work-tabs]", installTabs);
  for (const node of root.querySelectorAll<HTMLElement>("[data-work-task-float]")) installTaskFloatLayout(node);
  each(".work-line-slot", (slot) => { installRise(slot); installCountsRoom(slot); });
}
