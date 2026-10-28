/** Local SQLite technical owner. */
export { LocalSqliteJournal, LocalSqliteStorage, openExistingSqliteConnection, LOCAL_JOURNAL_SCHEMA_SQL, type SqliteDatabase } from "./sqlite.js";

export { LOCAL_OPAQUE_BLOB_SCHEMA_SQL } from "./schema.js";
export { LocalCatalogMetadata } from "./catalog-metadata.js";

export { inspectExistingStoragePath, inspectExistingSqlitePath, type ExistingStoragePath } from "./storage-maintenance-path.js";

export { atomicWriteFileSync } from "./adapters/atomic-write.js";
export { snapshotFileStat, isSnapshotSqlite, readSnapshotFile, copySnapshotFile, snapshotFileDigest } from "./snapshot-files.js";
export { backupSnapshotSqlite, readSqliteSnapshotMetadata, type SqliteSnapshotMetadata, type SqliteSnapshotOptions, type SqliteSnapshotInfo } from "./snapshot-sqlite.js";
export { acquireStorageOwner, assertStorageOwner, borrowStorageOwner, hasOnlyStorageOwnerFiles, hasStorageBusinessFiles, type StorageOwner, type StorageOwnerBorrow } from "./adapters/storage-owner.js";

export {
  homeSqlitePartitionDirectory,
  homeSqlitePath,
  openHomeSqliteDatabase,
  openHomeSqliteFile,
  openReadOnlyHomeSqlite,
} from "./home-sqlite.js";
export { homeStoreRegistry, type HomeStore, type HomeStoreDeclaration, type HomeStoreRegistry } from "./home-stores.js";
export {
  SqliteSchemaVersionError,
  applySqliteBaseline,
  clearInExistingHomeSqlite,
  describeSqliteBaseline,
  describeSqliteSchema,
  listSqliteObjects,
  openBaselineHomeSqlite,
  openExistingBaselineSqlite,
  type SqliteBaseline,
  type SqliteBaselineDatabase,
  type SqliteSchemaObject,
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
export { sealExistingHomePayload, openExistingHomePayload, type SealedHomePayload } from "./adapters/file-secret-store.js";

export * from "./adapters/search-storage.js";

export { createEvidenceContentStore, evidenceContentRef, type EvidenceContentStore } from "./adapters/evidence-content.js";
export { openMemoryLedger, readMemoryLedgerProfiles, memoryLedgerHasOnlyPreferences, MEMORY_LEDGER_STORE, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_HOME_STORE } from "./adapters/memory-ledger.js";
export { inspectMemoryLedgerAdoption, beginMemoryLedgerAdoption, completeMemoryLedgerAdoption, type MemoryLedgerAdoptionSnapshot, type MemoryLedgerAdoptionProfile } from "./adapters/memory-ledger-adoption.js";
export type { MemoryLedgerCloseFailure } from "./adapters/memory-ledger-close.js";
export { createMemoryLedgerHomeRecovery, type MemoryLedgerHomeRecovery, type MemoryLedgerHomeRecoveryExpected,
  type MemoryLedgerHomeRecoveryChange } from "./adapters/memory-ledger-home-recovery.js";
export type { MemoryHomeRecoveryRecord } from "./adapters/memory-ledger-home-recovery-decision.js";
export { createMemoryLedgerProjectRetention, type MemoryLedgerProjectRetention, type MemoryLedgerProjectRetentionPlan } from "./adapters/memory-ledger-project-retention.js";
export { createMemoryLedgerSelectedRetention, type MemoryLedgerSelectedRetention, type MemoryLedgerSelectedRetentionPlan, type MemoryLedgerSelectedRetentionSource } from "./adapters/memory-ledger-selected-retention.js";
export { openKnowledgeCards, clearKnowledgeProject, KNOWLEDGE_CARDS_STORE, KNOWLEDGE_CARDS_BASELINE, KNOWLEDGE_CARDS_HOME_STORE } from "./adapters/knowledge-cards.js";
export { openTextSearchIndex, normalizeSearchText, searchTokens, searchQueryPlan, TEXT_SEARCH_STORE, TEXT_SEARCH_HOME_STORE, type TextSearchIndexOptions } from "./adapters/text-search-index.js";

export { inspectMemoryLedgerCleanupSources, inspectMemoryLedgerSelectedSources, copyMemoryLedgerCleanupTargets, readMemoryLedgerCleanupDecision, beginMemoryLedgerCleanup, suppressMemoryLedgerCleanupSources, completeMemoryLedgerCleanupTarget, type MemoryLedgerCleanupTarget, type MemoryLedgerCleanupDecision } from "./adapters/memory-ledger-adoption-cleanup.js";
export { clearProjectInExistingTextSearchIndex, type TextSearchProjectCleanupInput, type TextSearchProjectCleanupResult } from "./adapters/text-search-maintenance.js";
export { openMemoryLedgerRecoveryInspection, type MemoryLedgerRecoveryInspection } from "./adapters/memory-ledger-recovery.js";
