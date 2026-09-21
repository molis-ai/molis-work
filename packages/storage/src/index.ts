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

export { SqliteSchema, LOCAL_OPAQUE_BLOB_SCHEMA_SQL } from "./schema.js";
export { LocalCatalogMetadata } from "./catalog-metadata.js";

export { atomicWriteFileSync } from "./adapters/atomic-write.js";

export {
  runWithMolisWorkHome,
  resolveMolisWorkHome,
  resolveFeedSecurityDirectory,
  readProductEnv,
  resolveProjectDatabaseFile,
  DEFAULT_HOME_DIRNAME,
  PROJECT_DATABASE_FILENAME,
} from "./adapters/local-security-paths.js";

export { type SecretStore, type SecretStoreBackendKind, type SecretStoreBackendInfo, type SecretStoreMigrationResult, KeychainUnavailableError, holdSecretsLockForTest, isLegacyEnvelope, sealLegacyForTest, assertNotReversibleBase64Only, safeEqualString, createFileSecretStore, resetSecretStoreCache, peekSealedEntry, readSecretsFileMeta } from "./adapters/file-secret-store.js";

export * from "./adapters/search-storage.js";
