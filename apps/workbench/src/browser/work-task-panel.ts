/**
 * The background-task mark at the dialog's top right and the panel it opens (specs/work-line §4.5, §6; WLN-34～WLN-36): every task
 * the person can read, from the task table the page's one attention read brings, the ones that wait first. A row opens its task's
 * card in the panel's place: whom it is done for and where that can be changed (the owner keeps it; the mainline service asks),
 * one step to that event's tab, and its stop — the command the row itself carries, which the service checks with the owner again.
 * A part of the work bar's bundle (work-bar.ts), which owns the line and hands this what the line last showed.
 */
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTaskRow, BackgroundTasksReadResult, WorkLineEvent } from "@molis-ai/molis-work-contracts/services/mainline";
import { renderButton, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPlaceMenu, renderTaskCard, renderTaskFloat, renderTaskMark, renderTaskPanel, type TaskRowView } from "../work-line-parts.js";
import type { LineEventPress, WorkBarHost } from "./work-bar.js";
import { installWorkLineLayout } from "./work-line-layout.js";

export const ASKS: ReadonlySet<StateRingState> = new Set(["answer", "approval", "reauth"]);
export const FAILED: ReadonlySet<StateRingState> = new Set(["failed", "blocked", "unavailable", "quarantined"]);

/** What the line gives the panel: the events it last showed, how one opens, and how to ask for a newer read. */
export interface TaskPanelLine {
  events(): Iterable<WorkLineEvent>;
  press(event: WorkLineEvent): LineEventPress;
  keyOf(subject: ActionSubject): string;
  hue: ReadonlyMap<string, string>;
  again(): void;
  request: UiRequest;
}

export function installTaskPanel(host: WorkBarHost, line: TaskPanelLine): { take(result: BackgroundTasksReadResult): void; place(subject: ActionSubject): void } {
  const { keyOf, press, hue, again, request } = line, events = { values: () => [...line.events()], get: (id: string) => [...line.events()].find(one => one.id === id) };
  const PANEL = "work-task-panel";
  // `carded`: the task whose card stands in the panel's place (WLN-36); `placing`: its 「改」 menu is open.
  // `wanted`: the task asked for from outside the panel (「改」 under a reply), shown as soon as the table has it.
  let tasks: BackgroundTaskRow[] = [], float: HTMLElement | null = null, tasksShown = "", carded = "", placing = false, wanted = "";
  const asks = (task: BackgroundTaskRow) => task.waiting || ASKS.has(task.state);
  const weight = (task: BackgroundTaskRow) => asks(task) ? 0 : FAILED.has(task.state) ? 1 : 2;
  const row = (task: BackgroundTaskRow): TaskRowView => {
    const event = task.serves.map(subject => [...events.values()].find(one => one.subject.kind === subject.kind && one.subject.id === subject.id)?.title).find(Boolean);
    return { id: task.id, title: task.title, ring: task.state, step: [task.step?.text, task.executor.label].filter(Boolean).join(" · "), serves: event ?? null,
      ...(task.commands.some(command => command.role === "stop") ? { control: "stop" as const } : {}) };
  };
  const servedBy = (task: BackgroundTaskRow) => task.serves.map(subject => [...events.values()].find(one => keyOf(one.subject) === keyOf(subject))).find(Boolean);
  const card = (task: BackgroundTaskRow): string => {
    const event = servedBy(task), own = task.serves.some(subject => keyOf(subject) === keyOf(task.subject));
    const button = (label: string, attrs: Record<string, string>) => renderButton({ variant: "secondary", size: "sm", label, attrs });
    const actions = placing
      ? renderPlaceMenu({ task: task.id, own, none: task.serves.length === 0,
          events: [...events.values()].filter(one => keyOf(one.subject) !== keyOf(task.subject)).map(one => ({ id: one.id, title: one.title, current: one === event && !own })) })
      : (task.commands.some(command => command.role === "stop") ? button(uiText.text("workbench.work-line.stop"), { "data-task-control": "stop", "data-task": task.id }) : "")
        + (event ? button(uiText.text("workbench.work-line.go-to-event"), { "data-task-event": task.id }) : "") + (task.open ? button(task.open.label, { "data-task-go": task.id }) : "");
    return renderTaskCard({ id: task.id, panel: PANEL, title: task.title, ring: task.state, state: [task.step?.text, ...task.details.map(line => line.text)].filter(Boolean).join(" · "),
      owner: { name: task.origin.title, glyph: task.origin.icon as PluginIconName, hue: hue.get(task.origin.surface) ?? "" }, who: task.executor.label,
      serves: event?.title ?? uiText.text("workbench.work-line.no-event"), returnsTo: task.origin.title,
      steps: task.step ? [{ name: task.step.text, at: "current", ring: task.state, who: task.executor.label }] : [], actions });
  };
  const paintTasks = () => {
    const live = [...tasks].sort((a, b) => weight(a) - weight(b) || b.updated_at.localeCompare(a.updated_at));
    const counts = { needsYou: live.filter(asks).length, failed: live.filter(task => !asks(task) && FAILED.has(task.state)).length, working: 0 };
    counts.working = live.length - counts.needsYou - counts.failed;
    for (const mark of document.querySelectorAll("[data-task-mark]"))
      mark.outerHTML = renderTaskMark({ count: live.length, panel: PANEL, expanded: Boolean(float), ...(live[0] ? { lead: live[0].state } : {}), needsYou: counts.needsYou > 0, failed: counts.failed > 0 });
    const asked = wanted ? tasks.find(task => keyOf(task.subject) === wanted) : undefined;
    if (asked) { carded = asked.id; placing = true; wanted = ""; }
    const shown = tasks.find(task => task.id === carded);
    if (!shown) { carded = ""; placing = false; }
    if (float) { float.innerHTML = shown ? card(shown) : renderTaskPanel({ id: PANEL, live: live.map(row), returned: [], counts }); installWorkLineLayout(document); }
  };
  const takeTasks = (result: BackgroundTasksReadResult) => {
    const next = JSON.stringify(result.tasks.map(task => [task.id, task.title, task.state, task.step?.text, task.waiting, task.serves, task.commands.length]));
    if (next === tasksShown) return;
    tasksShown = next; tasks = result.tasks; paintTasks();
  };
  const showTasks = (open: boolean) => {
    if (open === Boolean(float)) return;
    if (open) { document.body.insertAdjacentHTML("beforeend", renderTaskFloat("assistant-panel", "")); float = document.body.lastElementChild as HTMLElement; again(); }
    else { float?.remove(); float = null; carded = ""; placing = false; wanted = ""; }
    paintTasks();
    if (!open) document.querySelector<HTMLElement>("[data-task-mark]")?.focus();
  };
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-task-mark]")) { showTasks(!float); return; }
    if (!float) return;
    // A press outside the panel and the dialog puts the panel away. The path is the one the press took: a press that redrew what
    // it landed on (a tab of the dialog) is still a press inside the dialog.
    const inDialog = event.composedPath().some(node => node instanceof Element && node.matches("[data-assistant-panel]"));
    if (target?.closest("[data-task-panel-close]") || !target?.closest("[data-work-task-float]")) { if (!inDialog || target?.closest("[data-task-panel-close]")) showTasks(false); return; }
    if (target.closest("[data-task-panel-list]")) { carded = ""; placing = false; wanted = ""; paintTasks(); return; }
    const row = target.closest<HTMLElement>("[data-task-open]");
    if (row) { carded = row.dataset.taskOpen ?? ""; placing = false; wanted = ""; paintTasks(); float.querySelector<HTMLElement>("[data-task-panel-list]")?.focus(); return; }
    const stop = target.closest<HTMLElement>('[data-task-control="stop"]'), task = tasks.find(one => one.id === (stop?.dataset.task ?? carded));
    if (!task) return;
    const failed = (error: unknown) => request.toast?.(document.querySelector("[data-toast]") as never, error);
    const to = target.closest<HTMLElement>("[data-place-to]"), served = servedBy(task);
    if (stop) {
      const command = task.commands.find(one => one.role === "stop");
      if (command) void request(host.route("/api/mainline/tasks/command"), { body: { source: task.source, subject: task.subject, command } }).catch(failed).finally(again);
    } else if (target.closest("[data-place-change]")) { placing = !placing; paintTasks(); }
    else if (to) {
      // Where it goes is the owner's record, changed through the mainline service; what is under way goes on (WLN-36).
      const subject = events.get(to.dataset.placeEvent ?? "")?.subject, now = Date.now(), DAY = 86_400_000;
      placing = false; paintTasks();
      void request(host.route("/api/mainline/place"), { body: { task: task.subject, to: { kind: to.dataset.placeTo, ...(subject ? { subject } : {}) },
        window: { from: new Date(now - 30 * DAY).toISOString(), to: new Date(now + 2 * DAY).toISOString(), now: new Date(now).toISOString() } } }).catch(failed).finally(again);
    } else if (target.closest("[data-task-event]")) { if (served) host.openEvent(press(served)); }
    else if (target.closest("[data-task-go]") && task.open) { if (task.open.kind === "surface" || !task.open.id) host.openSurface(task.open.surface); else host.openItem(task.open.surface, task.open.id, task.open.title); }
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && float) { event.stopPropagation(); showTasks(false); } }, true);

  return {
    take: takeTasks,
    // 「改」 under a reply (WLN-32): the panel opens on that task's card with where it can go — at once when the table has the
    // task, else when the read this asks for brings it. A task that has ended is not in the table: the panel shows its list.
    place(subject) { wanted = keyOf(subject); if (float) again(); else showTasks(true); paintTasks(); },
  };
}
