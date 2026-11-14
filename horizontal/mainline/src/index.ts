import { isDeepStrictEqual } from "node:util";
import { ActionError, BACKGROUND_TASKS_OUTPUT_TYPE, type ActionCallContext, type ActionClient, type ActionReference, type ActionSubject, type ActionView,
  type BackgroundTask, type BackgroundTaskCollection, type BackgroundTaskCommand, type BackgroundTaskPhrase, type OpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_RING_FAMILIES, type StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import { mainlineErrors, type BackgroundTaskCommandRequest, type BackgroundTaskCommandResult, type BackgroundTaskRow, type BackgroundTasksReadResult, type MainlineIssue } from "@molis-ai/molis-work-contracts/services/mainline";
import { createExecutionLifetime, isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";

// The mainline service (specs/work-line §5–§6): it finds a project's task providers in the caller's own directory, asks each once and
// checks every row before a page draws it. Nothing is stored: every call asks again, so a caller never gets what it may not read.

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

/** One slow provider cannot keep the panel waiting or hold another's answer behind it. */
async function beforeDeadline<T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds: 2_000, reason: new ActionError("actions.timeout", "后台任务读取超时，请重试") } });
  try { lifetime.assertActive(); return await lifetime.wait(work(lifetime.signal)); }
  finally { lifetime.dispose(); }
}

/**
 * `background.tasks.read@1`: every task provider of the caller's project, found once and asked in parallel, each call read-only and
 * bounded. A provider that is off in the project has nothing to report; one that cannot answer is an issue, by its code.
 */
export async function readBackgroundTasks(caller: ActionCallContext, client: ActionClient): Promise<BackgroundTasksReadResult> {
  const reader: ActionCallContext = { ...caller, query_only: true };
  const sources = (await client.discover(reader)).filter(isTaskSource);
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
