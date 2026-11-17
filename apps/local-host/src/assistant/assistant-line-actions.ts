import type { AssistantCharacterRef } from "@molis-ai/molis-work-contracts/services/assistant";
import { roleKey } from "./assistant-characters.js";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { bindActionHandler, defineBackgroundTasksAction, inputSchemaFor, defineTaskServesAction, defineWorkEventsAction, withinWorkEventWindow, assertWorkEventWindow, requireSynchronous,
  type ActionDefinition, type ActionHandlerBinding, type ActionSubject, type BackgroundTask, type BackgroundTaskCollection, type BackgroundTaskDecision, type OpenTarget,
  type TaskServesBindInput, type TaskServesInput, type TaskServesResult, type WorkEvent, type WorkEventCollection, type WorkEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewRequest, StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import { ASSISTANT_NEXT_STEP_REVIEW, type AssistantPendingReview, type AssistantScope, type AssistantSendInput, type AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MAINLINE_PROVIDER_ID, mainlineActions, type BackgroundTasksReadResult, type WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { assistantErrors } from "./assistant-errors.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";
import { workTitle } from "./assistant-work-title.js";

/**
 * The Assistant on the work line (specs/work-line §5, §6; contract-design §2, §4, §5): it reports its works like any registrant
 * and any task provider, through actions found by their types. The Host has no branch for it.
 *
 * - A work the person started for one thing (not a main conversation, not handed out by one) is an event; so is a background
 *   task registered as one (`line_event`). A main conversation is the conversation itself, never an event or a task.
 * - Every such work that is under way or waits on the person is a row of the task table. A work that is an event serves
 *   itself; a background task serves what its record says (`serves`), or nothing.
 * - Which event a background task is done for is kept on the task (the `serves` relation, here).
 * - A work that waits on the person's confirmation lists each held effect as a decision of its row (WLN-10): what is held and the
 *   fields the review itself shows, answered through `assistant.background.decide`, which is the same decision the conversation's
 *   own confirmation card records.
 */
const PROVIDER = "io.molis.work.assistant.rules";
export const ASSISTANT_WORK_KIND = "assistant_work";
/** Who registered the Assistant's events and tasks, named in the reader's language. */
const sourceNamed = () => ({ surface: "assistant", title: uiText.text("workbench.assistant-line.assistant"), icon: "assistant" }) as const;
const own = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> => ({ ...definition, provider_id: PROVIDER });
interface AssistantStopInput { work_id: string }
interface AssistantDecideInput { work_id: string; review_id: string; version: string; decision: "approve" | "reject"; note?: string }

export const ASSISTANT_LINE_ACTIONS = {
  events: own(defineWorkEventsAction("assistant.events", /* @version action.assistant.events */ 1, [ASSISTANT_WORK_KIND], "助理事件", [])),
  tasks: own(defineBackgroundTasksAction("assistant.background.tasks", /* @version action.assistant.background.tasks */ 1, [ASSISTANT_WORK_KIND], "助理后台任务", [])),
  stop: own({ capability_id: "assistant.background.stop", version: /* @version action.assistant.background.stop */ 1, operation: "command", action: { title: "停止助理的后台任务",
    description: "停止一项在办的助理工作：它正在跑的一轮停下，已做出的保留。", kind: "operation", effect: "write", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [ASSISTANT_WORK_KIND],
    input_schema: inputSchemaFor<AssistantStopInput>()({ type: "object", properties: { work_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["work_id"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { stopped: { type: "boolean" } }, required: ["stopped"], additionalProperties: false } } } as ActionDefinition<AssistantStopInput, { stopped: boolean }>),
  decide: own({ capability_id: "assistant.background.decide", version: /* @version action.assistant.background.decide */ 1, operation: "command", action: { title: "回答助理任务要你确认的操作",
    description: "同意或拒绝一项助理工作里等你确认的那一步操作；拒绝时可以带上怎么改，这项工作按你说的接着办。只作用于这一条待确认的操作。", kind: "operation", effect: "write", scope: "project",
    audiences: ["user"], permissions: [], subject_kinds: [ASSISTANT_WORK_KIND],
    input_schema: inputSchemaFor<AssistantDecideInput>()({ type: "object", properties: { work_id: { type: "string", minLength: 1, maxLength: 200 }, review_id: { type: "string", minLength: 1, maxLength: 200 },
      version: { type: "string", minLength: 1, maxLength: 200 }, decision: { enum: ["approve", "reject"] }, note: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["work_id", "review_id", "version", "decision"], additionalProperties: false } as const),
    output_schema: { type: "object", properties: { decided: { enum: ["approve", "reject"] } }, required: ["decided"], additionalProperties: false } } } as ActionDefinition<AssistantDecideInput, { decided: "approve" | "reject" }>),
  servesList: own(defineTaskServesAction("list", "assistant.serves.list", /* @version action.assistant.serves.list */ 1, [ASSISTANT_WORK_KIND], "助理任务为哪个事件办", [])),
  servesBind: own(defineTaskServesAction("bind", "assistant.serves.bind", /* @version action.assistant.serves.bind */ 1, [ASSISTANT_WORK_KIND], "把助理任务挂到事件", [])),
  servesRelease: own(defineTaskServesAction("release", "assistant.serves.release", /* @version action.assistant.serves.release */ 1, [ASSISTANT_WORK_KIND], "把助理任务从事件移开", [])),
  servesCreate: own(defineTaskServesAction("create", "assistant.serves.create", /* @version action.assistant.serves.create */ 1, [ASSISTANT_WORK_KIND], "把助理任务登记成事件", [])),
} as const;

/**
 * The task table for the Assistant's own Agent (user decision 2026-11-15; S-49): what is being done in the round's project and
 * what waits on the person, so it can say where things stand. The task providers answer the person alone, and still do: the
 * Assistant service reads the table as the person, in the project of the round that asks, and hands on a reading copy — names,
 * states, steps, whom each is done for, what each asks — with no command and no answer in it. Only the Assistant's own round may
 * call it; another plugin's Agent, a workflow, an MCP client and a page are refused, and a personal round has no project to read.
 */
export interface AssistantTaskTableRow { subject: ActionSubject; title: string; state: StateRingState; step?: string; waiting: boolean; who: string; from: string; serves: ActionSubject[]; asks: string[]; updated_at: string }
export interface AssistantTaskTable { tasks: AssistantTaskTableRow[]; unreadable: string[] }
const SUBJECT = { type: "object", properties: { kind: { type: "string" }, id: { type: "string" } }, required: ["kind", "id"], additionalProperties: false } as const;
export const ASSISTANT_TASK_TABLE_ACTION = own({ capability_id: "assistant.background.read", version: /* @version action.assistant.background.read */ 1, operation: "query", action: { title: "后台任务办到哪了",
  description: "读取这个项目里此刻正在办、或等着用户处理的后台任务：各是什么、办到哪一步、谁在办、为线上的哪个事件办、在等用户定什么。只读：不能停止任务，也不能替用户回答它问的事。用户问「现在后台有哪些在办」「那件事办得怎样了」时用。",
  kind: "query", effect: "read", scope: "project", scheduling: "concurrent", audiences: ["agent"], permissions: [], subject_kinds: [],
  input_schema: inputSchemaFor<Record<string, never>>()({ type: "object", properties: {}, additionalProperties: false }),
  output_schema: { type: "object", properties: { tasks: { type: "array", maxItems: 500, items: { type: "object", properties: { subject: SUBJECT, title: { type: "string" }, state: { type: "string" }, step: { type: "string" },
    waiting: { type: "boolean" }, who: { type: "string" }, from: { type: "string" }, serves: { type: "array", items: SUBJECT }, asks: { type: "array", items: { type: "string" } }, updated_at: { type: "string" } },
    required: ["subject", "title", "state", "waiting", "who", "from", "serves", "asks", "updated_at"], additionalProperties: false } }, unreadable: { type: "array", items: { type: "string" } } },
    required: ["tasks", "unreadable"], additionalProperties: false } } } as ActionDefinition<Record<string, never>, AssistantTaskTable>);
/** The reading copy of the table: what a row says, never what can be done to it. */
export function assistantTaskTable(table: BackgroundTasksReadResult): AssistantTaskTable {
  return { tasks: table.tasks.map(task => ({ subject: { kind: task.subject.kind, id: task.subject.id }, title: task.title, state: task.state,
    ...(task.step ? { step: task.step.text } : {}), waiting: task.waiting, who: task.executor.label, from: task.origin.title,
    serves: task.serves.map(one => ({ kind: one.kind, id: one.id })), asks: task.decisions.map(decision => decision.ask), updated_at: task.updated_at })),
    unreadable: table.issues.map(issue => issue.title) };
}

/** How the Assistant service reads that table: as the person, in that project, through the mainline service — the providers answer nobody else (S-49). */
export const personTaskTable = <Reference>(reference: ((projectId: string) => Promise<Reference>) | undefined,
  client: (reference: Reference) => { invoke(action: { capability_id: string; version: number; provider_id: string }, input: unknown): Promise<unknown> }): AssistantLineSource["table"] => async projectId => {
  if (!reference) throw assistantErrors.scope("当前宿主未提供项目上下文");
  return await client(await reference(projectId)).invoke({ capability_id: mainlineActions.tasks.capability_id, version: mainlineActions.tasks.version, provider_id: MAINLINE_PROVIDER_ID }, {}) as BackgroundTasksReadResult;
};

/** What the line needs of the Assistant service: the person's works in a project with their state now, the task's own record, and its stop. */
export interface AssistantLineSource {
  /** `reviews`: the effects held for the person's confirmation, read for a work that waits on one; `acceptance`: delivered requirements waiting on the person's OK (APR-15, APR-16). */
  works(projectId: string, caller?: { user_action?: import("@molis-ai/molis-work-contracts/platform/actions").ActionUserAction; signal?: AbortSignal }): Promise<Array<{ work: StoredWork; state: AssistantWorkState; reviews?: readonly AssistantPendingReview[]; acceptance?: ReviewRequest }>>;
  /** The project's task table, read as the person (every provider the person can read there). */
  table(projectId: string): Promise<BackgroundTasksReadResult>;
  /** Record the person's answer to one held effect or acceptance request of a work; the work goes on as that answer says. */
  decide(workId: string, input: { review_id: string; version: string; decision: "approve" | "reject"; note?: string },
    boundary?: { beforeEffect?(): void | Promise<void>; assertCurrent?(): void },
    caller?: { user_action?: { source: string; conversation_ref: string; message_ref: string }; signal?: AbortSignal }): Promise<void>;
  /** Keep which events a background task is done for; `line_event` makes it an event of its own. */
  place(workId: string, to: { serves: ActionSubject[]; line_event: boolean }): StoredWork;
  stop(workId: string): Promise<void>;
}

const UNDER_WAY: readonly AssistantWorkState[] = ["running", "waiting-input", "waiting-review", "paused", "needs-check"];
const WAITS_ON_PERSON: readonly AssistantWorkState[] = ["waiting-input", "waiting-review", "needs-check"];
const RING: Readonly<Record<AssistantWorkState, StateRingState>> = { idle: "idle", running: "running", "waiting-input": "answer", "waiting-review": "approval", paused: "paused",
  completed: "done", failed: "failed", stopped: "stopped", "needs-check": "verify" };
/** The state as one phrase, said in the reader's language when the line or the table is read (not kept). */
const words = (state: AssistantWorkState) => uiText.text(`workbench.assistant-line.state-${state}`);
const nameOf = (work: StoredWork) => workTitle(work) || uiText.text("workbench.assistant-line.untitled");
/** How many ended works the line is told of at most; what is under way is always told. */
const ENDED_SHOWN = 20;

const subjectOf = (work: StoredWork): ActionSubject => ({ kind: ASSISTANT_WORK_KIND, id: work.work_id });
/** A work as the object its requirements hang on (`modules/acceptance`): the name its task row carries on the page. */
export const acceptanceSubjectOf = (work: StoredWork): { provider_id: string; subject: ActionSubject } => ({ provider_id: PROVIDER, subject: subjectOf(work) });
const openOf = (work: StoredWork): OpenTarget => ({ kind: "item", surface: "assistant", id: work.work_id, title: nameOf(work), label: uiText.text("workbench.assistant-line.open") });
/** A work that is an event on the line in its own right: one the person started for one thing (not said about another event), or a background task registered as one. */
const isEvent = (work: StoredWork) => !work.main && !work.reply_target && (work.delegated_by ? work.line_event === true : !work.serves?.length);
/** A work that can be a row of the task table: anything but the conversation itself and a reply into someone's thread. */
const isTask = (work: StoredWork) => !work.main && !work.reply_target;
/**
 * The event a part handed out by `parent` is done for when the round names none: the event `parent` itself is, or the one it is
 * done for. A main conversation is no event, so what it hands out belongs to none until it is placed.
 */
export const eventBehind = (parent: StoredWork): StoredWork["serves"] =>
  parent.main || parent.reply_target || parent.delegated_by ? undefined : parent.serves?.length ? parent.serves.map(one => ({ ...one })) : [{ kind: ASSISTANT_WORK_KIND, id: parent.work_id }];
const servesOf = (work: StoredWork): ActionSubject[] => isEvent(work) ? [subjectOf(work)] : (work.serves ?? []).map(one => ({ kind: one.kind, id: one.id }));

export function assistantWorkEvents(works: ReadonlyArray<{ work: StoredWork; state: AssistantWorkState }>, window: WorkEventWindow): WorkEvent[] {
  const events = works.filter(({ work }) => isEvent(work)).map(({ work, state }): WorkEvent & { under_way: boolean } => ({
    event_id: work.work_id, subject: subjectOf(work), title: nameOf(work), summary: words(state), content: "", facts: [], category: "personal",
    placement: UNDER_WAY.includes(state) ? "active" : "occurred", occurred_at: work.updated_at, state: RING[state],
    // What waits on the person is said by the task table's row for the same work, so the line counts it once.
    needs_attention: false, open: openOf(work), under_way: UNDER_WAY.includes(state) }));
  const ended = events.filter(event => !event.under_way && event.state !== "idle" && withinWorkEventWindow(event.occurred_at, window))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, ENDED_SHOWN);
  return [...events.filter(event => event.under_way), ...ended].map(({ under_way: _underWay, ...event }) => event);
}

/** The held effects of a work as what its row asks (WLN-10): one decision an effect, by the review's own id, so an answer reaches that effect only. */
function decisionsOf(work: StoredWork, reviews: readonly AssistantPendingReview[], acceptance?: ReviewRequest): BackgroundTaskDecision[] {
  const action = { capability_id: ASSISTANT_LINE_ACTIONS.decide.capability_id, version: ASSISTANT_LINE_ACTIONS.decide.version }, name = nameOf(work);
  const held = reviews.slice(0, 10).flatMap(review => {
    const input = (decision: "approve" | "reject") => ({ work_id: work.work_id, review_id: review.review_id, version: review.version, decision });
    const said = { name, what: review.summary.slice(0, 200) || uiText.text("workbench.assistant-line.this-step") };
    const approve = review.decisions.approve.available, reject = review.decisions.reject.available;
    const answers = review.kind === ASSISTANT_NEXT_STEP_REVIEW
      ? [...(approve ? [{ role: "approve" as const, action, input: input("approve"), summary: uiText.text("workbench.assistant-step-gate.go-on", { name }) }] : []),
         ...(reject ? [{ role: "reject" as const, action, input: input("reject"), summary: uiText.text("workbench.assistant-step-gate.not-now", { name }) }] : [])]
      : [...(approve ? [{ role: "approve" as const, action, input: input("approve"), summary: uiText.text("workbench.assistant-line.approve-step", said) }] : []),
         ...(reject ? [{ role: "revise" as const, action, input: input("reject"), summary: uiText.text("workbench.assistant-line.revise-step", said) },
           { role: "reject" as const, action, input: input("reject"), summary: uiText.text("workbench.assistant-line.reject-step", said) }] : [])];
    if (!answers.length) return [];
    return [{ id: review.review_id, ...(review.reference ? { reference: review.reference } : {}), ask: review.summary.slice(0, 1000) || uiText.text("workbench.assistant-line.step-to-approve"), why: uiText.text("workbench.assistant-line.why-ask"),
      changes: review.fields.slice(0, 20).map(field => ({ label: field.label.slice(0, 200) || uiText.text("workbench.assistant-line.content"), value: field.value.slice(0, 2000) })),
      answers }];
  });
  const acceptAll = acceptance?.choices.find(choice => choice.id === "accept_all" && choice.availability.available);
  if (!acceptance || !acceptAll || held.length >= 10) return held;
  const openIds = new Set(acceptAll.accepts);
  const said = { name, what: acceptance.summary.slice(0, 200) };
  const input = (decision: "approve" | "reject") => ({ work_id: work.work_id, review_id: `acceptance:${work.work_id}`, version: acceptance.reference.version, decision });
  return [...held, {
    id: `acceptance:${work.work_id}:${acceptance.reference.version.slice(0, 16)}`,
    reference: acceptance.reference,
    ask: uiText.text("common.presentation.needs-acceptance"),
    why: acceptance.summary.slice(0, 1000),
    changes: acceptance.requirements.filter(req => openIds.has(req.id)).slice(0, 20).map(req => ({ label: req.id.slice(0, 200), value: req.statement.slice(0, 2000) })),
    answers: [
      { role: "approve", action, input: input("approve"), summary: uiText.text("workbench.assistant-line.approve-step", said) },
      { role: "revise", action, input: input("reject"), summary: uiText.text("workbench.assistant-line.revise-step", said) },
    ],
  }];
}

export function assistantBackgroundTasks(works: ReadonlyArray<{ work: StoredWork; state: AssistantWorkState; reviews?: readonly AssistantPendingReview[]; acceptance?: ReviewRequest }>): BackgroundTask[] {
  return works.filter(({ work, state, acceptance }) => isTask(work) && (UNDER_WAY.includes(state) || Boolean(acceptance?.choices.some(c => c.id === "accept_all" && c.availability.available)))).map(({ work, state, reviews, acceptance }): BackgroundTask => {
    const waitingAcceptance = Boolean(acceptance?.choices.some(c => c.id === "accept_all" && c.availability.available));
    return {
      subject: subjectOf(work), title: nameOf(work), state: waitingAcceptance && !UNDER_WAY.includes(state) ? "approval" : RING[state],
      step: { text: waitingAcceptance && !UNDER_WAY.includes(state) ? uiText.text("common.presentation.needs-acceptance") : words(state) }, details: [],
      waiting: WAITS_ON_PERSON.includes(state) || waitingAcceptance,
      started_at: work.created_at, updated_at: work.updated_at,
      executor: work.executor.kind === "plugin" ? { kind: "plugin", label: work.executor.title } : work.character ? { kind: "character", label: work.character.title } : { kind: "assistant", label: uiText.text("workbench.assistant-line.assistant") },
      serves: servesOf(work), scope: "project",
      commands: state === "paused" || !UNDER_WAY.includes(state) ? [] : [{ role: "stop", action: { capability_id: ASSISTANT_LINE_ACTIONS.stop.capability_id, version: ASSISTANT_LINE_ACTIONS.stop.version }, input: { work_id: work.work_id }, summary: uiText.text("workbench.assistant-line.stop-work", { title: nameOf(work) }) }],
      decisions: decisionsOf(work, reviews ?? [], acceptance), open: openOf(work),
    };
  });
}

export function assistantLineRegistration(source: () => AssistantLineSource): { definitions: ActionDefinition[]; handlers: ActionHandlerBinding[] } {
  const project = (caller: { project_id: string | null }) => {
    if (!caller.project_id) throw assistantErrors.scope("事项线在项目里读取");
    return caller.project_id;
  };
  /** The caller's own task in the caller's project; anything else is not found, whatever it is. */
  const task = async (caller: { project_id: string | null; user_action?: import("@molis-ai/molis-work-contracts/platform/actions").ActionUserAction; signal?: AbortSignal }, subject: ActionSubject) => {
    const found = subject.kind === ASSISTANT_WORK_KIND ? (await source().works(project(caller), caller)).find(({ work }) => work.work_id === subject.id && isTask(work)) : undefined;
    if (!found) throw assistantErrors.not_found("没有这项助理任务，或你读不到它");
    return found.work;
  };
  /** A work the person started for nothing else is the event itself: there is nothing to take it off, or to register. Hung on another event it is a task behind that one. */
  const movable = (work: StoredWork) => {
    if (!work.delegated_by && !work.serves?.length) throw assistantErrors.invalid("这项工作本身就是线上的事件");
    return work;
  };
  const answer = (work: StoredWork): TaskServesResult => ({ serves: servesOf(work) });
  const A = ASSISTANT_LINE_ACTIONS;
  const definitions: ActionDefinition[] = [A.events, A.tasks, ASSISTANT_TASK_TABLE_ACTION as ActionDefinition, A.stop, A.decide, A.servesList, A.servesBind, A.servesRelease, A.servesCreate];
  return { definitions, handlers: [
    bindActionHandler(A.events, async (window, caller): Promise<WorkEventCollection> => {
      assertWorkEventWindow(window);
      return { source: sourceNamed(), events: assistantWorkEvents(await source().works(project(caller), caller), window) };
    }),
    bindActionHandler(A.tasks, async (_input, caller): Promise<BackgroundTaskCollection> => ({ source: sourceNamed(), tasks: assistantBackgroundTasks(await source().works(project(caller), caller)) })),
    bindActionHandler(A.stop, async (input, caller) => {
      const work = await task(caller, { kind: ASSISTANT_WORK_KIND, id: input.work_id });
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      await source().stop(work.work_id);
      return { stopped: true };
    }),
    // Only the Assistant's own round (the Host writes `skill_round`; no input can), in its project. What it gets is a copy to read.
    bindActionHandler(ASSISTANT_TASK_TABLE_ACTION, async (_input, caller): Promise<AssistantTaskTable> => {
      if (caller.audience !== "agent" || caller.skill_round?.consumer !== "assistant" || caller.host_plugin || caller.delegated_by) throw assistantErrors.scope("后台任务总表只给助理自己的这一轮读");
      return assistantTaskTable(await source().table(project(caller)));
    }),
    // The answer is for one held effect of the caller's own work; whether that effect is still held is the review queue's to say.
    bindActionHandler(A.decide, async (input, caller) => {
      const work = await task(caller, { kind: ASSISTANT_WORK_KIND, id: input.work_id });
      const boundary = {
        beforeEffect: () => caller.beforeEffect(),
        assertCurrent: () => { caller.signal?.throwIfAborted(); requireSynchronous(caller.assert_authority_current?.()); },
      };
      await boundary.beforeEffect(); boundary.assertCurrent();
      await source().decide(work.work_id, { review_id: input.review_id, version: input.version, decision: input.decision, ...(input.note ? { note: input.note } : {}) }, boundary,
        { ...(caller.user_action ? { user_action: caller.user_action } : {}), ...(caller.signal ? { signal: caller.signal } : {}) });
      return { decided: input.decision };
    }),
    bindActionHandler(A.servesList, async (input: TaskServesInput, caller) => answer(await task(caller, input.task))),
    bindActionHandler(A.servesBind, async (input: TaskServesBindInput, caller) => {
      const work = await task(caller, input.task);
      if (input.event.kind === ASSISTANT_WORK_KIND && input.event.id === work.work_id) throw assistantErrors.invalid("任务不能挂到它自己上");
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      return answer(source().place(work.work_id, { serves: [{ kind: input.event.kind, id: input.event.id }], line_event: false }));
    }),
    bindActionHandler(A.servesRelease, async (input: TaskServesInput, caller) => {
      const work = movable(await task(caller, input.task));
      // Only a task the Assistant sent out can belong to no event: a work the person started, off its event, is an event itself.
      if (!work.delegated_by) throw assistantErrors.invalid("这项工作是你单独交办的，不挂在别的事件上时它自己就是线上的事件：请改选「登记成新事件」");
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      return answer(source().place(work.work_id, { serves: [], line_event: false }));
    }),
    bindActionHandler(A.servesCreate, async (input: TaskServesInput, caller) => {
      const work = movable(await task(caller, input.task));
      await caller.beforeEffect(); caller.signal?.throwIfAborted();
      return answer(source().place(work.work_id, { serves: [], line_event: Boolean(work.delegated_by) }));
    }),
  ] };
}

export interface AssistantLineAcceptance {
  read(projectId: string, works: readonly StoredWork[], caller?: { user_action?: import("@molis-ai/molis-work-contracts/platform/actions").ActionUserAction; signal?: AbortSignal }): Promise<ReadonlyMap<string, ReviewRequest>>;
  decide(work: StoredWork, input: { review_id: string; version: string; decision: "approve" | "reject"; note?: string },
    boundary: { beforeEffect?(): void | Promise<void>; assertCurrent?(): void } | undefined,
    caller?: { user_action?: import("@molis-ai/molis-work-contracts/platform/actions").ActionUserAction; signal?: AbortSignal }): Promise<boolean>;
}

const ENDED_STATES: readonly AssistantWorkState[] = ["idle", "completed", "failed", "stopped"];
/** The line's source over the Assistant's own store and service: nothing here is a second record of a work. */
export function assistantLineSource(store: Pick<AssistantStore, "list" | "observed" | "update">, table: AssistantLineSource["table"], service: { reads: { stateSafely(work: StoredWork): Promise<AssistantWorkState> }; control(workId: string, control: { kind: "stop" }): Promise<unknown>;
  read(workId: string): Promise<{ reviews: AssistantPendingReview[] }>; outcomes: { decide(workId: string, input: { review_id: string; version: string; decision: "approve" | "reject"; note?: string },
    boundary?: { beforeEffect?(): void | Promise<void>; assertCurrent?(review: { run: { session_id: string } | null }): void }): Promise<unknown> } }, actorId: string,
  assertReviewCurrent?: (review: { run: { session_id: string } | null }) => void,
  acceptance?: AssistantLineAcceptance): AssistantLineSource {
  return {
    // A work last seen ended is read from that record; one that may be under way is read from its session.
    works: async (projectId, caller) => {
      const scoped = store.list(actorId, { limit: 500 }).filter(work => work.project_ref?.project_id === projectId);
      const reviewsByWork = acceptance ? await acceptance.read(projectId, scoped.filter(isTask), caller).catch(() => new Map<string, ReviewRequest>()) : new Map<string, ReviewRequest>();
      return Promise.all(scoped.map(async work => {
        const seen = store.observed.of(actorId, work.work_id);
        // A step held for the person's yes (PWA-156) is read from the work even when its last round was seen ending.
        const state = seen !== null && ENDED_STATES.includes(seen) && !work.step_gate ? seen : await service.reads.stateSafely(work);
        const acceptanceReview = reviewsByWork.get(work.work_id);
        // What is held is read only for a work that waits on a confirmation; a work whose view cannot be read still shows as waiting, with 「去处理」.
        const base = state === "waiting-review" ? { work, state, reviews: await service.read(work.work_id).then(view => view.reviews, () => []) } : { work, state };
        return acceptanceReview ? { ...base, acceptance: acceptanceReview } : base;
      }));
    },
    decide: async (workId, input, boundary, caller) => {
      if (acceptance && input.review_id === `acceptance:${workId}`) {
        const found = store.list(actorId, { limit: 500 }).find(work => work.work_id === workId);
        if (found && await acceptance.decide(found, input, boundary, caller)) return;
      }
      await service.outcomes.decide(workId, input, {
        beforeEffect: boundary?.beforeEffect,
        assertCurrent: review => { boundary?.assertCurrent?.(); assertReviewCurrent?.(review); },
      });
    },
    table,
    place: (workId, to) => store.update(actorId, workId, null, { serves: to.serves.length ? to.serves.map(one => ({ kind: one.kind, id: one.id })) : undefined, line_event: to.line_event ? true : undefined }, false),
    stop: async workId => { await service.control(workId, { kind: "stop" }); },
  };
}

/** The standing main conversation of a scope with a counterpart (the Assistant: null), if it has been opened and not put away. */
export function mainWorkOf(store: Pick<AssistantStore, "list">, actorId: string, scope: AssistantScope, character: AssistantCharacterRef | null): StoredWork | undefined {
  return store.list(actorId, { limit: Number.MAX_SAFE_INTEGER }).find(work => work.main && !work.delegated_by && work.scope.kind === scope.kind
    && (scope.kind !== "project" || work.scope.kind === "project" && work.scope.project_id === scope.project_id) && roleKey(work.character?.ref) === roleKey(character));
}
/**
 * Where a message said at 「现在」 goes (specs/work-line §3.2): the standing conversation of its scope with its counterpart, once
 * there is one. A main conversation is with one counterpart, so naming another one in it goes to that one's own main conversation
 * instead of changing who this one is with.
 */
export function mainSendInput(store: Pick<AssistantStore, "list">, actorId: string, input: AssistantSendInput, scope: (input: AssistantSendInput) => AssistantScope): AssistantSendInput {
  if (input.work_id && input.character !== undefined) {
    const held = store.list(actorId, { limit: Number.MAX_SAFE_INTEGER }).find(work => work.work_id === input.work_id);
    if (held?.main && roleKey(held.character?.ref) !== roleKey(input.character)) {
      const { work_id: _work, draft_revision: _revision, target: _target, delivery: _delivery, ...rest } = input;
      input = { ...rest, main: true, scope: held.scope };
    }
  }
  if (!input.main || input.work_id) return input;
  if (input.executor?.kind === "plugin") throw assistantErrors.invalid("主对话由助理或一个 Character 承担，不交给执行方插件");
  const standing = mainWorkOf(store, actorId, scope(input), input.character ?? null);
  return standing ? { ...input, work_id: standing.work_id } : input;
}
/**
 * A new work said in an event's tab (specs/work-line §4.4, WLN-12): it is done for that event. The event has to be on the person's
 * own line now, read with their authority before anything is written; a main conversation is never done for an event.
 */
export async function eventServes(input: AssistantSendInput, actions: (() => Promise<Pick<AgentActionClient, "invoke">>) | undefined): Promise<StoredWork["serves"]> {
  const wanted = input.for_event;
  if (wanted === undefined || input.work_id) return undefined;
  if (input.main || typeof wanted !== "object" || wanted === null || typeof wanted.kind !== "string" || typeof wanted.id !== "string" || !wanted.kind || !wanted.id)
    throw assistantErrors.invalid("for_event 要写事件的 kind 与 id，主对话不为某个事件办");
  const events = await lineEventsFor(await actions?.());
  if (!events.some(event => event.kind === wanted.kind && event.id === wanted.id)) throw assistantErrors.not_found("事项线上没有这个事件，或你读不到它");
  return [{ kind: wanted.kind, id: wanted.id }];
}

/** The events the work line shows to a work, read with the work's own authority (a sub-task is hung only on one of these). */
export async function lineEventsFor(actions: Pick<AgentActionClient, "invoke"> | undefined): Promise<ActionSubject[]> {
  if (!actions) throw assistantErrors.unsupported("这项工作现在读不到事项线");
  const at = Date.now(), day = 86_400_000;
  const line = await actions.invoke({ capability_id: mainlineActions.line.capability_id, version: mainlineActions.line.version, provider_id: MAINLINE_PROVIDER_ID },
    { from: new Date(at - 30 * day).toISOString(), to: new Date(at + 2 * day).toISOString(), now: new Date(at).toISOString() }) as WorkLineReadResult;
  return line.events.map(event => event.subject);
}
