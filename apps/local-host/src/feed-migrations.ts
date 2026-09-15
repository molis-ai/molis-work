import { LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { migrateSources } from "@molis-ai/molis-work-module-sources";
import { migrateSignals } from "@molis-ai/molis-work-module-signals";
import { migrateListenerHost } from "@molis-ai/molis-work-service-listener-host";
import { AttentionModule, migrateAttention } from "@molis-ai/molis-work-module-attention-resumption";
import { migrateFeed, migrateInfoflowContractV2 as migrateModuleInfoflowContractV2 } from "@molis-ai/molis-work-module-feed";
import type { InfoflowContractMigrationReport } from "@molis-ai/molis-work-contracts/modules/feed";
import { migrateFeedOutRules } from "@molis-ai/molis-work-plugin-feed";
/** Ordered Feed-related Module initialization for existing Project databases. */
export function migrateFeedTables(db: SqliteDatabase): void {
  migrateSources(db);
  migrateSignals(db);
  migrateListenerHost(db);
  migrateAttention(db);
  migrateFeed(db);
  migrateFeedOutRules(db);
  db.exec(LOCAL_OPAQUE_BLOB_SCHEMA_SQL);
}

export function migrateInfoflowContractV2(db: SqliteDatabase): InfoflowContractMigrationReport {
  migrateFeedTables(db);
  const attention = new AttentionModule(db, { exists: () => true });
  return migrateModuleInfoflowContractV2(db, attention);
}
