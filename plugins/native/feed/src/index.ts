import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedApi } from "@molis-ai/molis-work-contracts/modules/feed";
import type { SourcesApi } from "@molis-ai/molis-work-contracts/modules/sources";

/**
 * FD2 fixes the native Plugin's module-facing boundary. FD4 will add the UI
 * contribution without giving the Plugin ownership of either fact store.
 */
export interface FeedNativePluginModules {
  readonly feed: FeedApi;
  readonly attention: AttentionApi;
  readonly sources: SourcesApi;
}

export { feedRuleActions, createFeedRuleHandlers, type FeedRulePreview, type FeedJudgmentChoice, type FeedJudgmentCatalog } from "./rule-actions.js";
export { feedItemActions, createFeedItemHandlers, promoteOffered, FEED_ITEM_ACTIONS, type FeedItemActionPorts, type FeedItemResult, type FeedPromoteResult } from "./item-actions.js";
export { feedSourceActions, createFeedSourceHandlers, FEED_SOURCE_ACTIONS, type FeedSourceActionPorts, type FeedSourceRegistration, type FeedSourceRegistered } from "./source-actions.js";

export * from "./routes.js";
export * from "./ui.js";
export { readLinkedFeedContext } from "./linked-context.js";

export * from "./projection.js";


export { FeedApplication } from "./application.js";
export type { FeedApplicationPorts } from "./application-ports.js";
export { receiptContentRefs, FEED_RECEIPT_CONTENT_REFS, type FeedSourceHistory, type FeedSourceHistoryHolding, type FeedSourceHistoryRelease } from "./source-history.js";
export * from "./application-errors.js";

export {
  FEED_ARTIFACT_PRODUCER,
  FEED_CAPTURE_ARTIFACT_TYPE_ID,
  FEED_CAPTURE_SCHEMA_VERSION,
  FeedOutRuleStore,
  feedCaptureArtifactId,
  feedOutRuleMatches,
  parseFeedOutRulePatch,
  parseFeedOutRuleWrite,
} from "./out-rules.js";
export type { FeedArtifactProducer, FeedOutRuleWrite, FeedPluginSqliteDatabase } from "./out-rules.js";

export { createFeedExactRouteResolver, type FeedExactSourceDefinitions } from "./exact-source-routes.js";

export { FeedSourceService } from "./source-service.js";
export type * from "./source-ports.js";
export { createFeedSourceSyncGuard, type FeedSourceSyncAuthority, type FeedSourceSyncGuard } from "./source-sync-guard.js";

export { FeedConnectorSync } from "./connector-sync.js";
export { integrationKeyOf } from "./integration-key.js";
export type { ConnectorSyncMode, FeedConnectorSyncPorts, FeedConnectorListener } from "./connector-sync-ports.js";

export type { ConnectorAuthStatus } from "./connector-auth-status.js";

export { FeedSourceScheduler, type FeedSourceSchedulerDispatch, type FeedSourceSchedulerResult } from "./source-scheduler.js";

export { promoteFeedItemToGoal, type FeedGoalPromotionPorts, type FeedGoalPromotionGoals, type FeedGoalPromotionInput } from "./goal-promotion.js";

export { createFeedRouteHandlers } from "./route-handlers.js";
export type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
export { FEED_PLUGIN_ID, FEED_PROJECT_PLUGIN_ID, feedManifest } from "./manifest.js";

export { FEED_STYLES } from "./styles.js";

export { FEED_EN } from "./en.js";

export { feedContentActions, createFeedContentHandlers } from "./content-actions.js";

export { feedSubjectAction, feedSourceSubjectAction } from "./content-actions.js";

export * from "./scenes.js";
export { createFeedSceneRuntime, type FeedSceneHost, type FeedSceneJudgmentInput, type FeedSceneRuntimeOptions } from "./scene-runtime.js";
export type { FeedRuleJudgmentSelection } from "./rule-actions.js";

export { feedQueryActions, createFeedQueryHandlers, type FeedDirectorySnapshot } from "./query-actions.js";

export { FEED_PROJECT_DATABASE } from "./database.js";
