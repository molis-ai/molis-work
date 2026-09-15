export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-runtime-host",
  packagePath: "horizontal/runtime-host",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/runtime-host",
  migrationGoals: ["goal-reorg-f2","goal-reorg-wk2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["runtime.host.v1", "runtime.codex.v1", "runtime.terminal-pty.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  RuntimeHostRouter,
  assertCompleteRuntimeSessionCapabilities,
  type RuntimeAdapterFallback,
} from "./runtime-router.js";
export {
  CodexRuntimeSessionAdapter,
} from "./adapters/codex-session.js";
export {
  CodexAppServerTransport,
  CodexAppServerTransportError,
  type CodexAppServerTransportOptions,
} from "./adapters/codex-app-server.js";
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
export type {
  RuntimeHostApi,
  RuntimeProviderDescriptor,
  RuntimeSessionAdapter,
  RuntimeSessionAdapterResult,
  RuntimeSessionCapabilities,
  RuntimeSessionCapability,
  RuntimeSessionCapabilityMode,
  RuntimeSessionTransport,
} from "@molis-ai/molis-work-contracts/services/runtime-host";
