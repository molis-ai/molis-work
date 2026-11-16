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
/**
 * Run on the next frame, once however many sizes changed: what rises over the input and where the input stands both change the
 * boxes their observers measure (a Coding stage loops its ResizeObservers otherwise); the line's other observers mark in place.
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
 * The left wing rests at its end: what is being worked on and what waits sit next to the composer, and the oldest events go
 * out of sight first. Only whole capsules show: one cut by an edge is made invisible (it stays in the reading and tab order,
 * and focusing it brings it into the wing). The button after the head says how many are before the wing, and whether one of
 * them asks for attention; a press brings the last of them to the wing's end, so every press shows at least one more event
 * whole and every counted event is reached. Once paged back, a button at the wing's end goes back to now.
 */
function installPastWing(run: HTMLElement): void {
  const wing = run.parentElement;
  const earlier = wing?.querySelector<HTMLButtonElement>("[data-work-line-earlier]"), latest = wing?.querySelector<HTMLButtonElement>("[data-work-line-latest]");
  const count = earlier?.querySelector<HTMLElement>("[data-count]"), flagged = earlier?.querySelector<HTMLElement>("[data-attn-count]");
  const items = () => [...run.children] as HTMLElement[];
  const smooth = (): ScrollBehavior => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  /** Where a capsule's end rests: the run's end, less its padding (wider while the way back to now stands there). */
  const end = () => run.getBoundingClientRect().right - parseFloat(getComputedStyle(run).paddingRight);
  const align = (item: HTMLElement, behavior: ScrollBehavior = "auto") => run.scrollTo({ left: run.scrollLeft + item.getBoundingClientRect().right - end(), behavior });
  // Whether the person left the wing at its end: a size change keeps the end in sight only then, so paging back is not undone.
  // Only a scroll the person made counts (one that follows their input): the scroll events our own settling causes, arriving
  // after a button appeared and narrowed the run, would otherwise read as "scrolled away".
  let atEnd = true, touched = -Infinity, turned = 0;
  // While a press is carrying the wing to a capsule: a size change must not cut the move short or land it elsewhere, and on
  // the way back to now the capsules still past the end do not bring the way back's room in again.
  let dest: HTMLElement | null = null, idle = 0, homing = false;
  // The last whole capsule in sight: what a size change keeps in place while paged back, and what a wheel steps from.
  let anchor: HTMLElement | null = null;
  const touch = () => { touched = performance.now(); };
  const report = () => {
    const from = run.getBoundingClientRect().left, to = end(), all = items();
    const boxes = all.map((item) => item.getBoundingClientRect());
    // Before the wing's start: out of sight and counted. Past its end (while paged back): out of sight, toward now.
    const before = boxes.map((box) => box.left < from - 1), after = boxes.map((box) => box.right > to + 1);
    let hidden = 0, attention = 0;
    anchor = null;
    all.forEach((item, index) => {
      item.toggleAttribute("data-cut", !dest && (before[index]! || after[index]!));
      if (before[index]) { hidden += 1; if (URGENT.has(item.dataset.state ?? "")) attention += 1; } else if (!after[index]) anchor = item;
    });
    const back = !homing && after.some(Boolean);
    run.toggleAttribute("data-back", back);
    // A button that goes away while it holds the focus hands it to the event it led to.
    if (latest && !back && document.activeElement === latest) all[all.length - 1]?.focus({ preventScroll: true });
    if (latest) latest.hidden = !back;
    if (!earlier) return;
    if (hidden === 0 && document.activeElement === earlier) all[0]?.focus({ preventScroll: true });
    earlier.hidden = hidden === 0;
    earlier.toggleAttribute("data-attn", attention > 0);
    if (count) count.textContent = String(hidden);
    if (flagged) { flagged.hidden = attention === 0; const n = flagged.querySelector("[data-n]"); if (n) n.textContent = String(attention); }
    const label = attention ? globalThis.t.text("workbench.work-line.earlier-events-n-attention", { n: String(hidden), m: String(attention) })
      : globalThis.t.text("workbench.work-line.earlier-events-n", { n: String(hidden) });
    earlier.setAttribute("aria-label", label); earlier.title = label;
  };
  const settle = () => {
    fitEvents(run);
    if (!dest) { if (atEnd) run.scrollLeft = run.scrollWidth; else if (anchor?.isConnected) align(anchor); }
    report();
  };
  /** The move a press began has come to rest (no scroll for a moment): it lands exactly on its capsule, whatever changed size on the way. */
  const arrive = () => {
    const to = dest; dest = null;
    if (atEnd) run.scrollLeft = run.scrollWidth; else if (to?.isConnected) align(to);
    report();
  };
  const wait = () => { clearTimeout(idle); idle = window.setTimeout(arrive, 160); };
  /** Brings a capsule to the wing's end; the one next to now takes the wing back to its rest. */
  const go = (target: HTMLElement | undefined, behavior: ScrollBehavior) => {
    if (!target) return;
    const all = items();
    touch(); clearTimeout(idle);
    // Only a glide has a way to go: without motion the capsule is there at once.
    dest = behavior === "smooth" ? target : null;
    if (dest) wait();
    atEnd = homing = target === all[all.length - 1];
    if (atEnd) { run.removeAttribute("data-back"); run.scrollTo({ left: run.scrollWidth, behavior }); return; }
    // The way back to now takes its room first, so the capsule lands where it will stay.
    run.setAttribute("data-back", ""); anchor = target; align(target, behavior);
  };
  const beside = (by: number) => { const all = items(); return all[(anchor ? all.indexOf(anchor) : all.length - 1) + by]; };
  // A press while the last one is still gliding goes one event further than where that one is headed.
  earlier?.addEventListener("click", () => {
    const from = run.getBoundingClientRect().left, all = items();
    go(dest ? all[all.indexOf(dest) - 1] : all.filter((item) => item.getBoundingClientRect().left < from - 1).pop(), smooth());
  });
  latest?.addEventListener("click", () => go(items().pop(), smooth()));
  // The person's own input: what follows is theirs, and it ends a move a press began.
  for (const type of ["wheel", "pointerdown", "touchstart", "keydown", "focusin"]) run.addEventListener(type, () => { touch(); homing = false; dest = null; clearTimeout(idle); }, { passive: true });
  run.addEventListener("scroll", () => {
    const rests = run.scrollLeft + run.clientWidth >= run.scrollWidth - 2;
    if (rests) homing = false;
    if (!homing && performance.now() - touched < 2000) atEnd = rests;
    if (dest) wait();
    report();
  }, { passive: true });
  // A wheel that only turns up and down still reaches the earlier events, a capsule at a time (the run snaps to whole capsules).
  run.addEventListener("wheel", (event) => {
    if (run.scrollWidth <= run.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    // At either end the wheel is the page's again.
    if (event.deltaY < 0 ? run.scrollLeft <= 0 : atEnd) return;
    event.preventDefault();
    turned += event.deltaMode ? event.deltaY * 16 : event.deltaY;
    if (Math.abs(turned) < 48) return;
    go(beside(turned < 0 ? -1 : 1), "auto"); turned = 0;
  }, { passive: false });
  settle(); new ResizeObserver(settle).observe(run);
  // The line is drawn again into the same wing (a read brought other events): it settles as after a resize.
  new MutationObserver(settle).observe(run, { childList: true });
}

function installNextWing(run: HTMLElement): void {
  // The edge that has more fades by the shared overflow fade (the run is marked data-overflow-fade); nothing is measured here for it.
  const settle = () => fitEvents(run);
  settle(); new ResizeObserver(settle).observe(run);
  new MutationObserver(settle).observe(run, { childList: true });
}

/**
 * On a phone the line is one track that slides sideways. It opens with the event next to now whole after the fixed lead, and
 * now in sight (WLN-18); it rests on whole capsules (the sheet snaps their starts to the lead's edge, which this measures), a
 * line too short to slide that far gets the tail it needs, and a wheel that only turns up and down moves an event a notch.
 */
function installTrack(track: HTMLElement): void {
  const now = track.querySelector<HTMLElement>(".work-line-now");
  const slides = () => getComputedStyle(track).display !== "contents";
  const leadWidth = () => (track.querySelector<HTMLElement>(".work-line-lead")?.getBoundingClientRect().width ?? 0) + 8;
  const capsules = () => [...track.querySelectorAll<HTMLElement>(".work-line-run > .work-event")];
  let turned = 0;
  const rest = () => {
    for (const name of ["--near-max", "--cap-max", "--lead-width", "--track-tail"]) track.style.removeProperty(name);
    if (!now || !slides()) return;
    const lead = leadWidth();
    track.style.setProperty("--lead-width", `${lead}px`);
    // The event next to now is no wider than what the fixed lead and now leave of the track: it shows whole in any language.
    // Its floor is a mark and a short name: a track the folded dialog row shortens still keeps now in sight.
    track.style.setProperty("--near-max", `${Math.max(72, track.clientWidth - lead - now.offsetWidth - 24)}px`);
    // No event is wider than the track beside the lead: each can rest whole at the lead's edge.
    track.style.setProperty("--cap-max", `${Math.max(96, track.clientWidth - lead - 8)}px`);
    const box = track.getBoundingClientRect(), nearest = track.querySelector<HTMLElement>(`${PAST_RUN} > :last-child`);
    const from = (nearest ?? now).getBoundingClientRect().left - box.left - lead;
    // Never so far that now leaves the track.
    const most = now.getBoundingClientRect().right - box.left - track.clientWidth + 8;
    const to = track.scrollLeft + Math.max(from, most), end = track.scrollWidth - track.clientWidth;
    // The track ends where a capsule starts at the lead's edge: slid all the way, none stands half under the lead. The
    // tail is what the content lacks to end there (and to reach the resting place at all).
    const stops = capsules().map((item) => track.scrollLeft + item.getBoundingClientRect().left - box.left - lead);
    const last = stops.find((stop) => stop >= Math.max(to, end) - 1) ?? Math.max(to, end);
    if (last - end > 0.5) track.style.setProperty("--track-tail", `${Math.ceil(last - end)}px`);
    track.scrollLeft = to;
  };
  track.addEventListener("wheel", (event) => {
    if (!slides() || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const edge = track.getBoundingClientRect().left + leadWidth(), events = capsules();
    const at = events.findIndex((item) => item.getBoundingClientRect().left >= edge - 1), target = events[(at < 0 ? events.length : at) + (event.deltaY < 0 ? -1 : 1)];
    // With no event further that way, or the track at its end, the wheel is the page's again.
    if (!target || (event.deltaY > 0 && track.scrollLeft >= track.scrollWidth - track.clientWidth - 1)) { turned = 0; return; }
    event.preventDefault();
    turned += event.deltaMode ? event.deltaY * 16 : event.deltaY;
    if (Math.abs(turned) < 48) return;
    turned = 0;
    track.scrollBy({ left: target.getBoundingClientRect().left - edge });
  }, { passive: false });
  // A capsule that takes the focus rests whole. The browser brings it in by the shortest way and then snaps to the nearest
  // stop, which can be the capsule before it: a short one after a wide one would be left outside the track.
  track.addEventListener("focusin", (event) => {
    const item = event.target instanceof Element ? event.target.closest<HTMLElement>(".work-line-run > .work-event") : null;
    if (!item || !slides()) return;
    const box = track.getBoundingClientRect(), at = item.getBoundingClientRect(), edge = box.left + leadWidth();
    if (at.left < edge - 1 || at.right > box.right + 1) track.scrollBy({ left: at.left - edge, behavior: "instant" });
  });
  rest(); new ResizeObserver(rest).observe(track);
  new MutationObserver(rest).observe(track, { childList: true, subtree: true });
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
    const shut = dialog.hidden, box = (shut ? dialog.parentElement ?? dialog : dialog).getBoundingClientRect(), panel = float.firstElementChild?.getBoundingClientRect();
    // With the dialog closed the panel stands above the input, its right edge on the composer's (WLN-35).
    float.dataset.place = shut ? "closed" : within.right - box.right >= (panel?.width ?? 340) + 12 ? "beside" : "over";
    float.style.setProperty("--dialog-top", `${box.top - within.top}px`);
    float.style.setProperty("--dialog-right", `${box.right - within.left}px`);
    float.style.setProperty("--dialog-inset", `${within.right - box.right + 8}px`);
    // Over the dialog the panel ends inside it: what is at its foot (reconnecting, when the connection is lost) stays in reach.
    float.style.setProperty("--dialog-room", `${Math.max(160, box.height - 60)}px`);
    // On a phone the panel is a layer above the line: it never lies over the track or the composer (WLN-18).
    float.style.setProperty("--line-clear", `${line ? Math.max(0, within.bottom - line.getBoundingClientRect().top) : 0}px`);
  };
  place();
  watch.observe(dialog); watch.observe(frame ?? document.documentElement);
  new MutationObserver(place).observe(dialog, { attributes: true, attributeFilter: ["hidden"] });
  // The viewport growing taller or shorter moves a dialog fixed to its bottom without resizing anything watched.
  window.addEventListener("resize", place, { passive: true });
}

/** The work surface and the side: what stands above the line in the shell. */
const ABOVE = ":scope>:is([data-plugin-stage],[data-side-panel],.side-panel-divider)";

/**
 * The line keeps its height (WLN-01): an input written past one line grows up out of it, and what it then lies over (the work
 * surface, the side, the divider between them) gives up the same height at its foot (WLN-02). Where the line is one row the
 * sheet holds it at the bar's height and the composer's slot stands out above it; where the line stands above the composer the
 * row grows with it and the shell makes the room itself, so nothing rises there.
 */
function installRise(slot: HTMLElement): void {
  const bar = slot.closest<HTMLElement>("[data-work-bar]"), shell = bar?.parentElement, row = slot.parentElement;
  if (!bar || !shell || !row) return;
  const measure = () => {
    const rise = Math.max(0, Math.round(slot.offsetHeight - row.clientHeight)), box = slot.getBoundingClientRect();
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
 * The input's least width where the line is one row (the sheet's narrowest middle column); what the next wing keeps (the folded
 * dialog's mark and 展开对话, 72px, and the start of a capsule: the sheet's own floor under 1120px is none); a pane's inset.
 */
const LEAST_SLOT = 300, LEAST_NEXT = 120, INSET = 24;

/**
 * The input stands over the work, not over the window (UIV-19, which the line keeps: specs/work-line §10). Where the line is one
 * row, the composer's column is centred on the focused pane, or on the conversation column the page in front names (that page
 * then stands as wide as the input, `--mw-bar-column`), and never reaches past the work's right edge: an open side keeps it, and
 * what rises above it, clear of the side. It keeps the width the sheet gives it while there is room; short of room it narrows down
 * to the sheet's least, and then the left wing gives up its 420px. Where the line stands above the composer (or on a phone) the
 * sheet's own layout stands. The page in front tells it when its column changes (`molisWorkBarPlace`).
 */
function installPlace(slot: HTMLElement): void {
  const row = slot.parentElement, stage = document.querySelector<HTMLElement>("[data-plugin-stage]");
  if (!row || !stage || !("ResizeObserver" in window)) return;
  const pane = (): DOMRect | null => {
    const box = (stage.querySelector<HTMLElement>(".tab-workspace-panes > [data-tab-pane].is-focused:not([hidden])") ?? stage).getBoundingClientRect();
    return box.width > 0 ? box : null;
  };
  const place = (): void => {
    row.removeAttribute("data-slot-placed"); row.style.removeProperty("--slot-columns");
    const work = pane(), style = getComputedStyle(row);
    if (!work || style.display !== "grid" || getComputedStyle(slot).gridRowStart !== "1") return;
    const page = globalThis.molisBarReceivers?.front()?.column() ?? null;
    const column = page && page.width > 0 ? page : { left: work.left + INSET, width: work.width - 2 * INSET };
    const box = row.getBoundingClientRect(), gap = parseFloat(style.columnGap) || 0, natural = slot.getBoundingClientRect().width;
    const least = Math.min(420, box.width * 0.4) + gap;
    const most = Math.min(work.right - box.left, box.width - gap - LEAST_NEXT);
    let width = Math.min(natural, column.width), left = column.left + column.width / 2 - width / 2 - box.left;
    if (most - least >= width) left = Math.min(Math.max(left, least), most - width);
    else { width = Math.max(LEAST_SLOT, Math.min(width, most - least)); left = Math.max(gap, most - width); }
    row.style.setProperty("--slot-columns", `${Math.round(left - gap)}px ${Math.round(width)}px minmax(0,1fr)`);
    row.setAttribute("data-slot-placed", "");
  };
  // A size change is placed on the next frame (placing changes the row it was measured on, which would loop the observer); the
  // rest is placed before the frame paints, so a page that loads does not first paint the input where it stood (VUX-31).
  const soon = nextFrame(place);
  let queued = false;
  const now = (): void => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; place(); }); } };
  const sizes = new ResizeObserver(soon);
  sizes.observe(row); sizes.observe(stage);
  // Panes split, close and take focus by class and children; the window moves the stage without resizing it.
  new MutationObserver(now).observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
  window.addEventListener("resize", now, { passive: true });
  globalThis.molisWorkBarPlace = now;
  place();
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
  each(".work-line-slot", (slot) => { installRise(slot); installPlace(slot); });
}
