import type { ContractDescriptor } from "../platform/package.js";

export interface PtySpawnRequest {
  panelId: string;
  command?: string;
  args?: string[];
  cwd?: string | null;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  attachOnly?: boolean;
}

export interface PtySpawnResult {
  attached: boolean;
  started: boolean;
  replay: string;
}

export interface PtyHostHandlers {
  onData: (panelId: string, data: string) => void;
  onExit: (panelId: string, exit: { exitCode: number; signal: number }) => void;
}

export const servicesRuntimeHostContract = {
  contractId: "io.molis.work.service.runtime-host.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/horizontal/runtime-host.md",
} as const satisfies ContractDescriptor;
