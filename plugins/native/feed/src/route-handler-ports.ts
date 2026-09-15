import type { FeedApplication } from "./application.js";
import type { FeedSourceService } from "./source-service.js";
import type { FeedConnectorService } from "./connector-service.js";
import type { FeedItemRecord, FeedSnapshot, FeedSourceCatalogView, InboxEntryRecord, RelayImportAvailability } from "./projection.js";
import type { RelayImportResult } from "./relay-import-types.js";
import type { FeedGoalPromotionInput, promoteFeedItemToGoal } from "./goal-promotion.js";

export interface FeedRouteHandlerPorts {
  boardId: string;
  routePrefix: string;
  feed(): FeedApplication;
  sources(): FeedSourceService;
  connectors(): FeedConnectorService;
  changed(): void;
  hydrateItem(item: FeedItemRecord): FeedItemRecord;
  hydrateSnapshot(snapshot: FeedSnapshot): FeedSnapshot;
  sourceCatalog(): FeedSourceCatalogView[];
  detectRelayImport(): RelayImportAvailability;
  importRelay(feed: FeedApplication): RelayImportResult;
  renderWorkbench(): string;
  renderDetail(item: FeedItemRecord, options: { entryId: string; inboxActive: boolean; inboxEntry?: InboxEntryRecord | null; surface?: "frame-block" }): string;
  promote(feed: FeedApplication, input: FeedGoalPromotionInput): ReturnType<typeof promoteFeedItemToGoal>;
}
