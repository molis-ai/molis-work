import type { FeedApplication } from "./application.js";
import type { FeedSourceService } from "./source-service.js";
import type { FeedConnectorService } from "./connector-service.js";
import type { FeedItemRecord, FeedSnapshot, FeedSourceCatalogView, InboxEntryRecord } from "./projection.js";
import type { FeedGoalPromotionInput, promoteFeedItemToGoal } from "./goal-promotion.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

export interface FeedRouteHandlerPorts {
  actions: BoundActionClient;
  boardId: string;
  routePrefix: string;
  feed(): FeedApplication;
  sources(): FeedSourceService;
  connectors(): FeedConnectorService;
  changed(): void;
  hydrateItem(item: FeedItemRecord): FeedItemRecord | Promise<FeedItemRecord>;
  hydrateSnapshot(snapshot: FeedSnapshot): FeedSnapshot | Promise<FeedSnapshot>;
  sourceCatalog(): FeedSourceCatalogView[];
  renderWorkbench(): string | Promise<string>;
  renderDetail(item: FeedItemRecord, options: { entryId: string; inboxActive: boolean; inboxEntry?: InboxEntryRecord | null; surface?: "frame-block" }): string;
  promote(feed: FeedApplication, input: FeedGoalPromotionInput): ReturnType<typeof promoteFeedItemToGoal>;
}
