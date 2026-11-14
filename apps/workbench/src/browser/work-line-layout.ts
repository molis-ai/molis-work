/**
 * How the work line and the task panel sit (specs/work-line §4.1, §4.5, WLN-18; rules in styles/work-line.ts), in one place
 * for the component board's frame and the product's line: where a wing rests, how its hidden events are reached, where the
 * phone's track rests, which capsule gives up its note, which dialog tab stays in sight, and where the task panel floats. Call it after each draw of a line or
 * a dialog under `root`; it keeps itself right when sizes change. It reads no data and changes no state but scroll positions,
 * a count, and the placement attributes the sheet reads.
 */

const PAST_RUN = '.work-line-wing[data-wing="past"] .work-line-run';
const NEXT_RUN = '.work-line-wing[data-wing="next"] .work-line-run';
const FADE = 24;

/** The events of a run that lie wholly or partly out of sight at its start. */
function hiddenBefore(run: HTMLElement): number {
  const edge = run.getBoundingClientRect().left;
  return [...run.children].filter((item) => item.getBoundingClientRect().left < edge - 1).length;
}

/** A capsule that cannot hold its name whole drops its note first: the name and the state word say more. */
function fitEvents(scope: ParentNode): void {
  for (const event of scope.querySelectorAll<HTMLElement>(".work-event")) {
    const name = event.querySelector<HTMLElement>(".work-event-name");
    if (!name || !event.querySelector(".work-event-note")) continue;
    event.removeAttribute("data-tight");
    event.toggleAttribute("data-tight", name.scrollWidth > name.clientWidth + 1);
  }
}

function installPastWing(run: HTMLElement): void {
  const earlier = run.parentElement?.querySelector<HTMLButtonElement>("[data-work-line-earlier]");
  const count = earlier?.querySelector<HTMLElement>("[data-count]");
  const report = () => {
    const hidden = hiddenBefore(run);
    run.toggleAttribute("data-more", run.scrollLeft > 1);
    if (!earlier) return;
    earlier.hidden = hidden === 0;
    if (count) count.textContent = String(hidden);
    const label = earlier.dataset.label?.replace("{n}", String(hidden));
    if (label) { earlier.setAttribute("aria-label", label); earlier.title = label; }
  };
  // What is being worked on and what waits sit next to the composer, so the wing rests at its end; the oldest scroll out first.
  const rest = () => { fitEvents(run); run.scrollLeft = run.scrollWidth; report(); };
  earlier?.addEventListener("click", () => run.scrollBy({ left: -Math.max(120, run.clientWidth - FADE), behavior: "smooth" }));
  run.addEventListener("scroll", report, { passive: true });
  // A wheel that only turns up and down still reaches the earlier events.
  run.addEventListener("wheel", (event) => {
    if (run.scrollWidth <= run.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault(); run.scrollLeft += event.deltaY;
  }, { passive: false });
  rest(); new ResizeObserver(rest).observe(run);
}

function installNextWing(run: HTMLElement): void {
  const report = () => run.toggleAttribute("data-more", run.scrollLeft + run.clientWidth < run.scrollWidth - 1);
  const rest = () => { fitEvents(run); report(); };
  run.addEventListener("scroll", report, { passive: true });
  rest(); new ResizeObserver(rest).observe(run);
}

/** On a phone the line is one track that scrolls sideways. It opens with the events next to now whole, and now in sight (WLN-18). */
function installTrack(track: HTMLElement): void {
  const now = track.querySelector<HTMLElement>(".work-line-now");
  const rest = () => {
    if (!now?.offsetParent) return;
    const box = track.getBoundingClientRect(), head = track.querySelector<HTMLElement>("[data-work-line-head]");
    const lead = (head?.getBoundingClientRect().width ?? 0) + 8;
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
 * of the line (`--line-clear`) and ignores the others.
 */
function installFloat(float: HTMLElement): void {
  const dialog = document.getElementById(float.dataset.workTaskFloat ?? "");
  // A fixed box is placed in the viewport, or in the nearest ancestor that says it frames it (the component board's stage).
  const frame = float.closest<HTMLElement>("[data-work-float-frame]");
  if (!dialog) return;
  const line = (frame ?? document).querySelector<HTMLElement>("[data-work-line]");
  const place = () => {
    const within = frame?.getBoundingClientRect() ?? new DOMRect(0, 0, document.documentElement.clientWidth, document.documentElement.clientHeight);
    const box = dialog.getBoundingClientRect(), panel = float.firstElementChild?.getBoundingClientRect();
    const beside = within.right - box.right >= (panel?.width ?? 340) + 12;
    float.dataset.place = beside ? "beside" : "over";
    float.style.setProperty("--dialog-top", `${box.top - within.top}px`);
    float.style.setProperty("--dialog-right", `${box.right - within.left}px`);
    float.style.setProperty("--dialog-inset", `${within.right - box.right + 8}px`);
    // On a phone the panel is a layer above the line: it never lies over the track or the composer (WLN-18).
    float.style.setProperty("--line-clear", `${line ? Math.max(0, within.bottom - line.getBoundingClientRect().top) : 0}px`);
  };
  place();
  const watch = new ResizeObserver(place);
  watch.observe(dialog); watch.observe(frame ?? document.documentElement);
  if (line) watch.observe(line);
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
  each(".assistant-tabs[data-work-line]", installTabs);
  each("[data-work-task-float]", installFloat);
}
