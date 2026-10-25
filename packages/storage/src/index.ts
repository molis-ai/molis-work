/** Local SQLite technical owner. */
export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-storage",
  packagePath: "packages/storage",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/storage",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ap2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { LocalSqliteJournal, LocalSqliteStorage, LOCAL_JOURNAL_SCHEMA_SQL, type SqliteDatabase } from "./sqlite.js";

export { LOCAL_OPAQUE_BLOB_SCHEMA_SQL } from "./schema.js";
export { LocalCatalogMetadata } from "./catalog-metadata.js";

export { atomicWriteFileSync } from "./adapters/atomic-write.js";

export {
  homeSqlitePartitionDirectory,
  homeSqlitePath,
  openHomeSqliteDatabase,
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
  type SqliteBaseline,
  type SqliteBaselineDatabase,
  type SqliteSchemaObject,
  type SqliteSchemaShape,
} from "./sqlite-baseline.js";

export {
  runWithMolisWorkHome,
  resolveMolisWorkHome,
  resolveFeedSecurityDirectory,
  readProductEnv,
  resolveProjectDatabaseFile,
  DEFAULT_HOME_DIRNAME,
  PROJECT_DATABASE_FILENAME,
} from "./adapters/local-security-paths.js";

export { type SecretStore, type SecretStoreBackendKind, type SecretStoreBackendInfo, KeychainUnavailableError, holdSecretsLockForTest, createFileSecretStore, createLazyFileSecretStore, resetSecretStoreCache, peekSealedEntry, deleteSecretEntriesWithPrefix, readSecretsFileMeta } from "./adapters/file-secret-store.js";
export { inspectSealedSecretsSnapshot, readSealedSecretSnapshotEntry, readExistingSecret, type SealedSecretsSnapshotInspection } from "./adapters/file-secret-store.js";
export { sealExistingHomePayload, openExistingHomePayload, type SealedHomePayload } from "./adapters/file-secret-store.js";

export * from "./adapters/search-storage.js";

export { createEvidenceContentStore, type EvidenceContentStore } from "./adapters/evidence-content.js";
export { openMemoryLedger, MEMORY_LEDGER_STORE, MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_HOME_STORE } from "./adapters/memory-ledger.js";
export { inspectMemoryLedgerAdoption, beginMemoryLedgerAdoption, completeMemoryLedgerAdoption, type MemoryLedgerAdoptionSnapshot, type MemoryLedgerAdoptionProfile } from "./adapters/memory-ledger-adoption.js";
export { openKnowledgeCards, clearKnowledgeProject, KNOWLEDGE_CARDS_STORE, KNOWLEDGE_CARDS_BASELINE, KNOWLEDGE_CARDS_HOME_STORE } from "./adapters/knowledge-cards.js";
export { openTextSearchIndex, normalizeSearchText, searchTokens, searchQueryPlan, TEXT_SEARCH_STORE, TEXT_SEARCH_HOME_STORE, type TextSearchIndexOptions } from "./adapters/text-search-index.js";
