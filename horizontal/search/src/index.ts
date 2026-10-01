import {
  ActionError,
  SUBJECT_CONTEXT_TYPE,
  SUBJECT_REFERENCE_TYPE,
  isSearchEntriesSource,
  isSearchQuerySource,
  retainActionAuthority,
  SEARCH_ENTRIES_PAGE_LIMIT,
  type ActionCallContext,
  type ActionClient,
  type ActionReference,
  type ActionSubjectContext,
  type ActionView,
  type SearchEntriesPage,
  type SearchEntry,
  type SearchQueryResult,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  SEARCH_PROVIDER_ID,
  searchActions,
  searchSourceKey,
  type SearchHit,
  type SearchIndexDocument,
  type SearchIndexPort,
  type SearchIndexSourceRecord,
  type SearchOpenRequest,
  type SearchOpenResponse,
  type SearchQueryRequest,
  type SearchQueryResponse,
  type SearchRebuildRequest,
  type SearchRebuildResponse,
  type SearchScope,
  type SearchSourceStatus,
  type SearchStatusResponse,
} from "@molis-ai/molis-work-contracts/services/search";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-search",
  packagePath: "horizontal/search",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/search",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["search.query.v1", "search.index.v1"],
} as const;
export type MolisWorkPackageDescriptor = typeof packageDescriptor;

/** One trusted way to reach a scope's sources: the calling client and the context to call it with. */
export interface SearchAccess { client: ActionClient; caller: ActionCallContext }
export interface SearchServiceOptions {
  index: SearchIndexPort;
  /**
   * The local person's own access to one scope (a project, or null for personal content). Only the Host supplies it;
   * indexing reads with it, so the index is independent of whoever asks. Throws when the scope is not open.
   */
  indexer(projectId: string | null): Promise<SearchAccess>;
  clock?: () => number;
  /** A source checked this recently, and not marked changed since, is not re-listed before a query. */
  freshMs?: number;
  /** How long a query waits for sources to catch up before answering with what is indexed. */
  budgetMs?: number;
  /** Delay before a changed source is refreshed in the background. */
  refreshDelayMs?: number;
  /** Projects that still exist in this Home; index rows of any other project are dropped. Null while unknown. */
  knownProjects?(): Promise<readonly string[] | null>;
  /**
   * The project partition that is the person's own space (specs/archive/work-placement): what is in it is personal, so the local
   * person finds it from any project. Only a caller acting as that person (audience `user`) reaches it from elsewhere;
   * agents, workflows and MCP clients of another project do not.
   */
  personalSpace?: string;
  onError?(error: unknown, where: string): void;
}

interface SourceView {
  key: string;
  project_id: string | null;
  view: ActionView;
  reference: ActionReference & { provider_id: string };
  kinds: Map<string, { title: string; surface: string }>;
}
type Scoped = { project: boolean; personal: boolean };
/** The local person's access to one scope and its directory, read once per round of syncs. */
type Owner = { access: SearchAccess; views: readonly ActionView[] };
const DEFAULT_LIMIT = 20;
const CONTEXT_BATCH = 25;
const SYNC_RESTARTS = 2;
const RETRY_MS = 10_000;

const referenceOf = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const sameReference = (a: ActionReference, b: ActionReference) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;
const isReader = (view: ActionView) => view.action.input_type === SUBJECT_REFERENCE_TYPE && view.action.output_type === SUBJECT_CONTEXT_TYPE;
const entryKey = (kind: string, id: string) => `${kind}\u0000${id}`;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);
const errorCode = (error: unknown) => error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";

/** hit_id carries only public identity: scope, provider, source version, kind and object id. */
export function encodeSearchHitId(input: { project_id: string | null; provider_id: string; capability_id: string; version: number; kind: string; id: string }): string {
  return JSON.stringify(["search-hit-v1", input.project_id ?? "", input.provider_id, input.capability_id, input.version, input.kind, input.id]);
}
export function decodeSearchHitId(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown[];
    if (!Array.isArray(parsed) || parsed.length !== 7 || parsed[0] !== "search-hit-v1" || !parsed.slice(1).every((part, index) => index === 3 ? Number.isSafeInteger(part) : typeof part === "string")) throw new Error();
    const [, project, provider_id, capability_id, version, kind, id] = parsed as [string, string, string, string, number, string, string];
    if (!provider_id || !capability_id || !kind || !id) throw new Error();
    return { project_id: project || null, provider_id, capability_id, version, kind, id };
  } catch { throw new ActionError("actions.input_invalid", "搜索结果标识无效，请重新搜索"); }
}
const cursorOf = (query: string, offset: number) => JSON.stringify(["search-cursor-v1", query, offset]);
function offsetOf(cursor: string | null | undefined, query: string): number {
  if (!cursor) return 0;
  try {
    const [tag, forQuery, offset] = JSON.parse(cursor) as [unknown, unknown, unknown];
    if (tag === "search-cursor-v1" && forQuery === query && Number.isSafeInteger(offset) && Number(offset) >= 0) return Number(offset);
  } catch { /* falls through */ }
  throw new ActionError("actions.input_invalid", "翻页位置已失效，请从第一页重新搜索");
}

/**
 * The system search (specs/archive/system-search): discovers sources through the shared action directory, keeps the index
 * current against each owner's own versions, and answers queries with only what the caller may read.
 * It never reads a plugin's store; everything goes through the plugin's declared actions.
 */
export class SearchService {
  private readonly clock: () => number;
  private readonly freshMs: number;
  private readonly budgetMs: number;
  private readonly refreshDelayMs: number;
  private readonly inflight = new Map<string, Promise<void>>();
  /** Every announced change gets the next number; a source synced from an earlier number is out of date. */
  private changeSeq = 0;
  /** `${project}|${provider}` → number of the provider's last announced change. */
  private readonly changed = new Map<string, number>();
  /** source_key → change number current when its last sync started. */
  private readonly syncedSeq = new Map<string, number>();
  private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reconciled = new Map<string, number>();
  private closed = false;

  constructor(private readonly options: SearchServiceOptions) {
    this.clock = options.clock ?? Date.now;
    this.freshMs = options.freshMs ?? 3_000;
    this.budgetMs = options.budgetMs ?? 1_500;
    this.refreshDelayMs = options.refreshDelayMs ?? 800;
  }

  /** Called by the Host whenever a command of a provider succeeded, from any entry. Known sources refresh shortly after. */
  markChanged(providerId: string, projectId: string | null): void {
    if (!this.announce(providerId, projectId)) return;
    this.scheduleRefresh(providerId, projectId);
  }

  /**
   * Called by the Host when a provider is registered or withdrawn (install, enable, upgrade, disable, uninstall).
   * The next query re-checks that provider's sources and drops the ones that are gone; nothing runs now.
   */
  markRegistration(providerId: string, projectId: string | null): void {
    this.announce(providerId, projectId);
  }

  private announce(providerId: string, projectId: string | null): boolean {
    if (this.closed || providerId === SEARCH_PROVIDER_ID) return false;
    const seq = ++this.changeSeq;
    this.changed.set(`${projectId ?? ""}|${providerId}`, seq);
    // Home-scoped providers are called with a project context too; their content is personal.
    if (projectId) this.changed.set(`|${providerId}`, seq);
    this.reconciled.delete(projectId ?? "");
    this.reconciled.delete("");
    return true;
  }

  async query(access: SearchAccess, input: SearchQueryRequest): Promise<SearchQueryResponse> {
    const query = input.query.trim();
    if (!query) throw new ActionError("actions.input_invalid", "请输入要搜索的内容");
    const limit = Math.min(50, Math.max(1, input.limit ?? DEFAULT_LIMIT));
    const offset = offsetOf(input.cursor, query);
    const scoped = this.scoped(access.caller, input.scope);
    const views = await access.client.discover(access.caller);
    const personal = await this.personalSpaceOf(access, scoped);
    const all = [...this.entrySources(views, access.caller), ...personal?.sources ?? []].filter(source => this.inScope(source, scoped) && this.matchesFilter(source, input));
    const visible = all.filter(source => source.view.availability.available);
    await this.purgeDisabled(all);
    await this.catchUp(visible, scoped, access.caller, false, personal ? this.options.personalSpace : undefined);
    if (!all.length) return { status: "empty_scope", hits: [], next_cursor: null, sources: [] };
    const readers = [...views, ...personal?.views ?? []].filter(view => isReader(view) && view.availability.available);
    const allowed = visible.map(source => ({ source_key: source.key,
      readable_kinds: [...source.kinds.keys()].filter(kind => readers.some(reader => reader.provider.provider_id === source.reference.provider_id && reader.action.subject_kinds.includes(kind))) }));
    const found = this.options.index.search({ query, sources: allowed, ...(input.kinds?.length ? { kinds: input.kinds } : {}), offset, limit });
    const byKey = new Map(visible.map(source => [source.key, source]));
    const hits: SearchHit[] = found.matches.flatMap(match => {
      const source = byKey.get(match.source_key);
      if (!source) return [];
      return [{ hit_id: encodeSearchHitId({ project_id: source.project_id, provider_id: source.reference.provider_id, capability_id: source.reference.capability_id,
        version: source.reference.version, kind: match.kind, id: match.object_id }), subject: { kind: match.kind, id: match.object_id }, project_id: source.project_id,
        plugin_id: source.view.provider.plugin_id ?? source.reference.provider_id, plugin_title: source.view.provider.title, source: source.reference,
        title: match.title, snippet: match.snippet, highlights: match.highlights, revision: match.revision, updated_at: match.updated_at,
        open: match.open ?? this.defaultOpen(source, match.kind, match.object_id), locator: match.locator }];
    });
    if (offset === 0) hits.push(...await this.onDemand(views, access, scoped, input, query, limit, hits));
    const sources = this.statuses(all);
    const pending = sources.some(source => source.state === "indexing");
    const degraded = sources.some(source => ["failed", "stale", "unavailable", "indexing"].includes(source.state));
    return { status: !hits.length && pending ? "indexing" : degraded ? "partial" : "complete", hits: hits.slice(0, limit),
      next_cursor: offset + limit < found.total ? cursorOf(query, offset + limit) : null, sources };
  }

  async open(access: SearchAccess, input: SearchOpenRequest): Promise<SearchOpenResponse> {
    const hit = decodeSearchHitId(input.hit_id);
    const hit_id = input.hit_id;
    if (hit.project_id && hit.project_id !== access.caller.project_id) {
      // The person's own space answers them from any project, read with their own access to it; nothing else of another project does.
      if (hit.project_id !== this.options.personalSpace || access.caller.audience !== "user") return { state: "unavailable", hit_id, reason: "这条结果属于其他项目" };
      try { access = (await this.owner(hit.project_id)()).access; }
      catch (error) { return { state: "unavailable", hit_id, reason: errorText(error) }; }
    }
    const views = await access.client.discover(access.caller);
    const candidates = [...this.entrySources(views, access.caller), ...this.querySources(views, access.caller)];
    const source = candidates.find(candidate => candidate.project_id === hit.project_id && sameReference(candidate.reference, hit));
    if (!source) return { state: "unavailable", hit_id, reason: "来源插件已停用、升级或当前没有读取权限" };
    if (!source.view.availability.available) return { state: "unavailable", hit_id, reason: source.view.availability.reason };
    if (!source.kinds.has(hit.kind)) return { state: "unavailable", hit_id, reason: "来源不再提供这类对象" };
    const origin = { ...searchActions.open, provider_id: SEARCH_PROVIDER_ID };
    const nested = retainActionAuthority(access.caller, origin);
    const reader = views.find(view => isReader(view) && view.availability.available && view.provider.provider_id === hit.provider_id && view.action.subject_kinds.includes(hit.kind));
    const indexed = this.options.index.document(source.key, hit.kind, hit.id);
    if (reader) {
      try {
        const context = await access.client.invoke(nested, referenceOf(reader), { subject_id: hit.id }) as ActionSubjectContext & { open?: { surface: string; id: string } };
        if (context.subject.kind !== hit.kind || context.subject.id !== hit.id) return { state: "unavailable", hit_id, reason: "对象读取结果与搜索结果不一致" };
        return { state: "ok", hit_id, subject: context.subject, open: context.open ?? indexed?.open ?? this.defaultOpen(source, hit.kind, hit.id), title: context.title, revision: context.revision };
      } catch (error) {
        if (!this.meansMissing(error)) return { state: "unavailable", hit_id, reason: errorText(error) };
        this.options.index.remove(source.key, [{ kind: hit.kind, object_id: hit.id }]);
        return { state: "missing", hit_id, reason: "这条内容已被删除或归档" };
      }
    }
    if (isSearchQuerySource(source.view.action)) return { state: "unavailable", hit_id, reason: "来源没有提供对象读取，无法核对这条结果" };
    // No reader for this kind: confirm by listing the source with the caller's own authority.
    const entry = await this.findEntry(access.client, nested, source, hit.kind, hit.id);
    if (!entry) {
      this.options.index.remove(source.key, [{ kind: hit.kind, object_id: hit.id }]);
      return { state: "missing", hit_id, reason: "这条内容已被删除" };
    }
    return { state: "ok", hit_id, subject: entry.subject, open: entry.open ?? this.defaultOpen(source, hit.kind, hit.id), title: entry.title, revision: entry.revision };
  }

  async status(access: SearchAccess, input: { scope?: SearchScope }): Promise<SearchStatusResponse> {
    const scoped = this.scoped(access.caller, input.scope);
    const views = await access.client.discover(access.caller);
    const personal = await this.personalSpaceOf(access, scoped);
    return { sources: this.statuses([...this.entrySources(views, access.caller), ...personal?.sources ?? []].filter(source => this.inScope(source, scoped))) };
  }

  async rebuild(access: SearchAccess, input: SearchRebuildRequest): Promise<SearchRebuildResponse> {
    const scoped = this.scoped(access.caller, input.scope);
    const views = await access.client.discover(access.caller);
    const personal = await this.personalSpaceOf(access, scoped);
    const sources = [...this.entrySources(views, access.caller), ...personal?.sources ?? []].filter(source => this.inScope(source, scoped));
    let cleared = 0;
    for (const source of sources) { await this.inflight.get(source.key)?.catch(() => undefined); cleared += this.options.index.removeSource(source.key); }
    const visible = sources.filter(source => source.view.availability.available);
    await this.catchUp(visible, scoped, access.caller, true, personal ? this.options.personalSpace : undefined);
    return { cleared, sources: this.statuses(sources) };
  }

  /** Project deletion: the index keeps nothing of it. */
  removeProject(projectId: string): number {
    for (const [key, timer] of this.refreshTimers) if (key.startsWith(`${projectId}|`)) { clearTimeout(timer); this.refreshTimers.delete(key); }
    return this.options.index.removeProject(projectId);
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const timer of this.refreshTimers.values()) clearTimeout(timer);
    this.refreshTimers.clear();
    // A sync waiting on a closing project must not hold the Host's shutdown; its next write fails and is dropped.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled([...this.inflight.values()]), new Promise<void>(resolve => { timer = setTimeout(resolve, 3_000); })]);
    clearTimeout(timer);
  }

  /* ---------------- sources ---------------- */

  private scoped(caller: ActionCallContext, scope: SearchScope | undefined): Scoped {
    const chosen = scope ?? "all";
    if (chosen === "project" && !caller.project_id) throw new ActionError("actions.project_required", "当前没有打开项目，只能搜索个人内容");
    return { project: chosen !== "personal" && !!caller.project_id, personal: chosen !== "project" };
  }

  private entrySources(views: readonly ActionView[], caller: ActionCallContext): SourceView[] {
    return views.filter(view => isSearchEntriesSource(view.action) && view.action.search_source?.kinds.length).map(view => {
      // A registration bound to a project serves that project; a Home registration of a project action serves the caller's project.
      const project_id = view.provider.project_id ?? (view.action.scope === "project" ? caller.project_id : null);
      const reference = referenceOf(view);
      return { key: searchSourceKey({ project_id, ...reference }), project_id, view, reference,
        kinds: new Map(view.action.search_source!.kinds.map(entry => [entry.kind, { title: entry.title, surface: entry.surface }])) };
    });
  }

  private querySources(views: readonly ActionView[], caller: ActionCallContext): SourceView[] {
    return views.filter(view => isSearchQuerySource(view.action) && view.action.search_source?.kinds.length).map(view => {
      const project_id = view.provider.project_id ?? (view.action.scope === "project" ? caller.project_id : null);
      const reference = referenceOf(view);
      return { key: searchSourceKey({ project_id, ...reference }), project_id, view, reference,
        kinds: new Map(view.action.search_source!.kinds.map(entry => [entry.kind, { title: entry.title, surface: entry.surface }])) };
    });
  }

  private inScope(source: SourceView, scoped: Scoped): boolean {
    // The personal space is a project partition, but what is in it is the person's own.
    if (source.project_id && source.project_id === this.options.personalSpace) return scoped.personal || scoped.project;
    return source.project_id ? scoped.project : scoped.personal;
  }

  /** The personal space seen from another project, for the local person only; null when out of scope, absent or not reachable. */
  private async personalSpaceOf(access: SearchAccess, scoped: Scoped): Promise<{ views: readonly ActionView[]; sources: SourceView[] } | null> {
    const space = this.options.personalSpace;
    if (!space || !scoped.personal || access.caller.project_id === space || access.caller.audience !== "user") return null;
    try {
      const { access: own, views } = await this.owner(space)();
      return { views, sources: this.entrySources(views, own.caller).filter(source => source.project_id === space) };
    } catch { return null; }
  }

  private matchesFilter(source: SourceView, input: SearchQueryRequest): boolean {
    if (input.plugins?.length && !input.plugins.includes(source.view.provider.plugin_id ?? source.reference.provider_id)) return false;
    if (input.kinds?.length && ![...source.kinds.keys()].some(kind => input.kinds!.includes(kind))) return false;
    return true;
  }

  private defaultOpen(source: SourceView, kind: string, id: string) {
    const surface = source.kinds.get(kind)?.surface;
    return surface ? { surface, id } : null;
  }

  private meansMissing(error: unknown): boolean {
    return ["actions.subject_unavailable", "actions.not_found", "not_found"].includes(errorCode(error)) || /not_found|不存在|已删除|已归档/u.test(errorCode(error) + errorText(error));
  }

  /** A plugin turned off in this project keeps nothing in the index; turned back on, it is indexed again. */
  private async purgeDisabled(sources: readonly SourceView[]): Promise<void> {
    for (const source of sources) {
      const state = source.view.availability;
      if (state.available || state.code !== "actions.plugin_disabled" || !this.options.index.source(source.key)) continue;
      await this.inflight.get(source.key)?.catch(() => undefined);
      this.options.index.removeSource(source.key);
    }
  }

  /** Sources the owner no longer has (uninstalled, upgraded to another version) leave the index. */
  private async reconcile(projectId: string | null): Promise<void> {
    const scope = projectId ?? "";
    const last = this.reconciled.get(scope) ?? 0;
    if (this.clock() - last < 30_000) return;
    this.reconciled.set(scope, this.clock());
    const { access, views } = await this.owner(projectId)();
    const current = new Set(this.entrySources(views, access.caller).filter(source => source.project_id === projectId).map(source => source.key));
    for (const record of this.options.index.sources()) {
      if (record.project_id !== projectId || current.has(record.source_key)) continue;
      await this.inflight.get(record.source_key)?.catch(() => undefined);
      this.options.index.removeSource(record.source_key);
    }
    if (projectId !== null) return;
    // A deleted project leaves nothing behind, whichever entry deleted it.
    const projects = await this.options.knownProjects?.();
    if (!projects) return;
    const existing = new Set(projects);
    for (const stale of new Set(this.options.index.sources().map(record => record.project_id).filter((id): id is string => !!id && !existing.has(id)))) {
      this.removeProject(stale);
    }
  }

  /* ---------------- freshness ---------------- */

  private needsSync(source: SourceView, record: SearchIndexSourceRecord | null): boolean {
    if (!record) return true;
    const changed = this.changed.get(`${source.project_id ?? ""}|${source.reference.provider_id}`);
    if (changed !== undefined && changed > (this.syncedSeq.get(source.key) ?? 0)) return true;
    const checked = record.checked_at ?? 0;
    if (record.error) return this.clock() - checked >= RETRY_MS;
    if (record.state !== "ready" || record.collection_revision === null) return true;
    return this.clock() - checked >= this.freshMs;
  }

  private owner(projectId: string | null): () => Promise<Owner> {
    let pending: Promise<Owner> | undefined;
    return () => pending ??= (async () => {
      const access = await this.options.indexer(projectId);
      return { access, views: await access.client.discover(access.caller) };
    })();
  }

  /** Bring the caller's sources current within the query's budget; what does not finish continues in the background. */
  private async catchUp(sources: readonly SourceView[], scoped: Scoped, caller: ActionCallContext, force = false, alsoProject?: string): Promise<void> {
    const reconciling = [
      ...(scoped.project && caller.project_id ? [this.reconcile(caller.project_id)] : []),
      ...(scoped.personal ? [this.reconcile(null)] : []),
      ...(alsoProject ? [this.reconcile(alsoProject)] : []),
    ].map(promise => promise.catch(error => this.options.onError?.(error, "search.reconcile")));
    const owners = new Map<string, () => Promise<Owner>>();
    const ownerFor = (projectId: string | null) => { const key = projectId ?? ""; if (!owners.has(key)) owners.set(key, this.owner(projectId)); return owners.get(key)!; };
    const work = sources.filter(source => force || this.needsSync(source, this.options.index.source(source.key))).map(source => this.sync(source, ownerFor(source.project_id)));
    if (!work.length && !reconciling.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled([...work, ...reconciling]), new Promise<void>(resolve => { timer = setTimeout(resolve, this.budgetMs); })]);
    clearTimeout(timer);
  }

  private scheduleRefresh(providerId: string, projectId: string | null): void {
    const key = `${projectId ?? ""}|${providerId}`;
    if (this.refreshTimers.has(key)) return;
    const timer = setTimeout(() => {
      this.refreshTimers.delete(key);
      void this.refreshKnown(providerId, projectId).catch(error => this.options.onError?.(error, "search.refresh"));
    }, this.refreshDelayMs);
    (timer as { unref?: () => void }).unref?.();
    this.refreshTimers.set(key, timer);
  }

  /** Only sources already in the index are refreshed in the background; new ones are indexed when first searched. */
  private async refreshKnown(providerId: string, projectId: string | null): Promise<void> {
    if (this.closed) return;
    const records = this.options.index.sources().filter(record => record.provider_id === providerId && (record.project_id === projectId || record.project_id === null));
    for (const scope of new Set(records.map(record => record.project_id))) {
      const owner = this.owner(scope);
      const { access, views } = await owner();
      const sources = this.entrySources(views, access.caller)
        .filter(source => source.project_id === scope && source.reference.provider_id === providerId && source.view.availability.available);
      await Promise.allSettled(sources.map(source => this.sync(source, owner)));
    }
  }

  private sync(source: SourceView, owner: () => Promise<Owner>): Promise<void> {
    const running = this.inflight.get(source.key);
    if (running) return running;
    const task = this.runSync(source, owner).catch(error => this.options.onError?.(error, "search.sync")).finally(() => {
      if (this.inflight.get(source.key) === task) this.inflight.delete(source.key);
    });
    this.inflight.set(source.key, task);
    return task;
  }

  private async runSync(source: SourceView, ownerOf: () => Promise<Owner>): Promise<void> {
    const index = this.options.index;
    const previous = index.source(source.key);
    const base: SearchIndexSourceRecord = previous ?? { source_key: source.key, project_id: source.project_id, provider_id: source.reference.provider_id,
      capability_id: source.reference.capability_id, version: source.reference.version, plugin_id: source.view.provider.plugin_id ?? source.reference.provider_id,
      title: source.view.provider.title, collection_revision: null, state: "indexing", error: null, synced_at: null, checked_at: null };
    const startedAt = this.clock();
    this.syncedSeq.set(source.key, this.changeSeq);
    const save = (patch: Partial<SearchIndexSourceRecord>) => index.saveSource({ ...base, plugin_id: source.view.provider.plugin_id ?? source.reference.provider_id,
      title: source.view.provider.title, ...patch });
    if (!previous) save({});
    try {
      const { access: owner, views } = await ownerOf();
      const live = views.find(view => sameReference(referenceOf(view), source.reference) && (view.provider.project_id ?? null) === (source.view.provider.project_id ?? null));
      if (!live) throw new ActionError("actions.missing", "来源已从当前项目撤下");
      if (!live.availability.available) throw new ActionError(live.availability.code, live.availability.reason);
      const nested = retainActionAuthority(owner.caller, source.reference);
      const list = (cursor: string | null) => owner.client.invoke(nested, source.reference, { cursor, limit: SEARCH_ENTRIES_PAGE_LIMIT }) as Promise<SearchEntriesPage>;
      let first = await list(null);
      if (previous?.state === "ready" && !previous.error && previous.collection_revision === first.collection_revision) {
        save({ checked_at: startedAt });
        return;
      }
      let entries: SearchEntry[] = [];
      for (let attempt = 0; ; attempt += 1) {
        entries = [...first.entries];
        let page = first, moved = false;
        while (page.next_cursor) {
          page = await list(page.next_cursor);
          if (page.collection_revision !== first.collection_revision) { moved = true; break; }
          entries.push(...page.entries);
        }
        if (!moved) break;
        // The collection changed while it was being listed: start over from the new revision.
        if (attempt >= SYNC_RESTARTS) throw new ActionError("search.source_moving", "来源内容在读取期间持续变化，稍后重试");
        first = await list(null);
      }
      const seen = new Map<string, SearchEntry>();
      for (const entry of entries) {
        if (!source.kinds.has(entry.subject.kind)) throw new ActionError("search.entry_invalid", "来源返回了未声明的对象种类");
        const key = entryKey(entry.subject.kind, entry.subject.id);
        if (seen.has(key)) throw new ActionError("search.entry_invalid", "来源返回了重复的条目");
        seen.set(key, entry);
      }
      const known = index.revisions(source.key);
      const changed = [...seen.values()].filter(entry => known.get(entryKey(entry.subject.kind, entry.subject.id)) !== entry.revision);
      const readers = new Map<string, ActionReference>();
      for (const view of views) if (isReader(view) && view.availability.available && view.provider.provider_id === source.reference.provider_id) {
        for (const kind of view.action.subject_kinds) if (!readers.has(kind)) readers.set(kind, referenceOf(view));
      }
      for (let at = 0; at < changed.length; at += CONTEXT_BATCH) {
        if (this.closed) throw new ActionError("search.closed", "搜索服务已关闭");
        const batch = changed.slice(at, at + CONTEXT_BATCH);
        index.upsert(await Promise.all(batch.map(entry => this.document(source, entry, readers.get(entry.subject.kind), owner, nested))));
      }
      const removed = [...known.keys()].filter(key => !seen.has(key)).map(key => {
        const [kind, object_id] = key.split("\u0000") as [string, string];
        return { kind, object_id };
      });
      if (removed.length) index.remove(source.key, removed);
      save({ collection_revision: first.collection_revision, state: "ready", error: null, synced_at: this.clock(), checked_at: startedAt });
    } catch (error) {
      // Keep what was indexed; removals wait for a complete pass. The next query retries after a pause.
      save({ state: previous?.collection_revision ? "ready" : "failed", error: errorText(error), checked_at: startedAt });
      throw error;
    }
  }

  private async document(source: SourceView, entry: SearchEntry, reader: ActionReference | undefined, owner: SearchAccess, nested: ActionCallContext): Promise<SearchIndexDocument> {
    const base: SearchIndexDocument = { source_key: source.key, kind: entry.subject.kind, object_id: entry.subject.id, project_id: source.project_id, revision: entry.revision,
      title: entry.title, summary: entry.summary, content: "", updated_at: entry.updated_at, open: entry.open ?? this.defaultOpen(source, entry.subject.kind, entry.subject.id),
      content_policy: "summary" };
    if (entry.content !== "context" || !reader) return base;
    try {
      const context = await owner.client.invoke(nested, reader, { subject_id: entry.subject.id }) as ActionSubjectContext;
      if (context.subject.kind !== entry.subject.kind || context.subject.id !== entry.subject.id) return base;
      return { ...base, content: context.content, content_policy: "context" };
    } catch {
      // Unreadable now (archived, locked): index what the listing allowed; the object stays findable by title.
      return base;
    }
  }

  private statuses(sources: readonly SourceView[]): SearchSourceStatus[] {
    return sources.map(source => {
      const record = this.options.index.source(source.key);
      const base = { plugin_id: source.view.provider.plugin_id ?? source.reference.provider_id, title: source.view.provider.title,
        scope: source.project_id ? "project" as const : "personal" as const, indexed_at: record?.synced_at ? new Date(record.synced_at).toISOString() : null,
        entries: record ? this.options.index.count(source.key) : 0 };
      const availability = source.view.availability;
      if (!availability.available) return { ...base, state: availability.code === "actions.plugin_disabled" ? "disabled" as const : "unavailable" as const, reason: availability.reason, entries: 0 };
      if (!record || record.collection_revision === null) return { ...base, state: record?.state === "failed" ? "failed" as const : "indexing" as const, reason: record?.error ?? null };
      if (record.error) return { ...base, state: "stale" as const, reason: record.error };
      return { ...base, state: "ready" as const, reason: null };
    });
  }

  private async findEntry(client: ActionClient, caller: ActionCallContext, source: SourceView, kind: string, id: string): Promise<SearchEntry | null> {
    let cursor: string | null = null;
    do {
      const page = await client.invoke(caller, source.reference, { cursor, limit: SEARCH_ENTRIES_PAGE_LIMIT }) as SearchEntriesPage;
      const found = page.entries.find(entry => entry.subject.kind === kind && entry.subject.id === id);
      if (found) return found;
      cursor = page.next_cursor;
    } while (cursor);
    return null;
  }

  /** Owners that search their own data at query time; nothing they return is written to the index. */
  private async onDemand(views: readonly ActionView[], access: SearchAccess, scoped: Scoped, input: SearchQueryRequest, query: string, limit: number,
    already: readonly SearchHit[]): Promise<SearchHit[]> {
    const sources = this.querySources(views, access.caller).filter(source => source.view.availability.available && this.inScope(source, scoped) && this.matchesFilter(source, input));
    const nested = retainActionAuthority(access.caller, { ...searchActions.query, provider_id: SEARCH_PROVIDER_ID });
    const seen = new Set(already.map(hit => hit.hit_id));
    const results = await Promise.allSettled(sources.map(async source => {
      const result = await access.client.invoke(nested, source.reference, { query, limit }) as SearchQueryResult;
      return result.hits.filter(hit => source.kinds.has(hit.subject.kind)).map((hit): SearchHit => ({
        hit_id: encodeSearchHitId({ project_id: source.project_id, ...source.reference, kind: hit.subject.kind, id: hit.subject.id }), subject: hit.subject,
        project_id: source.project_id, plugin_id: source.view.provider.plugin_id ?? source.reference.provider_id, plugin_title: source.view.provider.title,
        source: source.reference, title: hit.title, snippet: hit.snippet, highlights: [], revision: hit.revision, updated_at: hit.updated_at,
        open: hit.open ?? this.defaultOpen(source, hit.subject.kind, hit.subject.id), locator: { field: "content", offset: 0, length: 0, text: "" } }));
    }));
    return results.flatMap(result => result.status === "fulfilled" ? result.value : []).filter(hit => !seen.has(hit.hit_id) && (seen.add(hit.hit_id), true));
  }
}

export { searchActions, SEARCH_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/search";
