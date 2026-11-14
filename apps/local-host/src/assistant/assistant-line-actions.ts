import { bindActionHandler, defineBackgroundTasksAction, inputSchemaFor, defineTaskServesAction, defineWorkEventsAction, withinWorkEventWindow, assertWorkEventWindow,
  type ActionDefinition, type ActionHandlerBinding, type ActionSubject, type BackgroundTask, type BackgroundTaskCollection, type OpenTarget,
  type TaskServesBindInput, type TaskServesInput, type TaskServesResult, type WorkEvent, type WorkEventCollection, type WorkEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import type { StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import type { AssistantScope, AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MAINLINE_PROVIDER_ID, mainlineActions, type WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { assistantErrors } from "./assistant-errors.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

/**
 * The Assistant on the work line (specs/work-line §5, §6; contract-design §2, §4, §5): it reports its works like any registrant
 * and any task provider, through actions found by their types. The Host has no branch for it.
 *
 * - A work the person started for one thing (not a main conversation, not handed out by one) is an event; so is a background
 *   task registered as one (`line_event`). A main conversation is the conversation itself, never an event or a task.
 * - Every such work that is under way or waits on the person is a row of the task table. A work that is an event serves
 *   itself; a background task serves what its record says (`serves`), or nothing.
 * - Which event a background task is done for is kept on the task (the `serves` relation, here).
 */
const PROVIDER = "io.molis.work.assistant.rules";
export const ASSISTANT_WORK_KIND = "assistant_work";
const SOURCE = { surface: "assistant", title: "助理", icon: "assistant" } as const;
const own = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> => ({ ...definition, provider_id: PROVIDER });
interface AssistantStopInput { work_id: string }

export const ASSISTANT_LINE_ACTIONS = {
  events: own(defineWorkEventsAction("assistant.events", /* @version action.assistant.events */ 1, [ASSISTANT_WORK_KIND], "助理事件", [])),
  tasks: own(defineBackgroundTasksAction("assistant.background.tasks", /* @version action.assistant.background.tasks */ 1, [ASSISTANT_WORK_KIND], "助理后台任务", [])),
  stop: own({ capability_id: "assistant.background.stop", version: /* @version action.assistant.background.stop */ 1, operation: "command", action: { title: "停止助理的后台任务",
    description: "停止一项在办的助理工作：它正在跑的一轮停下，已做出的保留。", kind: "operation", effect: "write", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [ASSISTANT_WORK_KIND],
    input_schema: inputSchemaFor<AssistantStopInput>()({ type: "object", properties: { work_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["work_id"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { stopped: { type: "boolean" } }, required: ["stopped"], additionalProperties: false } } } as ActionDefinition<AssistantStopInput, { stopped: boolean }>),
  servesList: own(defineTaskServesAction("list", "assistant.serves.list", /* @version action.assistant.serves.list */ 1, [ASSISTANT_WORK_KIND], "助理任务为哪个事件办", [])),
  servesBind: own(defineTaskServesAction("bind", "assistant.serves.bind", /* @version action.assistant.serves.bind */ 1, [ASSISTANT_WORK_KIND], "把助理任务挂到事件", [])),
  servesRelease: own(defineTaskServesAction("release", "assistant.serves.release", /* @version action.assistant.serves.release */ 1, [ASSISTANT_WORK_KIND], "把助理任务从事件移开", [])),
  servesCreate: own(defineTaskServesAction("create", "assistant.serves.create", /* @version action.assistant.serves.create */ 1, [ASSISTANT_WORK_KIND], "把助理任务登记成事件", [])),
} as const;

/** What the line needs of the Assistant service: the person's works in a project with their state now, the task's own record, and its stop. */
export interface AssistantLineSource {
  works(projectId: string): Promise<Array<{ work: StoredWork; state: AssistantWorkState }>>;
  /** Keep which events a background task is done for; `line_event` makes it an event of its own. */
  place(workId: string, to: { serves: ActionSubject[]; line_event: boolean }): StoredWork;
  stop(workId: string): Promise<void>;
}

const UNDER_WAY: readonly AssistantWorkState[] = ["running", "waiting-input", "waiting-review", "paused", "needs-check"];
const WAITS_ON_PERSON: readonly AssistantWorkState[] = ["waiting-input", "waiting-review", "needs-check"];
const RING: Readonly<Record<AssistantWorkState, StateRingState>> = { idle: "idle", running: "running", "waiting-input": "answer", "waiting-review": "approval", paused: "paused",
  completed: "done", failed: "failed", stopped: "stopped", "needs-check": "verify" };
/** The state as one phrase; the page has a translation for each. */
const WORDS: Readonly<Record<AssistantWorkState, string>> = { idle: "还没开始", running: "正在办", "waiting-input": "等你回答", "waiting-review": "等你确认", paused: "已暂停",
  completed: "办完了", failed: "没有办成", stopped: "已停止", "needs-check": "需要你核对" };
/** How many ended works the line is told of at most; what is under way is always told. */
const ENDED_SHOWN = 20;

const subjectOf = (work: StoredWork): ActionSubject => ({ kind: ASSISTANT_WORK_KIND, id: work.work_id });
const openOf = (work: StoredWork): OpenTarget => ({ kind: "item", surface: SOURCE.surface, id: work.work_id, title: work.title || "助理工作", label: "打开" });
/** A work that is an event on the line in its own right. */
const isEvent = (work: StoredWork) => !work.main && !work.reply_target && (work.delegated_by ? work.line_event === true : true);
/** A work that can be a row of the task table: anything but the conversation itself and a reply into someone's thread. */
const isTask = (work: StoredWork) => !work.main && !work.reply_target;
const servesOf = (work: StoredWork): ActionSubject[] => isEvent(work) ? [subjectOf(work)] : (work.serves ?? []).map(one => ({ kind: one.kind, id: one.id }));

export function assistantWorkEvents(works: ReadonlyArray<{ work: StoredWork; state: AssistantWorkState }>, window: WorkEventWindow): WorkEvent[] {
  const events = works.filter(({ work }) => isEvent(work)).map(({ work, state }): WorkEvent & { under_way: boolean } => ({
    event_id: work.work_id, subject: subjectOf(work), title: work.title || "助理工作", summary: WORDS[state], content: "", facts: [], category: "personal",
    placement: UNDER_WAY.includes(state) ? "active" : "occurred", occurred_at: work.updated_at, state: RING[state],
    // What waits on the person is said by the task table's row for the same work, so the line counts it once.
    needs_attention: false, open: openOf(work), under_way: UNDER_WAY.includes(state) }));
  const ended = events.filter(event => !event.under_way && event.state !== "idle" && withinWorkEventWindow(event.occurred_at, window))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, ENDED_SHOWN);
  return [...events.filter(event => event.under_way), ...ended].map(({ under_way: _underWay, ...event }) => event);
}

export function assistantBackgroundTasks(works: ReadonlyArray<{ work: StoredWork; state: AssistantWorkState }>): BackgroundTask[] {
  return works.filter(({ work, state }) => isTask(work) && UNDER_WAY.includes(state)).map(({ work, state }): BackgroundTask => ({
    subject: subjectOf(work), title: work.title || "助理工作", state: RING[state], step: { text: WORDS[state] }, details: [], waiting: WAITS_ON_PERSON.includes(state),
    started_at: work.created_at, updated_at: work.updated_at,
    executor: work.executor.kind === "plugin" ? { kind: "plugin", label: work.executor.title } : work.character ? { kind: "character", label: work.character.title } : { kind: "assistant", label: "助理" },
    serves: servesOf(work), scope: "project",
    commands: state === "paused" ? [] : [{ role: "stop", action: { capability_id: ASSISTANT_LINE_ACTIONS.stop.capability_id, version: ASSISTANT_LINE_ACTIONS.stop.version }, input: { work_id: work.work_id }, summary: `停止「${work.title || "助理工作"}」` }],
    open: openOf(work) }));
}

export function assistantLineRegistration(source: () => AssistantLineSource): { definitions: ActionDefinition[]; handlers: ActionHandlerBinding[] } {
  const project = (caller: { project_id: string | null }) => {
    if (!caller.project_id) throw assistantErrors.scope("事项线在项目里读取");
    return caller.project_id;
  };
  /** The caller's own task in the caller's project; anything else is not found, whatever it is. */
  const task = async (caller: { project_id: string | null }, subject: ActionSubject) => {
    const found = subject.kind === ASSISTANT_WORK_KIND ? (await source().works(project(caller))).find(({ work }) => work.work_id === subject.id && isTask(work)) : undefined;
    if (!found) throw assistantErrors.not_found("没有这项助理任务，或你读不到它");
    return found.work;
  };
  /** Only a task a conversation handed out can be moved: a work the person started for one thing is the event itself. */
  const movable = (work: StoredWork) => {
    if (!work.delegated_by) throw assistantErrors.invalid("这项工作本身就是线上的事件，不能挂到别的事件或移开");
    return work;
  };
  const answer = (work: StoredWork): TaskServesResult => ({ serves: servesOf(work) });
  const A = ASSISTANT_LINE_ACTIONS;
  const definitions: ActionDefinition[] = [A.events, A.tasks, A.stop, A.servesList, A.servesBind, A.servesRelease, A.servesCreate];
  return { definitions, handlers: [
    bindActionHandler(A.events, async (window, caller): Promise<WorkEventCollection> => {
      assertWorkEventWindow(window);
      return { source: { ...SOURCE }, events: assistantWorkEvents(await source().works(project(caller)), window) };
    }),
    bindActionHandler(A.tasks, async (_input, caller): Promise<BackgroundTaskCollection> => ({ source: { ...SOURCE }, tasks: assistantBackgroundTasks(await source().works(project(caller))) })),
    bindActionHandler(A.stop, async (input, caller) => {
      const work = await task(caller, { kind: ASSISTANT_WORK_KIND, id: input.work_id });
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      await source().stop(work.work_id);
      return { stopped: true };
    }),
    bindActionHandler(A.servesList, async (input: TaskServesInput, caller) => answer(await task(caller, input.task))),
    bindActionHandler(A.servesBind, async (input: TaskServesBindInput, caller) => {
      const work = movable(await task(caller, input.task));
      if (input.event.kind === ASSISTANT_WORK_KIND && input.event.id === work.work_id) throw assistantErrors.invalid("任务不能挂到它自己上");
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      return answer(source().place(work.work_id, { serves: [{ kind: input.event.kind, id: input.event.id }], line_event: false }));
    }),
    bindActionHandler(A.servesRelease, async (input: TaskServesInput, caller) => {
      const work = movable(await task(caller, input.task));
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      return answer(source().place(work.work_id, { serves: [], line_event: false }));
    }),
    bindActionHandler(A.servesCreate, async (input: TaskServesInput, caller) => {
      const work = movable(await task(caller, input.task));
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      return answer(source().place(work.work_id, { serves: [], line_event: true }));
    }),
  ] };
}

const ENDED_STATES: readonly AssistantWorkState[] = ["idle", "completed", "failed", "stopped"];
/** The line's source over the Assistant's own store and service: nothing here is a second record of a work. */
export function assistantLineSource(store: Pick<AssistantStore, "list" | "observed" | "update">, service: { reads: { stateSafely(work: StoredWork): Promise<AssistantWorkState> }; control(workId: string, control: { kind: "stop" }): Promise<unknown> }, actorId: string): AssistantLineSource {
  return {
    // A work last seen ended is read from that record; one that may be under way is read from its session.
    works: async projectId => Promise.all(store.list(actorId, { limit: 500 }).filter(work => work.project_ref?.project_id === projectId).map(async work => {
      const seen = store.observed(actorId, work.work_id);
      return { work, state: seen !== null && ENDED_STATES.includes(seen) ? seen : await service.reads.stateSafely(work) };
    })),
    place: (workId, to) => store.update(actorId, workId, null, { serves: to.serves.length ? to.serves.map(one => ({ kind: one.kind, id: one.id })) : undefined, line_event: to.line_event ? true : undefined }, false),
    stop: async workId => { await service.control(workId, { kind: "stop" }); },
  };
}

/** The standing main conversation of a scope with a counterpart (the Assistant: null), if it has been opened and not put away. */
export function mainWorkOf(store: Pick<AssistantStore, "list">, actorId: string, scope: AssistantScope, character: { artifact_id: string } | null): StoredWork | undefined {
  return store.list(actorId, { limit: Number.MAX_SAFE_INTEGER }).find(work => work.main && !work.delegated_by && work.scope.kind === scope.kind
    && (scope.kind !== "project" || work.scope.kind === "project" && work.scope.project_id === scope.project_id) && (work.character?.artifact_id ?? null) === (character?.artifact_id ?? null));
}
/** The main conversation's name until its counterpart is a Character; the page names the tab by the counterpart. */
export const MAIN_TITLE = "与助理的对话";

/** The events the work line shows to a work, read with the work's own authority (a sub-task is hung only on one of these). */
export async function lineEventsFor(actions: Pick<AgentActionClient, "invoke"> | undefined): Promise<ActionSubject[]> {
  if (!actions) throw assistantErrors.unsupported("这项工作现在读不到事项线");
  const at = Date.now(), day = 86_400_000;
  const line = await actions.invoke({ capability_id: mainlineActions.line.capability_id, version: mainlineActions.line.version, provider_id: MAINLINE_PROVIDER_ID },
    { from: new Date(at - 30 * day).toISOString(), to: new Date(at + 2 * day).toISOString(), now: new Date(at).toISOString() }) as WorkLineReadResult;
  return line.events.map(event => event.subject);
}
