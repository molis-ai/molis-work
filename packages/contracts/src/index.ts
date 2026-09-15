/** Generated as the F2 contract-only workspace boundary. */
import type { PackageDescriptor } from "./platform/package.js";

export type {
  ContractDescriptor,
  PackageDescriptor,
  PackageKind,
  PackageMaturity,
} from "./platform/package.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-contracts",
  packagePath: "packages/contracts",
  kind: "foundation",
  maturity: "contract-only",
  contract: "@molis-ai/molis-work-contracts/platform/package",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-f3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const satisfies PackageDescriptor;
