import { ActionError, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
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
  { permission: "sources:pull_feed", required: false, reason: "按平台的公开订阅源目录与格式描述、规范来源" },
] as const;
const VOCABULARY_PERMISSION = "sources:pull_feed";

/**
 * What the Runtime Feed does not answer yet: sources and their sync, connector state, the link to a Goal's material, and the platform's
 * notifications. The slice's step 4e-2 adds them; until then they stay with the Host's Feed (`feedManifest` is still the registered one).
 */
const NOT_YET: ReadonlySet<ActionDefinition> = new Set<ActionDefinition>([
  // Deleting releases a source's bodies (4e-2b), pulling and the clock are 4e-2b/c.
  feedSourceActions.delete, feedSourceActions.sync, feedSourceActions.tick,
  ...FEED_NOTIFICATION_ACTIONS, feedQueryActions.connections, feedQueryActions.linkedContext,
]);
/** The actions that describe a source with the platform's vocabulary: the platform lets a call use it only when its action declares the permission. */
const NEEDS_VOCABULARY: ReadonlySet<ActionDefinition> = new Set<ActionDefinition>([feedSourceActions.register, feedSourceActions.update]);
const withPermission = (definition: ActionDefinition, permission: string): ActionDefinition =>
  ({ ...definition, action: { ...definition.action, permissions: [...definition.action.permissions, permission] } });
const { notifications: _notifications, action_scenes: _scenes, ...BASE } = feedManifest;

/**
 * Feed as the Plugin Runtime will start it, derived from the registered Manifest so the two cannot drift while both exist. It becomes
 * `feedManifest` when Feed is flipped to the Runtime (step 4e-3); nothing registers it before.
 */
export const feedRuntimeManifest: PluginManifest = { ...BASE,
  permissions: [...feedManifest.permissions.filter(declared => !PLATFORM_PERMISSIONS.some(platform => platform.permission === declared.permission)), ...PLATFORM_PERMISSIONS],
  actions: feedManifest.actions!.filter(definition => !NOT_YET.has(definition)).map(definition => NEEDS_VOCABULARY.has(definition) ? withPermission(definition, VOCABULARY_PERMISSION) : definition),
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
    const feed = assembleFeedApplication({ sql: ports.sql, ledger: ports.ledger, attention: ports.attention, appendEvent: ports.appendEvent,
      subscribeInboxCreated: ports.subscribeInboxCreated, outRules: new FeedOutRuleStore(ports.sql) });
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
    // Called inside the action's own write transaction, so a service that changes several rows needs no transaction of its own.
    const sources = new FeedSourceService({ feed, providers, acquireSync: createFeedSourceSyncLease(), createRuntime: later("来源拉取"), transaction: operation => operation(),
      appendEvent: (project, sourceId, type, reason, payload = {}) => ports.appendEvent(project, "feed_source", sourceId, type, reason, payload, new Date().toISOString()) }, projectId);
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
      ...createFeedSourceHandlers(projectId, { feed: () => feed, sources: () => sources, connectorSync: later("连接器同步") }),
      ...createFeedItemHandlers(feed, projectId, { inboxActive: itemId => feed.listInboxEntries(projectId)
        .some(entry => entry.subject_type === "feed_item" && entry.subject_id === itemId && (entry.status === "open" || entry.status === "in_progress")) }),
    ];
    const declared = new Set(feedRuntimeManifest.actions!.map(idOf));
    return { kind: "app", views: [feedUiContribution], actions: writer.writing(feedRuntimeManifest.actions!, bindings.filter(binding => declared.has(idOf(binding)))) };
  } };
}
