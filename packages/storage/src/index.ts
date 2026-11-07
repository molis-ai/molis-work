/** Local SQLite technical owner. */
export { openSqliteConnection, sqliteErrorName } from "./sqlite-connection.js";
export { LocalSqliteJournal, LocalSqliteStorage, LOCAL_JOURNAL_SCHEMA_SQL, type SqliteDatabase } from "./sqlite.js";

export { LOCAL_OPAQUE_BLOB_SCHEMA_SQL } from "./schema.js";
export { LocalCatalogMetadata,inspectCatalogFile } from "./catalog-metadata.js";

export { atomicWriteFileSync } from "./adapters/atomic-write.js";
export { createAtomicFileDocument } from './adapters/file-document.js';
export { ensureStorageSpace, readStorageSpace, personalStorageSpace, bindDatabaseSpace, readDatabaseSpace, spaceAssetRef, STORAGE_SPACE_SCHEMA_SQL, type StorageSpace, type SpaceAssetRef } from './space.js';
export { snapshotFileStat, isSnapshotSqlite, readSnapshotFile, copySnapshotFile, snapshotFileDigest } from "./snapshot-files.js";
export { backupSnapshotSqlite, inspectSnapshotSqlite, type SqliteSnapshotOptions, type SqliteSnapshotInfo } from "./snapshot-sqlite.js";
export { acquireStorageOwner, acquireStorageOwnerForRecovery, assertStorageOwner, retainStorageOwner, borrowStorageOwner, hasOnlyStorageOwnerFiles, hasStorageBusinessFiles, type StorageOwner, type StorageOwnerBorrow } from "./adapters/storage-owner.js";
export { HOME_RESTORE_JOURNAL, assertNoPendingHomeRestore } from "./adapters/home-restore-guard.js";

export {
  homeSqlitePartitionDirectory,
  homeSqlitePath,
  openHomeSqliteDatabase,
  openHomeSqliteFile,
  openReadOnlyHomeSqlite,
} from "./home-sqlite.js";
export { runSqliteUpgrade, type SqliteUpgradeResult } from "./sqlite-upgrade.js";
export {
  assertUpgradeDiskSpace,
  captureUpgradeSnapshot,
  pruneUpgradeSnapshots,
  restoreUpgradeSnapshot,
  verifyUpgradeSnapshot,
  type UpgradeHomeLock,
  type UpgradeSnapshotEntry,
  type UpgradeSnapshotKeyDependency,
  type UpgradeSnapshotUnit,
  type UpgradeSqliteConnection,
} from "./upgrade-snapshot.js";
export { homeStoreRegistry, type HomeStore, type HomeStoreDeclaration, type HomeStoreRegistry } from "./home-stores.js";
export {
  isSqliteSchemaStructureMismatch,
  isSqliteVersionRefusal,
  sqliteVersionRefusal,
  checkSqliteBaselineVersion,
  applySqliteBaseline,
  clearInExistingHomeSqlite,
  describeSqliteBaseline,
  describeSqliteSchema,
  listSqliteObjects,
  openBaselineHomeSqlite,
  type SqliteBaseline,
  type SqliteBaselineDatabase,
  type SqliteSchemaObject,
  type SqliteUpgradeStep,
  type SqliteSchemaShape,
} from "./sqlite-baseline.js";

export {
  runWithMolisWorkHome,
  resolveMolisWorkHome,
  resolveHomeDirectory,
  resolveHomeSecurityDirectory,
  readProductEnv,
  resolveProjectDatabaseFile,
  DEFAULT_HOME_DIRNAME,
  PROJECT_DATABASE_FILENAME,
} from "./adapters/local-security-paths.js";

export { type SecretStore, type SecretStoreBackendKind, type SecretStoreBackendInfo, KeychainUnavailableError, holdSecretsLockForTest, createFileSecretStore, createLazyFileSecretStore, resetSecretStoreCache, peekSealedEntry, deleteSecretEntriesWithPrefix, readSecretsFileMeta } from "./adapters/file-secret-store.js";
export { inspectSealedSecretsSnapshot, readSealedSecretSnapshotEntry, readExistingSecret, type SealedSecretsSnapshotInspection } from "./adapters/file-secret-store.js";
export { sealExistingHomePayload, openExistingHomePayload, assertExistingHomeKeyReference, type SealedHomePayload } from "./adapters/file-secret-store.js";

export * from "./adapters/search-storage.js";

export { createEvidenceContentStore, evidenceContentRef, type EvidenceContentStore } from "./adapters/evidence-content.js";
export { createLocalPayloadProtection } from './adapters/local-payload-protection.js';
export { replicaSerialization as createSyncBodySerialization } from './replica-serialization.js';
export { installReplicaTrigger, replicaTriggerDefinitions, shareReplicaTriggerDefinitions } from './replica-triggers.js';
export {borrowedReplicaDatabase,hasReplicaBodies} from './borrowed-replica.js';
export { openMemoryLedger, inspectMemoryLedger, type MemoryLedgerInspection, MEMORY_LEDGER_STORE, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_HOME_STORE } from "./adapters/memory-ledger.js";
export { openKnowledgeCards, clearKnowledgeProject, KNOWLEDGE_CARDS_STORE, KNOWLEDGE_CARDS_BASELINE, KNOWLEDGE_CARDS_HOME_STORE } from "./adapters/knowledge-cards.js";
export { openTextSearchIndex, normalizeSearchText, searchTokens, searchQueryPlan, TEXT_SEARCH_STORE, TEXT_SEARCH_HOME_STORE, type TextSearchIndexOptions } from "./adapters/text-search-index.js";
export { hasReplicaHistory,replicaApplyingSql, replicaSchemaSql, initializeReplica, replicaMarkSql, replicaMarkRowsSql, queueReplicaChange, replicaTransaction, createSqliteReplica, namespacedReplicaDatabase, type ReplicaInputValue,type ReplicaOutputValue,type ReplicaDatabase, type SqliteReplica, type ReplicaReceiveDisposition } from './replica.js';
export { AGGREGATE_REPLICA_SCHEMA_SQL, initializeAggregateReplication, createAggregateReplica, type AggregateDefinition, type AggregateRecords, type AggregateReplicaContext, type PortableRow } from './aggregate-replica.js';
export { createProjectReplicaSection, installProjectReplicaJournal, validateProjectReplicaRows } from './project-replica.js';
export { createProjectContentReplicaFactory, validateProjectContentReplication } from './project-replica-content.js';
export { createProjectReplicaJournal, validateProjectReplicaJournal } from './project-replica-journal.js';
export { mapReplicaSequences } from './replica-sequences.js';

export {retainLocalReplicaSnapshot} from './replica.js';

export {createAggregateCopy} from './aggregate-copy.js';
export type {AggregateCopyContext} from './aggregate-copy.js';

export {openAggregateCopyOwner,openOwnerCopyStore} from './aggregate-copy-store.js';
export { compileSyncTrackingSql, syncTrackingSeedSql } from './sync-tracking.js';

export { compileAggregateTrackingSql, aggregateTrackingSeedSql } from './aggregate-tracking.js';
export { createCollectionCopy } from './collection-copy.js';

export { nativeSqliteOwnerBoundary, type PluginSqlExecution } from './sqlite-owner-boundary.js';
export { sqliteBaselineTriggers, assertSqliteBaselineTriggers } from './sqlite-baseline-inspection.js';
export { dumpSqliteText, countSqliteRows, SQLITE_DUMP_NORMALIZED_COLUMNS, type SqliteTextDump } from './sqlite-text-dump.js';
export { inspectEvidenceContentSnapshot } from "./evidence-snapshot.js";
