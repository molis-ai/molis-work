import { ActionError, requireSynchronous, BACKGROUND_TASK_DONE_STATES, LOCAL_PERSON_ACTOR_ID, PERSONAL_SPACE_PROJECT_ID, RUN_MISSED_KEPT_MS, runExpiredUntold, type ActionCallContext,
  type RunsExpiryBounds } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_RING_FAMILIES, type StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";
import type { OverviewIndexRow, OverviewKind, OverviewOpen, OverviewReadResult, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { HomeBackgroundTaskRow, HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pluginHomeFor } from "./home-side.js";
import { existingPartitionPluginHost } from "./partition-plugin-host.js";
import { attentionOverviewLibrary, partitionOverviewLibraries, runningPartitionPlatformServices } from "./partition-platform-services.js";
import type { OverviewGrant, OverviewLibrary } from "@molis-ai/molis-work-service-search";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readBackgroundTasks } from "@molis-ai/molis-work-service-mainline";
import { localOwnerContext } from "./home-plugin-http.js";

/**
 * The Home's two lists across partitions, 「后台任务」 and 「定时运行」, read from the overview index alone (specs/unified-partition-plugins §6.1
 * 「主库摘要表」, V17, batch 108). Every row was written by its plugin with the business write it sums up, in the partition's own library or
 * in the platform's table in the partition's main database; here they are read read-only, the person's own read, and no partition is opened
 * or woken. What the Home keeps itself (when this Host started, what the person was last told about expired runs) is applied on top.
 */

/** A partition as the Home names it. */
export interface HomeOverviewPartition { readonly project_id: string; readonly display_name: string }

/**
 * Where the Home reads: its directory, and which plugins each partition has enabled now (the catalog's judgement, as a project's actions
 * are judged: `MolisWorkLocalHost.projectPluginReach`). A plugin not enabled in a partition contributes nothing there.
 */
export interface HomeOverviewSource {
  readonly home: string;
  readable?(caller: ActionCallContext, candidates: readonly string[]): readonly string[];
  reach(partitionId: string): Promise<(pluginId: string) => boolean | undefined>;
}

/** The Home's source as this Host serves it, or undefined before its catalog is bound. */
export function hostOverviewSource(host: Pick<MolisWorkLocalHost, "overviewHome" | "projectPluginReach"> & Partial<Pick<MolisWorkLocalHost, "overviewReadable">>): HomeOverviewSource | undefined {
  const home = host.overviewHome();
  return home ? { home, readable: host.overviewReadable?.bind(host), reach: partitionId => host.projectPluginReach(partitionId) } : undefined;
}

export const overviewPerson: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: [] };

/** The Manifests that may write rows of these kinds: the plugins this Host ships and those it runs per partition, each once. */
function overviewManifests(home: string, kinds: readonly OverviewKind[]): Map<string, PluginManifest> {
  const manifests = new Map<string, PluginManifest>();
  const host = existingPartitionPluginHost(home);
  for (const manifest of [...PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest), ...(host?.plugins() ?? []).flatMap(id => host?.manifestOf(id) ?? [])]) {
    if (manifests.has(manifest.plugin_id)) continue;
    if (manifest.overview_projection?.kinds.some(kind => kinds.includes(kind))) manifests.set(manifest.plugin_id, manifest);
  }
  return manifests;
}

/**
 * The rows of `kinds` in every partition, as the person may read them, with the Manifest of each row's plugin; null while this Host runs no
 * partition services (a command-line tool). A plugin not enabled in a partition contributes nothing there.
 */
export async function homeOverviewRows(source: HomeOverviewSource, partitions: readonly HomeOverviewPartition[], kinds: readonly OverviewKind[]):
  Promise<(OverviewReadResult & { readonly manifests: ReadonlyMap<string, PluginManifest>; readonly unavailable?: readonly string[]; readonly refreshing?: readonly string[] }) | null> {
  return overviewRowsFor(source, overviewPerson, partitions, () => [], { kinds, limit: 2_000 });
}

/**
 * The overview rows `caller` may read now in `partitions` (`overview-readers`): the libraries of the plugins enabled in each partition, and
 * each partition's "waiting on you" entries when notifications are asked for (R13). `grants` are the person's grants to the assistant, read
 * again before the rows are handed over. Rows the index still holds of an installation turned off since are not handed over. Null while this
 * Host runs no partition services.
 */
export async function overviewRowsFor(source: HomeOverviewSource, caller: ActionCallContext, partitions: readonly HomeOverviewPartition[],
  grants: () => readonly OverviewGrant[], query: { readonly kinds: readonly OverviewKind[]; readonly limit: number }):
  Promise<(OverviewReadResult & { readonly manifests: ReadonlyMap<string, PluginManifest>; readonly unavailable?: readonly string[]; readonly refreshing?: readonly string[] }) | null> {
  const { home } = source, services = runningPartitionPlatformServices(home);
  if (!services) return null;
  const ids = partitions.map(partition => partition.project_id);
  const readableNow = () => {
    requireSynchronous(caller.assert_authority_current?.());
    const scope = caller.readable_project_ids;
    const candidates = scope === undefined ? ids : ids.filter(id => scope.includes(id));
    return source.readable?.(caller, candidates) ?? candidates;
  };
  const initial = new Set(readableNow());
  const manifests = overviewManifests(home, query.kinds);
  const attention = query.kinds.includes("notification");
  const libraries: OverviewLibrary[] = (await Promise.all(partitions.filter(partition => initial.has(partition.project_id)).map(async partition => {
    const reaches = await source.reach(partition.project_id).catch(() => () => false);
    return [...partitionOverviewLibraries(home, [{ partition_id: partition.project_id,
      plugins: [...manifests.values()].flatMap(manifest => reaches(manifest.plugin_id) === true ? [{ install_id: installIdentity(manifest), manifest }] : []) }]),
      ...(attention ? [attentionOverviewLibrary(home, partition.project_id)] : [])];
  }))).flat();
  const enabled = new Set(libraries.map(library => `${library.partition_id}\u0000${library.install_id}`));
  const read = services.readOverview(caller, libraries, () => ({ readable: readableNow(), grants: grants() }), query);
  const rows = read.rows.filter(row => enabled.has(`${row.partition_id}\u0000${row.install_id}`));
  return { ...read, rows, manifests };
}

const familyOf = new Map<string, string>(STATE_RING_FAMILIES.flatMap(family => family.states.map(state => [state, family.key] as const)));
/** The states of a task being done or taking its turn: work a restart cuts short, and a reason not to put the project to sleep. */
const UNDER_WAY = new Set(["running", "waiting", "syncing", "retrying"]);
/** The states that hold only while this Host process runs: a row in one written before it started was cut off. */
const PROCESS_BOUND = new Set(["running", "answer", "paused"]);
/** How long an ended task that reports to the Assistant stays listed after it ended (`reports_to`). */
export const REPORTED_ENDED_SHOWN_MS = 10 * 60_000;

const stringField = (row: OverviewIndexRow, field: string): string | undefined => typeof row.fields[field as never] === "string" ? row.fields[field as never] as string : undefined;
const openOf = (row: OverviewIndexRow): OverviewOpen | undefined => {
  const open = row.fields.open as OverviewOpen | null | undefined;
  return open && typeof open.surface === "string" && typeof open.id === "string" ? open : undefined;
};
/** The state ring's word for a state, in the reader's language: the row's step, since the plugin's own words stay in its partition. */
function stateWord(state: string): { text: string } | undefined {
  const family = familyOf.get(state);
  if (!family) return undefined;
  const key = family === "running" || family === "done" ? `common.presentation.${family}` : `common.presentation.state.${family}`;
  try {
    const text = uiText.text(key);
    return text && text !== key ? { text } : undefined;
  } catch {
    return undefined;
  }
}
const iconOf = (manifest: PluginManifest): string => (manifest.ui?.views as ReadonlyArray<{ icon?: string }> | undefined)?.find(view => typeof view.icon === "string")?.icon ?? "apps";

/**
 * One `background_task` row as the Home lists it, or null when it is not listed: ended well, or ended and reported more than
 * {@link REPORTED_ENDED_SHOWN_MS} ago. A row under way from before `startedAt` (this Host's start) was cut off and reads as interrupted.
 */
export function homeBackgroundTaskOf(row: OverviewIndexRow, manifest: PluginManifest, partition: HomeOverviewPartition, startedAt: string | undefined, now: number): HomeBackgroundTaskRow | null {
  const title = stringField(row, "title"), updatedAt = stringField(row, "updated_at"), stored = stringField(row, "state");
  if (!title || !updatedAt || !stored) return null;
  const family = familyOf.get(stored) ?? "";
  const cutOff = startedAt !== undefined && PROCESS_BOUND.has(family) && updatedAt < startedAt;
  const state = (cutOff ? "interrupted" : stored) as StateRingState;
  if (BACKGROUND_TASK_DONE_STATES.has(state)) return null;
  const reportsTo = row.fields.reports_to === "assistant";
  if (reportsTo && (state === "failed" || state === "interrupted") && !(now - Date.parse(updatedAt) <= REPORTED_ENDED_SHOWN_MS)) return null;
  const subject = { kind: row.plugin_id, id: row.row_id }, open = openOf(row), startedField = stringField(row, "started_at");
  const surface = open?.surface ?? manifest.plugin_id;
  return {
    id: `${row.install_id}:${row.row_id}`, subject, title, state, ...(stateWord(state) ? { step: stateWord(state)! } : {}), details: [], waiting: !cutOff && row.fields.waiting === true,
    ...(startedField ? { started_at: startedField } : {}), updated_at: updatedAt,
    executor: { kind: "plugin", label: manifest.name }, serves: [subject], scope: partition.project_id === PERSONAL_SPACE_PROJECT_ID ? "personal" : "project",
    commands: [], decisions: [], open: open ? { kind: "item", surface: open.surface, id: open.id, title, label: title } : null,
    ...(reportsTo ? { reports_to: "assistant" as const } : {}),
    source: { capability_id: "", version: 0, provider_id: row.install_id }, origin: { surface, title: manifest.name, icon: iconOf(manifest) },
    project_id: partition.project_id, project_name: partition.display_name,
  };
}

type CollectedBackgroundTasks = HomeBackgroundTasksReadResult & { readonly refreshing?: readonly string[] };

/** The background tasks of every partition, newest first: what is being done or waits on the person (PG-043, V17). */
export async function homeBackgroundTasks(source: HomeOverviewSource, partitions: readonly HomeOverviewPartition[], now = Date.now()): Promise<CollectedBackgroundTasks> {
  const read = await homeOverviewRows(source, partitions, ["background_task"]);
  if (!read) return { tasks: [], issues: [] };
  const names = new Map(partitions.map(partition => [partition.project_id, partition])), startedAt = pluginHomeFor(source.home).startedAt;
  const tasks = read.rows.flatMap(row => {
    const manifest = read.manifests.get(row.plugin_id), partition = names.get(row.partition_id);
    const task = manifest && partition ? homeBackgroundTaskOf(row, manifest, partition, startedAt, now) : null;
    return task ? [task] : [];
  });
  return { tasks: tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id)), issues: (read.unavailable ?? []).map(project_id => ({ project_id, source: null, code: "actions.plugin_unavailable" })), ...(read.refreshing && { updating: true, refreshing: read.refreshing }) };
}

/**
 * The Home's list of background tasks as this Host serves it: every partition's overview rows, and the tasks of the Host's own providers
 * (the Assistant's work: not a plugin, so not in the overview, V17 point 5), asked as before in each project open now and never opening
 * one. Nothing before the Home catalog is bound.
 */
async function collectBackgroundTasks(host: MolisWorkLocalHost): Promise<CollectedBackgroundTasks> {
  const source = hostOverviewSource(host);
  if (!source) return { tasks: [], issues: [] };
  const partitions = await host.partitions(), names = new Map(partitions.map(partition => [partition.project_id, partition.display_name]));
  const opened = host.projects().filter(row => row.state !== "closing");
  const readable = new Set(host.overviewReadable(overviewPerson, opened.map(row => row.project_id)));
  const [overview, own] = await Promise.all([homeBackgroundTasks(source, partitions), Promise.all(opened.filter(row => readable.has(row.project_id)).map(async (reference): Promise<HomeBackgroundTasksReadResult> => {
    // A source that could not be read stays in the answer as an issue (QEA-14): an empty list alone never says there is no work.
    let read: Awaited<ReturnType<typeof readBackgroundTasks>>;
    try {
      read = await host.withProject(reference, async () => {
        const caller = await localOwnerContext(host, reference), client = host.actionClient(reference);
        const views = (await client.discover({ ...caller, query_only: true })).filter(view => view.provider.kind === "system");
        return readBackgroundTasks(caller, client, views);
      });
    } catch (error) {
      return { tasks: [], issues: [{ project_id: reference.project_id, source: null, code: error instanceof ActionError ? error.code : "actions.execution_failed" }] };
    }
    return {
      tasks: read.tasks.filter(row => !BACKGROUND_TASK_DONE_STATES.has(row.state))
        .map((row): HomeBackgroundTaskRow => ({ ...row, project_id: reference.project_id, project_name: names.get(reference.project_id) ?? reference.project_id })),
      issues: read.issues.map(issue => ({ project_id: reference.project_id, source: issue.source, code: issue.code })),
    };
  }))]);
  const tasks = [...overview.tasks, ...own.flatMap(part => part.tasks)];
  return { tasks: tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.project_id.localeCompare(b.project_id)),
    ...(overview.refreshing && { updating: true, refreshing: overview.refreshing }), issues: [...overview.issues, ...own.flatMap(part => part.issues)] };
}

/** Other attention sources can still be pending after the task providers answered. Apply live access at delivery. */
function currentBackgroundTasks(host: MolisWorkLocalHost, { tasks, issues, refreshing = [] }: CollectedBackgroundTasks): HomeBackgroundTasksReadResult {
  const ids = new Set([...refreshing, ...[...tasks, ...issues].map(row => row.project_id)]);
  if (!ids.size) return { tasks, issues };
  const allowed = new Set(host.overviewReadable(overviewPerson, [...ids]));
  return { tasks: tasks.filter(row => allowed.has(row.project_id)), issues: issues.filter(row => allowed.has(row.project_id)),
    ...(refreshing.some(id => allowed.has(id)) && { updating: true }) };
}

export async function hostBackgroundTasks(host: MolisWorkLocalHost): Promise<HomeBackgroundTasksReadResult> {
  return currentBackgroundTasks(host, await collectBackgroundTasks(host));
}

export function backgroundTaskAttention(host: MolisWorkLocalHost) {
  return { backgroundTasks: () => collectBackgroundTasks(host), currentBackgroundTasks: (result: HomeBackgroundTasksReadResult) => currentBackgroundTasks(host, result) };
}

/**
 * Whether something in the partition is under way, asked before it is put to sleep: the same rows the Home lists, for that partition
 * alone. Reading them opens nothing, so asking never keeps a partition awake by itself.
 */
export async function backgroundWorkUnderWay(source: HomeOverviewSource, partition: HomeOverviewPartition): Promise<boolean> {
  const { tasks, updating } = await homeBackgroundTasks(source, [partition]);
  return updating === true || tasks.some(task => UNDER_WAY.has(familyOf.get(task.state) ?? ""));
}

/** One owner of scheduled runs in one partition, as the runs panel names it: the plugin, and where its rows open. */
export interface HomeRunsOwner { readonly project_id: string; readonly plugin_id: string; readonly surface: string; readonly title: string }
export interface HomeRun { readonly run_id: string; readonly title: string; readonly due_at: string; readonly missed_at?: string; readonly needs: Array<"network" | "model">;
  readonly open: { surface: string; id: string } | null; readonly owner: HomeRunsOwner }

export interface HomeScheduledRuns { readonly refreshing?: readonly string[]; readonly unavailable?: readonly string[]; readonly updating?: boolean; readonly upcoming: HomeRun[]; readonly missed: HomeRun[]; readonly expired: ReadonlyMap<HomeRunsOwner, number>; readonly owners: readonly HomeRunsOwner[] }

/**
 * The partitions' scheduled runs (V17): what comes before `until`, what was missed in the last seven days and nobody decided on, and per
 * owner how many expired since the person was last told (`bounds`, from the Home's own marks by owner).
 */
export async function homeScheduledRuns(source: HomeOverviewSource, partitions: readonly HomeOverviewPartition[], window: { readonly now: Date; readonly until: Date },
  bounds: (owner: HomeRunsOwner) => RunsExpiryBounds): Promise<HomeScheduledRuns | null> {
  const read = await homeOverviewRows(source, partitions, ["scheduled_run"]);
  return read ? { ...scheduledRunsOf(read.rows, read.manifests, window, bounds), ...(read.unavailable && { unavailable: read.unavailable }), ...(read.refreshing && { updating: true, refreshing: read.refreshing }) } : null;
}

/** The same, from rows already read: each owner is a (partition, plugin), named by its Manifest. */
export function scheduledRunsOf(rows: readonly OverviewIndexRow[], manifests: ReadonlyMap<string, Pick<PluginManifest, "plugin_id" | "name">>,
  window: { readonly now: Date; readonly until: Date }, bounds: (owner: HomeRunsOwner) => RunsExpiryBounds): HomeScheduledRuns {
  const now = window.now.getTime(), until = window.until.getTime(), listedAfter = now - RUN_MISSED_KEPT_MS;
  const owners = new Map<string, HomeRunsOwner>(), upcoming: HomeRun[] = [], missed: HomeRun[] = [], expired = new Map<HomeRunsOwner, number>();
  for (const row of rows) {
    const manifest = manifests.get(row.plugin_id), title = stringField(row, "title"), dueAt = stringField(row, "due_at");
    if (row.kind !== "scheduled_run" || !manifest || !title || !dueAt) continue;
    const open = openOf(row), key = `${row.partition_id}\u0000${row.plugin_id}`;
    let owner = owners.get(key);
    if (!owner) owners.set(key, owner = { project_id: row.partition_id, plugin_id: row.plugin_id, surface: open?.surface ?? manifest.plugin_id, title: manifest.name });
    const needs = (Array.isArray(row.fields.needs) ? row.fields.needs : []).filter((need): need is "network" | "model" => need === "network" || need === "model");
    const run = { run_id: row.row_id, title, due_at: dueAt, needs, open: open ? { surface: open.surface, id: open.id } : null, owner };
    const missedAt = stringField(row, "missed_at"), due = Date.parse(dueAt);
    if (missedAt === undefined) {
      if (due > now && due <= until) upcoming.push(run);
    } else if (due > listedAfter) {
      missed.push({ ...run, missed_at: missedAt });
    } else if (runExpiredUntold({ due_at: dueAt, missed_at: missedAt }, bounds(owner))) {
      expired.set(owner, (expired.get(owner) ?? 0) + 1);
    }
  }
  return { upcoming, missed, expired, owners: [...owners.values()] };
}
