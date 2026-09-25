import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedApi } from "@molis-ai/molis-work-contracts/modules/feed";
import type { SourcesApi } from "@molis-ai/molis-work-contracts/modules/sources";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-feed",
  packagePath: "plugins/native/feed",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2","goal-reorg-fd4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "feed.native-plugin.contract.v1",
    "feed.ui-contribution.v1",
    "feed.http-routes.v1",
  ],
} as const;

/**
 * FD2 fixes the native Plugin's module-facing boundary. FD4 will add the UI
 * contribution without giving the Plugin ownership of either fact store.
 */
export interface FeedNativePluginModules {
  readonly feed: FeedApi;
  readonly attention: AttentionApi;
  readonly sources: SourcesApi;
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./routes.js";
export * from "./ui.js";
export * from "./context.js";
export { readLinkedFeedContext } from "./linked-context.js";

export * from "./projection.js";

export { renderFeedRichText, feedPlainText } from "./rich-content.js";

export { FeedApplication } from "./application.js";
export type { FeedApplicationPorts } from "./application-ports.js";
export * from "./application-errors.js";

export {
  FEED_ARTIFACT_PRODUCER,
  FEED_CAPTURE_ARTIFACT_TYPE_ID,
  FEED_CAPTURE_SCHEMA_VERSION,
  FeedOutRuleStore,
  feedCaptureArtifactId,
  feedOutRuleMatches,
  migrateFeedOutRules,
  parseFeedOutRulePatch,
  parseFeedOutRuleWrite,
} from "./out-rules.js";
export type { FeedArtifactProducer, FeedOutRuleWrite, FeedPluginSqliteDatabase } from "./out-rules.js";

export { createFeedExactRouteResolver, type FeedExactSourceDefinitions } from "./exact-source-routes.js";

export { FeedSourceService } from "./source-service.js";
export type * from "./source-ports.js";

export { FeedConnectorSync } from "./connector-sync.js";
export type { ConnectorSyncMode, FeedConnectorSyncPorts, FeedConnectorListener } from "./connector-sync-ports.js";

export { FeedConnectorService } from "./connector-service.js";
export type { FeedConnectorAccountPorts, FeedConnectorKind, CatalogConnectorPort, ConnectorCredentialStatus, ConnectorAuthStatus } from "./connector-account-ports.js";

export { FeedSourceScheduler, type FeedSourceSchedulerDispatch, type FeedSourceSchedulerResult } from "./source-scheduler.js";

export { promoteFeedItemToGoal, type FeedGoalPromotionPorts, type FeedGoalPromotionInput } from "./goal-promotion.js";

export { createFeedRouteHandlers } from "./route-handlers.js";
export { feedRouteErrorResponse } from "./route-error.js";
export type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
export { FEED_PLUGIN_ID, FEED_PROJECT_PLUGIN_ID, feedManifest } from "./manifest.js";

export { FEED_STYLES } from "./styles.js";

export { FEED_EN } from "./en.js";

export { feedContentActions, createFeedContentHandlers } from "./content-actions.js";
