import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assembleFeedApplication } from "./application-assembly.js";
import { createFeedContentHandlers } from "./content-actions.js";
import { createRuntimeItemStaging, createRuntimeJudgmentTriggers, createRuntimeSceneRuntime } from "./runtime-judgments.js";
import { createFeedInboxHandlers } from "./inbox-actions.js";
import type { FeedApplication } from "./application.js";
import type { FeedHydrate } from "./item-hydration.js";
import { createFeedItemHandlers, promoteOffered } from "./item-actions.js";
import { feedGoalsThroughDirectory, promoteFeedItemToGoal } from "./goal-promotion.js";
import { feedManifest } from "./manifest.js";
import { FeedOutRuleStore } from "./out-rules.js";
import { createFeedQueryHandlers } from "./query-actions.js";
import { createFeedRuleHandlers } from "./rule-actions.js";
import { createFeedRuntimePorts } from "./runtime-ports.js";
import { createFeedWriter } from "./runtime-writes.js";
import { createFeedSourceHandlers, feedSourceActions } from "./source-actions.js";
import { FeedSourceService } from "./source-service.js";
import { createFeedSourceSyncLease } from "./source-sync-lease.js";
import { feedContentLedgerActions } from "./content-ledger-actions.js";
import { FEED_PROJECT_ACTIONS, GOAL_CONTRACT, SELF_COMMITTING, WAKE } from "./runtime-actions.js";
import { createRuntimePublicFeed } from "./runtime-source-pull.js";
import { keepFeedWakeup } from "./runtime-wake.js";
import { syncResearchLibrary } from "./research-library-sync.js";
import { holdingsOfSnapshot, type FeedSourceHistory, type FeedSourceHistoryRelease } from "./source-history.js";
import type { FeedSourceProviders } from "./source-ports.js";
import { createFeedNotificationHandlers } from "./notification-actions.js";
import { readLinkedFeedContext } from "./linked-context.js";
import { feedUiContribution } from "./ui.js";
import { authorizeRuntimeSource, connectorSlotOf, createRuntimeConnectorSync, releaseRuntimeAccount, runtimeConnectorStatus } from "./runtime-connector.js";
import { SignalsModule } from "./store/index.js";
import { createConnectionWatch, FEED_RECONCILE_ACTOR, keepFeedReconcile } from "./runtime-reconcile.js";

const idOf = (value: { capability_id: string; version: number }) => `${value.capability_id}@${value.version}`;

/**
 * Feed as a Plugin Runtime plugin, one instance per project (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §11).
 * The application is the same one the Host builds; what changes is what it stands on. Its tables are the plugin's own library, its Inbox
 * entries are Attention's (`services.attention`), its links to Goals the Context Ledger's, its journal the project's, and its retained
 * bodies are read through the platform (`services.sourcePull.evidence`). Writes happen only inside `createFeedWriter`'s commit.
 */
export function createFeedPlugin(): PluginDefinition {
  return { manifest: feedManifest, async start(context) {
    for (const permission of feedManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id, services = context.services;
    const database = services?.project_database, attention = services?.attention, contextLedger = services?.contextLedger;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "Feed 只属于一个项目");
    if (!database || !attention || !contextLedger) throw new ActionError("actions.unredeemed", "Feed 需要项目库、注意力与 Context Ledger 服务");
    // The capture scene's judgments, Home's and the Inbox's: the platform's scene client, judgment ledger and action directory.
    const scenes = services?.scenes, judgments = services?.judgments, directory = services?.actions?.directory;
    if (!scenes || !judgments || !directory) throw new ActionError("actions.unredeemed", "Feed 需要场景、判断账与动作目录服务");
    const judgmentServices = { scenes, judgments, directory };
    const ports = createFeedRuntimePorts({ projectId, database, attention, contextLedger });
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
    // Releasing a deleted source's history waits on other services, so it is done before the commit that deletes the rows; the commit's
    // history port only reports what that found, and the event that records it is written in the same commit.
    let released: FeedSourceHistoryRelease | null = null;
    const history: FeedSourceHistory = { release: () => released ?? { bodies_deleted: 0, bodies_kept: 0, records_deleted: 0, complete: false } };
    // The triggers read the application they are part of, once it exists: they run only when a call judges, long after this assembly.
    let assembled: FeedApplication | undefined;
    const application = (): FeedApplication => assembled ?? ((): never => { throw new ActionError("actions.execution_failed", "Feed 还没有装配完"); })();
    const staging = createRuntimeItemStaging(application, projectId);
    const feed = assembleFeedApplication({ sql: ports.sql, ledger: ports.ledger, attention: ports.attention, appendEvent: ports.appendEvent,
      subscribeInboxCreated: ports.subscribeInboxCreated, outRules: new FeedOutRuleStore(ports.sql), history,
      ...createRuntimeJudgmentTriggers({ projectId, services: judgmentServices, feed: application, hydrate, staging }) });
    assembled = feed;
    const writer = createFeedWriter(database, ports);
    const sceneRuntime = createRuntimeSceneRuntime({ projectId, services: judgmentServices, feed, hydrate, staging, commit: (caller, body) => writer.commit(caller, body) });
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
    // An account source is read with the account the person bound to it: both services come with the two optional permissions (`connections:use`, `sources:pull_connector`).
    const connections = services?.connections, connector = sourcePull?.connector, signals = new SignalsModule(ports.sql);
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
      // The account is the person's binding, made through the platform; the source keeps only the connection's id as a record of the choice.
      ...(connections ? { resolveConnection: () => ({ credentialRef: null, accountLabel: null }) } : {}),
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
    const connectorSync = (caller: ActionExecutionContext) => {
      if (!connections || !connector) throw new ActionError("actions.dependency_missing", "Feed 没有使用账号来源的权限");
      return createRuntimeConnectorSync({ feed, projectId, sql: ports.sql, signals: signals.commands, services: { connections, connector }, commit: operation => writer.commit(caller, operation),
        acquireSync: lease, appendEvent });
    };
    const sourceHandlers = createFeedSourceHandlers(projectId, { feed: () => feed, sources: sourcesFor, connectorSync, wake: WAKE,
      retire: (outcome, run) => { released = outcome; try { return run(); } finally { released = null; } } });
    // The Goal is read as the caller before its linked material is, so the material of a Goal the caller cannot read is not given.
    const linkedContext = async (input: { goal_id: string; item_id?: string }, caller: ActionExecutionContext) => {
      const actions = services?.actions;
      if (!actions) throw new ActionError("actions.connection_required", "尚未接通 Goal 服务");
      await actions.invokeQuery(GOAL_CONTRACT, { goal_id: input.goal_id });
      await caller.beforeEffect();
      return readLinkedFeedContext(feed, projectId, input, hydrate);
    };
    const delegation = services?.actions?.directory;
    const bindings: ActionHandlerBinding[] = [
      ...createFeedContentHandlers(feed, projectId, hydrate),
      ...createFeedQueryHandlers(feed, projectId, { hydrate, authStatus: connector ? () => runtimeConnectorStatus(connector) : later("连接状态"), linkedContext }),
      ...createFeedRuleHandlers(feed, projectId, hydrate, sceneRuntime.selection, (caller, body) => writer.commit(caller, body)),
      // The platform's notifications are written in one commit, as the platform's notification service; the judgments that follow report themselves.
      ...createFeedNotificationHandlers(projectId, { feed: () => feed, judgmentFailed: () => {} }),
      ...createFeedInboxHandlers(feed, projectId, { hydrate, authorize: authorizeRuntimeSource(connections) }),
      // Disconnecting an account source also takes the person's binding off it (after the commit, as the platform's own binding is not Feed's).
      ...sourceHandlers.map(binding => binding.capability_id !== feedSourceActions.disconnect.capability_id || !connections ? binding : { ...binding, handle: (caller: ActionExecutionContext, input: unknown) => {
        const source = feed.getSource(projectId, (input as { source_id: string }).source_id);
        return Promise.resolve(binding.handle(caller, input)).then(async result => { if (connectorSlotOf(source) !== null) await releaseRuntimeAccount(connections, source); return result; });
      } }),
      ...createFeedItemHandlers(feed, projectId, { inboxActive: itemId => feed.listInboxEntries(projectId)
        .some(entry => entry.subject_type === "feed_item" && entry.subject_id === itemId && (entry.status === "open" || entry.status === "in_progress")),
        // Goals is asked through the caller's directory; without it (`actions:delegate` not given) there is no Goal service to ask, and the promotion stays unavailable.
        promote: delegation ? (input, caller) => promoteFeedItemToGoal({ feed, goals: feedGoalsThroughDirectory(delegation), hydrateItem: hydrate,
          transaction: operation => writer.commit(caller, operation), beforeEffect: () => caller.beforeEffect(),
          // Goals is reached as a delegated call (workflow audience), which it only takes as a proposal, whoever asked (S-43); the person accepts it in Goals.
          by_person: false }, input) : undefined,
        promoteAvailable: delegation ? async () => promoteOffered(await delegation.discover()) : undefined }),
    ];
    const declared = new Set(FEED_PROJECT_ACTIONS.map(idOf)), own = new Set([...SELF_COMMITTING, WAKE].map(idOf));
    const mine = bindings.filter(binding => declared.has(idOf(binding)));
    keepFeedWakeup(services?.background, { grants: context.grants, scheduler: services?.scheduler, database, wake: WAKE });
    // What no call sets right: the Home's ledger names every body the library keeps, and an account source follows its account. An event
    // delivery has no action scope of its own, so it only wakes the kept job, which has.
    const watch = createConnectionWatch();
    keepFeedReconcile(services?.background, { feed, projectId, connections, commit: (control, body) => writer.commitAs(control, FEED_RECONCILE_ACTOR, body),
      hold: dependencies ? async (sourceId, contentRefs) => { await ledger(feedContentLedgerActions.hold, { source_id: sourceId, content_refs: [...contentRefs] }); } : undefined }, watch);
    return { kind: "app", views: [feedUiContribution], action_scenes: [sceneRuntime.handler],
      onEvent: (_event, delivery) => { delivery.beforeEffect(); watch.changed(); }, actions: [
      ...writer.writing(FEED_PROJECT_ACTIONS.filter(definition => !own.has(idOf(definition))), mine.filter(binding => !own.has(idOf(binding)))),
      ...mine.filter(binding => own.has(idOf(binding))),
    ] };
  } };
}
