export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-runtime-host",
  packagePath: "horizontal/runtime-host",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/runtime-host",
  migrationGoals: ["goal-reorg-f2","goal-reorg-wk2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["runtime.host.v1", "runtime.terminal-pty.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  MolisWorkPtyHost,
  buildPtyEnvironment,
  isBlockedPtyEnvKey,
  isPtyCommandAvailable,
  resolveNvmBinDirectory,
  resolvePtyCommand,
  type PtyHostHandlers,
  type PtySpawnRequest,
  type PtySpawnResult,
} from "./adapters/terminal-pty.js";
