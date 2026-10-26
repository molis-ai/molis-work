import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type {
  FeedApi,
  FeedItemDisposition,
  FeedMaterialRecord,
  IngestFeedItemInput,
} from "@molis-ai/molis-work-contracts/modules/feed";
import { FeedDispositions } from "./dispositions.js";
import { FeedGoalLinks } from "./goal-links.js";
import { FeedIngest } from "./ingest.js";
import { FeedRecords } from "./records.js";
import { text, type Row } from "./rows.js";
import { FEED_SCHEMA_SQL } from "./schema.js";
import type { FeedModuleOptions, FeedSqliteDatabase } from "./types.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-feed",
  packagePath: "modules/feed",
  kind: "module",
  maturity: "production",
  contract: "@molis-ai/molis-work-contracts/modules/feed",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["feed.query.v1", "feed.command.v1"],
} as const;

export type { FeedJournalEvent, FeedModuleOptions, FeedSqliteDatabase } from "./types.js";
export { FEED_SCHEMA_SQL } from "./schema.js";

/** The evidence bodies the Feed materials in this database point at (`content_ref`), each once. */
export function listFeedMaterialContentRefs(db: Pick<FeedSqliteDatabase, "prepare">): string[] {
  return (db.prepare("SELECT DISTINCT content_ref FROM feed_materials WHERE content_ref IS NOT NULL").all() as Row[])
    .map((row) => text(row.content_ref));
}

export class FeedModule implements FeedApi {
  readonly query: FeedApi["query"];
  readonly commands: FeedApi["commands"];
  readonly events: FeedApi["events"];

  constructor(db: FeedSqliteDatabase, attention: AttentionApi, options: FeedModuleOptions) {
    db.exec(FEED_SCHEMA_SQL);
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

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
