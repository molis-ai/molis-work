import type {
  EvidenceVerificationApplicationApi,
  EvidenceQueryApi,
} from "@molis-ai/molis-work-contracts/modules/evidence-verification";

import { EvidenceRepository, type EvidenceSqliteDatabase } from "./repository.js";
import { EvidenceVerificationService } from "./verification.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-evidence-verification",
  packagePath: "modules/evidence-verification",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/evidence-verification",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ex2", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "evidence.records.v1",
    "evidence.locator-preflight.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export interface EvidenceVerificationModuleOptions {
  db: EvidenceSqliteDatabase;
}

export class EvidenceVerificationModule implements EvidenceVerificationApplicationApi {
  readonly repository: EvidenceRepository;
  readonly verification: EvidenceVerificationService;
  readonly query: EvidenceQueryApi;

  constructor(options: EvidenceVerificationModuleOptions) {
    this.repository = new EvidenceRepository(options.db);
    this.verification = new EvidenceVerificationService(this.repository);
    this.query = this.verification;
  }
}

export {
  EvidenceVerificationError,
  type EvidenceVerificationErrorFactory,
} from "./errors.js";
export {
  MAX_PROJECT_REFERENCE_BYTES,
  ProjectReferenceError,
  projectReferenceSegments,
  readProjectReference,
  validateEvidenceLocator,
  type EvidenceLocatorValidation,
} from "./locator.js";
export {
  evidenceCorrectionsMigrationRequired,
  migrateEvidenceContractRevisionColumns,
  migrateEvidenceCorrections,
  migrateEvidenceLocatorSource,
  migrateEvidenceLocatorValidation,
  migrateEvidenceLocatorWorkspace,
  type EvidenceMigrationDatabase,
} from "./migrations.js";
export {
  EVIDENCE_SCHEMA_SQL,
  EvidenceRepository,
  createEvidenceSchema,
  mapEvidence,
  mapEvidenceCorrection,
  type EvidenceSqliteDatabase,
  type EvidenceSqliteStatement,
} from "./repository.js";
export { EvidenceVerificationService } from "./verification.js";

export function createEvidenceQueryApi(db: EvidenceSqliteDatabase): EvidenceQueryApi {
  return new EvidenceVerificationService(new EvidenceRepository(db));
}
