/**
 * The tasks behind the events (specs/work-line §2「后台任务在哪看」, §6; WLN-34～WLN-36), from the task table the page's one
 * attention read brings: the rows a list or an event's information draws under an event (the ones that wait first; a step given
 * to a sub-agent one level further in), the tasks that belong to no event, what tasks ask the person and the answers, and a
 * task's card — whom it is done for and where that can be changed (the owner keeps it; the mainline service asks), one step to
 * that event, and its stop, the command the row itself carries, which the service checks with the owner again. The card opens in
 * the float that takes the information column's place. A part of the work bar's bundle (work-bar.ts), which owns the read and
 * hands this what it last showed.
 */
import { BACKGROUND_TASK_DONE_STATES, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState, UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTaskRow, BackgroundTasksReadResult, WorkLineEvent } from "@molis-ai/molis-work-contracts/services/mainline";
import { renderButton, t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPlaceMenu, renderTaskCard, renderTaskDecision, renderTaskRow, type TaskRowView } from "../work-line-parts.js";
import type { LineEventPress, WorkBarHost } from "./work-bar.js";
import { installTaskFloatShell } from "./task-float-shell.js";
import { installWorkLineLayout } from "./work-line-layout.js";

export const ASKS: ReadonlySet<StateRingState> = new Set(["answer", "approval", "reauth"]);
export const FAILED: ReadonlySet<StateRingState> = new Set(["failed", "blocked", "unavailable", "quarantined"]);

/** A step a task gave a sub-agent, as the page that holds its conversation names it: under which task, and the key that opens its conversation. `subject`: it is a task of the table as well. */
export interface SubtaskRef { parent: ActionSubject; key: string; subject?: ActionSubject; title: string; ring: StateRingState; step: string }

/** What the foot gives the tasks: the events it last showed, how one opens, and how to ask for a newer read. */
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
  /** The steps given to sub-agents that this page knows of (the Assistant's works). */
  subtasks(): readonly SubtaskRef[];
  /** Owning work item name for a task or the event it serves, shown neutrally in 「在办」 (Decision 48 ⑥). */
  itemName?(subject: ActionSubject, serves: readonly ActionSubject[]): string | undefined;
}

/** Draw `root` again and keep the words being written into a decision's field, with the caret, when the field is still there. */
export function keepNote(root: ParentNode, paint: () => void): void {
  const field = root.querySelector<HTMLTextAreaElement>("[data-decision-note]");
  const had = field ? { value: field.value, focus: document.activeElement === field, at: field.selectionStart } : null;
  paint();
  const now = root.querySelector<HTMLTextAreaElement>("[data-decision-note]");
  if (!had || !now) return;
  now.value = had.value;
  if (had.focus) {
    now.focus();
    now.setSelectionRange(had.at, had.at);
  }
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
    if (part.closest("[data-work-stack]") && part.closest("[data-work-line][data-checking]")) return;
    const task = ports.task(part.dataset.task), id = part.dataset.taskDecision ?? "";
    if (!task) return;
    const reviewVersion = part.hasAttribute("data-task-held-review") ? part.dataset.reviewVersion : undefined;
    const key = asked(task, id), root = part.closest<HTMLElement>("[data-event-card],[data-work-task-float]") ?? document.body;
    const field = () => root.querySelector<HTMLTextAreaElement>(`[data-task-decision="${CSS.escape(id)}"][data-task="${CSS.escape(task.id)}"] [data-decision-note]`);
    const send = (role: string, note?: string) => {
      deciding.add(key);
      ports.repaint();
      void request(host.route("/api/mainline/tasks/decide"), { body: { source: task.source, subject: task.subject, decision: id, role,
        ...(reviewVersion ? { review_version: reviewVersion } : {}), ...(note ? { note } : {}) } })
        .then(() => { if (revising === key) revising = ""; }).catch(ports.failed).finally(() => {
          deciding.delete(key);
          ports.repaint();
          ports.again();
        });
    };
    const role = target.closest<HTMLElement>("[data-decision-answer]")?.dataset.decisionAnswer;
    if (role === "revise") {
      revising = key;
      ports.repaint();
      field()?.focus();
    }
    else if (role) send(role);
    else if (target.closest("[data-decision-cancel]")) {
      revising = "";
      ports.repaint();
    }
    else if (target.closest("[data-decision-send]")) {
      const words = field(), note = words?.value.trim() ?? "";
      if (!note) {
        words?.setAttribute("aria-invalid", "true");
        words?.focus();
        return;
      }
      send("revise", note);
    } else if (target.closest("[data-decision-go]")) ports.go(task);
  };
  return { answer, revising: (task: BackgroundTaskRow, id: string) => revising === asked(task, id), busy: (task: BackgroundTaskRow, id: string) => deciding.has(asked(task, id)) };
}

/** In a decision's field Enter sends the words and Escape puts the field away, neither reaching the dialog or the float; elsewhere Escape closes the float before the conversation (`close` says whether it was open). */
function installDecisionKeys(close: () => boolean): void {
  document.addEventListener("keydown", event => {
    // In a decision's field: Enter sends the words, Escape puts the field away; neither reaches the dialog or the panel.
    const note = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-decision-note]") : null, part = note?.closest<HTMLElement>("[data-task-decision]");
    if (note && part && !event.isComposing && (event.key === "Escape" || event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      part.querySelector<HTMLElement>(event.key === "Escape" ? "[data-decision-cancel]" : "[data-decision-send]")?.click();
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing && !event.defaultPrevented && close()) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

type StopAttempt =
  | { state: "pending" }
  | { state: "succeeded"; afterSequence: number | null; afterTime: number; source: BackgroundTaskRow["source"] };

function stopCommandKey(task: BackgroundTaskRow, command: BackgroundTaskRow["commands"][number]): string {
  return JSON.stringify([task.id, command.role, command.action, command.input]);
}

/** One page-local attempt per offered stop command across all views of a task. The task's owner still decides its state and available commands. */
function installTaskStops(host: WorkBarHost, { request, again }: Pick<TaskPanelLine, "request" | "again">, repaint: () => void, failed: (error: unknown) => void) {
  const attempts = new Map<string, StopAttempt>();
  const readSequence = () => (globalThis as { molisWorkAttentionSequence?: () => number }).molisWorkAttentionSequence?.();
  return {
    busy(task: BackgroundTaskRow): boolean {
      const command = task.commands.find(one => one.role === "stop");
      return command ? attempts.has(stopCommandKey(task, command)) : false;
    },
    observe(issues: BackgroundTasksReadResult["issues"], started: number, sequence?: number): boolean {
      let changed = false;
      for (const [key, attempt] of attempts) {
        if (attempt.state !== "succeeded") continue;
        const fresher = attempt.afterSequence !== null && typeof sequence === "number"
          ? sequence > attempt.afterSequence
          : started > attempt.afterTime;
        if (!fresher) continue;
        const { provider_id, capability_id, version } = attempt.source;
        if (issues.some(({ source }) => source.provider_id === provider_id && source.capability_id === capability_id && source.version === version)) continue;
        attempts.delete(key);
        changed = true;
      }
      return changed;
    },
    stop(task: BackgroundTaskRow): void {
      const command = task.commands.find(one => one.role === "stop");
      if (!command) return;
      const key = stopCommandKey(task, command);
      if (attempts.has(key)) return;
      attempts.set(key, { state: "pending" });
      repaint();
      // Mainline confirms that the task's owner still offers this exact command (WLN-39).
      void request(host.route("/api/mainline/tasks/command"), { body: { source: task.source, subject: task.subject, command } })
        .then(() => {
          const current = readSequence();
          attempts.set(key, {
            state: "succeeded",
            afterSequence: typeof current === "number" ? current : null,
            afterTime: performance.now(),
            source: task.source,
          });
        })
        .catch(error => {
          attempts.delete(key);
          failed(error);
        })
        .finally(() => {
          repaint();
          again();
        });
    },
  };
}

export interface WorkTasks {
  take(result: BackgroundTasksReadResult, started: number, sequence?: number): boolean;
  /** The connection is lost (since when, as the foot says it) or heard again (null): rows say 正在核对 and offer nothing to press. Returns whether offline state changed. */
  offline(since: string | null): boolean;
  /** Repaint an open task float after a live UI language switch. */
  retitle(): void;
  /** 「改」 under a reply (WLN-32): that task's card with where it can go, as soon as the table has the task. */
  place(subject: ActionSubject): void;
  /** The tasks done for one event, as a list and the event's information draw them under it (WLN-09): what waits on the person first, a sub-agent's step under its task. */
  rows(subject: ActionSubject): string;
  /** The tasks that have not ended and are done for no event of the line: 不属于事件 at the end of 在办, counted in none of the three. */
  unplaced(): string;
  /** What the tasks done for one event ask the person, drawn (WLN-10): the ones that wait first, each answered on its own. */
  decisions(subject: ActionSubject): string;
  /** The tasks done for one event, as the objects requirements may hang on: each with the provider that reported it. */
  subjects(subject: ActionSubject): { provider_id: string; subject: ActionSubject }[];
  /** The tasks that wait on the person and are done for an event on the line, one per task and the decision it asks first (WLN-06). */
  waiting(): { key: string; provider: string; title: string; event: WorkLineEvent }[];
  /** The tasks that wait on the person and belong to no event of the line: each is a card of the stack. */
  loose(): BackgroundTaskRow[];
  /** The providers the last table could not read: what they reported before is not known to have ended. */
  unreadable(): ReadonlySet<string>;
  /** What tasks ask, as the card stack answers them: the same decision by its id, the same answers (WLN-10). By the event they are done for, or by the task itself. */
  questions(of: ActionSubject | BackgroundTaskRow): { task: string; id: string; ask: string; answers: BackgroundTaskRow["decisions"][number]["answers"][number]["role"][]; hasChanges: boolean; busy: boolean }[];
  /** A task's card in the float, as a press on its row opens it. */
  open(id: string): void;
  /** Put the float away (the conversation closed, another tab of the column was chosen); says whether it was open. */
  close(): boolean;
}

export function installTasks(host: WorkBarHost, line: TaskPanelLine): WorkTasks {
  const { keyOf, press, hue, again, request } = line, events = { values: () => [...line.events()], get: (id: string) => [...line.events()].find(one => one.id === id) };
  // `carded`: the task whose card stands in the information column's place (WLN-36); `placing`: its 「改」 menu is open.
  // `wanted`: the task asked for from outside (「改」 under a reply), shown as soon as the table has it.
  let tasks: BackgroundTaskRow[] = [], float: HTMLElement | null = null, tasksShown = "", carded = "", placing = false, wanted = "", offlineSince: string | null = null;
  const rowOf = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-task-open="${CSS.escape(id)}"]`)].find(row => row.getClientRects().length);
  const shell = installTaskFloatShell({ dialog: "assistant-panel",
    shown() {
      float = shell.root;
      again();
      paintCard();
    },
    hidden(content) {
      const was = carded;
      accepting?.destroy();
      accepting = undefined;
      float = null;
      carded = "";
      placing = false;
      if (!content && was) rowOf(was)?.focus({ preventScroll: true });
    },
    // Back from a sub-agent's conversation: the task's card it was opened over, else the column itself.
    back() { if (carded) paintCard(); else shell.hide(); },
  });
  let accepting: { update(): void; destroy(): void } | undefined;
  const stops = installTaskStops(host, line, () => repaint(), error => failed(error));
  const answers = installDecisionAnswers(host, request, { task: id => tasks.find(one => one.id === id), repaint: () => repaint(), again, failed: error => failed(error), go: task => go(task) });
  /** The decisions of these tasks in order, the first carrying the primary button; `named`: say which task asks, where the card is not its own. */
  const decisionsOf = (list: readonly BackgroundTaskRow[], named: (task: BackgroundTaskRow) => boolean) => list.flatMap(task => task.decisions.map(decision => ({ task, decision })))
    .map(({ task, decision }, at) => renderTaskDecision({ task: task.id, id: decision.id, ...(decision.reference ? { reference: { id: decision.reference.id, version: decision.reference.version } } : {}), ask: decision.ask, ...(decision.why ? { why: decision.why } : {}), ...(named(task) ? { from: task.title } : {}),
      changes: decision.changes, ...("review_html" in decision ? { reviewHtml: decision.review_html } : {}),
      answers: decision.answers.map(answer => answer.role), lead: at === 0, revising: answers.revising(task, decision.id), busy: answers.busy(task, decision.id) })).join("");
  const asks = (task: BackgroundTaskRow) => task.waiting || ASKS.has(task.state);
  const weight = (task: BackgroundTaskRow) => asks(task) ? 0 : FAILED.has(task.state) ? 1 : 2;
  const ordered = (list: readonly BackgroundTaskRow[]) => [...list].sort((a, b) => weight(a) - weight(b) || b.updated_at.localeCompare(a.updated_at));
  const ended = (task: BackgroundTaskRow) => BACKGROUND_TASK_DONE_STATES.has(task.state);
  const servedBy = (task: BackgroundTaskRow) => task.serves.map(subject => events.values().find(one => keyOf(one.subject) === keyOf(subject))).find(Boolean);
  const serving = (subject: ActionSubject) => tasks.filter(task => task.serves.some(one => keyOf(one) === keyOf(subject)));
  const row = (task: BackgroundTaskRow, level: 1 | 2 = 1): TaskRowView => {
    const item = line.itemName?.(task.subject, task.serves);
    return { id: task.id, title: task.title, ring: task.state, step: [task.step?.text, task.executor.label].filter(Boolean).join(" · "), level,
      ...(item ? { item } : {}),
      ...(ended(task) ? { done: true } : {}),
      ...(offlineSince !== null && !ended(task) ? { checking: true } : asks(task) && task.open && !task.decisions.length ? { control: "decide" as const }
        : task.commands.some(command => command.role === "stop") ? { control: "stop" as const, busy: stops.busy(task) } : {}) };
  };
  /** These tasks as rows: a step given to a sub-agent under its task — the same row, one level in, when the step is a task of the table too. */
  const tree = (list: readonly BackgroundTaskRow[]): string => {
    const all = ordered(list), subs = line.subtasks(), at = new Map(all.map(task => [keyOf(task.subject), task]));
    const inner = new Set(subs.flatMap(sub => sub.subject && at.has(keyOf(sub.subject)) && at.has(keyOf(sub.parent)) ? [keyOf(sub.subject)] : []));
    const under = (task: BackgroundTaskRow) => subs.filter(sub => keyOf(sub.parent) === keyOf(task.subject)).map(sub => {
      const own = sub.subject ? at.get(keyOf(sub.subject)) : undefined;
      return renderTaskRow(own ? { ...row(own, 2), sub: sub.key } : { id: sub.key, sub: sub.key, title: sub.title, ring: sub.ring, step: sub.step, level: 2, ...(offlineSince !== null ? { checking: true } : {}) });
    }).join("");
    return all.filter(task => !inner.has(keyOf(task.subject))).map(task => renderTaskRow(row(task)) + under(task)).join("");
  };
  const card = (task: BackgroundTaskRow): string => {
    const event = servedBy(task), own = task.serves.some(subject => keyOf(subject) === keyOf(task.subject));
    const button = (label: string, attrs: Record<string, string>) => renderButton({ variant: "secondary", size: "sm", label, attrs });
    const actions = placing
      ? renderPlaceMenu({ task: task.id, own, none: task.serves.length === 0,
          events: events.values().filter(one => keyOf(one.subject) !== keyOf(task.subject)).map(one => ({ id: one.id, title: one.title, current: one === event && !own })) })
      : (task.commands.some(command => command.role === "stop") ? button(uiText.text("workbench.work-line.stop"), { "data-task-control": "stop", "data-task": task.id, ...(stops.busy(task) || offlineSince !== null ? { disabled: "" } : {}) }) : "")
        + (event ? button(uiText.text("workbench.work-line.go-to-event"), { "data-task-event": task.id }) : "") + (task.open ? button(task.open.label, { "data-task-go": task.id }) : "");
    return renderTaskCard({ id: task.id, decisions: decisionsOf([task], () => false), title: task.title, ring: task.state, state: [task.step?.text, ...task.details.map(one => one.text)].filter(Boolean).join(" · ") || (ASKS.has(task.state) ? uiText.text("workbench.work-line.waiting-for-you") : ""),
      owner: { name: task.origin.title, glyph: task.origin.icon as PluginIconName, hue: hue.get(task.origin.surface) ?? "" }, who: task.executor.label,
      serves: event?.title ?? uiText.text("workbench.work-line.no-event"), returnsTo: task.origin.title,
      steps: task.step ? [{ name: task.step.text, at: "current", ring: task.state, who: task.executor.label }] : [], actions });
  };
  const paintCard = () => {
    const shown = tasks.find(task => task.id === carded);
    if (!float || shell.content) return;
    // A task that ended leaves the table: its card goes, and the column shows again.
    if (!shown) {
      if (carded) shell.hide();
      return;
    }
    const on = shell.cards!;
    keepNote(on, () => { on.innerHTML = card(shown); });
    installWorkLineLayout(document);
    // A task's card sums up the requirements hung on the task itself: a task done for no event has no event to say it.
    accepting?.destroy();
    accepting = undefined;
    const slot = float.querySelector<HTMLElement>("[data-task-acceptance]");
    if (slot) {
      accepting = line.acceptance(slot, { provider_id: shown.source.provider_id, subject: shown.subject });
      accepting.update();
    }
  };
  const open = (id: string, menu = false) => {
    if (!tasks.some(task => task.id === id)) return;
    host.dialog?.(true);
    wanted = "";
    carded = id;
    placing = menu;
    if (shell.shown) shell.back(); else shell.show();
    shell.root?.querySelector<HTMLElement>(menu ? "[data-place-to]" : "[data-task-panel-close]")?.focus({ preventScroll: true });
  };
  let unread: ReadonlySet<string> = new Set();
  const takeTasks = (result: BackgroundTasksReadResult, started: number, sequence?: number): boolean => {
    unread = new Set(result.issues.map(issue => issue.source.provider_id));
    const commandChanged = stops.observe(result.issues, started, sequence);
    // Same command count need not mean the same command, details or navigation target.
    const next = JSON.stringify(result.tasks);
    if (next === tasksShown && !commandChanged) {
      wanted = "";
      return false;
    }
    tasksShown = next;
    tasks = result.tasks;
    const asked = wanted ? tasks.find(task => keyOf(task.subject) === wanted) : undefined;
    wanted = "";
    if (asked) open(asked.id, true); else paintCard();
    return true;
  };
  const failed = (error: unknown) => request.toast?.(document.querySelector("[data-toast]") as never, error);
  const repaint = () => {
    paintCard();
    line.repaint();
  };
  const go = (task: BackgroundTaskRow) => {
    if (!task.open) return;
    if (task.open.kind === "surface" || !task.open.id) host.openSurface(task.open.surface); else host.openItem(task.open.surface, task.open.id, task.open.title);
  };
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const decision = target?.closest<HTMLElement>("[data-task-decision]");
    if (decision && target) {
      answers.answer(decision, target);
      return;
    }
    // A sub-agent's step: its own conversation, in the same float; the conversation column and the one input stay as they are (决定 49).
    const sub = target?.closest<HTMLElement>("[data-subtask-open]");
    if (sub && !target?.closest("[data-task-control]")) {
      host.dialog?.(true);
      host.openSubtask?.(sub.dataset.subtaskOpen ?? "");
      return;
    }
    // A task's row, wherever it is drawn (a list, an event's information, a card parked in the side panel): the same stop, the same card.
    const control = target?.closest<HTMLElement>("[data-task-control]"), opened = target?.closest<HTMLElement>("[data-task-open]");
    if ((control || opened) && !(float && target && float.contains(target))) {
      const on = tasks.find(one => one.id === (control?.dataset.task ?? opened?.dataset.taskOpen));
      if (!on) return;
      if (control?.dataset.taskControl === "stop") stops.stop(on); else if (control) go(on); else open(on.id);
      return;
    }
    if (!float) return;
    // The column of requirements stands beside the work, where the conversation is: opening it puts the float away.
    if (target?.closest("[data-work-task-float] [data-acceptance-open]")) {
      shell.hide();
      return;
    }
    // The original path still includes the float after a click repaints the button it landed on.
    const path = event.composedPath();
    if (target?.closest("[data-task-panel-close]")) {
      shell.hide();
      return;
    }
    if (!target || !path.includes(float)) {
      if (!document.querySelector("dialog[open]") && !path.some(node => node instanceof Element && node.matches("[data-assistant-panel],[data-work-bar],[data-side-panel],dialog,[popover]"))) shell.hide();
      return;
    }
    const stop = target.closest<HTMLElement>('[data-task-control="stop"]'), task = tasks.find(one => one.id === (stop?.dataset.task ?? carded));
    if (!task) return;
    const to = target.closest<HTMLElement>("[data-place-to]"), served = servedBy(task);
    if (stop) stops.stop(task);
    else if (target.closest("[data-place-change]")) {
      placing = !placing;
      paintCard();
    }
    else if (to) {
      // Where it goes is the owner's record, changed through the mainline service; what is under way goes on (WLN-36).
      const subject = events.get(to.dataset.placeEvent ?? "")?.subject, now = Date.now(), DAY = 86_400_000;
      placing = false;
      paintCard();
      void request(host.route("/api/mainline/place"), { body: { task: task.subject, to: { kind: to.dataset.placeTo, ...(subject ? { subject } : {}) },
        window: { from: new Date(now - 30 * DAY).toISOString(), to: new Date(now + 2 * DAY).toISOString(), now: new Date(now).toISOString() } } }).catch(failed).finally(again);
    } else if (target.closest("[data-task-event]")) { if (served) {
      shell.hide();
      host.openEvent(press(served));
    } }
    else if (target.closest("[data-task-go]")) go(task);
  });
  installDecisionKeys(() => {
    if (!float || document.querySelector("dialog[open]")) return false;
    shell.hide();
    return true;
  });

  return {
    take: takeTasks,
    offline(since) {
      if (since === offlineSince) return false;
      offlineSince = since;
      paintCard();
      return true;
    },
    retitle() {
      paintCard();
    },
    rows: subject => tree(serving(subject)),
    unplaced: () => tree(tasks.filter(task => !ended(task) && !servedBy(task))),
    decisions: subject => decisionsOf(ordered(serving(subject)), task => keyOf(task.subject) !== keyOf(subject)),
    waiting: () => tasks.filter(asks).flatMap(task => {
      const event = servedBy(task);
      return event ? [{ key: `${keyOf(task.subject)}|${task.decisions[0]?.id ?? ""}`, provider: task.source.provider_id, title: task.title, event }] : [];
    }),
    loose: () => ordered(tasks.filter(task => asks(task) && !ended(task) && !servedBy(task))),
    unreadable: () => unread,
    questions: of => ("subject" in of ? [of] : ordered(serving(of)).filter(asks))
      .flatMap(task => task.decisions.map(decision => ({ task: task.id, id: decision.id, ask: decision.ask, answers: decision.answers.map(answer => answer.role),
        hasChanges: decision.changes.length > 0 || "review_html" in decision, busy: answers.busy(task, decision.id) }))),
    subjects: subject => serving(subject).map(task => ({ provider_id: task.source.provider_id, subject: task.subject })),
    // A task that has ended is not in the table: nothing opens, and the reply's row says where it stood.
    place(subject) {
      const now = tasks.find(task => keyOf(task.subject) === keyOf(subject));
      if (now) open(now.id, true); else {
        wanted = keyOf(subject);
        again();
      }
    },
    open: id => open(id),
    close() {
      if (!shell.shown) return false;
      shell.hide();
      return true;
    },
  };
}
