/**
 * The work line at the bottom of the workbench (specs/work-line §4, §5; WLN-16～WLN-21): it draws what the page's one attention
 * read (`molis-work:attention`, scripts/client/attention.ts) says is on this project's line, each event with the parts the
 * component board shows (work-line-parts.ts), and keeps the line laid out (work-line-layout.ts). It has no beat of its own
 * (contract-design §11): when something here needs a newer answer it asks for the read again (`molis-work:attention-refresh`).
 * Nothing is kept between reads: an event's name and state are what its owner said this time, a source that could not be read
 * stands beside the head and can be asked again, and the head counts what waits for the person from the same read. The page
 * is served with an empty line, so nothing here runs before the shell is drawn.
 *
 * The background-task mark at the dialog's top right and the panel it opens are in work-task-panel.ts; they paint from the same read.
 *
 * Bundled by esbuild into dist/work-bar-client.js and carried in workbench.js; the workbench's start calls the page global
 * `molisWorkBar` once its shell is drawn (not in a pane-embedded page, which has no bar).
 */
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTasksReadResult, MainlineIssue, WorkLineEvent, WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderLineEvent, renderLineUnreadable, renderOwnerMark, type LineEventState, type LineEventView } from "../work-line-parts.js";
import { ASKS, FAILED, installTaskPanel } from "./work-task-panel.js";
import { installWorkLineLayout } from "./work-line-layout.js";

/** What the workbench gives the line: where its routes are, how a thing opens in the work area, and the dialog an event's tab opens in. */
export interface WorkBarHost {
  route(path: string): string;
  /** A press on an event: its tab in the Assistant's dialog (specs/work-line §4.4). `mark` is its owner's mark as the line draws it. */
  openEvent(event: { subject: ActionSubject; title: string; mark: string }): void;
  /** Back to now: the main conversation in front and the caret in the one input. */
  toNow(): void;
  openItem(surface: string, id: string, title: string): void;
  openSurface(surface: string): void;
}

const RUNNING: ReadonlySet<StateRingState> = new Set(["doing", "starting", "running", "generating", "saving", "indexing", "syncing", "retrying"]);
const QUEUED: ReadonlySet<StateRingState> = new Set(["queued", "waiting"]);
const STOPPED: ReadonlySet<StateRingState> = new Set(["paused", "stopped", "cancelled", "interrupted"]);
const CHECK: ReadonlySet<StateRingState> = new Set(["verify", "conflict", "partial", "disconnected"]);
const DONE: ReadonlySet<StateRingState> = new Set(["done", "saved", "round-ended", "staged"]);

/** The capsule's state: what waits for the person first, then what the line read says is behind the event. */
function stateOf(event: WorkLineEvent): LineEventState {
  const ring = event.line_state;
  if (event.waiting || (ring && ASKS.has(ring))) return "wait";
  if (!ring) return "";
  return FAILED.has(ring) ? "failed" : CHECK.has(ring) ? "verify" : STOPPED.has(ring) ? "stopped" : RUNNING.has(ring) ? "running" : QUEUED.has(ring) ? "queued" : DONE.has(ring) ? "done" : "";
}

/** A plugin's hue on the tab strip is its hue on the line; one that declares none is drawn in the neutral ink. */
function hues(): Map<string, string> {
  try {
    const entries = JSON.parse(document.querySelector("script[data-plugin-directory]")?.textContent || "[]") as Array<{ id: string; hue: string | null }>;
    return new Map(entries.flatMap(entry => entry.hue ? [[entry.id, entry.hue] as const] : []));
  } catch { return new Map(); }
}

/** What the line takes back: which event's tab is the dialog's current one (none at "now"). */
export interface WorkBarHandle {
  focus(subject: ActionSubject | null): void;
  /** The event of this object on the line as last read, as a press on it would open it; null when the line does not show it. */
  event(subject: ActionSubject): LineEventPress | null;
}
export type LineEventPress = Parameters<WorkBarHost["openEvent"]>[0];

export function installWorkBar(host: WorkBarHost): WorkBarHandle | undefined {
  const bar = document.querySelector<HTMLElement>("[data-work-bar]"), line = bar?.querySelector<HTMLElement>("[data-work-line]");
  const past = line?.querySelector<HTMLElement>('[data-wing="past"] .work-line-run'), next = line?.querySelector<HTMLElement>('[data-wing="next"] .work-line-run');
  const lead = line?.querySelector<HTMLElement>(".work-line-lead"), head = lead?.querySelector<HTMLElement>("[data-work-line-head]");
  const { molisWorkRequest: request, molisCraft: craft } = globalThis as typeof globalThis & { molisWorkRequest?: UiRequest; molisCraft?: { ask?(node: Element | null): void } };
  if (!bar || !line || !past || !next || !lead || !head || !request) return undefined;
  installWorkLineLayout(bar);
  const hue = hues(), name = head.querySelector(".work-line-head-name")?.textContent ?? "";
  let events = new Map<string, WorkLineEvent>(), shown = "", focused = "";
  const keyOf = (subject: ActionSubject) => `${subject.kind}:${subject.id}`;
  const again = () => document.dispatchEvent(new CustomEvent("molis-work:attention-refresh"));

  const view = (event: WorkLineEvent, fresh: boolean): LineEventView => {
    const state = stateOf(event), behind = event.tasks.running + event.tasks.waiting, quiet = state === "" || state === "running" || state === "queued";
    // The owner's one line about the event is said once: as the note of a quiet event, as the state of one that asks for a look.
    return {
      id: event.id, title: event.title, kind: "", state, stateLabel: quiet ? "" : state === "wait" && !event.needs_attention ? uiText.text("workbench.work-line.waiting-for-you") : event.summary,
      owner: { name: event.origin.title, glyph: event.origin.icon as PluginIconName, hue: hue.get(event.origin.surface) ?? "" },
      ...(quiet && event.summary ? { note: event.summary } : {}),
      ...(behind > 0 ? { tasks: { count: behind, lead: event.tasks.waiting > 0 ? "answer" as const : "running" as const } } : {}),
      ...(fresh ? { fresh: true } : {}), ...(focused === keyOf(event.subject) ? { current: true } : {}),
    };
  };
  const press = (event: WorkLineEvent): LineEventPress => ({ subject: event.subject, title: event.title, mark: renderOwnerMark(view(event, false).owner) });
  const paintHead = (waiting: number) => {
    const label = waiting > 0 ? uiText.text("workbench.work-line.head-with-waiting", { name, n: waiting }) : name;
    head.setAttribute("aria-label", label); head.title = label;
    let count = head.querySelector<HTMLElement>(".work-line-count");
    if (waiting > 0 && !count) { count = document.createElement("span"); count.className = "work-line-count"; count.setAttribute("aria-hidden", "true"); head.querySelector(".work-line-head-name")?.after(count); }
    if (count) { count.textContent = String(waiting); count.hidden = waiting === 0; }
  };
  const draw = (result: WorkLineReadResult) => {
    const before = events;
    events = new Map(result.events.map(event => [event.id, event]));
    // The same events in the same states are the same line: nothing is redrawn, so a press or a scroll under way is not lost.
    const drawn = JSON.stringify([result.events.map(event => [event.id, event.title, event.summary, event.wing, event.rank, stateOf(event), event.tasks.running, event.tasks.waiting]), result.issues.map(issue => issue.title)]);
    if (drawn === shown) return;
    const first = shown === "";
    shown = drawn;
    const of = (wing: WorkLineEvent["wing"]) => result.events.filter(event => event.wing === wing).sort((a, b) => a.rank - b.rank);
    const html = (list: WorkLineEvent[]) => list.map(event => renderLineEvent(view(event, !first && !before.has(event.id)))).join("");
    // What happened runs towards now, oldest first; what is beside now ends the left wing, nearest last.
    past.innerHTML = html([...of("done").reverse(), ...of("now").reverse()]);
    next.innerHTML = html(of("next"));
    for (const stale of lead.querySelectorAll("[data-work-line-retry]")) stale.remove();
    lead.insertAdjacentHTML("beforeend", unreadable(result.issues));
    paintHead(result.events.filter(event => stateOf(event) === "wait").length);
    installWorkLineLayout(bar);
    // An event that came to wait for the person since the last read says so once (the shared "your turn" ring); its state keeps saying it.
    if (!first) for (const event of result.events) {
      const was = before.get(event.id);
      if (stateOf(event) === "wait" && (!was || stateOf(was) !== "wait")) craft?.ask?.(line.querySelector(`[data-work-event="${CSS.escape(event.id)}"]`));
    }
  };
  const unreadable = (issues: readonly MainlineIssue[]) => [...new Set(issues.map(issue => issue.title))].map(renderLineUnreadable).join("");

  const panel = installTaskPanel(host, { events: () => events.values(), press, keyOf, hue, again, request });

  line.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-work-line-retry]")) { again(); return; }
    if (target?.closest("[data-work-line-head]")) { host.openSurface("home"); return; }
    const pressed = events.get(target?.closest<HTMLElement>("[data-work-event]")?.dataset.workEvent ?? "");
    if (pressed) host.openEvent(press(pressed));
  });
  // Keyboard (WLN-17): Alt+L puts focus on the line — the event whose tab is in front, else the one beside now; ← and → move
  // between events in the line's order, Enter is the button's own press, Esc goes back to now.
  const stops = () => [...line.querySelectorAll<HTMLElement>("[data-work-event]")];
  document.addEventListener("keydown", event => {
    if (event.code !== "KeyL" || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || (event.target instanceof Element && event.target.closest(".xterm"))) return;
    event.preventDefault();
    (line.querySelector<HTMLElement>("[data-work-event][aria-current]") ?? [...past.querySelectorAll<HTMLElement>("[data-work-event]")].pop() ?? stops()[0] ?? head).focus();
  });
  line.addEventListener("keydown", event => {
    const at = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-work-event]") : null;
    if (!at || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const all = stops(), to = all[all.indexOf(at) + (event.key === "ArrowRight" ? 1 : -1)];
      if (to) { event.preventDefault(); to.focus(); }
    } else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); host.toNow(); }
  });
  // A part the read could not get is null: the line and the mark keep what they showed.
  document.addEventListener("molis-work:attention", event => {
    const { line: read, tasks: table } = (event as CustomEvent<{ line?: WorkLineReadResult | null; tasks?: BackgroundTasksReadResult | null }>).detail ?? {};
    if (read) draw(read);
    if (table) panel.take(table);
  });
  return {
    event(subject) { const found = [...events.values()].find(one => keyOf(one.subject) === keyOf(subject)); return found ? press(found) : null; },
    // The outline moves with the dialog's current tab; the event keeps its place on the line (WLN-07).
    focus(subject) {
      focused = subject ? keyOf(subject) : "";
      for (const node of line.querySelectorAll<HTMLElement>("[data-work-event]")) {
        const event = events.get(node.dataset.workEvent ?? "");
        if (event && keyOf(event.subject) === focused) node.setAttribute("aria-current", "true"); else node.removeAttribute("aria-current");
      }
    },
  };
}

(globalThis as { molisWorkBar?: (host: WorkBarHost) => WorkBarHandle | undefined }).molisWorkBar = installWorkBar;
