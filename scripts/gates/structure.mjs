// The structure gates of specs/repository-anti-corruption W1-05, as metrics for scripts/check-health-gates.mjs: numbers
// that may only fall, measured on the working tree and on the merge-base by the same code. Each gate is its own module in
// this directory; this file lists them for the entry, which calls structureMetrics(helpers) once.
import { assemblyMetrics, assemblyWantsText } from "./assembly.mjs";
import { contractsPurity } from "./contracts-purity.mjs";
import { hostEntryExports } from "./host-entry-exports.mjs";
import { moduleRepositoryExports } from "./module-repository-exports.mjs";
import { typedCapabilities } from "./typed-capabilities.mjs";

/** Files the structure gates read besides source files and test files (the entry reads them from the merge-base too). */
export const structureWantsText = (file) => assemblyWantsText(file);

/** `helpers`: { isSource, perFile, rekey, rekeyUnit, sumOf }, shared by the entry. */
export const structureMetrics = (helpers) => [
  contractsPurity(helpers),
  hostEntryExports(helpers),
  moduleRepositoryExports(helpers),
  typedCapabilities(helpers),
  ...assemblyMetrics(helpers),
];
