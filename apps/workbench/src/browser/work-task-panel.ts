/**
 * The background-task mark at the dialog's top right and the panel it opens (specs/work-line §4.5, §6; WLN-34～WLN-36): every task
 * the person can read, from the task table the page's one attention read brings, the ones that wait first. A row opens its task's
 * card in the panel's place: whom it is done for and where that can be changed (the owner keeps it; the mainline service asks),
 * one step to that event's tab, and its stop — the command the row itself carries, which the service checks with the owner again.
 * A part of the work bar's bundle (work-bar.ts), which owns the line and hands this what the line last showed.
 */
import { BACKGROUND_TASK_DONE_STATES, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTaskRow, BackgroundTasksReadResult, WorkLineEvent } from "@molis-ai/molis-work-contracts/services/mainline";
import { escapeHtml, renderButton, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPlaceMenu, renderTaskCard, renderReplyMini, renderReplyPeek, renderTaskDecision, renderTaskMark, renderTaskPanel, renderTaskRow, type TaskRowView } from "../work-line-parts.js";
import type { LineEventPress, WorkBarHost } from "./work-bar.js";
import { installTaskFloatShell } from "./task-float-shell.js";
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
  /** Draw the event cards again: what a card asks changed without a new read (「改一下」 pressed, an answer on its way). */
  repaint(): void;
  request: UiRequest;
  /** The requirements hung on a task's own object, summed up in `slot` with the way into the column (specs/proactive-assistant §7.3.1). */
  acceptance(slot: HTMLElement, target: { provider_id: string; subject: ActionSubject }): { update(): void; destroy(): void };
}

/** Draw `root` again and keep the words being written into a decision's field, with the caret, when the field is still there. */
export function keepNote(root: ParentNode, paint: () => void): void {
  const field = root.querySelector<HTMLTextAreaElement>("[data-decision-note]");
  const had = field ? { value: field.value, focus: document.activeElement === field, at: field.selectionStart } : null;
  paint();
  const now = root.querySelector<HTMLTextAreaElement>("[data-decision-note]");
  if (!had || !now) return;
  now.value = had.value;
  if (had.focus) { now.focus(); now.setSelectionRange(had.at, had.at); }
}

/**
 * The answers to what tasks ask (WLN-10, PWA-135), wherever the question is drawn (the panel, an event's card): which decision's
 * 「改一下」 field is open, which answers are on their way, and the answer itself — the decision by its id and the answer by its
 * role; the mainline service asks the owner again and runs only what it still offers. 「改一下」 opens the field first, and its
 * words go with the answer.
 */
function installDecisionAnswers(host: WorkBarHost, request: TaskPanelLine["request"], ports: { task(id: string | undefined): BackgroundTaskRow | undefined; repaint(): void; again(): void; failed(error: unknown): void; go(task: BackgroundTaskRow): void }) {
  let revising = "";
  const deciding = new Set<string>(), asked = (task: BackgroundTaskRow, id: string) => `${task.id}\n${id}`;
  const answer = (part: HTMLElement, target: Element) => {
    const task = ports.task(part.dataset.task), id = part.dataset.taskDecision ?? "";
    if (!task) return;
    const key = asked(task, id), root = part.closest<HTMLElement>("[data-event-card],[data-work-task-float]") ?? document.body;
    const field = () => root.querySelector<HTMLTextAreaElement>(`[data-task-decision="${CSS.escape(id)}"][data-task="${CSS.escape(task.id)}"] [data-decision-note]`);
    const send = (role: string, note?: string) => {
      deciding.add(key); ports.repaint();
      void request(host.route("/api/mainline/tasks/decide"), { body: { source: task.source, subject: task.subject, decision: id, role, ...(note ? { note } : {}) } })
        .then(() => { if (revising === key) revising = ""; }).catch(ports.failed).finally(() => { deciding.delete(key); ports.repaint(); ports.again(); });
    };
    const role = target.closest<HTMLElement>("[data-decision-answer]")?.dataset.decisionAnswer;
    if (role === "revise") { revising = key; ports.repaint(); field()?.focus(); }
    else if (role) send(role);
    else if (target.closest("[data-decision-cancel]")) { revising = ""; ports.repaint(); }
    else if (target.closest("[data-decision-send]")) {
      const words = field(), note = words?.value.trim() ?? "";
      if (!note) { words?.setAttribute("aria-invalid", "true"); words?.focus(); return; }
      send("revise", note);
    } else if (target.closest("[data-decision-go]")) ports.go(task);
  };
  return { answer, revising: (task: BackgroundTaskRow, id: string) => revising === asked(task, id), busy: (task: BackgroundTaskRow, id: string) => deciding.has(asked(task, id)) };
}

/**
 * With the dialog closed its way in stays above the input (WLN-35): the latest reply of the conversation in front with the task
 * mark and the button that opens the dialog, until the person presses the work, then only the mark and the button. A reply that
 * comes while it is closed is shown again. A phone keeps to the mark: its line has no room above the input for more.
 */
function installDialogRow(panel: string, paint: () => void): void {
  const island = document.querySelector<HTMLElement>("[data-assistant-island]"), dialog = island?.querySelector<HTMLElement>("[data-assistant-panel]");
  const thread = island?.querySelector<HTMLElement>("[data-assistant-thread]"), narrow = matchMedia("(max-width:760px)");
  if (!island || !dialog) return;
  let folded = "", shown = "";
  const latest = () => { const said = thread?.querySelectorAll<HTMLElement>(".assistant-msg--assistant"); return said?.length ? said[said.length - 1]!.dataset.text?.trim() ?? "" : ""; };
  // Whose words they are: the Character whose conversation is in front, else the Assistant.
  const who = () => { const tab = island.querySelector<HTMLElement>(".assistant-tab[data-current][data-character]"), name = tab?.querySelector(".assistant-tab-title")?.textContent?.trim();
    return name ? { name, character: true } : { name: uiText.text("workbench.common.assistant") }; };
  const row = () => {
    // The folded row stands at the line's right end, on the line and over nothing of the work (user decision 2026-11-15); the
    // line's mark leaves its wing room for it.
    const line = island.closest("[data-work-line]"), lineRow = line?.querySelector<HTMLElement>(".work-line-row") ?? island;
    const peek = island.querySelector<HTMLElement>("[data-reply-peek]"), mini = lineRow.querySelector("[data-reply-mini]"), said = dialog.hidden && !narrow.matches ? latest() : "";
    line?.toggleAttribute("data-mini", dialog.hidden && !(said && said !== folded));
    if (!dialog.hidden && (peek || mini)) { peek?.remove(); mini?.remove(); shown = ""; return; }
    if (!dialog.hidden) return;
    if (said && said !== folded) {
      if (peek && shown !== said) peek.querySelector<HTMLElement>(".work-reply-peek-body")!.textContent = said;
      else if (!peek) { mini?.remove(); island.insertAdjacentHTML("beforeend", renderReplyPeek({ who: who(), body: escapeHtml(said), mark: renderTaskMark({ count: 0, panel }) })); paint(); }
      shown = said;
    } else if (!mini) { peek?.remove(); shown = ""; lineRow.insertAdjacentHTML("beforeend", renderReplyMini(renderTaskMark({ count: 0, panel }))); paint(); }
  };
  new MutationObserver(row).observe(dialog, { attributes: true, attributeFilter: ["hidden"] });
  if (thread) new MutationObserver(() => { if (dialog.hidden) row(); }).observe(thread, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-text"] });
  // The person went back to the work: the reply folds away, and stays away until another comes.
  document.addEventListener("pointerdown", event => { if (shown && event.target instanceof Element && !event.target.closest("[data-work-bar],[data-work-task-float]")) { folded = shown; row(); } }, true);
  narrow.addEventListener("change", row); row();
}

/** In a decision's field Enter sends the words and Escape puts the field away, neither reaching the dialog or the panel; elsewhere Escape closes the panel (`close` says whether it was open). */
function installDecisionKeys(close: () => boolean): void {
  document.addEventListener("keydown", event => {
    // In a decision's field: Enter sends the words, Escape puts the field away; neither reaches the dialog or the panel.
    const note = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-decision-note]") : null, part = note?.closest<HTMLElement>("[data-task-decision]");
    if (note && part && !event.isComposing && (event.key === "Escape" || event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault(); event.stopPropagation();
      part.querySelector<HTMLElement>(event.key === "Escape" ? "[data-decision-cancel]" : "[data-decision-send]")?.click();
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing && !event.defaultPrevented && close()) { event.preventDefault(); event.stopPropagation(); }
  });
}

/** One page-local attempt for all views of a task. The task's owner still decides its state and available commands. */
function installTaskStops(host: WorkBarHost, { request, again }: Pick<TaskPanelLine, "request" | "again">, repaint: () => void, failed: (error: unknown) => void) {
  const attempts = new Map<string, { state: "pending" } | { state: "succeeded"; after: number; source: BackgroundTaskRow["source"] }>();
  return {
    busy: (id: string) => attempts.has(id),
    observe(issues: BackgroundTasksReadResult["issues"], started: number): boolean {
      let changed = false;
      for (const [id, attempt] of attempts) {
        if (attempt.state !== "succeeded" || !(started > attempt.after)) continue;
        const { provider_id, capability_id, version } = attempt.source;
        if (issues.some(({ source }) => source.provider_id === provider_id && source.capability_id === capability_id && source.version === version)) continue;
        attempts.delete(id);
        changed = true;
      }
      return changed;
    },
    stop(task: BackgroundTaskRow): void {
      const command = task.commands.find(one => one.role === "stop");
      if (!command || attempts.has(task.id)) return;
      attempts.set(task.id, { state: "pending" });
      repaint();
      // Mainline confirms that the task's owner still offers this exact command (WLN-39).
      void request(host.route("/api/mainline/tasks/command"), { body: { source: task.source, subject: task.subject, command } })
        .then(() => { attempts.set(task.id, { state: "succeeded", after: performance.now(), source: task.source }); })
        .catch(error => { attempts.delete(task.id); failed(error); })
        .finally(() => { repaint(); again(); });
    },
  };
}

export function installTaskPanel(host: WorkBarHost, line: TaskPanelLine): { take(result: BackgroundTasksReadResult, started: number): void; offline(since: string | null): void; place(subject: ActionSubject): void; rows(subject: ActionSubject): string; decisions(subject: ActionSubject): string; subjects(subject: ActionSubject): { provider_id: string; subject: ActionSubject }[]; waiting(): { key: string; provider: string; title: string; event: WorkLineEvent }[]; unreadable(): ReadonlySet<string> } {
  const { keyOf, press, hue, again, request } = line, events = { values: () => [...line.events()], get: (id: string) => [...line.events()].find(one => one.id === id) };
  const PANEL = "work-task-panel";
  // `carded`: the task whose card stands in the panel's place (WLN-36); `placing`: its 「改」 menu is open.
  // `wanted`: the task asked for from outside the panel (「改」 under a reply), shown as soon as the table has it.
  let tasks: BackgroundTaskRow[] = [], float: HTMLElement | null = null, tasksShown = "", carded = "", placing = false, wanted = "", offlineSince: string | null = null;
  const shell = installTaskFloatShell({ dialog: "assistant-panel",
    shown() { float = shell.root; again(); paintTasks(); },
    hidden(content) { accepting?.destroy(); accepting = undefined; float = null; carded = ""; placing = false; wanted = ""; paintTasks();
      if (!content) [...document.querySelectorAll<HTMLElement>("[data-task-mark]")].find(mark => mark.getClientRects().length)?.focus(); },
    back() { paintTasks(); shell.cards?.querySelector<HTMLElement>("[data-task-panel-list], [data-task-panel-close]")?.focus(); },
  });
  let accepting: { update(): void; destroy(): void } | undefined;
  const stops = installTaskStops(host, line, () => repaint(), error => failed(error));
  const answers = installDecisionAnswers(host, request, { task: id => tasks.find(one => one.id === id), repaint: () => repaint(), again, failed: error => failed(error), go: task => go(task) });
  /** The decisions of these tasks in order, the first carrying the primary button; `named`: say which task asks, where the card is not its own. */
  const decisionsOf = (list: readonly BackgroundTaskRow[], named: (task: BackgroundTaskRow) => boolean) => list.flatMap(task => task.decisions.map(decision => ({ task, decision })))
    .map(({ task, decision }, at) => renderTaskDecision({ task: task.id, id: decision.id, ...(decision.reference ? { reference: { id: decision.reference.id, version: decision.reference.version } } : {}), ask: decision.ask, ...(decision.why ? { why: decision.why } : {}), ...(named(task) ? { from: task.title } : {}),
      changes: decision.changes, answers: decision.answers.map(answer => answer.role), lead: at === 0, revising: answers.revising(task, decision.id), busy: answers.busy(task, decision.id) })).join("");
  const asks = (task: BackgroundTaskRow) => task.waiting || ASKS.has(task.state);
  const weight = (task: BackgroundTaskRow) => asks(task) ? 0 : FAILED.has(task.state) ? 1 : 2;
  const row = (task: BackgroundTaskRow): TaskRowView => {
    const event = task.serves.map(subject => [...events.values()].find(one => one.subject.kind === subject.kind && one.subject.id === subject.id)?.title).find(Boolean);
    return { id: task.id, title: task.title, ring: task.state, step: [task.step?.text, task.executor.label].filter(Boolean).join(" · "), serves: event ?? null,
      ...(task.commands.some(command => command.role === "stop") ? { control: "stop" as const, busy: stops.busy(task.id) } : {}) };
  };
  const servedBy = (task: BackgroundTaskRow) => task.serves.map(subject => [...events.values()].find(one => keyOf(one.subject) === keyOf(subject))).find(Boolean);
  const card = (task: BackgroundTaskRow): string => {
    const event = servedBy(task), own = task.serves.some(subject => keyOf(subject) === keyOf(task.subject));
    const button = (label: string, attrs: Record<string, string>) => renderButton({ variant: "secondary", size: "sm", label, attrs });
    const actions = placing
      ? renderPlaceMenu({ task: task.id, own, none: task.serves.length === 0,
          events: [...events.values()].filter(one => keyOf(one.subject) !== keyOf(task.subject)).map(one => ({ id: one.id, title: one.title, current: one === event && !own })) })
      : (task.commands.some(command => command.role === "stop") ? button(uiText.text("workbench.work-line.stop"), { "data-task-control": "stop", "data-task": task.id, ...(stops.busy(task.id) ? { disabled: "" } : {}) }) : "")
        + (event ? button(uiText.text("workbench.work-line.go-to-event"), { "data-task-event": task.id }) : "") + (task.open ? button(task.open.label, { "data-task-go": task.id }) : "");
    return renderTaskCard({ id: task.id, panel: PANEL, decisions: decisionsOf([task], () => false), title: task.title, ring: task.state, state: [task.step?.text, ...task.details.map(line => line.text)].filter(Boolean).join(" · "),
      owner: { name: task.origin.title, glyph: task.origin.icon as PluginIconName, hue: hue.get(task.origin.surface) ?? "" }, who: task.executor.label,
      serves: event?.title ?? uiText.text("workbench.work-line.no-event"), returnsTo: task.origin.title,
      steps: task.step ? [{ name: task.step.text, at: "current", ring: task.state, who: task.executor.label }] : [], actions });
  };
  const paintTasks = () => {
    // A task that ended stays in the table only to be reported (`reports_to`): it is among what just came back, not what is under way.
    const ended = (task: BackgroundTaskRow) => BACKGROUND_TASK_DONE_STATES.has(task.state);
    const live = tasks.filter(task => !ended(task)).sort((a, b) => weight(a) - weight(b) || b.updated_at.localeCompare(a.updated_at));
    const returned = tasks.filter(ended).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const counts = { needsYou: live.filter(asks).length, failed: live.filter(task => !asks(task) && FAILED.has(task.state)).length, working: 0 };
    counts.working = live.length - counts.needsYou - counts.failed;
    for (const mark of document.querySelectorAll("[data-task-mark]"))
      mark.outerHTML = renderTaskMark({ count: live.length, panel: PANEL, expanded: Boolean(float), ...(live[0] ? { lead: live[0].state } : {}), needsYou: counts.needsYou > 0, failed: counts.failed > 0, offline: offlineSince !== null });
    const asked = wanted ? tasks.find(task => keyOf(task.subject) === wanted) : undefined;
    if (asked) { carded = asked.id; placing = true; wanted = ""; }
    const shown = tasks.find(task => task.id === carded);
    if (!shown) { carded = ""; placing = false; }
    if (float && shell.cards && !shell.content) { const on = shell.cards; keepNote(on, () => { on.innerHTML = shown ? card(shown) : renderTaskPanel({ id: PANEL, live: live.map(row), returned: returned.map(row), counts, ...(offlineSince === null ? {} : { offlineSince }) }); }); installWorkLineLayout(document); }
    // A task's card sums up the requirements hung on the task itself: a task done for no event has no event card to say it.
    accepting?.destroy(); accepting = undefined;
    const slot = shown && !shell.content ? float?.querySelector<HTMLElement>("[data-task-acceptance]") : null;
    if (shown && slot) { accepting = line.acceptance(slot, { provider_id: shown.source.provider_id, subject: shown.subject }); accepting.update(); }
  };
  let unread: ReadonlySet<string> = new Set();
  const takeTasks = (result: BackgroundTasksReadResult, started: number) => {
    unread = new Set(result.issues.map(issue => issue.source.provider_id));
    const commandChanged = stops.observe(result.issues, started);
    // Same command count need not mean the same command, details or navigation target.
    const next = JSON.stringify(result.tasks);
    if (next === tasksShown && !commandChanged) return;
    tasksShown = next; tasks = result.tasks; paintTasks();
  };
  const showTasks = (open: boolean) => open ? shell.show() : shell.hide();
  const backToCard = () => shell.back();
  installDialogRow(PANEL, () => paintTasks());
  const failed = (error: unknown) => request.toast?.(document.querySelector("[data-toast]") as never, error);
  const repaint = () => { paintTasks(); line.repaint(); };
  const go = (task: BackgroundTaskRow) => { if (!task.open) return; if (task.open.kind === "surface" || !task.open.id) host.openSurface(task.open.surface); else host.openItem(task.open.surface, task.open.id, task.open.title); };
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-task-mark]")) { showTasks(!float); return; }
    if (target?.closest("[data-dialog-open]")) { host.dialog?.(true); return; }
    if (target?.closest("[data-task-reconnect]")) { again(); return; }
    const decision = target?.closest<HTMLElement>("[data-task-decision]");
    if (decision && target) { answers.answer(decision, target); return; }
    // 「在办」 on an event's card (in the dialog or parked in the side panel): the same task, so the same stop, and its card in the panel.
    if (target?.closest("[data-event-card]")) {
      const control = target.closest<HTMLElement>("[data-task-control]"), opened = target.closest<HTMLElement>("[data-task-open]");
      const on = tasks.find(one => one.id === (control?.dataset.task ?? opened?.dataset.taskOpen));
      if (!on) return;
      if (control?.dataset.taskControl === "stop") stops.stop(on); else if (control) go(on);
      else { wanted = ""; showTasks(true); backToCard(); carded = on.id; placing = false; paintTasks(); }
      return;
    }
    if (!float) return;
    // The column of requirements stands beside the work, where this panel floats: opening it puts the panel away.
    if (target?.closest("[data-work-task-float] [data-acceptance-open]")) { showTasks(false); return; }
    // The original path still includes the panel after a click repaints the button it landed on.
    const path = event.composedPath();
    if (target?.closest("[data-task-panel-close]")) { showTasks(false); return; }
    if (!target || !path.includes(float)) {
      if (!path.some(node => node instanceof Element && node.matches("[data-assistant-panel]"))) showTasks(false);
      return;
    }
    if (target.closest("[data-task-panel-list]")) { carded = ""; placing = false; wanted = ""; paintTasks(); return; }
    const row = target.closest<HTMLElement>("[data-task-open]");
    if (row) { carded = row.dataset.taskOpen ?? ""; placing = false; wanted = ""; paintTasks(); float.querySelector<HTMLElement>("[data-task-panel-list]")?.focus(); return; }
    const stop = target.closest<HTMLElement>('[data-task-control="stop"]'), task = tasks.find(one => one.id === (stop?.dataset.task ?? carded));
    if (!task) return;
    const to = target.closest<HTMLElement>("[data-place-to]"), served = servedBy(task);
    if (stop) stops.stop(task);
    else if (target.closest("[data-place-change]")) { placing = !placing; paintTasks(); }
    else if (to) {
      // Where it goes is the owner's record, changed through the mainline service; what is under way goes on (WLN-36).
      const subject = events.get(to.dataset.placeEvent ?? "")?.subject, now = Date.now(), DAY = 86_400_000;
      placing = false; paintTasks();
      void request(host.route("/api/mainline/place"), { body: { task: task.subject, to: { kind: to.dataset.placeTo, ...(subject ? { subject } : {}) },
        window: { from: new Date(now - 30 * DAY).toISOString(), to: new Date(now + 2 * DAY).toISOString(), now: new Date(now).toISOString() } } }).catch(failed).finally(again);
    } else if (target.closest("[data-task-event]")) { if (served) host.openEvent(press(served)); }
    else if (target.closest("[data-task-go]")) go(task);
  });
  installDecisionKeys(() => { if (!float) return false; showTasks(false); return true; });

  return {
    take: takeTasks,
    offline(since) { if (since === offlineSince) return; offlineSince = since; paintTasks(); },
    // The tasks done for one event, as its card lists them (WLN-09): what waits on the person first, each with the way to decide or to stop.
    rows: subject => [...tasks].filter(task => task.serves.some(one => keyOf(one) === keyOf(subject))).sort((a, b) => weight(a) - weight(b) || b.updated_at.localeCompare(a.updated_at))
      .map(task => { const { serves: _serves, control, busy, ...rest } = row(task); return renderTaskRow({ ...rest, ...(asks(task) && task.open && !task.decisions.length ? { control: "decide" as const } : control ? { control, busy } : {}) }); }).join(""),
    // What the tasks done for one event ask the person, at the head of its card (WLN-10): the ones that wait first, each answered on its own.
    decisions: subject => decisionsOf([...tasks].filter(task => task.serves.some(one => keyOf(one) === keyOf(subject))).sort((a, b) => weight(a) - weight(b) || b.updated_at.localeCompare(a.updated_at)),
      task => keyOf(task.subject) !== keyOf(subject)),
    // The tasks that wait on the person and are done for an event on the line, one per task and the decision it asks first (WLN-06).
    waiting: () => [...tasks].filter(asks).flatMap(task => { const event = servedBy(task); return event ? [{ key: `${keyOf(task.subject)}|${task.decisions[0]?.id ?? ""}`, provider: task.source.provider_id, title: task.title, event }] : []; }),
    // The providers the last table could not read: what they reported before is not known to have ended.
    unreadable: () => unread,
    // The tasks done for one event, as the objects requirements may hang on: each with the provider that reported it.
    subjects: subject => [...tasks].filter(task => task.serves.some(one => keyOf(one) === keyOf(subject))).map(task => ({ provider_id: task.source.provider_id, subject: task.subject })),
    // 「改」 under a reply (WLN-32): the panel opens on that task's card with where it can go — at once when the table has the
    // task, else when the read this asks for brings it. A task that has ended is not in the table: the panel shows its list.
    place(subject) { backToCard(); wanted = keyOf(subject); if (float) again(); else showTasks(true); paintTasks(); },
  };
}
