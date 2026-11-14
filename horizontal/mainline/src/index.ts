import { isDeepStrictEqual } from "node:util";
import { ActionError, BACKGROUND_TASKS_OUTPUT_TYPE, WORK_EVENTS_INPUT_TYPE, WORK_EVENTS_OUTPUT_TYPE, assertWorkEventWindow, type ActionCallContext, type ActionClient, type ActionReference,
  type ActionSubject, type ActionView, type BackgroundTask, type BackgroundTaskCollection, type BackgroundTaskCommand, type BackgroundTaskPhrase, type OpenTarget, type WorkEvent,
  type WorkEventCollection, type WorkEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_RING_FAMILIES, type StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import { mainlineErrors, type BackgroundTaskCommandRequest, type BackgroundTaskCommandResult, type BackgroundTaskRow, type BackgroundTasksReadResult, type MainlineIssue, type WorkLineEvent,
  type WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { createExecutionLifetime, isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";

// The mainline service (specs/work-line §5–§6): it finds a project's event registrants and task providers in the caller's own
// directory, asks each once and checks every row before a page draws it. Nothing is stored: every call asks again, so a caller
// never gets what it may not read.

const TOKEN = /^[a-zA-Z0-9_-]{1,64}$/;
const STATES: ReadonlySet<string> = new Set(STATE_RING_FAMILIES.flatMap(family => [...family.states]));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const codeOf = (error: unknown) => error instanceof ActionError ? error.code : "actions.execution_failed";

function phraseOf(value: unknown): BackgroundTaskPhrase | null {
  if (!record(value) || !text(value.text, 200) || (value.count !== undefined && !Number.isSafeInteger(value.count))) return null;
  return { text: value.text, ...(value.count === undefined ? {} : { count: value.count as number }) };
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
function commandOf(value: unknown, source: Required<ActionReference>): BackgroundTaskCommand | null {
  if (!record(value) || !["stop", "pause", "resume"].includes(value.role as string) || typeof value.summary !== "string" || value.summary.length > 1000 || !record(value.input) || !record(value.action)) return null;
  const { capability_id, version, provider_id } = value.action;
  if (!text(capability_id, 200) || !Number.isSafeInteger(version) || (version as number) < 1 || (provider_id !== undefined && provider_id !== source.provider_id)) return null;
  return { role: value.role as BackgroundTaskCommand["role"], action: { capability_id, version: version as number, provider_id: source.provider_id }, input: value.input, summary: value.summary };
}

/** Who answered, as the answer names itself, or null when it is not a plain surface, name and glyph. */
export function backgroundTaskOrigin(output: unknown): BackgroundTaskCollection["source"] | null {
  const origin = record(output) ? output.source : null;
  return record(origin) && text(origin.surface, 64) && TOKEN.test(origin.surface) && text(origin.title, 200) && text(origin.icon, 64) && TOKEN.test(origin.icon)
    ? { surface: origin.surface, title: origin.title, icon: origin.icon } : null;
}

/** One task of an answer, or null when the provider sent something a page cannot draw or a kind it did not declare. */
export function backgroundTaskRow(task: unknown, source: Required<ActionReference>, origin: BackgroundTaskCollection["source"], kinds: readonly string[]): BackgroundTaskRow | null {
  if (!record(task)) return null;
  const subject = subjectOf(task.subject), executor = record(task.executor) ? task.executor : null;
  if (!subject || !kinds.includes(subject.kind) || typeof task.title !== "string" || task.title.length > 500 || !STATES.has(task.state as string) || typeof task.waiting !== "boolean" || !text(task.updated_at, 64)
    || !Array.isArray(task.details) || task.details.length > 8 || !Array.isArray(task.serves) || task.serves.length > 20 || !Array.isArray(task.commands) || (task.scope !== "project" && task.scope !== "personal")
    || !executor || !["assistant", "character", "plugin", "platform"].includes(executor.kind as string) || !text(executor.label, 120)
    || (task.started_at !== undefined && !text(task.started_at, 64)) || (task.open !== null && !openOf(task.open))) return null;
  const details = task.details.map(phraseOf), serves = task.serves.map(subjectOf), step = task.step === undefined ? undefined : phraseOf(task.step);
  if (details.includes(null) || serves.includes(null) || step === null) return null;
  return { id: JSON.stringify([source.provider_id, source.capability_id, subject.kind, subject.id]), source, origin, subject, title: task.title, state: task.state as StateRingState,
    ...(step ? { step } : {}), details: details as BackgroundTaskPhrase[], waiting: task.waiting, ...(task.started_at === undefined ? {} : { started_at: task.started_at as string }), updated_at: task.updated_at,
    executor: { kind: executor.kind as BackgroundTask["executor"]["kind"], label: executor.label as string }, serves: serves as ActionSubject[], scope: task.scope,
    commands: task.commands.flatMap(command => { const offered = commandOf(command, source); return offered ? [offered] : []; }), open: openOf(task.open) };
}

/** The rows of one provider's answer, or null when the answer as a whole cannot be read. */
export function backgroundTaskRows(output: unknown, source: Required<ActionReference>, kinds: readonly string[]): BackgroundTaskRow[] | null {
  const origin = backgroundTaskOrigin(output), tasks = record(output) && Array.isArray(output.tasks) ? output.tasks : null;
  if (!origin || !tasks) return null;
  return tasks.flatMap(task => { const row = backgroundTaskRow(task, source, origin, kinds); return row ? [row] : []; });
}

const isTaskSource = (view: ActionView) => view.action.output_type === BACKGROUND_TASKS_OUTPUT_TYPE && isHomeAggregateQuery(view);
const referenceOf = (view: ActionView): Required<ActionReference> => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const same = (a: ActionReference, b: Required<ActionReference>) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;

/** One slow provider cannot keep the reader waiting or hold another's answer behind it. */
async function beforeDeadline<T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>, milliseconds = 2_000, reason = "后台任务读取超时，请重试"): Promise<T> {
  const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds, reason: new ActionError("actions.timeout", reason) } });
  try { lifetime.assertActive(); return await lifetime.wait(work(lifetime.signal)); }
  finally { lifetime.dispose(); }
}

/**
 * `background.tasks.read@1`: every task provider of the caller's project, found once and asked in parallel, each call read-only and
 * bounded. A provider that is off in the project has nothing to report; one that cannot answer is an issue, by its code.
 */
export async function readBackgroundTasks(caller: ActionCallContext, client: ActionClient, discovered?: readonly ActionView[]): Promise<BackgroundTasksReadResult> {
  const reader: ActionCallContext = { ...caller, query_only: true };
  const sources = (discovered ?? await client.discover(reader)).filter(isTaskSource);
  const answers = await Promise.all(sources.map(async (view): Promise<{ tasks: BackgroundTaskRow[]; issues: MainlineIssue[] }> => {
    const source = referenceOf(view), issue = (code: string) => ({ tasks: [], issues: [{ source, title: view.action.title, code }] });
    if (!view.availability.available) return view.availability.code === "actions.plugin_disabled" ? { tasks: [], issues: [] } : issue(view.availability.code);
    try {
      const output = await beforeDeadline(caller.signal, signal => client.invoke({ ...reader, signal }, source, {}));
      const rows = backgroundTaskRows(output, source, view.action.subject_kinds ?? []);
      return rows ? { tasks: rows, issues: [] } : issue("actions.output_invalid");
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
  const view = (await client.discover(caller)).find(candidate => isTaskSource(candidate) && same(request.source, referenceOf(candidate)));
  if (!view?.availability.available) throw mainlineErrors.source_changed("这个任务的提供方已不可用，请重新读取后台任务");
  const source = referenceOf(view);
  const rows = backgroundTaskRows(await beforeDeadline(caller.signal, signal => client.invoke({ ...caller, query_only: true, signal }, source, {})), source, view.action.subject_kinds ?? []);
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

/**
 * `mainline.line.read@1`: one discovery, then every registrant and the task table in parallel. Each event is placed by its owner,
 * moved beside now while a task behind it is under way or waits on the person, and ordered within its wing: what is done by when it
 * happened (newest nearest), what is ahead by when it starts or falls due (soonest nearest), what is beside now with what waits
 * first. A registrant that is off in the project says nothing; one that cannot answer is an issue by its code (WLN-37, WLN-38).
 */
export async function readWorkLine(caller: ActionCallContext, client: ActionClient, window: WorkEventWindow): Promise<WorkLineReadResult> {
  assertWorkEventWindow(window);
  const reader: ActionCallContext = { ...caller, query_only: true };
  const directory = await client.discover(reader);
  const [answers, table] = await Promise.all([gatherWorkEvents(reader, client, window, directory.filter(isWorkEventSource)), readBackgroundTasks(caller, client, directory)]);
  const behind = new Map<string, BackgroundTaskRow[]>();
  for (const task of table.tasks) for (const served of task.serves) behind.set(subjectKey(served), [...behind.get(subjectKey(served)) ?? [], task]);
  const issues: MainlineIssue[] = answers.flatMap(answer => !answer.failure || answer.failure.code === "actions.plugin_disabled" ? [] : [{ source: answer.source, title: answer.view.action.title, code: answer.failure.code }]);
  const events = answers.flatMap(answer => answer.events ?? []).map((event): WorkLineEvent => {
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
  for (const wing of ["done", "now", "next"] as const) {
    events.filter(event => event.wing === wing).sort((a, b) => order[wing](a, b) || a.id.localeCompare(b.id)).forEach((event, rank) => { event.rank = rank; });
  }
  const WINGS = ["done", "now", "next"];
  return { events: events.sort((a, b) => WINGS.indexOf(a.wing) - WINGS.indexOf(b.wing) || a.rank - b.rank), issues: [...issues, ...table.issues] };
}
