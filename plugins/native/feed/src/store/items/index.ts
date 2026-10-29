import type {
  FeedApi,
  FeedItemDisposition,
  FeedMaterialRecord,
  IngestFeedItemInput,
} from "../../contract/feed.js";
import { FeedDispositions } from "./dispositions.js";
import { FeedGoalLinks } from "./goal-links.js";
import { FeedIngest } from "./ingest.js";
import { FeedRecords } from "./records.js";
import type { FeedSql } from "../sql.js";
import type { FeedAttentionPort, FeedModuleOptions } from "./types.js";

export type { FeedAttentionPort, FeedJournalEvent, FeedLedgerPort, FeedModuleOptions } from "./types.js";
export { FEED_ITEMS_SCHEMA_SQL } from "./schema.js";

export class FeedModule implements FeedApi {
  readonly query: FeedApi["query"];
  readonly commands: FeedApi["commands"];
  readonly events: FeedApi["events"];

  constructor(db: FeedSql, attention: FeedAttentionPort, options: FeedModuleOptions) {
    const records = new FeedRecords(db, new FeedGoalLinks(options.ledger), options);
    const ingest = new FeedIngest(records, attention);
    const dispositions = new FeedDispositions(records, attention);
    this.query = {
      list: (projectId: string) => records.list(projectId),
      get: (projectId: string, itemId: string) => records.get(projectId, itemId),
      exists: (projectId: string, itemId: string) => records.exists(projectId, itemId),
      countBySource: (projectId: string, sourceId: string) => records.countBySource(projectId, sourceId),
      findByLinkedGoal: (projectId: string, goalId: string, itemId?: string) =>
        records.findByLinkedGoal(projectId, goalId, itemId),
    };
    this.commands = {
      ingest: (input: IngestFeedItemInput) => ingest.ingest(input),
      upsertMaterial: (material: FeedMaterialRecord) => ingest.upsertMaterial(material),
      setDisposition: (projectId: string, itemId: string, disposition: FeedItemDisposition, expectedRevision?: number) =>
        dispositions.setDisposition(projectId, itemId, disposition, expectedRevision),
      restore: (projectId: string, itemId: string, expectedRevision?: number) =>
        dispositions.restore(projectId, itemId, expectedRevision),
      markRead: (projectId: string, itemId: string) => dispositions.markRead(projectId, itemId),
      linkGoal: (projectId: string, itemId: string, goalId: string, disposition: "promoted" | "processing") =>
        dispositions.linkGoal(projectId, itemId, goalId, disposition),
      deleteBySource: (projectId: string, sourceId: string) => dispositions.deleteBySource(projectId, sourceId),
    };
    this.events = { list: (projectId: string, itemId?: string) => records.listEvents(projectId, itemId) };
  }
}
