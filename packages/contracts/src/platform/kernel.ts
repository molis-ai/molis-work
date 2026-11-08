import type { ContractDescriptor } from "./package.js";

export const platformKernelContract = {
  contractId: /* @version contract.io.molis.work.platform.kernel "io.molis.work.platform.kernel.v{version}" */ "io.molis.work.platform.kernel.v1",
  kind: "platform",
  schemaVersion: /* @version contract.io.molis.work.platform.kernel */ 1,
  maturity: "partial",
  ssot: "docs/platform/PLUGIN-PLATFORM.md",
} as const satisfies ContractDescriptor;
