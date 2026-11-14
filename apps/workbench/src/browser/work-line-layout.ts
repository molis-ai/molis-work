/**
 * How the work line and the task panel sit (specs/work-line §4.1, §4.5, §4.9, §4.10; rules in styles/work-line.ts), in one
 * place for the component board's frame and the product's line: where a wing rests, which of its events show, how the hidden
 * ones are reached, where the phone's track rests, which capsule gives up its note, which dialog tab stays in sight, and where
 * the task panel floats. Call it after each draw of a line or a dialog under `root`; it keeps itself right when sizes change.
 * It reads no data and changes no state but scroll positions, a count, and the attributes and properties the sheet reads.
 */

const PAST_RUN = '.work-line-wing[data-wing="past"] .work-line-run';
const NEXT_RUN = '.work-line-wing[data-wing="next"] .work-line-run';
const FADE = 24;
/** The states worth saying about events out of sight: one needs the person, failed, or has a result to check. */
const URGENT = new Set(["wait", "failed", "verify"]);

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
 * The left wing rests at its end: what is being worked on and what waits sit next to the composer, and the oldest events go
 * out of sight first. Only whole capsules show (one cut by the wing's edge is hidden and counted), except the one next to now,
 * which shrinks instead. The button after the head says how many are out of sight, and whether one of them asks for attention.
 */
function installPastWing(run: HTMLElement): void {
  const earlier = run.parentElement?.querySelector<HTMLButtonElement>("[data-work-line-earlier]");
  const count = earlier?.querySelector<HTMLElement>("[data-count]"), flagged = earlier?.querySelector<HTMLElement>("[data-attn-count]");
  // Whether the person left the wing at its end: a size change keeps the end in sight only then, so paging back is not undone.
  // Only a scroll the person made counts (one that follows their input): the scroll events our own settling causes, arriving
  // after the button appeared and narrowed the run, would otherwise read as "scrolled away".
  let atEnd = true, touched = -Infinity;
  const touch = () => { touched = performance.now(); };
  const report = () => {
    const box = run.getBoundingClientRect(), items = [...run.children] as HTMLElement[];
    const boxes = items.map((item) => item.getBoundingClientRect());
    // Before the wing's start: out of sight and counted. Past its end (while paged back): only hidden, they are next to now.
    const before = boxes.map((item, index) => index < items.length - 1 && item.left < box.left - 1);
    let hidden = 0, attention = 0;
    items.forEach((item, index) => {
      item.toggleAttribute("data-cut", before[index] || boxes[index]!.right > box.right + 1);
      if (before[index]) { hidden += 1; if (URGENT.has(item.dataset.state ?? "")) attention += 1; }
    });
    if (!earlier) return;
    earlier.hidden = hidden === 0;
    earlier.toggleAttribute("data-attn", attention > 0);
    if (count) count.textContent = String(hidden);
    if (flagged) { flagged.hidden = attention === 0; const n = flagged.querySelector("[data-n]"); if (n) n.textContent = String(attention); }
    const label = (attention ? earlier.dataset.labelAttn : earlier.dataset.label)?.replace("{n}", String(hidden)).replace("{m}", String(attention));
    if (label) { earlier.setAttribute("aria-label", label); earlier.title = label; }
  };
  const settle = () => { fitEvents(run); if (atEnd) run.scrollLeft = run.scrollWidth; report(); };
  earlier?.addEventListener("click", () => { touch(); run.scrollBy({ left: -Math.max(120, run.clientWidth - FADE), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
  for (const type of ["wheel", "pointerdown", "touchstart", "keydown", "focusin"]) run.addEventListener(type, touch, { passive: true });
  run.addEventListener("scroll", () => { if (performance.now() - touched < 2000) atEnd = run.scrollLeft + run.clientWidth >= run.scrollWidth - 2; report(); }, { passive: true });
  // A wheel that only turns up and down still reaches the earlier events.
  run.addEventListener("wheel", (event) => {
    if (run.scrollWidth <= run.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault(); touch(); run.scrollLeft += event.deltaY;
  }, { passive: false });
  settle(); new ResizeObserver(settle).observe(run);
}

function installNextWing(run: HTMLElement): void {
  const report = () => run.toggleAttribute("data-more", run.scrollLeft + run.clientWidth < run.scrollWidth - 1);
  const settle = () => { fitEvents(run); report(); };
  run.addEventListener("scroll", report, { passive: true });
  settle(); new ResizeObserver(settle).observe(run);
}

/** On a phone the line is one track that scrolls sideways. It opens with the event next to now whole after the head, and now in sight (WLN-18). */
function installTrack(track: HTMLElement): void {
  const now = track.querySelector<HTMLElement>(".work-line-now");
  const rest = () => {
    if (!now?.offsetParent) return;
    const box = track.getBoundingClientRect(), lead = (track.querySelector<HTMLElement>(".work-line-lead")?.getBoundingClientRect().width ?? 0) + 8;
    const nearest = track.querySelector<HTMLElement>(`${PAST_RUN} > :last-child`);
    const from = (nearest ?? now).getBoundingClientRect().left - box.left - lead;
    // Never so far that now leaves the track.
    const most = now.getBoundingClientRect().right - box.left - track.clientWidth + 8;
    track.scrollLeft += Math.max(from, most);
  };
  rest(); new ResizeObserver(rest).observe(track);
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
function installFloat(float: HTMLElement): void {
  const dialog = document.getElementById(float.dataset.workTaskFloat ?? "");
  if (!dialog) return;
  // A fixed box is placed in the viewport, or in the nearest ancestor that says it frames it (the component board's stage).
  const frame = float.closest<HTMLElement>("[data-work-float-frame]");
  // The line may be drawn after the dialog: it is looked up at each placing, and watched once found.
  let line: HTMLElement | null = null;
  const watch = new ResizeObserver(() => place());
  const stop = () => { watch.disconnect(); window.removeEventListener("resize", place); };
  const place = (): void => {
    if (!float.isConnected || !dialog.isConnected) { stop(); return; }
    const found = (frame ?? document).querySelector<HTMLElement>(".work-line[data-work-line]");
    if (found !== line) { if (line) watch.unobserve(line); line = found; if (line) watch.observe(line); }
    const within = frame?.getBoundingClientRect() ?? new DOMRect(0, 0, document.documentElement.clientWidth, document.documentElement.clientHeight);
    const box = dialog.getBoundingClientRect(), panel = float.firstElementChild?.getBoundingClientRect();
    float.dataset.place = within.right - box.right >= (panel?.width ?? 340) + 12 ? "beside" : "over";
    float.style.setProperty("--dialog-top", `${box.top - within.top}px`);
    float.style.setProperty("--dialog-right", `${box.right - within.left}px`);
    float.style.setProperty("--dialog-inset", `${within.right - box.right + 8}px`);
    // On a phone the panel is a layer above the line: it never lies over the track or the composer (WLN-18).
    float.style.setProperty("--line-clear", `${line ? Math.max(0, within.bottom - line.getBoundingClientRect().top) : 0}px`);
  };
  place();
  watch.observe(dialog); watch.observe(frame ?? document.documentElement);
  // The viewport growing taller or shorter moves a dialog fixed to its bottom without resizing anything watched.
  window.addEventListener("resize", place, { passive: true });
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
  each(PAST_RUN, installPastWing);
  each(NEXT_RUN, installNextWing);
  each("[data-work-line-track]", installTrack);
  each(".assistant-tabs[data-work-tabs]", installTabs);
  each("[data-work-task-float]", installFloat);
}
