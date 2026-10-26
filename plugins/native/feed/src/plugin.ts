import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assembleFeedApplication } from "./application-assembly.js";
import { createFeedContentHandlers } from "./content-actions.js";
import { createFeedInboxHandlers } from "./inbox-actions.js";
import type { FeedHydrate } from "./item-hydration.js";
import { createFeedItemHandlers } from "./item-actions.js";
import { feedManifest } from "./manifest.js";
import { FeedOutRuleStore } from "./out-rules.js";
import { createFeedQueryHandlers, feedQueryActions } from "./query-actions.js";
import { createFeedRuleHandlers } from "./rule-actions.js";
import { createFeedRuntimePorts } from "./runtime-ports.js";
import { createFeedWriter } from "./runtime-writes.js";
import { createFeedSourceHandlers, feedSourceActions } from "./source-actions.js";
import { FeedSourceService } from "./source-service.js";
import { createFeedSourceSyncLease } from "./source-sync-lease.js";
import { feedContentLedgerActions } from "./content-ledger-actions.js";
import { createRuntimePublicFeed } from "./runtime-source-pull.js";
import { feedWakeAction, feedWakeJob, keepFeedWakeup } from "./runtime-wake.js";
import { syncResearchLibrary } from "./research-library-sync.js";
import { holdingsOfSnapshot, type FeedSourceHistory, type FeedSourceHistoryRelease } from "./source-history.js";
import type { FeedSourceProviders } from "./source-ports.js";
import { FEED_NOTIFICATION_ACTIONS } from "./notification-actions.js";
import { feedUiContribution } from "./ui.js";

/** What Feed needs of the platform to run as a plugin: Inbox entries are Attention's, the links to Goals are the Context Ledger's. */
const PLATFORM_PERMISSIONS = [
  { permission: "attention:read", required: true, reason: "读取这个项目的 Inbox 事项" },
  { permission: "attention:write", required: true, reason: "把消息加入或移出 Inbox" },
  { permission: "context-ledger:read", required: true, reason: "读取消息与 Goal 的关联" },
  { permission: "context-ledger:write", required: true, reason: "记录消息与 Goal 的关联" },
  { permission: "journal:project", required: true, reason: "把消息的变化记进项目历史" },
  { permission: "evidence:read", required: false, reason: "读取留存的原始正文" },
  { permission: "sources:pull_feed", required: false, reason: "按平台的公开订阅源目录与格式描述来源、拉取公开订阅源" },
  { permission: "sources:pull_query", required: false, reason: "拉取固定的网页查询来源" },
  { permission: "sources:read_repository", required: false, reason: "读取 GitHub 研究库里发布的内容" },
  { permission: "schedule:read", required: false, reason: "查看是否已设好按时拉取" },
  { permission: "schedule:write", required: false, reason: "设定按时拉取到期的来源" },
  { permission: "actions:invoke", required: false, reason: "向 Feed 在 Home 里的引用账登记和释放留存的正文" },
] as const;
const FEED_PULL = "sources:pull_feed", QUERY_PULL = "sources:pull_query", REPOSITORY_READ = "sources:read_repository";

/**
 * What the Runtime Feed does not answer yet: sources and their sync, connector state, the link to a Goal's material, and the platform's
 * notifications. The slice's step 4e-2 adds them; until then they stay with the Host's Feed (`feedManifest` is still the registered one).
 */
const NOT_YET: ReadonlySet<ActionDefinition> = new Set<ActionDefinition>([
  ...FEED_NOTIFICATION_ACTIONS, feedQueryActions.connections, feedQueryActions.linkedContext,
]);
/**
 * The permissions an action's calls need of the platform beyond Feed's own: the platform lets a call use a service only when its action
 * declares the permission. Describing a source uses the vocabulary, deleting one forgets its search records, a sync pulls (a web query
 * has its own permission).
 */
const PLATFORM_NEEDS: ReadonlyMap<ActionDefinition, readonly string[]> = new Map<ActionDefinition, readonly string[]>([
  [feedSourceActions.register, [FEED_PULL]], [feedSourceActions.update, [FEED_PULL]],
  // Removing a source removes its items, with their Inbox entries and their links to Goals.
  [feedSourceActions.delete, [FEED_PULL, "attention:write", "context-ledger:write"]],
  [feedSourceActions.sync, [FEED_PULL, QUERY_PULL, REPOSITORY_READ]],
  // A tick runs the syncs, so it needs what they need, and it records a source's fault in the Inbox.
  [feedSourceActions.tick, [FEED_PULL, QUERY_PULL, REPOSITORY_READ, "attention:write"]],
]);
/** Actions that commit for themselves, because what they write comes after something they must wait for. */
const SELF_COMMITTING: ReadonlySet<ActionDefinition> = new Set<ActionDefinition>([feedSourceActions.sync, feedSourceActions.delete, feedSourceActions.tick]);
/** The platform lets a call write its ledgers only from a concurrent action that declares the permission, so a self-committing action is one. */
const runtimeAction = (definition: ActionDefinition): ActionDefinition => {
  const needs = PLATFORM_NEEDS.get(definition) ?? [], concurrent = SELF_COMMITTING.has(definition);
  return needs.length === 0 && !concurrent ? definition
    : { ...definition, action: { ...definition.action, permissions: [...definition.action.permissions, ...needs], ...(concurrent ? { scheduling: "concurrent" as const } : {}) } };
};
/** What the platform's clock wakes: a tick, for the plugin audience, with the wakeup's input. */
const WAKE = feedWakeAction(runtimeAction(feedSourceActions.tick));
const { notifications: _notifications, action_scenes: _scenes, ...BASE } = feedManifest;

/**
 * Feed as the Plugin Runtime will start it, derived from the registered Manifest so the two cannot drift while both exist. It becomes
 * `feedManifest` when Feed is flipped to the Runtime (step 4e-3); nothing registers it before.
 */
export const feedRuntimeManifest: PluginManifest = { ...BASE,
  // The kinds of Inbox entry Feed adds and removes: an item's, and a source's fault.
  attention: { subjects: ["feed_item", "source_fault"] },
  permissions: [...feedManifest.permissions.filter(declared => !PLATFORM_PERMISSIONS.some(platform => platform.permission === declared.permission)), ...PLATFORM_PERMISSIONS],
  actions: [...feedManifest.actions!.filter(definition => !NOT_YET.has(definition)).map(runtimeAction), WAKE],
  background: { jobs: [feedWakeJob], wakeups: [{ action: { capability_id: WAKE.capability_id, version: WAKE.version }, reason: WAKE.action.title }] },
};

const idOf = (value: { capability_id: string; version: number }) => `${value.capability_id}@${value.version}`;

/**
 * Feed as a Plugin Runtime plugin, one instance per project (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §11).
 * The application is the same one the Host builds; what changes is what it stands on. Its tables are the plugin's own library, its Inbox
 * entries are Attention's (`services.attention`), its links to Goals the Context Ledger's, its journal the project's, and its retained
 * bodies are read through the platform (`services.sourcePull.evidence`). Writes happen only inside `createFeedWriter`'s commit.
 */
export function createFeedPlugin(): PluginDefinition {
  return { manifest: feedRuntimeManifest, async start(context) {
    for (const permission of feedRuntimeManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id, services = context.services;
    const database = services?.project_database, attention = services?.attention, contextLedger = services?.contextLedger;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "Feed 只属于一个项目");
    if (!database || !attention || !contextLedger) throw new ActionError("actions.unredeemed", "Feed 需要项目库、注意力与 Context Ledger 服务");
    const ports = createFeedRuntimePorts({ projectId, database, attention, contextLedger });
    // Releasing a deleted source's history waits on other services, so it is done before the commit that deletes the rows; the commit's
    // history port only reports what that found, and the event that records it is written in the same commit.
    let released: FeedSourceHistoryRelease | null = null;
    const history: FeedSourceHistory = { release: () => released ?? { bodies_deleted: 0, bodies_kept: 0, records_deleted: 0, complete: false } };
    const feed = assembleFeedApplication({ sql: ports.sql, ledger: ports.ledger, attention: ports.attention, appendEvent: ports.appendEvent,
      subscribeInboxCreated: ports.subscribeInboxCreated, outRules: new FeedOutRuleStore(ports.sql), history });
    const writer = createFeedWriter(database, ports);
    const evidence = services?.sourcePull?.evidence;
    // A body that is gone, or that cannot be read, is unavailable and never makes the item unreadable; a call that is cancelled or no longer allowed fails.
    const hydrate: FeedHydrate = async item => {
      if (!item.materials.some(material => material.content_ref)) return item;
      return { ...item, materials: await Promise.all(item.materials.map(async material => {
        if (!material.content_ref) return material;
        const content = evidence ? await evidence.read(material.content_ref) : null;
        return content === null ? { ...material, content: null, content_available: false } : { ...material, content, content_available: true };
      })) };
    };
    const later = (what: string) => (): never => { throw new ActionError("actions.dependency_missing", `${what}还没有接到平台服务`); };
    // The source vocabulary (catalog, normalizers, the HTTP cursor) is the platform's (`services.sourcePull.vocabulary`); without the permission, describing a source fails.
    const vocabulary = services?.sourcePull?.vocabulary, noVocabulary = later("来源词汇");
    const providers: FeedSourceProviders = vocabulary ? {
      listCatalog: () => vocabulary.catalog().map(entry => ({ sourceId: entry.source_id, enabled: entry.enabled, feedUrl: entry.feed_url, name: entry.name })),
      customRss: { definitionId: vocabulary.custom_rss_definition_id, normalizeUrl: vocabulary.normalizeCustomRssUrl, host: vocabulary.customRssHost },
      youtube: { definitionId: vocabulary.youtube_definition_id, host: vocabulary.youtube_feed_host, normalizeChannel: vocabulary.normalizeYouTubeChannel, feedUrl: vocabulary.youTubeChannelFeedUrl },
      gmail: { defaultScope: "", parseScope: later("Gmail 范围") },
      rss: { isSourceKind: vocabulary.isRssSourceKind, failureCount: vocabulary.rssFailureCount, withFailure: vocabulary.rssCursorAfterFailure, withSuccess: vocabulary.rssCursorAfterSuccess },
    } : {
      listCatalog: noVocabulary, customRss: { definitionId: "", normalizeUrl: noVocabulary, host: noVocabulary },
      youtube: { definitionId: "", host: "", normalizeChannel: noVocabulary, feedUrl: noVocabulary }, gmail: { defaultScope: "", parseScope: noVocabulary },
      rss: { isSourceKind: noVocabulary, failureCount: noVocabulary, withFailure: noVocabulary, withSuccess: noVocabulary },
    };
    const sourcePull = services?.sourcePull, dependencies = services?.actions?.dependencies;
    // The Home's reference ledger is Feed's own Home half, asked as this installation: no body is written before it has been told.
    const ledger = <T>(definition: ActionDefinition, input: unknown): Promise<T> => {
      if (!dependencies) throw new ActionError("actions.dependency_missing", "Feed 需要 actions:invoke 才能向引用账登记正文");
      return dependencies.invoke<T>({ capability_id: definition.capability_id, version: definition.version }, input);
    };
    const lease = createFeedSourceSyncLease();
    const appendEvent = (project: string, sourceId: string, type: string, reason: string, payload: Record<string, unknown> = {}) =>
      ports.appendEvent(project, "feed_source", sourceId, type, reason, payload, new Date().toISOString());
    // Writes of a sync or a deletion happen after they have waited, so each is a commit of this call's own (`commit`); the plain
    // source actions run inside the action's own transaction and need no transaction of their own.
    const sourcesFor = (caller: ActionExecutionContext) => new FeedSourceService({ feed, providers, acquireSync: lease, appendEvent, transaction: operation => operation(),
      commit: operation => writer.commit(caller, operation),
      syncRepository: (source, input) => {
        const repository = sourcePull?.repository;
        if (!repository) throw new ActionError("actions.dependency_missing", "Feed 没有读取研究库的权限");
        return syncResearchLibrary({ feed, read: (request, options) => repository.read(request, options), commit: operation => writer.commit(caller, operation) }, source, input);
      },
      createRuntime: (source, operationId, hold) => {
        if (!sourcePull?.pull) throw new ActionError("actions.dependency_missing", "Feed 没有取得公开来源的权限");
        return createRuntimePublicFeed(sourcePull, source, operationId ?? "", providers, hold ?? (async () => {}));
      },
      holdContent: async (source, contentRefs) => { await ledger(feedContentLedgerActions.hold, { source_id: source.source_id, content_refs: [...contentRefs] }); },
      releaseHistory: async input => {
        const held = holdingsOfSnapshot(feed.snapshot(input.project_id), input.source_id);
        try {
          const bodies = await ledger<{ bodies_deleted: number; bodies_kept: number; complete: boolean }>(feedContentLedgerActions.release, { source_id: input.source_id, candidates: [...held.content_refs] });
          const forgotten = sourcePull?.forget ? await sourcePull.forget(held.operation_ids) : null;
          return { bodies_deleted: bodies.bodies_deleted, bodies_kept: bodies.bodies_kept, records_deleted: forgotten?.records_deleted ?? 0, complete: bodies.complete && forgotten !== null };
        } catch (error) {
          // A call that went away is not a release that failed; anything else is reported, and deleting the source again finishes it.
          if (error instanceof Error && error.name === "AbortError") throw error;
          return { bodies_deleted: 0, bodies_kept: held.content_refs.length, records_deleted: 0, complete: false };
        }
      } }, projectId);
    const sourceHandlers = createFeedSourceHandlers(projectId, { feed: () => feed, sources: sourcesFor, connectorSync: later("连接器同步"), wake: WAKE,
      retire: (outcome, run) => { released = outcome; try { return run(); } finally { released = null; } } });
    const bindings: ActionHandlerBinding[] = [
      ...createFeedContentHandlers(feed, projectId, hydrate),
      ...createFeedQueryHandlers(feed, projectId, { hydrate, authStatus: later("连接状态"), linkedContext: later("Goal 关联材料") }),
      ...createFeedRuleHandlers(feed, projectId, hydrate),
      // A connector source is not authorized until its connection can be asked (4e-2): the check fails closed.
      ...createFeedInboxHandlers(feed, projectId, { hydrate, authorize: async source => {
        const lifecycle = source.config._molis_work_lifecycle as { deleted_at?: string } | undefined;
        if (!source.enabled || source.status !== "active" || lifecycle?.deleted_at) return { authorized: false, reason: "来源已暂停、断开或移除" };
        return ["manual", "public_source"].includes(source.sync_kind) ? { authorized: true } : { authorized: false, reason: "来源连接暂不可用" };
      } }),
      ...sourceHandlers,
      ...createFeedItemHandlers(feed, projectId, { inboxActive: itemId => feed.listInboxEntries(projectId)
        .some(entry => entry.subject_type === "feed_item" && entry.subject_id === itemId && (entry.status === "open" || entry.status === "in_progress")) }),
    ];
    const declared = new Set(feedRuntimeManifest.actions!.map(idOf)), own = new Set([...SELF_COMMITTING, WAKE].map(idOf));
    const mine = bindings.filter(binding => declared.has(idOf(binding)));
    keepFeedWakeup(services?.background, { grants: context.grants, scheduler: services?.scheduler, database, wake: WAKE });
    return { kind: "app", views: [feedUiContribution], actions: [
      ...writer.writing(feedRuntimeManifest.actions!.filter(definition => !own.has(idOf(definition))), mine.filter(binding => !own.has(idOf(binding)))),
      ...mine.filter(binding => own.has(idOf(binding))),
    ] };
  } };
}
