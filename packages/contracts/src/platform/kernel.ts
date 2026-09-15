import type { ContractDescriptor } from "./package.js";

export const platformKernelContract = {
  contractId: "io.molis.work.platform.kernel.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/PLUGIN-PLATFORM.md",
} as const satisfies ContractDescriptor;
