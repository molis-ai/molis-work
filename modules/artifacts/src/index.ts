import type {
  ArtifactsApplicationApi,
  ArtifactsCommandApi,
  ArtifactsQueryApi,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

import {
  ArtifactsRepository,
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
  ARTIFACTS_SCHEMA_SQL,
  ArtifactsRepository,
  createArtifactsSchema,
  mapArtifactIdentity,
  mapArtifactVersion,
  type ArtifactsSqliteDatabase,
  type ArtifactsSqliteStatement,
} from "./repository.js";
export {
  ArtifactsService,
  type ArtifactEventInput,
  type ArtifactsServiceOptions,
} from "./service.js";
