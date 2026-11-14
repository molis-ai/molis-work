/** Local SQLite technical owner. */
export { openSqliteConnection, sqliteErrorName, sqliteRowAuthorizerCodes, type SqliteAuthorizer } from "./sqlite-connection.js";
export { LocalSqliteJournal, LocalSqliteStorage, LOCAL_JOURNAL_SCHEMA_SQL, type SqliteDatabase } from "./sqlite.js";

export { LOCAL_OPAQUE_BLOB_SCHEMA_SQL } from "./schema.js";
export { CATALOG_VERSION_ACCESS,LocalCatalogMetadata,catalogOwner,inspectCatalogFile } from "./catalog-metadata.js";

export { atomicWriteFileSync, syncPath } from "./adapters/atomic-write.js";
export { parseMemoryForgetting, serializeMemoryForgetting, mergeMemoryForgetting, inspectMemoryForgetting,
  initializeMemoryForgetting, openMemoryForgetting, startMemoryForgettingGeneration, MEMORY_FORGETTING_HOME_STORE } from "./adapters/memory-forgetting.js";
export { createAtomicFileDocument } from './adapters/file-document.js';
export { ensureStorageSpace, readStorageSpace, personalStorageSpace, bindDatabaseSpace, readDatabaseSpace, spaceAssetRef, STORAGE_SPACE_SCHEMA_SQL, type StorageSpace, type SpaceAssetRef } from './space.js';
export { snapshotFileStat, isSnapshotSqlite, readSnapshotFile, copySnapshotFile, snapshotFileDigest } from "./snapshot-files.js";
export { backupSnapshotSqlite, inspectSnapshotSqlite, type SqliteSnapshotOptions, type SqliteSnapshotInfo } from "./snapshot-sqlite.js";
export { acquireStorageOwner, acquireStorageOwnerForRecovery, assertStorageOwner, onStorageOwnerRelease, storageOwnerHeldHere, retainStorageOwner, borrowStorageOwner, hasOnlyStorageOwnerFiles, hasStorageBusinessFiles, type StorageOwner, type StorageOwnerBorrow } from "./adapters/storage-owner.js";
export { HOME_RESTORE_JOURNAL, assertNoPendingHomeRestore } from "./adapters/home-restore-guard.js";

export {
  homeSqlitePartitionDirectory,
  homeSqlitePath,
  openHomeSqliteDatabase,
  openHomeSqliteFile,
  openReadOnlyHomeSqlite,
} from "./home-sqlite.js";
export { runSqliteUpgrade, upgradeStepsProblem, type SqliteUpgradeResult } from "./sqlite-upgrade.js";
export { readUpgradeStore, readUpgradeStoreSpace, readUpgradeStoreVersion, upgradeFailedRefusal, upgradeInProgressRefusal, upgradeNoSpaceRefusal, type UpgradeStoreVersion } from "./upgrade-inspection.js";
export {
  assertUpgradeDiskSpace,
  captureUpgradeFileSnapshot,
  captureUpgradeSnapshot,
  pruneUpgradeSnapshots,
  restoreUpgradeSnapshot,
  upgradeSnapshotListed,
  verifyUpgradeSnapshot,
  type UpgradeHomeLock,
  type UpgradeSnapshotEntry,
  type UpgradeSnapshotKeyDependency,
  type UpgradeSnapshotUnit,
  type UpgradeSqliteConnection,
} from "./upgrade-snapshot.js";
export { recoverSqliteRollbackJournals, type RollbackLibrary } from "./rollback-journal.js";
export { homeStoreRegistry, type HomeStore, type HomeStoreDeclaration, type HomeStoreRegistry } from "./home-stores.js";
export {
  isSqliteSchemaStructureMismatch,
  isSqliteVersionRefusal,
  onUpgradePending,
  sqliteStoreLabel,
  sqliteVersionRefusal,
  storageErrors,
  USER_VERSION_ACCESS,
  versionRefusalAfterSignal,
  type SqliteVersionAccess,
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
  type UpgradePendingListener,
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

export { type SecretStore, type SecretStoreBackendKind, type SecretStoreBackendInfo, KeychainUnavailableError, holdSecretsLockForTest, createFileSecretStore,
  SECRET_STORE_FILE, assertSecretStoreWritable, createLazyFileSecretStore, resetSecretStoreCache, peekSealedEntry, deleteSecretEntriesWithPrefix, readSecretsFileMeta } from "./adapters/file-secret-store.js";
export { inspectSealedSecretsSnapshot, readSealedSecretSnapshotEntry, readExistingSecret, type SealedSecretsSnapshotInspection } from "./adapters/file-secret-store.js";
export { sealExistingHomePayload, openExistingHomePayload, assertExistingHomeKeyReference, type SealedHomePayload } from "./adapters/file-secret-store.js";

export * from "./adapters/search-storage.js";

export { createEvidenceContentStore, evidenceContentRef, type EvidenceContentStore } from "./adapters/evidence-content.js";
export { createLocalPayloadProtection } from './adapters/local-payload-protection.js';
export { replicaSerialization as createSyncBodySerialization } from './replica-serialization.js';
export { installReplicaTrigger, replicaTriggerDefinitions, shareReplicaTriggerDefinitions } from './replica-triggers.js';
export {borrowedReplicaDatabase,hasReplicaBodies} from './borrowed-replica.js';
export { openMemoryLedger, inspectMemoryLedger, finishMemoryLedgerUpgrade, type MemoryLedgerInspection, MEMORY_LEDGER_STORE, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_HOME_STORE } from "./adapters/memory-ledger.js";
export { readMemoryLedgerRestoreFacts, retainMemoryLedgerAfterRestore } from "./adapters/memory-ledger-recovery.js";
export { openKnowledgeCards, clearKnowledgeProject, KNOWLEDGE_CARDS_STORE, KNOWLEDGE_CARDS_BASELINE, KNOWLEDGE_CARDS_HOME_STORE } from "./adapters/knowledge-cards.js";
export { openTextSearchIndex, normalizeSearchText, searchTokens, searchQueryPlan, TEXT_SEARCH_STORE, TEXT_SEARCH_HOME_STORE, type TextSearchIndexOptions } from "./adapters/text-search-index.js";
export { hasReplicaHistory,replicaApplyingSql, replicaSchemaSql, initializeReplica, replicaMarkSql, replicaMarkRowsSql, queueReplicaChange, replicaTransaction, createSqliteReplica, namespacedReplicaDatabase, type ReplicaInputValue,type ReplicaOutputValue,type ReplicaDatabase, type SqliteReplica, type ReplicaReceiveDisposition } from './replica.js';
export { AGGREGATE_REPLICA_SCHEMA_SQL, initializeAggregateReplication, createAggregateReplica, type AggregateDefinition, type AggregateRecords, type AggregateReplicaContext, type PortableRow } from './aggregate-replica.js';
export { createProjectReplicaSection, installProjectReplicaJournal, validateProjectReplicaRows } from './project-replica.js';
export { PROJECT_SECTIONS_INLINE_ENCODING, createProjectContentReplicaFactory, validateProjectContentReplication } from './project-replica-content.js';
export { createProjectReplicaJournal, validateProjectReplicaJournal } from './project-replica-journal.js';
export { mapReplicaSequences } from './replica-sequences.js';

export {retainLocalReplicaSnapshot} from './replica.js';

export {createAggregateCopy} from './aggregate-copy.js';
export type {AggregateCopyContext} from './aggregate-copy.js';

export { compileSyncTrackingSql, syncTrackingSeedSql } from './sync-tracking.js';

export { compileAggregateTrackingSql, aggregateTrackingSeedSql } from './aggregate-tracking.js';
export { createCollectionCopy } from './collection-copy.js';

export { nativeSqliteOwnerBoundary, nativeSqliteSchemaBoundary, type PluginSqlExecution } from './sqlite-owner-boundary.js';
export { sqliteBaselineTriggers, assertSqliteBaselineTriggers } from './sqlite-baseline-inspection.js';
export { dumpSqliteText, countSqliteRows, SQLITE_DUMP_NORMALIZED_COLUMNS, type SqliteTextDump } from './sqlite-text-dump.js';
export { inspectEvidenceContentSnapshot } from "./evidence-snapshot.js";
export {
  assertVersionedFileWritable,
  entryAt,
  readVersionedFile,
  readVersionedFileVersion,
  upgradeVersionedFile,
  upgradeVersionedFileInPlace,
  versionedFileStepsProblem,
  type VersionedFile,
  type VersionedFileRead,
  type VersionedFileStep,
} from "./versioned-file.js";
export { rollbackPreservingError } from "./transaction-errors.js";

export { openExistingBaselineHomeSqlite } from "./sqlite-baseline.js";
