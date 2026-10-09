import type { ContractDescriptor } from "../platform/package.js";

export const modulesAlchemistContract = {
  contractId: "io.molis.work.module.alchemist.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

export const ALCHEMIST_PLUGIN_ID = "io.molis.work.alchemist";
export const ALCHEMIST_PROJECT_PLUGIN_ID = "alchemist";
