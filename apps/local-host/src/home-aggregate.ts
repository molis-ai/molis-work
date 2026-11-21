import { ActionError, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createExecutionLifetime, isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { attentionChanged } from "./attention-changes.js";

/**
 * What the Home gathers across projects (PG-043, S-49): the queries plugins declare `home_aggregate`, asked by their `output_type`,
 * one call per open project, each the person's own call in that project with that project's grants. Nothing about any plugin is known here.
 */

/** One provider's answer in one project. Answers are never merged: each keeps the project and the provider it came from. */
export interface HomeAggregateAnswer<Output> {
  readonly project_id: string;
  readonly source: Required<ActionReference>;
  /** The plugin behind the provider, when a plugin answered: where the Home opens what the answer names. */
  readonly plugin_id: string | null;
  /** The object kinds the provider declared it reports. */
  readonly subject_kinds: readonly string[];
  readonly output: Output;
  /** The project is asleep (batch 103-1): this is its answer from the last read before it slept, unchanged since nothing ran in it. */
  readonly resting?: true;
}

/** An answer that could not be read, by its code only: what a provider says in its error stays out (S-12). */
export interface HomeAggregateIssue {
  readonly project_id: string;
  /** Null when the project itself could not be read. */
  readonly source: Required<ActionReference> | null;
  readonly code: string;
}

export interface HomeAggregateResult<Output> { readonly answers: HomeAggregateAnswer<Output>[]; readonly issues: HomeAggregateIssue[] }

export interface HomeAggregatePorts {
  /** The projects open now; one already closing is not among them. */
  openProjects(): readonly LocalHostProjectReference[];
  /** Runs `work` while the project is kept open, or nothing once it is no longer open: reading an open project never reopens it. */
  whileOpen<T>(reference: LocalHostProjectReference, work: () => Promise<T>): Promise<T | undefined>;
  client(reference: LocalHostProjectReference): ActionClient;
  /** The person's context in that project; the grants in it are that project's installations' own. */
  context(reference: LocalHostProjectReference, signal?: AbortSignal): Promise<ActionCallContext>;
  /**
   * The projects that are not open (batch 103-1), when the Home reads those too (S-49). One put to sleep whose last read still holds (it
   * was not used since) is answered from that read, kept in memory only and marked `resting`. One not read since the Host started, or
   * used since its last read, is opened in the background, one at a time and without that counting as using it, to be read once; the
   * page hears of it (`changed`) and reads again. One closed on purpose (deleted, restored, synchronized) is neither read nor opened.
   * Absent: only open projects are read.
   */
  resting?: {
    closed(): Promise<readonly LocalHostProjectReference[]>;
    /** Whether the project was put to sleep, closed on purpose, or not opened since the Host started, and when it was last used. */
    rest(reference: LocalHostProjectReference): { state: "open" | "asleep" | "closed" | "never"; usedAt: number | undefined };
    wake<T>(reference: LocalHostProjectReference, work: () => Promise<T>): Promise<T>;
    /** Runs a read without it counting as use of the project (`ProjectLine.quietly`). */
    quietly<T>(work: () => Promise<T>): Promise<T>;
    /** A reading taken in the background: the Home page reads again. */
    changed(projectId: string): void;
    /** Whether the Host still takes work: the background pass stops when it does not. */
    running(): boolean;
    readings: RestingReadings;
  };
  /** Whether the project reaches the plugin behind a provider (Manifest id -> the platform's own exposure judgement); `undefined` when that is not the catalog's to judge. A Host with no catalog rejects, which the aggregate records as that project's issue. */
  projectPlugins(reference: LocalHostProjectReference): Promise<(pluginId: string) => boolean | undefined>;
}

const codeOf = (error: unknown) => error instanceof ActionError ? error.code : "actions.execution_failed";
// A project that began closing while it was read is passed over like one already closed.
const closing = (error: unknown) => codeOf(error) === "host.project_closing";
const same = (a: ActionReference, b: Required<ActionReference>) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;

/** One slow provider cannot keep the Home waiting or hold another project's answer behind it. */
export async function beforeDeadline<T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds: 2_000, reason: new ActionError("actions.timeout", "首页读取超时，请重试") } });
  try { lifetime.assertActive(); return await lifetime.wait(work(lifetime.signal)); }
  finally { lifetime.dispose(); }
}

/** An input made for each provider apart: `of` is given only the project and the provider it is for. Any other input goes to all alike. */
export class HomeAggregateInputEach {
  constructor(readonly of: (projectId: string, source: Required<ActionReference>) => unknown) {}
}

export async function collectHomeAggregate<Output>(ports: HomeAggregatePorts, outputType: string, input: unknown, signal?: AbortSignal): Promise<HomeAggregateResult<Output>> {
  signal?.throwIfAborted();
  const resting = ports.resting;
  if (!resting) {
    const projects = await Promise.all(ports.openProjects().map(reference => readProject<Output>(ports, reference, ports.whileOpen, outputType, input, signal)));
    return { answers: projects.flatMap(result => result.answers), issues: projects.flatMap(result => result.issues) };
  }
  const kind = JSON.stringify([outputType, input instanceof HomeAggregateInputEach ? "each" : input ?? null]);
  const remember = (reference: LocalHostProjectReference, usedAt: number | undefined, result: HomeAggregateResult<unknown>) => {
    let kept = resting.readings.projects.get(reference.storage_key);
    if (!kept) resting.readings.projects.set(reference.storage_key, kept = new Map());
    kept.set(kind, { usedAt, result });
  };
  const readOpen = async (reference: LocalHostProjectReference) => {
    const usedAt = resting.rest(reference).usedAt;
    const result = await resting.quietly(() => readProject<Output>(ports, reference, ports.whileOpen, outputType, input, signal));
    // Used meanwhile by someone else: what it says now may already be older than the project.
    if (resting.rest(reference).usedAt === usedAt) remember(reference, usedAt, result);
    return result;
  };
  const [open, closed] = await Promise.all([Promise.all(ports.openProjects().map(readOpen)), resting.closed()]);
  const known = new Set([...ports.openProjects(), ...closed].map(reference => reference.storage_key));
  for (const storageKey of resting.readings.projects.keys()) if (!known.has(storageKey)) resting.readings.projects.delete(storageKey);
  const kept: HomeAggregateResult<Output>[] = [], unread: LocalHostProjectReference[] = [];
  for (const reference of closed) {
    const { state, usedAt } = resting.rest(reference);
    // Opened since the list was read: the next read reads it open.
    if (state === "closed" || state === "open") continue;
    const reading = resting.readings.projects.get(reference.storage_key)?.get(kind);
    // Unchanged since it was read: asleep and not used since, or one that would not open then and has not opened since.
    if (reading && reading.usedAt === usedAt) {
      kept.push({ answers: (reading.result as HomeAggregateResult<Output>).answers.map(answer => ({ ...answer, resting: true as const })), issues: reading.result.issues });
    } else unread.push(reference);
  }
  if (unread.length) readInBackground(resting, unread, kind, remember, reference => readProject<unknown>(ports, reference, resting.wake, outputType, input, undefined));
  const projects = [...open, ...kept];
  return { answers: projects.flatMap(result => result.answers), issues: projects.flatMap(result => result.issues) };
}

/** What the Home last read of each project, by library and by what was asked; and the background pass taking the missing ones. */
export interface RestingReadings {
  readonly projects: Map<string, Map<string, { usedAt: number | undefined; result: HomeAggregateResult<unknown> }>>;
  readonly waking: Set<string>;
  pass: Promise<void>;
}

/**
 * Opens each project in turn, quietly, to read it once, then lets the page know. A project already being read for the same question is
 * not queued twice; one opened, closed on purpose or no longer there by its turn is passed over. A read that ran out of time on a project
 * just opened is tried once more, since the first read after opening is the slow one.
 */
function readInBackground(resting: NonNullable<HomeAggregatePorts["resting"]>, references: LocalHostProjectReference[], kind: string,
  remember: (reference: LocalHostProjectReference, usedAt: number | undefined, result: HomeAggregateResult<unknown>) => void,
  read: (reference: LocalHostProjectReference) => Promise<HomeAggregateResult<unknown>>): void {
  for (const reference of references) {
    const id = JSON.stringify([reference.storage_key, kind]);
    if (resting.readings.waking.has(id)) continue;
    resting.readings.waking.add(id);
    resting.readings.pass = resting.readings.pass.then(async () => {
      try {
        const before = resting.rest(reference).state;
        if (!resting.running() || before === "open" || before === "closed") return;
        let result = await resting.quietly(() => read(reference));
        if (result.issues.some(issue => issue.code === "actions.timeout")) result = await resting.quietly(() => read(reference));
        const { usedAt } = resting.rest(reference);
        remember(reference, usedAt, result);
        resting.changed(reference.project_id);
      } catch { /* the next read tries again */ }
      finally { resting.readings.waking.delete(id); }
    });
  }
}

/** One project's answers, read inside `enter` (only while open, or opened to be read). */
async function readProject<Output>(ports: HomeAggregatePorts, reference: LocalHostProjectReference, enter: HomeAggregatePorts["whileOpen"],
  outputType: string, input: unknown, signal: AbortSignal | undefined): Promise<HomeAggregateResult<Output>> {
  const project_id = reference.project_id;
  let catalogIssue: HomeAggregateIssue | null = null;
  let reaches: (pluginId: string) => boolean | undefined = () => undefined;
  try {
    // The exposure judgement comes from the catalog, which a project's own open window may hold: get it before entering.
    reaches = await ports.projectPlugins(reference);
  } catch (error) {
    signal?.throwIfAborted();
    // A catalog failure is that project's issue; it does not cost the answers the other sources can still give. The judgement
    // stays undefined, so plugin_disabled keeps the old silent rule and unavailable sources with other codes are still shown.
    catalogIssue = closing(error) ? null : { project_id, source: null, code: codeOf(error) };
  }
  try {
    const result = await enter(reference, async (): Promise<HomeAggregateResult<Output>> => {
      const collection = createExecutionLifetime({ signal });
      try {
        const client = ports.client(reference);
        const { caller, views } = await beforeDeadline(collection.signal, async discoverySignal => {
          // Queries and all their nested calls remain read-only; discovery has its own bound too.
          const caller: ActionCallContext = { ...await ports.context(reference, collection.signal), query_only: true };
          discoverySignal.throwIfAborted();
          return { caller, views: await client.discover({ ...caller, signal: discoverySignal }) };
        });
        const results = await Promise.all(views.map(async (view: typeof views[number]): Promise<HomeAggregateResult<Output>> => {
          const empty = { answers: [], issues: [] };
          if (view.action.output_type !== outputType || !isHomeAggregateQuery(view)) return empty;
          const source = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
          if (caller.allowed_actions && !caller.allowed_actions.some(allowed => same(allowed, source))) return empty;
          if (!view.availability.available) {
            const pluginId = view.provider.plugin_id;
            // Not in this project's plugin manifest is not installed here, so it has nothing to report; listed but unavailable (turned
            // off, or refused by policy) is what the person needs to see. A platform provider has no plugin and keeps the old rule.
            const judged = pluginId === undefined ? undefined : reaches(pluginId);
            // Main already showed every unavailable source but `plugin_disabled`; the judgement only decides that ambiguous code:
            // the project reaches the plugin => shown, it does not => not installed here, `undefined` => keep the old silent skip.
            return view.availability.code !== "actions.plugin_disabled" || judged === true
              ? { answers: [], issues: [{ project_id, source, code: view.availability.code }] } : empty;
          }
          try {
            const output = await beforeDeadline(collection.signal, providerSignal => client.invoke({ ...caller, signal: providerSignal }, source, input instanceof HomeAggregateInputEach ? input.of(project_id, source) : input)) as Output;
            return { answers: [{ project_id, source, plugin_id: view.provider.plugin_id ?? null, subject_kinds: view.action.subject_kinds ?? [], output }], issues: [] };
          } catch (error) {
            signal?.throwIfAborted();
            return { answers: [], issues: closing(error) ? [] : [{ project_id, source, code: codeOf(error) }] };
          }
        }));
        return { answers: results.flatMap(result => result.answers), issues: results.flatMap(result => result.issues) };
      } finally { collection.dispose(); }
    }) ?? { answers: [], issues: [] };
    return catalogIssue ? { answers: result.answers, issues: [catalogIssue, ...result.issues] } : result;
  } catch (error) {
    signal?.throwIfAborted();
    return { answers: [], issues: closing(error) ? [] : [
      ...(catalogIssue ? [catalogIssue] : []), { project_id, source: null, code: codeOf(error) },
    ] };
  }
}

/** The ports over this Host: its open projects, and the local person's own context in each, as the Web uses it. */
export function homeAggregatePorts(host: MolisWorkLocalHost): HomeAggregatePorts {
  const open = (projectId: string) => host.projects().some(row => row.project_id === projectId && row.state !== "closing");
  return {
    openProjects: () => host.projects().filter(row => row.state !== "closing"),
    // Checked and entered in the same turn: once inside, the project stays open until the work ends, and a close begun meanwhile refuses new calls.
    whileOpen: (reference, work) => open(reference.project_id) ? host.withProject(reference, work) : Promise.resolve(undefined),
    client: reference => host.actionClient(reference),
    context: (reference, signal) => localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS, signal),
    projectPlugins: reference => host.projectPluginReach(reference.project_id),
    resting: {
      closed: () => host.closedProjects(),
      rest: reference => host.projectRest(reference.storage_key),
      wake: (reference, work) => host.withProject(reference, work),
      quietly: work => host.quietly(work),
      changed: projectId => attentionChanged(projectId),
      running: () => host.lifecycle() === "running",
      readings: readingsOf(host),
    },
  };
}

/** What the Home last read of each project, in memory for the Host's life: a project asleep is shown by it (batch 103-1). */
const readings = new WeakMap<MolisWorkLocalHost, RestingReadings>();
const readingsOf = (host: MolisWorkLocalHost) => {
  let kept = readings.get(host);
  if (!kept) readings.set(host, kept = { projects: new Map(), waking: new Set(), pass: Promise.resolve() });
  return kept;
};
