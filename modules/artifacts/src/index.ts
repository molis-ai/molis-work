import type {
  ArtifactsApplicationApi,
  ArtifactsCommandApi,
  ArtifactsQueryApi,
  ProcessItemRecord,
  ProcessItemsApplicationApi,
  RecordProcessItemInput,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

import {
  ArtifactsRepository,
  PROCESS_ITEM_TABLES,
  type ArtifactsSqliteDatabase,
} from "./repository.js";
import {
  ArtifactsService,
  type ArtifactsServiceOptions,
} from "./service.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-artifacts",
  packagePath: "modules/artifacts",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/artifacts",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ar1","goal-reorg-ar3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "artifacts.identity.v1",
    "artifacts.version-repository.v1",
    "artifacts.opaque-content.v1",
    "artifacts.compatibility.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export interface ArtifactsModuleOptions extends ArtifactsServiceOptions {
  db: ArtifactsSqliteDatabase;
}

export class ArtifactsModule implements ArtifactsApplicationApi {
  readonly repository: ArtifactsRepository;
  readonly service: ArtifactsService;
  readonly query: ArtifactsQueryApi;
  readonly commands: ArtifactsCommandApi;

  constructor(options: ArtifactsModuleOptions) {
    this.repository = new ArtifactsRepository(options.db);
    this.service = new ArtifactsService(this.repository, options);
    this.query = this.service;
    this.commands = this.service;
  }
}

/**
 * Process items: the exchange data plugins pass to each other (a file snapshot, a change set, a run's receipt). Same
 * immutable versions as the 成果库 but its own tables and events, so none of it shows up where people look for 成果.
 * Each item belongs to the plugin that produced it (specs/artifact-positioning A2).
 */
export class ProcessItemsModule implements ProcessItemsApplicationApi {
  readonly repository: ArtifactsRepository<ProcessItemRecord>;
  readonly service: ArtifactsService<ProcessItemRecord, RecordProcessItemInput>;
  readonly query: ProcessItemsApplicationApi["query"];
  readonly commands: ProcessItemsApplicationApi["commands"];

  constructor(options: Omit<ArtifactsModuleOptions, "kind">) {
    this.repository = new ArtifactsRepository<ProcessItemRecord>(options.db, PROCESS_ITEM_TABLES);
    this.service = new ArtifactsService<ProcessItemRecord, RecordProcessItemInput>(this.repository, { ...options, kind: "process_item" });
    this.query = this.service;
    this.commands = this.service;
  }
}

export {
  artifactContentDigest,
  artifactContentSize,
  canonicalArtifactJson,
  normalizeArtifactMetadata,
  normalizeArtifactPayload,
} from "./content.js";
export {
  ArtifactsError,
  defaultArtifactsErrorFactory,
  type ArtifactsErrorFactory,
} from "./errors.js";
export {
  ARTIFACTS_MIGRATION_ID,
  migrateArtifactsSchema,
} from "./migrations.js";
export {
  ARTIFACT_TABLES,
  ARTIFACTS_SCHEMA_SQL,
  ArtifactsRepository,
  createArtifactsSchema,
  createProcessItemsSchema,
  PROCESS_ITEM_TABLES,
  PROCESS_ITEMS_SCHEMA_SQL,
  versionStoreSchemaSql,
  type VersionStoreTables,
  mapArtifactIdentity,
  mapArtifactVersion,
  mapFixedVersion,
  type ArtifactsSqliteDatabase,
  type ArtifactsSqliteStatement,
} from "./repository.js";
export {
  ArtifactsService,
  type ArtifactEventInput,
  type ArtifactsServiceOptions,
  type VersionStoreKind,
} from "./service.js";
