import type { FeedItemRecord, FeedSnapshot, FeedSourceCatalogView, InboxEntryRecord } from "./projection.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

export interface FeedRouteHandlerPorts {
  actions: BoundActionClient;
  routePrefix: string;
  inboxEntries(): Promise<readonly InboxEntryRecord[]>;
  changed(): void;
  hydrateItem(item: FeedItemRecord): FeedItemRecord | Promise<FeedItemRecord>;
  hydrateSnapshot(snapshot: FeedSnapshot): FeedSnapshot | Promise<FeedSnapshot>;
  sourceCatalog(): FeedSourceCatalogView[];
  renderWorkbench(): string | Promise<string>;
  /** `promoteAvailable`: whether the promotion can run for this caller now; the reader shows its button only then. */
  renderDetail(item: FeedItemRecord, options: { entryId: string; inboxActive: boolean; promoteAvailable: boolean; inboxEntry?: InboxEntryRecord | null; surface?: "frame-block" }): string;
}
