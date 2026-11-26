import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { isDeepStrictEqual } from "node:util";
import { ActionError, BACKGROUND_TASK_MAX_HELD_REVIEWS, BACKGROUND_TASKS_OUTPUT_TYPE, TASK_SERVES_RELATION, WORK_EVENTS_INPUT_TYPE, WORK_EVENTS_OUTPUT_TYPE, assertWorkEventWindow, resolveActionSubject, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionProvider, type ActionReference,
  type ActionSubject, type ActionView, type BackgroundTask, type BackgroundTaskAnswer, type BackgroundTaskCollection, type BackgroundTaskCommand, type BackgroundTaskDecision, type BackgroundTaskPhrase, type OpenTarget, type RetainedActionAuthority, type TaskServesRole, type WorkEvent,
  type WorkEventCollection, type WorkEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_RING_FAMILIES, type ReviewOwner, type ReviewReference, type StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import { MAINLINE_ARRANGE_PERMISSION, mainlineErrors, type BackgroundTaskCommandRequest, type BackgroundTaskCommandResult, type BackgroundTaskDecideRequest, type BackgroundTaskDecideResult, type BackgroundTaskHeldReview, type BackgroundTaskRow, type BackgroundTasksReadResult, type MainlineIssue, type ObjectOpenRequest, type ObjectOpenResult, type TaskPlaceRequest, type TaskPlaceResult,
  type WaitingItem, type WaitingReadResult, type WorkLineEvent, type WorkLineReadRequest, type WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { PRESENTATION_VALUES_INPUT_TYPE, PRESENTATION_VALUES_OUTPUT_TYPE, type OwnedPresentationObject, type PresentationValues } from "@molis-ai/molis-work-contracts/platform/presentation";
import { checkItemPlacement, itemLineScope, placeInItem, taskBelongsToItem, type ItemLineScope, type MainlineItemPorts } from "./items.js";
import { createExecutionLifetime, isProjectReadQuery } from "@molis-ai/molis-work-plugin-sdk";
import { MISSED_RUN_KIND, isRunDecisionOf, isRunsSource, missedRunTasks, missedRunsWindow } from "./missed-runs.js";

export { MAINLINE_BASELINE, MAINLINE_HOME_STORE, MainlineStore, openMainlineDatabase, purgeMainlineProject } from "./store.js";
export { completeItem, convertItem, createItem, editGroups, holdsBind, holdsCandidates, holdsCreate, holdsList, holdsRelease, moveItem, readContents, readItemSubject, readMainline,
  removeItem, renameItem, switchItem, type ItemDeclaration, type MainlineItemPorts } from "./items.js";

// The mainline service (specs/work-line §5–§6): it finds a project's event registrants and task providers in the caller's own
// directory, asks each once and checks every row before a page draws it. Nothing is stored: every call asks again, so a caller
// never gets what it may not read.

const TOKEN = /^[a-zA-Z0-9_-]{1,64}$/;
const STATES: ReadonlySet<string> = new Set(STATE_RING_FAMILIES.flatMap(family => [...family.states]));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const codeOf = (error: unknown) => error instanceof ActionError ? error.code : "actions.execution_failed";

function phraseOf(value: unknown): BackgroundTaskPhrase | null {
  return record(value) && text(value.text, 200) && Object.keys(value).length === 1 ? { text: value.text } : null;
}
function subjectOf(value: unknown): ActionSubject | null {
  return record(value) && text(value.kind, 200) && text(value.id, 200) ? { kind: value.kind, id: value.id } : null;
}
function openOf(value: unknown): OpenTarget | null {
  if (!record(value) || !text(value.surface, 64) || !TOKEN.test(value.surface) || !text(value.title, 1000) || !text(value.label, 200)) return null;
  if (value.kind === "surface") return value.id === null ? { kind: "surface", surface: value.surface, id: null, title: value.title, label: value.label } : null;
  return (value.kind === "item" || value.kind === "group") && text(value.id, 400) ? { kind: value.kind, surface: value.surface, id: value.id, title: value.title, label: value.label } : null;
}
/**
 * A command is offered only as an action of the provider that answered: a row cannot put another provider's action, with an
 * input of its choosing, behind a button the person presses. Anything else is not offered.
 */
function commandOf<Role extends string = BackgroundTaskCommand["role"]>(value: unknown, source: Required<ActionReference>, roles: readonly string[] = ["stop", "pause", "resume"]): { role: Role; action: Required<ActionReference>; input: Record<string, unknown>; summary: string } | null {
  if (!record(value) || !roles.includes(value.role as string) || typeof value.summary !== "string" || value.summary.length > 1000 || !record(value.input) || !record(value.action)) return null;
  const { capability_id, version, provider_id } = value.action;
  if (!text(capability_id, 200) || !Number.isSafeInteger(version) || (version as number) < 1 || (provider_id !== undefined && provider_id !== source.provider_id)) return null;
  return { role: value.role as Role, action: { capability_id, version: version as number, provider_id: source.provider_id }, input: value.input, summary: value.summary };
}
function reviewRefOf(value: unknown): ReviewReference<ReviewOwner> | null {
  if (!record(value)) return null;
  const { id, version, owner } = value;
  if (!text(id, 2800) || !text(version, 240) || !record(owner) || !text(owner.project_id, 240)) return null;
  const projectId = owner.project_id;
  if (owner.kind === "agent-review" && text(owner.plugin_id, 240) && text(owner.install_id, 240)) {
    return { owner: { kind: owner.kind, project_id: projectId, plugin_id: owner.plugin_id, install_id: owner.install_id }, id, version };
  }
  if (owner.kind === "trusted-decision" && (owner.scope === "home" || owner.scope === "project") && text(owner.plugin_id, 240) && text(owner.install_id, 240) && text(owner.installation_generation, 240)) {
    return { owner: { kind: "trusted-decision", project_id: projectId, scope: owner.scope, plugin_id: owner.plugin_id, install_id: owner.install_id, installation_generation: owner.installation_generation }, id, version };
  }
  if (owner.kind === "trusted-decision" && owner.scope === "project" && !("plugin_id" in owner) && text(owner.provider_id, 240)) {
    return { owner: { kind: "trusted-decision", project_id: projectId, scope: "project", provider_id: owner.provider_id }, id, version };
  }
  return null;
}

/**
 * What a task asks, or null when it cannot be drawn. Its answers are held to the same rule as a command: the provider's own actions,
 * one of a role at most. A line of what would change that is not a label and a value is a row the provider got wrong.
 */
function decisionOf(value: unknown, source: Required<ActionReference>): BackgroundTaskDecision | null {
  if (!record(value) || !text(value.id, 200) || !text(value.ask, 1000) || (value.why !== undefined && !text(value.why, 1000)) || !Array.isArray(value.changes) || value.changes.length > 20
    || !Array.isArray(value.answers) || value.answers.length > 3) return null;
  const reference = value.reference === undefined ? undefined : reviewRefOf(value.reference);
  if (value.reference !== undefined && !reference) return null;
  const changes = value.changes.map(line => record(line) && text(line.label, 200) && typeof line.value === "string" && line.value.length <= 2000 ? { label: line.label, value: line.value } : null);
  const answers = value.answers.map(answer => commandOf<BackgroundTaskAnswer["role"]>(answer, source, ["approve", "revise", "reject"]));
  if (changes.includes(null) || answers.includes(null) || new Set(answers.map(answer => answer!.role)).size !== answers.length) return null;
  return { id: value.id, ...(reference ? { reference } : {}), ask: value.ask, ...(value.why === undefined ? {} : { why: value.why as string }), changes: changes as BackgroundTaskDecision["changes"], answers: answers as BackgroundTaskAnswer[] };
}

/** Who answered, as the answer names itself, or null when it is not a plain surface, name and glyph. */
export function backgroundTaskOrigin(output: unknown): BackgroundTaskCollection["source"] | null {
  const origin = record(output) ? output.source : null;
  return record(origin) && text(origin.surface, 64) && TOKEN.test(origin.surface) && text(origin.title, 200) && text(origin.icon, 64) && TOKEN.test(origin.icon)
    ? { surface: origin.surface, title: origin.title, icon: origin.icon } : null;
}

type SourceTaskRow = Omit<BackgroundTaskRow, "decisions"> & Pick<BackgroundTask, "decisions" | "held_reviews">;

/** The Host owns the queue and the protected person entry, while mainline owns the read of the task and its provider. */
export interface TaskReviewPorts {
  read(caller: ActionCallContext, provider: ActionProvider, tasks: readonly SourceTaskRow[]): Promise<ReadonlyMap<string, BackgroundTaskHeldReview[]>>;
  decide(caller: ActionExecutionContext, provider: ActionProvider, review: { id: string; sessionId: string; version: string; role: "approve" | "reject" },
    source: { authority: RetainedActionAuthority; checkTask(): Promise<void> }): Promise<unknown>;
}

function heldReviewsOf(task: Record<string, unknown>): BackgroundTask["held_reviews"] {
  const held = task.held_reviews;
  if (task.waiting !== true || task.scope !== "project" || !record(held) || !text(held.session_id, 500)
    || !Array.isArray(held.ids) || !held.ids.length || held.ids.length > BACKGROUND_TASK_MAX_HELD_REVIEWS
    || !held.ids.every(id => text(id, 200))) return undefined;
  return { session_id: held.session_id, ids: [...new Set(held.ids)] };
}

/** One task of an answer, or null when the provider sent something a page cannot draw or a kind it did not declare. */
export function backgroundTaskRow(task: unknown, source: Required<ActionReference>, origin: BackgroundTaskCollection["source"], kinds: readonly string[]): SourceTaskRow | null {
  if (!record(task)) return null;
  const subject = subjectOf(task.subject), executor = record(task.executor) ? task.executor : null;
  if (!subject || !kinds.includes(subject.kind) || typeof task.title !== "string" || task.title.length > 500 || !STATES.has(task.state as string) || typeof task.waiting !== "boolean" || !text(task.updated_at, 64)
    || !Array.isArray(task.details) || task.details.length > 8 || !Array.isArray(task.serves) || task.serves.length > 20 || !Array.isArray(task.commands) || !Array.isArray(task.decisions) || task.decisions.length > 10 || (task.scope !== "project" && task.scope !== "personal")
    || !executor || !["assistant", "character", "plugin", "platform"].includes(executor.kind as string) || !text(executor.label, 120)
    || (task.started_at !== undefined && !text(task.started_at, 64)) || (task.open !== null && !openOf(task.open)) || (task.reports_to !== undefined && task.reports_to !== "assistant")) return null;
  const details = task.details.map(phraseOf), serves = task.serves.map(subjectOf), step = task.step === undefined ? undefined : phraseOf(task.step);
  const decisions = task.decisions.map(decision => decisionOf(decision, source));
  if (details.includes(null) || serves.includes(null) || step === null || decisions.includes(null) || new Set(decisions.map(decision => decision!.id)).size !== decisions.length) return null;
  const held = heldReviewsOf(task);
  return { id: JSON.stringify([source.provider_id, source.capability_id, subject.kind, subject.id]), source, origin, subject, title: task.title, state: task.state as StateRingState,
    ...(step ? { step } : {}), details: details as BackgroundTaskPhrase[], waiting: task.waiting, ...(task.started_at === undefined ? {} : { started_at: task.started_at as string }), updated_at: task.updated_at,
    executor: { kind: executor.kind as BackgroundTask["executor"]["kind"], label: executor.label as string }, serves: serves as ActionSubject[], scope: task.scope,
    commands: task.commands.flatMap(command => { const offered = commandOf(command, source); return offered ? [offered] : []; }), decisions: decisions as BackgroundTaskDecision[], open: openOf(task.open),
    ...(held ? { held_reviews: held } : {}),
    ...(task.reports_to === "assistant" ? { reports_to: "assistant" as const } : {}) };
}

/** The rows of one provider's answer, or null when the answer as a whole cannot be read. */
export function backgroundTaskRows(output: unknown, source: Required<ActionReference>, kinds: readonly string[]): SourceTaskRow[] | null {
  const origin = backgroundTaskOrigin(output), tasks = record(output) && Array.isArray(output.tasks) ? output.tasks : null;
  if (!origin || !tasks) return null;
  return tasks.flatMap(task => { const row = backgroundTaskRow(task, source, origin, kinds); return row ? [row] : []; });
}

const isTaskProvider = (view: ActionView) => view.action.output_type === BACKGROUND_TASKS_OUTPUT_TYPE && isProjectReadQuery(view);
/** What the table reads: the task providers, and the owners of what runs on its own, whose missed runs wait on the person (WLN-39). */
const isTaskSource = (view: ActionView) => isTaskProvider(view) || isRunsSource(view);
const referenceOf = (view: ActionView): Required<ActionReference> => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const same = (a: ActionReference, b: Required<ActionReference>) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;

/** One slow provider cannot keep the reader waiting or hold another's answer behind it. */
async function beforeDeadline<T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>, milliseconds = 2_000, reason = "后台任务读取超时，请重试"): Promise<T> {
  const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds, reason: new ActionError("actions.timeout", reason) } });
  try { lifetime.assertActive(); return await lifetime.wait(work(lifetime.signal)); }
  finally { lifetime.dispose(); }
}

/** One source asked once, read-only and bounded: its rows after the check, or null when the answer as a whole cannot be read. */
async function rowsFrom(caller: ActionCallContext, client: Pick<ActionClient, "invoke">, view: ActionView, views: readonly ActionView[]): Promise<SourceTaskRow[] | null> {
  const source = referenceOf(view), ask = (input: unknown) => beforeDeadline(caller.signal, signal => client.invoke({ ...caller, query_only: true, signal }, source, input));
  if (isTaskProvider(view)) return backgroundTaskRows(await ask({}), source, view.action.subject_kinds ?? []);
  const decide = views.find(other => isRunDecisionOf(other, source));
  return backgroundTaskRows(missedRunTasks(await ask(missedRunsWindow()), decide && referenceOf(decide)), source, [MISSED_RUN_KIND]);
}

/**
 * `background.tasks.read@1`: every task provider of the caller's project, found once and asked in parallel, each call read-only and
 * bounded. A provider that is off in the project has nothing to report; one that cannot answer is an issue, by its code.
 */
export async function readBackgroundTasks(caller: ActionCallContext, client: ActionClient, discovered?: readonly ActionView[], reviews?: TaskReviewPorts): Promise<BackgroundTasksReadResult> {
  const reader: ActionCallContext = { ...caller, query_only: true };
  const views = discovered ?? await client.discover(reader);
  const answers = await Promise.all(views.filter(isTaskSource).map(async (view): Promise<{ tasks: BackgroundTaskRow[]; issues: MainlineIssue[] }> => {
    const source = referenceOf(view), issue = (code: string) => ({ tasks: [], issues: [{ source, title: view.action.title, code }] });
    if (!view.availability.available) return view.availability.code === "actions.plugin_disabled" ? { tasks: [], issues: [] } : issue(view.availability.code);
    try {
      const rows = await rowsFrom(caller, client, view, views);
      if (!rows) return issue("actions.output_invalid");
      const projected = reviews && rows.some(row => row.held_reviews)
        ? await beforeDeadline(caller.signal, signal => reviews.read({ ...reader, signal }, view.provider, rows)).catch(() => undefined)
        : undefined;
      caller.signal?.throwIfAborted();
      return { tasks: rows.map(({ held_reviews, ...row }) => ({ ...row, decisions: [
        ...row.decisions.filter(decision => !held_reviews?.ids.includes(decision.id)), ...projected?.get(row.id) ?? [],
      ] })), issues: [] };
    } catch (error) {
      caller.signal?.throwIfAborted();
      return issue(codeOf(error));
    }
  }));
  return { tasks: answers.flatMap(answer => answer.tasks).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)), issues: answers.flatMap(answer => answer.issues) };
}

/**
 * `background.tasks.command@1`: the provider the row came from is asked again, and the command is run only if that task still offers
 * exactly it (WLN-34). What a page shows is never trusted as the command: the action and input that run are the provider's own, read
 * in this call. The action is then called as the caller, so its own authorization and diagnostics apply.
 */
export async function runBackgroundTaskCommand(caller: ActionCallContext, client: ActionClient, request: BackgroundTaskCommandRequest): Promise<BackgroundTaskCommandResult> {
  const views = await client.discover(caller), view = views.find(candidate => isTaskSource(candidate) && same(request.source, referenceOf(candidate)));
  if (!view?.availability.available) throw mainlineErrors.source_changed("这个任务的提供方已不可用，请重新读取后台任务");
  const source = referenceOf(view);
  const rows = await rowsFrom(caller, client, view, views);
  const task = rows?.find(row => row.subject.kind === request.subject.kind && row.subject.id === request.subject.id);
  const asked = { ...request.command, action: { ...request.command.action, provider_id: request.command.action.provider_id ?? source.provider_id } };
  const command = task?.commands.find(offered => isDeepStrictEqual(offered, asked));
  if (!command) throw mainlineErrors.task_changed("任务已变化，或不再提供这条命令，请重新读取后再操作");
  const guarded: ActionCallContext = { ...caller, validate_authority: async reference => {
    await caller.validate_authority?.(reference);
    await caller.validate_authority?.(source);
  } };
  return { role: command.role, output: await client.invoke(guarded, command.action, command.input) };
}

/**
 * `background.tasks.decide@1` (WLN-10, PWA-135): the provider is asked again, and the answer is run only if the task still asks the
 * decision of that id and still offers an answer of that role. The Host resolves held reviews in its queue. For other decisions,
 * the provider supplies the action and input on this read. Only `revise` carries the person's words as `note`.
 */
export async function decideBackgroundTask(caller: ActionExecutionContext, client: ActionClient, request: BackgroundTaskDecideRequest, reviews?: TaskReviewPorts): Promise<BackgroundTaskDecideResult> {
  if ((request.role === "revise") !== (typeof request.note === "string" && request.note.trim().length > 0)) throw mainlineErrors.note_invalid("「改一下」要写上怎么改；同意和拒绝不带修改意见");
  const views = await client.discover(caller), view = views.find(candidate => isTaskSource(candidate) && same(request.source, referenceOf(candidate)));
  if (!view?.availability.available) throw mainlineErrors.source_changed("这个任务的提供方已不可用，请重新读取后台任务");
  const source = referenceOf(view);
  const sourceAuthority = request.review_version && caller.retainAuthority?.([source]);
  const readTask = async () => (await rowsFrom(caller, client, view, views))?.find(row => sameSubject(row.subject, request.subject));
  const task = await readTask();
  const changed = () => mainlineErrors.decision_changed("任务已不再问这一件，或不再给出这种回答，请重新读取后再操作");
  const held = task?.held_reviews;
  if (request.review_version !== undefined || held?.ids.includes(request.decision)) {
    if (!held?.ids.includes(request.decision) || !reviews || !sourceAuthority || !request.review_version || request.role === "revise" || request.note !== undefined) throw changed();
    const output = await reviews.decide(caller, view.provider, { id: request.decision, sessionId: held.session_id, version: request.review_version, role: request.role }, {
      authority: sourceAuthority,
      async checkTask() {
        const current = (await readTask())?.held_reviews;
        if (current?.session_id !== held.session_id || !current.ids.includes(request.decision)) throw changed();
      },
    });
    return { role: request.role, output };
  }
  const answer = task?.decisions.find(decision => decision.id === request.decision)?.answers.find(offered => offered.role === request.role);
  if (!answer) throw changed();
  const guarded: ActionCallContext = { ...caller, validate_authority: async reference => {
    await caller.validate_authority?.(reference);
    await caller.validate_authority?.(source);
  } };
  return { role: answer.role, output: await client.invoke(guarded, answer.action, answer.role === "revise" ? { ...answer.input, note: request.note!.trim() } : answer.input) };
}

/** An event registrant: a query with the event registry's two types (specs/work-line §5). There is no other list of registrants. */
export const isWorkEventSource = ({ action }: Pick<ActionView, "action">): boolean => action.input_type === WORK_EVENTS_INPUT_TYPE && action.output_type === WORK_EVENTS_OUTPUT_TYPE;

/** A registrant's event as a reader gets it, before it is placed. */
export type GatheredWorkEvent = WorkEvent & { id: string; source: Required<ActionReference>; origin: WorkEventCollection["source"] };
/** What one registrant said in a read, or why it said nothing. The error itself stays in the process: a reader that shows it chooses what of it to show. */
export interface WorkEventSourceAnswer {
  view: ActionView;
  source: Required<ActionReference>;
  events?: GatheredWorkEvent[];
  failure?: { kind: "unavailable"; code: string; reason: string } | { kind: "failed"; code: string; error: unknown };
}

/** A registrant gets longer than a task provider: it may read its own store for a day's window. */
const EVENT_SOURCE_MILLISECONDS = 5_000;

/**
 * Every given registrant asked once, in parallel, each bounded: the answers in the order the registrants were given. An event
 * id said twice, or an object kind the registrant did not declare, voids that registrant's answer. Nothing is discovered here:
 * the caller passes the registrants it found in its own directory, so a registrant it cannot see is not asked.
 */
export async function gatherWorkEvents(caller: ActionCallContext, client: Pick<ActionClient, "invoke">, window: WorkEventWindow, sources: readonly ActionView[]): Promise<WorkEventSourceAnswer[]> {
  assertWorkEventWindow(window);
  return await Promise.all(sources.map(async (view): Promise<WorkEventSourceAnswer> => {
    const source = referenceOf(view);
    if (!view.availability.available) return { view, source, failure: { kind: "unavailable", code: view.availability.code, reason: view.availability.reason } };
    try {
      const result = await beforeDeadline(caller.signal, signal => client.invoke({ ...caller, signal }, source, window), EVENT_SOURCE_MILLISECONDS, "事件读取超时，请重试") as WorkEventCollection;
      const ids = new Set<string>();
      for (const event of result.events) {
        if (ids.has(event.event_id) || !view.action.subject_kinds.includes(event.subject.kind)) throw new ActionError("actions.event_invalid", "插件事项身份重复或超出已声明的对象类型");
        ids.add(event.event_id);
      }
      return { view, source, events: result.events.map(event => ({ ...event, id: JSON.stringify([source.provider_id, source.capability_id, event.event_id]), source, origin: result.source })) };
    } catch (error) {
      caller.signal?.throwIfAborted();
      return { view, source, failure: { kind: "failed", code: codeOf(error), error } };
    }
  }));
}

const FAMILY: ReadonlyMap<string, string> = new Map(STATE_RING_FAMILIES.flatMap(family => family.states.map(state => [state, family.key] as const)));
/** A task not waiting on the person is under way while its ring is one of these looks; anything else has stopped moving. */
const UNDER_WAY: ReadonlySet<string> = new Set(["running", "waiting", "syncing", "retrying"]);
const WING = { occurred: "done", active: "now", today: "next" } as const;
const subjectKey = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;

/**
 * `mainline.line.read@1`: one discovery, then every registrant and the task table in parallel. Each event is placed by its owner,
 * moved beside now while a task behind it is under way or waits on the person, and ordered within its wing: what is done by when it
 * happened (newest nearest), what is ahead by when it starts or falls due (soonest nearest), what is beside now with what waits
 * first. A registrant that is off in the project says nothing; one that cannot answer is an issue by its code (WLN-37, WLN-38).
 */
export async function readWorkLine(caller: ActionCallContext, client: ActionClient, request: WorkLineReadRequest, items?: MainlineItemPorts, reviews?: TaskReviewPorts): Promise<WorkLineReadResult> {
  const { item: itemId, ...window } = request;
  assertWorkEventWindow(window);
  const reader: ActionCallContext = { ...caller, query_only: true };
  const directory = await client.discover(reader);
  if (itemId !== undefined && !items) throw mainlineErrors.source_unavailable("这里读不到主线的事项");
  const scope = itemId !== undefined ? await itemLineScope(caller, client, items!, itemId, directory) : undefined;
  const [answers, wholeTable] = await Promise.all([gatherWorkEvents(reader, client, window, directory.filter(isWorkEventSource)), readBackgroundTasks(caller, client, directory, reviews)]);
  const table = scope ? { ...wholeTable, tasks: wholeTable.tasks.filter(task => taskBelongsToItem(task, scope.item.item_id, scope.subjects)) } : wholeTable;
  const behind = new Map<string, BackgroundTaskRow[]>();
  for (const task of table.tasks) for (const served of task.serves) behind.set(subjectKey(served), [...behind.get(subjectKey(served)) ?? [], task]);
  const issues: MainlineIssue[] = answers.flatMap(answer => !answer.failure || answer.failure.code === "actions.plugin_disabled" ? [] : [{ source: answer.source, title: answer.view.action.title, code: answer.failure.code }]);
  const gathered = answers.flatMap(answer => answer.events ?? []).filter(event => !scope || inScope(scope, event.subject));
  if (scope) gathered.push(...await heldEvents(reader, client, scope, window, directory, gathered));
  const events = gathered.map((event): WorkLineEvent => {
    const tasks = behind.get(subjectKey(event.subject)) ?? [];
    const waiting = tasks.filter(task => task.waiting).length, running = tasks.filter(task => !task.waiting && UNDER_WAY.has(FAMILY.get(task.state) ?? "")).length;
    const state = waiting ? "answer" : running ? "running" : event.state;
    return { ...event, wing: waiting || running ? "now" : WING[event.placement], rank: 0, ...(state ? { line_state: state } : {}), waiting: event.needs_attention || waiting > 0,
      tasks: { running, waiting, refs: tasks.map(task => task.subject) } };
  });
  const ahead = (event: WorkLineEvent) => event.scheduled_at ?? event.occurred_at;
  const order: Record<WorkLineEvent["wing"], (a: WorkLineEvent, b: WorkLineEvent) => number> = {
    done: (a, b) => b.occurred_at.localeCompare(a.occurred_at),
    now: (a, b) => Number(b.waiting) - Number(a.waiting) || b.occurred_at.localeCompare(a.occurred_at),
    next: (a, b) => ahead(a).localeCompare(ahead(b)),
  };
  if (scope?.next) events.push(suggestionOf(scope, window, events));
  for (const wing of ["done", "now", "next"] as const) {
    events.filter(event => event.wing === wing).sort((a, b) => Number(!!b.suggestion) - Number(!!a.suggestion) || order[wing](a, b) || a.id.localeCompare(b.id)).forEach((event, rank) => { event.rank = rank; });
  }
  const WINGS = ["done", "now", "next"];
  return { events: events.sort((a, b) => WINGS.indexOf(a.wing) - WINGS.indexOf(b.wing) || a.rank - b.rank), table, issues: [...issues, ...table.issues, ...scope?.issues ?? []] };
}

const inScope = (scope: ItemLineScope, subject: ActionSubject) => scope.subjects.has(subjectKey(subject));

/** The task table as the mainline counts it (`mainline.read` with `counts`): waiting on the person, or under way by the line's own rule. */
export async function readItemTasks(caller: ActionCallContext, client: ActionClient, directory?: readonly ActionView[]) {
  const table = await readBackgroundTasks(caller, client, directory);
  return { tasks: table.tasks.map(task => ({ subject: task.subject, serves: task.serves, waiting: task.waiting, running: !task.waiting && UNDER_WAY.has(FAMILY.get(task.state) ?? "") })) };
}

/** The source's next step, first ahead of now; it opens where the source object opens on the line, when it is there. */
function suggestionOf(scope: ItemLineScope, window: WorkEventWindow, events: readonly WorkLineEvent[]): WorkLineEvent {
  const subject = scope.item.source!, step = scope.next!.step, on = events.find(event => sameSubject(event.subject, subject));
  return { event_id: `next:${subject.kind}:${subject.id}`.slice(0, 1000), subject, title: step.text, summary: step.waiting_on ?? "", content: "", facts: [], category: "personal",
    placement: "today", occurred_at: window.now, needs_attention: false, open: on?.open ?? null, id: JSON.stringify([scope.next!.source.provider_id, scope.next!.source.capability_id, subject.kind, subject.id]),
    source: scope.next!.source, origin: on?.origin ?? { surface: "mainline", title: subject.kind, icon: "next" }, wing: "next", rank: 0, waiting: false,
    tasks: { running: 0, waiting: 0, refs: [] }, suggestion: step };
}

/**
 * What an item holds that no registrant put on the line but whose owner's declaration gives it a time role: read from the owner's values
 * action once per kind. Due → ahead; happened → behind; a state asking a decision or an acceptance → beside now and waiting. Without
 * any of the three it is not on the line, only among the item's things.
 */
async function heldEvents(reader: ActionCallContext, client: ActionClient, scope: ItemLineScope, window: WorkEventWindow,
  directory: readonly ActionView[], already: readonly GatheredWorkEvent[]): Promise<GatheredWorkEvent[]> {
  const on = new Set(already.map(event => subjectKey(event.subject))), off = scope.held.filter(subject => !on.has(subjectKey(subject)));
  if (!off.length) return [];
  const declarations = scope.declarations, kinds = [...new Set(off.map(subject => subject.kind))];
  const found = await Promise.all(kinds.map(async kind => {
    const declared = declarations.find(object => object.kind === kind), view = declared && directory.find(candidate => candidate.availability.available
      && candidate.provider.provider_id === declared.provider_id && candidate.action.input_type === PRESENTATION_VALUES_INPUT_TYPE
      && candidate.action.output_type === PRESENTATION_VALUES_OUTPUT_TYPE && candidate.action.subject_kinds.includes(kind));
    if (!declared || !view) return [];
    const roles = timeRoles(declared);
    if (!roles.due && !roles.happened && !roles.status) return [];
    try {
      const values = await beforeDeadline(reader.signal, signal => client.invoke({ ...reader, signal }, referenceOf(view),
        { subjects: off.filter(subject => subject.kind === kind), fields: [...new Set([roles.title, roles.due, roles.happened, roles.status].filter((key): key is string => !!key))] }), EVENT_SOURCE_MILLISECONDS, "事项里的对象读取超时") as PresentationValues;
      return values.items.flatMap((entry): GatheredWorkEvent[] => {
        if ((entry.state !== "ok" && entry.state !== "stale") || !entry.values) return [];
        const value = (key?: string) => key ? entry.values![key] : undefined, text = (key?: string) => typeof value(key) === "string" ? value(key) as string : undefined;
        const due = text(roles.due), happened = text(roles.happened), state = text(roles.status), mapping = state !== undefined ? declared.status?.map[state] : undefined;
        const waiting = mapping?.attention === "needs_decision" || mapping?.attention === "needs_acceptance";
        if (!waiting && !due && !happened) return [];
        const placement = waiting ? "active" : happened && !due ? "occurred" : "today";
        return [{ event_id: `held:${entry.subject.id}`.slice(0, 1000), subject: entry.subject, title: (text(roles.title) ?? entry.subject.id).slice(0, 1000), summary: "", content: "", facts: [],
          category: "personal", placement, occurred_at: happened ?? due ?? window.now, ...(due ? { scheduled_at: due } : {}), ...(mapping ? { state: mapping.ring } : {}),
          needs_attention: waiting, open: null, id: JSON.stringify([view.provider.provider_id, view.capability_id, entry.subject.kind, entry.subject.id]),
          source: referenceOf(view), origin: { surface: "mainline", title: kind, icon: "item" } }];
      });
    } catch (error) { reader.signal?.throwIfAborted(); return []; }
  }));
  return found.flat();
}

/** The fields an object's declaration gives these roles: its title, when it falls due, when it happened, and its state. */
function timeRoles(declared: OwnedPresentationObject): { title?: string; due?: string; happened?: string; status?: string } {
  const role = (name: string) => declared.fields.find(field => field.role === name)?.key;
  return { title: role("title"), due: role("due_at"), happened: role("happened_at"), status: declared.status?.field };
}

/**
 * `attention.waiting.read@1`: what waits on the person, from one line read and the task table that comes with it, each object once
 * (WLN-39). An event that waits is one item, with the task that waits behind it when one does; a waiting task that serves no event
 * of the line is its own item. Newest first.
 */
export async function readWaiting(caller: ActionCallContext, client: ActionClient, window: WorkEventWindow): Promise<WaitingReadResult> {
  const line = await readWorkLine(caller, client, window), tasks = line.table.tasks;
  const waitingTasks = tasks.filter(task => task.waiting), onLine = new Set(line.events.map(event => subjectKey(event.subject)));
  const items: WaitingItem[] = line.events.filter(event => event.waiting).map(event => {
    const task = waitingTasks.find(candidate => candidate.serves.some(served => sameSubject(served, event.subject)));
    return { subject: event.subject, source: task ? "task" : "event", event_id: event.id, ...(task ? { task: task.subject } : {}), since: task?.updated_at ?? event.occurred_at, open: event.open };
  });
  for (const task of waitingTasks) {
    if (!task.serves.some(served => onLine.has(subjectKey(served)))) items.push({ subject: task.subject, source: "task", task: task.subject, since: task.updated_at, open: task.open });
  }
  items.sort((a, b) => b.since.localeCompare(a.since) || subjectKey(a.subject).localeCompare(subjectKey(b.subject)));
  return { items, counts: { total: items.length }, issues: line.issues };
}

/** What a part of the `serves` relation returns: the events the task is done for now. Anything else is not the owner's answer. */
function servesOf(output: unknown): ActionSubject[] {
  const serves = record(output) && Array.isArray(output.serves) && output.serves.length <= 20 ? output.serves.map(subjectOf) : null;
  if (!serves || serves.includes(null)) throw mainlineErrors.owner_answer_invalid("任务的主人给出的回答读不了，请稍后重试");
  return serves as ActionSubject[];
}

/**
 * `mainline.place@1`: the first placement of a task and every later change (specs/work-line §5, WLN-32, WLN-34). The owner of the
 * task kind is the one provider in the caller's directory that declares the `serves` relation for it; its `list` part is asked
 * first, so a task the caller may not read is refused by its owner before anything is changed. An event is accepted only if a
 * registrant the caller can read reports it in the window. The owner then records the change; nothing of it is kept here, and nothing
 * of the task's authority, budget or data scope is touched. With `item`, only the mainline's own `holds` relation changes.
 */
export async function placeTask(caller: ActionExecutionContext, client: ActionClient, request: TaskPlaceRequest, items?: MainlineItemPorts): Promise<TaskPlaceResult> {
  if (!request.to && !request.item) throw new ActionError("actions.input_invalid", "安放要说明为哪个事件办，或在哪件事项里");
  if (request.item) {
    if ((request.item.kind === "item") !== (request.item.item_id !== undefined)) throw new ActionError("actions.input_invalid", "放进事项要说明哪一件；不归事项时不带事项");
    if (!caller.permissions.includes(MAINLINE_ARRANGE_PERMISSION)) throw new ActionError("actions.forbidden", "缺少排列事项的权限");
    if (!items) throw mainlineErrors.source_unavailable("这里读不到主线的事项");
  }
  // One discovery for the whole placement: the owner's serves parts, and the task table that says the caller sees the task.
  const directory = await client.discover(caller);
  const visible = async () => (await readBackgroundTasks({ ...caller, query_only: true }, client, directory)).tasks.some(task => sameSubject(task.subject, request.task));
  // With both an event and an item, whatever the item would refuse is found before the owner records the event (B36F-06).
  if (request.to && request.item) await checkItemPlacement(caller, items!, request.task, request.item, visible);
  const placed = request.to ? await placeServes(caller, client, { ...request, to: request.to }, directory) : { task: request.task, serves: await currentServes(caller, client, request.task, directory) };
  // The second dimension: which work item it is in. Only `holds` changes; the task goes on as it was (WLN-32).
  if (!request.item) return placed;
  return { ...placed, items: await placeInItem(caller, items!, request.task, request.item, visible) };
}

/** What the task serves now, by its owner's `list` part; none when no owner keeps the relation for its kind. */
async function currentServes(caller: ActionCallContext, client: ActionClient, task: ActionSubject, directory: readonly ActionView[]): Promise<ActionSubject[]> {
  const reader: ActionCallContext = { ...caller, query_only: true };
  const list = directory.find(view => view.availability.available && view.action.placement_relation?.relation === TASK_SERVES_RELATION
    && view.action.placement_relation.role === "list" && view.action.subject_kinds.includes(task.kind));
  return list ? servesOf(await client.invoke(reader, referenceOf(list), { task })) : [];
}

async function placeServes(caller: ActionCallContext, client: ActionClient, request: TaskPlaceRequest & { to: NonNullable<TaskPlaceRequest["to"]> }, directory: readonly ActionView[]): Promise<TaskPlaceResult> {
  const { task, to } = request, reader: ActionCallContext = { ...caller, query_only: true };
  const parts = directory.filter(view => view.availability.available && view.action.placement_relation?.relation === TASK_SERVES_RELATION && view.action.subject_kinds.includes(task.kind));
  const owners = [...new Set(parts.map(view => view.provider.provider_id))];
  if (owners.length > 1) throw mainlineErrors.relation_ambiguous("有不止一个提供方声明保管这类任务与事件的关系，无法安放", { owners });
  const part = (role: TaskServesRole) => { const view = parts.find(candidate => candidate.action.placement_relation?.role === role); return view ? referenceOf(view) : null; };
  const list = part("list"), change = part(to.kind === "event" ? "bind" : to.kind === "new_event" ? "create" : "release");
  if (!list || !change) throw mainlineErrors.task_not_placeable("这个任务的主人不提供这种安放");
  if (to.kind === "event" ? !to.subject || !request.window : to.subject !== undefined) throw new ActionError("actions.input_invalid", "安放到事件要给出事件与当前的时间窗口，其余去处不带事件");
  const before = servesOf(await client.invoke(reader, list, { task }));
  if (to.kind === "event") {
    const event = to.subject!;
    const answers = await gatherWorkEvents(reader, client, request.window!, directory.filter(isWorkEventSource));
    if (!answers.some(answer => answer.events?.some(reported => sameSubject(reported.subject, event)))) throw mainlineErrors.event_unreadable("线上没有这个事件，或你读不到它");
    if (before.length === 1 && sameSubject(before[0]!, event)) return { task, serves: before };
  } else if (to.kind === "none" && !before.length) return { task, serves: [] };
  const writer = request.item ? withArrangePermission(caller) : caller;
  if (request.item) await caller.validate_permissions?.([MAINLINE_ARRANGE_PERMISSION]);
  const serves = servesOf(await client.invoke(writer, change, to.kind === "event" ? { task, event: to.subject } : { task }));
  const done = to.kind === "event" ? serves.length === 1 && sameSubject(serves[0]!, to.subject!) : to.kind === "none" ? serves.length === 0 : serves.length === 1;
  if (!done) throw mainlineErrors.owner_answer_invalid("任务的主人没有按要求记下去处，请重新读取后再试");
  return { task, serves };
}

/** Carry the combined request's permission into the task owner's own final effect check. */
function withArrangePermission(caller: ActionCallContext): ActionCallContext {
  const permissionsFor = (required: readonly string[] = []) => required.includes(MAINLINE_ARRANGE_PERMISSION)
    ? required : [...required, MAINLINE_ARRANGE_PERMISSION];
  return { ...caller,
    validate_permissions: required => caller.validate_permissions?.(permissionsFor(required)),
    assert_authority_current: (ref, required) => caller.assert_authority_current?.(ref, permissionsFor(required)),
  };
}

/**
 * Where an object opens (`objects.open@1`): the one reader of its kind is asked as the caller, and what it says under `open` is
 * the place, named as the reader names the object. An object the caller cannot read throws what the reader throws; nothing is kept.
 */
export async function openObject(caller: ActionCallContext, client: ActionClient, request: ObjectOpenRequest): Promise<ObjectOpenResult> {
  const { context } = await resolveActionSubject(client, caller, request.subject);
  const title = context.title.trim().slice(0, 1000) || request.subject.id.slice(0, 1000);
  return { subject: context.subject, title, target: context.open ? { kind: "item", surface: context.open.surface, id: context.open.id, title, label: uiText.text("workbench.mainline.open") } : null };
}
