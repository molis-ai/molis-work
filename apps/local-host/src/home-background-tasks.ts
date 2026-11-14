import { ActionError, BACKGROUND_TASKS_OUTPUT_TYPE, type ActionReference, type ActionSubject, type BackgroundTask, type BackgroundTaskCollection, type BackgroundTaskCommand, type BackgroundTaskPhrase, type OpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_RING_FAMILIES, type StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import { collectHomeAggregate, type HomeAggregatePorts } from "./home-aggregate.js";
import { repeatingFailure } from "./host-log.js";

/**
 * The background tasks of every open project (PG-043, specs/work-line §6): what the providers that declare a `home_aggregate`
 * query of this type say is being done or waits on the person, newest first. Nothing here names a plugin or reads a table: the
 * Home asks each project's provider through its action (S-49) and flattens the answers, keeping the project and the provider
 * each came from. A project that is not open lists nothing (the Home never opens one to read it); a plugin that is off or not
 * granted in a project is not called.
 */

/** A task as the page draws it: the provider's own row, with where it came from. */
export interface HomeBackgroundTaskRow extends BackgroundTask {
  /** The same for a provider's task across reads. */
  id: string;
  project_id: string;
  project_name: string;
  /** The provider that answered; each command's action is its own. */
  source: Required<ActionReference>;
  origin: BackgroundTaskCollection["source"];
}

const TOKEN = /^[a-zA-Z0-9_-]{1,64}$/;
const STATES: ReadonlySet<string> = new Set(STATE_RING_FAMILIES.flatMap(family => [...family.states]));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

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

/** One task of an answer, or null when the provider sent something the page cannot draw or a kind it did not declare. */
function rowOf(task: unknown, base: Pick<HomeBackgroundTaskRow, "project_id" | "project_name" | "source" | "origin">, kinds: readonly string[]): HomeBackgroundTaskRow | null {
  if (!record(task)) return null;
  const subject = subjectOf(task.subject), executor = record(task.executor) ? task.executor : null;
  if (!subject || !kinds.includes(subject.kind) || typeof task.title !== "string" || task.title.length > 500 || !STATES.has(task.state as string) || typeof task.waiting !== "boolean" || !text(task.updated_at, 64)
    || !Array.isArray(task.details) || task.details.length > 8 || !Array.isArray(task.serves) || task.serves.length > 20 || !Array.isArray(task.commands) || (task.scope !== "project" && task.scope !== "personal")
    || !executor || !["assistant", "character", "plugin", "platform"].includes(executor.kind as string) || !text(executor.label, 120)
    || (task.started_at !== undefined && !text(task.started_at, 64)) || (task.open !== null && !openOf(task.open))) return null;
  const details = task.details.map(phraseOf), serves = task.serves.map(subjectOf), step = task.step === undefined ? undefined : phraseOf(task.step);
  if (details.includes(null) || serves.includes(null) || step === null) return null;
  return { ...base, id: JSON.stringify([base.source.provider_id, base.source.capability_id, subject.kind, subject.id]), subject, title: task.title, state: task.state as StateRingState,
    ...(step ? { step } : {}), details: details as BackgroundTaskPhrase[], waiting: task.waiting, ...(task.started_at === undefined ? {} : { started_at: task.started_at as string }), updated_at: task.updated_at,
    executor: { kind: executor.kind as BackgroundTask["executor"]["kind"], label: executor.label as string }, serves: serves as ActionSubject[], scope: task.scope,
    commands: task.commands.flatMap(command => { const offered = commandOf(command, base.source); return offered ? [offered] : []; }), open: openOf(task.open) };
}

// Read on every attention poll: a project that cannot be read is written when it starts failing, and again once it has been read.
const unreadable = repeatingFailure("home", "background_tasks_unreadable");

export async function homeBackgroundTasks(ports: HomeAggregatePorts, projects: ReadonlyArray<{ project_id: string; display_name: string }>, signal?: AbortSignal): Promise<HomeBackgroundTaskRow[]> {
  const names = new Map(projects.map(project => [project.project_id, project.display_name]));
  const { answers, issues } = await collectHomeAggregate<BackgroundTaskCollection>(ports, BACKGROUND_TASKS_OUTPUT_TYPE, {}, signal);
  const rows: HomeBackgroundTaskRow[] = [];
  for (const answer of answers) {
    const origin = answer.output?.source;
    const tasks = Array.isArray(answer.output?.tasks) ? answer.output.tasks : null;
    const key = `${answer.project_id}:${answer.source.capability_id}`;
    if (!record(origin) || !text(origin.surface, 64) || !TOKEN.test(origin.surface) || !text(origin.title, 200) || !text(origin.icon, 64) || !TOKEN.test(origin.icon) || !tasks) {
      unreadable.failed(key, new ActionError("actions.output_invalid", "后台任务的回答读不了"), { project_id: answer.project_id }); continue;
    }
    unreadable.worked(key); unreadable.worked(`${answer.project_id}:`);
    const base = { project_id: answer.project_id, project_name: names.get(answer.project_id) ?? answer.project_id, source: answer.source, origin: { surface: origin.surface, title: origin.title, icon: origin.icon } };
    for (const task of tasks) { const row = rowOf(task, base, answer.subject_kinds); if (row) rows.push(row); }
  }
  for (const issue of issues) unreadable.failed(`${issue.project_id}:${issue.source?.capability_id ?? ""}`, new ActionError(issue.code, "后台任务读不出来"), { project_id: issue.project_id });
  return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id));
}
