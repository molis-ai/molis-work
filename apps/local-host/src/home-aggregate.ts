import { ActionError, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createExecutionLifetime, isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";
import { attentionChanged } from "./attention-changes.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import {
  deleteProjectRestingSnapshots,
  prunePersistedRestingSnapshots,
  readProjectRestingSnapshots,
  type RestingReadingSnapshot,
  unreadableFileIdentity,
  writeProjectRestingSnapshots,
} from "./resting-readings-store.js";

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
  /** The project is asleep: this is its answer from the last read before it slept, unchanged since nothing ran in it. */
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

export interface HomeAggregateOptions<Output> {
  /** Reduces provider output to the Home summary before it is returned or kept as a resting reading. */
  readonly projectOutput?: (output: Output) => Output;
  /** Whether a reading of this output type may be persisted across restarts (transient issues are always excluded). */
  readonly persistable?: (result: HomeAggregateResult<Output>) => boolean;
  /** Whether a cached resting reading still holds right now (e.g. no upcoming run has become due, no under-way task). */
  readonly stillValid?: (result: HomeAggregateResult<Output>) => boolean;
}

/** Optional persistence and live-fingerprint validation port for resting readings across Host restarts. */
export interface RestingReadingsPersistence {
  /** Whether persistence is currently active for this Host (requires Home directory and catalog). */
  active?(): boolean;
  /** Waits for any in-flight sleep persistence on these projects to complete before checking their fingerprints. */
  awaitPending?(closed: readonly LocalHostProjectReference[], signal?: AbortSignal): Promise<void>;
  /** Live validity fingerprints for a batch of closed projects, keyed by `storage_key`. Null means invalid / unreadable. */
  fingerprints(closed: readonly LocalHostProjectReference[]): Promise<ReadonlyMap<string, string | null>>;
  /** Non-fingerprint stat identity when `fingerprints` returns null, so unopenable projects do not thrash every poll. */
  observedToken?(reference: LocalHostProjectReference): string;
  /** Loads persisted resting snapshots for one project from the Home cache, or null on miss/corruption. */
  load(reference: LocalHostProjectReference): Map<string, RestingReadingSnapshot> | null;
  /** Removes one project's persisted resting cache file. */
  remove(storageKey: string): void;
  /** Removes persisted cache files for projects no longer present in the catalog. */
  prune(knownStorageKeys: ReadonlySet<string>): void;
}

export interface HomeAggregatePorts {
  /** The projects open now; one already closing is not among them. */
  openProjects(): readonly LocalHostProjectReference[];
  /** Runs `work` while the project is kept open, or nothing once it is no longer open: reading an open project never reopens it. */
  whileOpen<T>(reference: LocalHostProjectReference, work: () => Promise<T>): Promise<T | undefined>;
  client(reference: LocalHostProjectReference): ActionClient;
  /** The person's context in that project; the grants in it are that project's installations' own. */
  context(reference: LocalHostProjectReference, signal?: AbortSignal): Promise<ActionCallContext>;
  /**
   * The projects that are not open, when the Home reads those too (S-49). One put to sleep (or reopened after restart) whose
   * last read still holds — unchanged database, plugin membership, Home plugin grants, and input keys — is answered from that
   * read, marked `resting`, without opening or calling the project. One missing a valid reading, or changed since, is opened in
   * the background one at a time without counting as use; the page hears of it (`changed`) and reads again. One closed on purpose
   * (deleted, restored, synchronized) is cleared and neither read nor opened. Absent: only open projects are read.
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
    persistence?: RestingReadingsPersistence;
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
  /**
   * `keyOf`: what of the input an answer depends on, for a project asleep: its last answer is shown while the key is the
   * same, and read again once it differs. Without it, an input made per call (a time window, say) has no answer to show for a sleeping
   * project, and the Home leaves such projects out of that read.
   */
  constructor(readonly of: (projectId: string, source: Required<ActionReference>) => unknown,
    readonly keyOf?: (projectId: string, source: Required<ActionReference>) => string) {}
}

export async function collectHomeAggregate<Output>(
  ports: HomeAggregatePorts,
  outputType: string,
  input: unknown,
  signal?: AbortSignal,
  options?: HomeAggregateOptions<Output>,
): Promise<HomeAggregateResult<Output>> {
  signal?.throwIfAborted();
  const resting = ports.resting;
  const read = (reference: LocalHostProjectReference, enter: HomeAggregatePorts["whileOpen"], readSignal?: AbortSignal) =>
    readProject<Output>(ports, reference, enter, outputType, input, readSignal, options?.projectOutput);
  if (!resting) {
    const projects = await Promise.all(ports.openProjects().map(reference => read(reference, ports.whileOpen, signal)));
    return { answers: projects.flatMap(result => result.answers), issues: projects.flatMap(result => result.issues) };
  }
  const each = input instanceof HomeAggregateInputEach ? input : undefined;
  if (each && !each.keyOf) {
    const projects = await Promise.all(ports.openProjects().map(reference => resting.quietly(() => read(reference, ports.whileOpen, signal))));
    return { answers: projects.flatMap(result => result.answers), issues: projects.flatMap(result => result.issues) };
  }
  const kind = restingKind(outputType, input);
  const canPersist = (result: HomeAggregateResult<unknown>): boolean =>
    isPersistableReading(result) && (options?.persistable ? options.persistable(result as HomeAggregateResult<Output>) : true);
  // What of the input each answer of the reading depended on (`HomeAggregateInputEach.keyOf`), by its source.
  const keysOf = (projectId: string, result: HomeAggregateResult<unknown>) => each?.keyOf
    ? Object.fromEntries([...result.answers.map(answer => answer.source), ...result.issues.flatMap(issue => issue.source ? [issue.source] : [])]
      .map(source => [JSON.stringify(source), each.keyOf!(projectId, source)])) : {};
  const remember = (
    reference: LocalHostProjectReference,
    usedAt: number | undefined,
    result: HomeAggregateResult<unknown>,
    fingerprint?: string,
  ) => {
    let kept = resting.readings.projects.get(reference.storage_key);
    if (!kept) {
      kept = new Map();
      resting.readings.projects.set(reference.storage_key, kept);
    }
    const persistable = (fingerprint === undefined || VALID_FINGERPRINT.test(fingerprint)) && canPersist(result);
    kept.set(kind, {
      usedAt,
      ...(fingerprint !== undefined ? { fingerprint } : {}),
      persistable,
      result,
      keys: keysOf(reference.project_id, result),
    });
  };
  const readOpen = async (reference: LocalHostProjectReference) => {
    const usedAt = resting.rest(reference).usedAt;
    let entered = false;
    const enter: HomeAggregatePorts["whileOpen"] = (project, work) => ports.whileOpen(project, () => {
      entered = true;
      return work();
    });
    const result = await resting.quietly(() => read(reference, enter, signal));
    // Kept only when it really read the project, and nobody used it meanwhile: what it says may already be older than the project.
    if (entered && resting.rest(reference).usedAt === usedAt) remember(reference, usedAt, result);
    return result;
  };
  const [open, closed] = await Promise.all([Promise.all(ports.openProjects().map(readOpen)), resting.closed()]);
  const known = new Set([...ports.openProjects(), ...closed].map(reference => reference.storage_key));
  for (const storageKey of resting.readings.projects.keys()) {
    if (!known.has(storageKey)) resting.readings.projects.delete(storageKey);
  }
  const persistence = resting.persistence && (!resting.persistence.active || resting.persistence.active()) ? resting.persistence : undefined;
  if (persistence) {
    const knownSignature = [...known].sort().join("\u0000");
    if (resting.readings.prunedKey !== knownSignature) {
      persistence.prune(known);
      resting.readings.prunedKey = knownSignature;
    }
    if (persistence.awaitPending && closed.length) {
      await persistence.awaitPending(closed, signal);
      signal?.throwIfAborted();
    }
  }
  const candidates = closed.filter(reference => {
    const { state } = resting.rest(reference);
    return state !== "closed" && state !== "open";
  });
  const liveFingerprints = persistence && candidates.length ? await persistence.fingerprints(candidates) : undefined;
  const kept: HomeAggregateResult<Output>[] = [];
  const unread: LocalHostProjectReference[] = [];
  for (const reference of candidates) {
    const { state, usedAt } = resting.rest(reference);
    // Opened or purposefully closed since the list was read: never answer or open it from resting state.
    if (state === "closed" || state === "open") continue;
    const currentFp = liveFingerprints?.get(reference.storage_key);
    const effectiveFp = typeof currentFp === "string"
      ? currentFp
      : persistence
        ? (persistence.observedToken?.(reference) ?? "unreadable")
        : undefined;
    let projectMap = resting.readings.projects.get(reference.storage_key);
    if (projectMap && persistence && [...projectMap.values()].some(entry => entry.fingerprint !== effectiveFp)) {
      resting.readings.projects.delete(reference.storage_key);
      persistence.remove(reference.storage_key);
      projectMap = undefined;
    }
    let reading = projectMap?.get(kind);
    if (!reading && state === "never" && persistence) {
      if (typeof currentFp === "string") {
        const persisted = persistence.load(reference);
        if (persisted) {
          let matchedAny = false;
          for (const [entryKind, entry] of persisted) {
            if (entry.fingerprint !== currentFp) continue;
            matchedAny = true;
            if (!projectMap) {
              projectMap = new Map();
              resting.readings.projects.set(reference.storage_key, projectMap);
            }
            if (!projectMap.has(entryKind)) {
              projectMap.set(entryKind, {
                usedAt: undefined,
                fingerprint: entry.fingerprint,
                persistable: true,
                result: {
                  answers: entry.result.answers.map(answer => ({ ...answer })),
                  issues: entry.result.issues.map(issue => ({ ...issue })),
                },
                keys: { ...entry.keys },
              });
            }
          }
          if (matchedAny) {
            reading = projectMap?.get(kind);
          } else {
            persistence.remove(reference.storage_key);
          }
        }
      } else {
        persistence.remove(reference.storage_key);
      }
    }
    const sameFp = !persistence || reading?.fingerprint === effectiveFp;
    const sameKeys = reading !== undefined
      && (Object.keys(reading.keys).length === 0 || Boolean(each?.keyOf))
      && Object.entries(reading.keys).every(([source, key]) => each?.keyOf?.(reference.project_id, JSON.parse(source)) === key);
    const validNow = reading !== undefined && (!options?.stillValid || options.stillValid(reading.result as HomeAggregateResult<Output>));
    if (reading && reading.usedAt === usedAt && sameFp && sameKeys && validNow) {
      kept.push({
        answers: (reading.result as HomeAggregateResult<Output>).answers.map(answer => ({ ...answer, resting: true as const })),
        issues: reading.result.issues,
      });
    } else {
      unread.push(reference);
    }
  }
  if (unread.length) {
    readInBackground(resting, persistence, unread, kind, remember, reference => read(reference, resting.wake));
  }
  const projects = [...open, ...kept];
  return { answers: projects.flatMap(result => result.answers), issues: projects.flatMap(result => result.issues) };
}

const VALID_FINGERPRINT = /^[0-9a-f]{64}$/u;

/** One cached resting reading of a project for one aggregate kind. */
export interface RestingReading {
  usedAt: number | undefined;
  fingerprint?: string;
  persistable?: boolean;
  result: HomeAggregateResult<unknown>;
  keys: Record<string, string>;
}

/** What the Home last read of each project, by library and by what was asked; and the background pass taking the missing ones. */
export interface RestingReadings {
  readonly projects: Map<string, Map<string, RestingReading>>;
  readonly waking: Set<string>;
  pass: Promise<void>;
  prunedKey?: string;
  readonly pendingSleeps?: Map<string, Set<Promise<void>>>;
}

function restingKind(outputType: string, input: unknown): string {
  const each = input instanceof HomeAggregateInputEach ? input : undefined;
  return JSON.stringify([outputType, each ? "each" : input ?? null]);
}

function isPersistableReading(result: HomeAggregateResult<unknown>): boolean {
  return result.issues.every(issue => issue.code === "actions.plugin_disabled");
}

/** Records a plain-input reading taken during an idle check right before sleep so it can be persisted on sleep. */
export function rememberRestingReading(
  resting: NonNullable<HomeAggregatePorts["resting"]>,
  reference: LocalHostProjectReference,
  outputType: string,
  input: unknown,
  usedAt: number | undefined,
  result: HomeAggregateResult<unknown>,
  persistable: boolean,
): void {
  if (input instanceof HomeAggregateInputEach) return;
  let kept = resting.readings.projects.get(reference.storage_key);
  if (!kept) {
    kept = new Map();
    resting.readings.projects.set(reference.storage_key, kept);
  }
  kept.set(restingKind(outputType, input), {
    usedAt,
    persistable: persistable && isPersistableReading(result),
    result,
    keys: {},
  });
}

/**
 * Opens each project in turn, quietly, to read it once, then lets the page know. A project already being read for the same question is
 * not queued twice; one opened, closed on purpose or no longer there by its turn is passed over. A read that ran out of time on a project
 * just opened is tried once more, since the first read after opening is the slow one.
 */
function readInBackground(
  resting: NonNullable<HomeAggregatePorts["resting"]>,
  persistence: RestingReadingsPersistence | undefined,
  references: LocalHostProjectReference[],
  kind: string,
  remember: (reference: LocalHostProjectReference, usedAt: number | undefined, result: HomeAggregateResult<unknown>, fingerprint?: string) => void,
  read: (reference: LocalHostProjectReference) => Promise<HomeAggregateResult<unknown>>,
): void {
  for (const reference of references) {
    const id = JSON.stringify([reference.storage_key, kind]);
    if (resting.readings.waking.has(id)) continue;
    resting.readings.waking.add(id);
    resting.readings.pass = resting.readings.pass.then(async () => {
      try {
        const before = resting.rest(reference);
        if (!resting.running() || before.state === "open" || before.state === "closed") return;
        let result = await resting.quietly(() => read(reference));
        if (result.issues.some(issue => issue.code === "actions.timeout") && resting.running() && resting.rest(reference).state !== "closed") {
          result = await resting.quietly(() => read(reference));
        }
        let after = resting.rest(reference);
        if (!resting.running() || after.state === "closed") return;
        if (after.state === "open" && after.usedAt !== undefined && after.usedAt !== 0 && after.usedAt !== before.usedAt) return;
        let fingerprint: string | undefined;
        if (persistence && after.state !== "open") {
          const live = (await persistence.fingerprints([reference])).get(reference.storage_key) ?? null;
          after = resting.rest(reference);
          if (!resting.running() || after.state === "closed") return;
          if (after.state === "open" && after.usedAt !== undefined && after.usedAt !== 0 && after.usedAt !== before.usedAt) return;
          if (after.state !== "open") {
            fingerprint = typeof live === "string" ? live : (persistence.observedToken?.(reference) ?? "unreadable");
          }
        }
        remember(reference, after.usedAt, result, fingerprint);
        resting.changed(reference.project_id);
      } catch { /* the next read tries again */ }
      finally { resting.readings.waking.delete(id); }
    });
  }
}

/** One project's answers, read inside `enter` (only while open, or opened to be read). */
async function readProject<Output>(ports: HomeAggregatePorts, reference: LocalHostProjectReference, enter: HomeAggregatePorts["whileOpen"],
  outputType: string, input: unknown, signal: AbortSignal | undefined, projectOutput?: (output: Output) => Output): Promise<HomeAggregateResult<Output>> {
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
            return { answers: [{ project_id, source, plugin_id: view.provider.plugin_id ?? null, subject_kinds: view.action.subject_kinds ?? [],
              output: projectOutput ? projectOutput(output) : output }], issues: [] };
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
      persistence: {
        active: () => host.restingHomeDirectory() !== undefined,
        awaitPending: async (closed, signal) => {
          const pendingSleeps = readingsOf(host).pendingSleeps;
          if (!pendingSleeps || pendingSleeps.size === 0) return;
          const waits: Promise<void>[] = [];
          for (const reference of closed) {
            const group = pendingSleeps.get(reference.storage_key);
            if (group) waits.push(...group);
          }
          if (waits.length === 0) return;
          await waitWithSignal(Promise.all(waits).then(() => undefined), signal);
        },
        fingerprints: closed => host.restingFingerprints(closed),
        observedToken: reference => unreadableFileIdentity(reference.storage_key),
        load: reference => {
          const home = host.restingHomeDirectory();
          return home ? readProjectRestingSnapshots(home, reference) : null;
        },
        remove: storageKey => {
          const home = host.restingHomeDirectory();
          if (home) deleteProjectRestingSnapshots(home, storageKey);
        },
        prune: knownStorageKeys => {
          const home = host.restingHomeDirectory();
          if (home) prunePersistedRestingSnapshots(home, knownStorageKeys);
        },
      },
    },
  };
}

function waitWithSignal(promise: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("Aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      error => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Serializes concurrent aggregate reads behind an in-flight sleep + fingerprint persistence for `storageKey`. */
export async function trackRestingSleepPersist<T>(
  host: MolisWorkLocalHost,
  storageKey: string,
  work: () => Promise<T>,
): Promise<T> {
  const pendingSleeps = readingsOf(host).pendingSleeps!;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => {
    release = resolve;
  });
  let group = pendingSleeps.get(storageKey);
  if (!group) {
    group = new Set();
    pendingSleeps.set(storageKey, group);
  }
  group.add(barrier);
  try {
    return await work();
  } finally {
    group.delete(barrier);
    if (group.size === 0) pendingSleeps.delete(storageKey);
    release();
  }
}

/** Clears both in-memory and on-disk resting readings for a project closed on purpose (deletion, recycle, restore, sync). */
export function clearProjectRestingReadings(host: MolisWorkLocalHost, storageKey: string): void {
  readings.get(host)?.projects.delete(storageKey);
  const home = host.restingCacheHomeDirectory();
  if (home) deleteProjectRestingSnapshots(home, storageKey);
}

/**
 * Stamps and persists valid in-memory resting readings for one project right after `sleepIfIdle` closes its database.
 * Drops any reading taken before the project's latest use so stale summaries can never survive a sleep or restart.
 */
export async function persistProjectRestingReadings(
  host: MolisWorkLocalHost,
  reference: LocalHostProjectReference,
  expectedUsedAt: number | undefined,
): Promise<void> {
  const restBefore = host.projectRest(reference.storage_key);
  if (restBefore.state !== "asleep" || restBefore.usedAt !== expectedUsedAt) return;
  const projectMap = readings.get(host)?.projects.get(reference.storage_key);
  if (projectMap) {
    for (const [kind, entry] of projectMap) {
      if (entry.usedAt !== expectedUsedAt) projectMap.delete(kind);
    }
  }
  const home = host.restingHomeDirectory();
  if (!home) return;
  if (!projectMap || projectMap.size === 0) {
    deleteProjectRestingSnapshots(home, reference.storage_key);
    return;
  }
  const fingerprint = (await host.restingFingerprints([reference])).get(reference.storage_key) ?? null;
  const restAfter = host.projectRest(reference.storage_key);
  if (restAfter.state !== "asleep" || restAfter.usedAt !== expectedUsedAt) return;
  if (!fingerprint) {
    for (const entry of projectMap.values()) entry.fingerprint = undefined;
    deleteProjectRestingSnapshots(home, reference.storage_key);
    return;
  }
  const toPersist = new Map<string, RestingReadingSnapshot>();
  for (const [kind, entry] of projectMap) {
    if (entry.usedAt !== expectedUsedAt) continue;
    entry.fingerprint = fingerprint;
    if (entry.persistable !== false) {
      toPersist.set(kind, { fingerprint, keys: entry.keys, result: entry.result });
    }
  }
  writeProjectRestingSnapshots(home, reference, toPersist);
}

/**
 * Persists valid resting readings for projects that were open and cleanly closed during Host shutdown,
 * and deletes stale on-disk snapshots for projects that were open without a current reading.
 */
export async function persistShutdownRestingReadings(
  host: MolisWorkLocalHost,
  projects: readonly {
    readonly reference: LocalHostProjectReference;
    readonly usedAt: number | undefined;
    readonly persistable: boolean;
  }[],
): Promise<void> {
  const home = host.restingHomeDirectory();
  if (!home || projects.length === 0) return;
  const kept = readings.get(host)?.projects;
  const persistableProjects: Array<{
    readonly reference: LocalHostProjectReference;
    readonly usedAt: number | undefined;
    readonly entries: Map<string, RestingReading>;
  }> = [];
  for (const item of projects) {
    const projectMap = item.persistable ? kept?.get(item.reference.storage_key) : undefined;
    const matching = new Map<string, RestingReading>();
    if (projectMap) {
      for (const [kind, entry] of projectMap) {
        if (entry.usedAt === item.usedAt && entry.persistable !== false) {
          matching.set(kind, entry);
        }
      }
    }
    if (matching.size > 0) {
      persistableProjects.push({ reference: item.reference, usedAt: item.usedAt, entries: matching });
    } else {
      deleteProjectRestingSnapshots(home, item.reference.storage_key);
    }
  }
  if (persistableProjects.length === 0) return;
  const fingerprints = await host.restingFingerprints(persistableProjects.map(item => item.reference));
  for (const item of persistableProjects) {
    const fingerprint = fingerprints.get(item.reference.storage_key) ?? null;
    if (!fingerprint) {
      deleteProjectRestingSnapshots(home, item.reference.storage_key);
      continue;
    }
    const toPersist = new Map<string, RestingReadingSnapshot>();
    for (const [kind, entry] of item.entries) {
      toPersist.set(kind, { fingerprint, keys: entry.keys, result: entry.result });
    }
    writeProjectRestingSnapshots(home, item.reference, toPersist);
  }
}

/** What the Home last read of each project, in memory for the Host's life: a project asleep is shown by it. */
const readings = new WeakMap<MolisWorkLocalHost, RestingReadings>();
const readingsOf = (host: MolisWorkLocalHost) => {
  let kept = readings.get(host);
  if (!kept) {
    kept = { projects: new Map(), waking: new Set(), pass: Promise.resolve(), pendingSleeps: new Map() };
    readings.set(host, kept);
  }
  return kept;
};
