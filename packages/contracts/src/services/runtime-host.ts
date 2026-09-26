import type { ContractDescriptor } from "../platform/package.js";

export const RUNTIME_SESSION_CAPABILITIES = [
  "create",
  "list",
  "discover",
  "read",
  "resume",
  "events",
  "handoff",
  "message",
] as const;

export type RuntimeSessionCapability = (typeof RUNTIME_SESSION_CAPABILITIES)[number];
export type RuntimeSessionCapabilityMode = "native" | "registry" | "unsupported";
export type RuntimeSessionCapabilities = Record<RuntimeSessionCapability, RuntimeSessionCapabilityMode>;

export interface RuntimeProviderDescriptor {
  runtime_id: string;
  provider_version: string;
  protocol_version: string;
  capabilities: RuntimeSessionCapabilities;
}

export type RuntimeSessionAdapterResult<T = unknown> =
  | { status: "ok"; source: "native" | "registry"; capability: RuntimeSessionCapability; value: T }
  | {
      status: "unsupported";
      capability: RuntimeSessionCapability;
      code: "runtime.capability_unavailable";
      message: string;
    }
  | {
      status: "failed";
      capability: RuntimeSessionCapability;
      code: "runtime.operation_failed" | "runtime.response_too_large";
      message: string;
      recovery?: {
        phase: "create" | "deliver";
        native_runtime_session_id?: string;
        retryable: boolean;
      };
    };

export interface RuntimeSessionTransport {
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
  subscribe(listener: (event: { method: string; params: unknown }) => void): () => void;
}

export interface RuntimeSessionAdapter {
  readonly runtime_id: string;
  readonly capabilities: RuntimeSessionCapabilities;
  invoke(
    capability: RuntimeSessionCapability,
    input: Record<string, unknown>,
  ): Promise<RuntimeSessionAdapterResult>;
}

export interface RuntimeHostApi {
  register(adapter: RuntimeSessionAdapter): void;
  adapter(runtimeId: string): RuntimeSessionAdapter;
  capabilities(runtimeId: string): RuntimeSessionCapabilities;
  invoke(
    runtimeId: string,
    capability: RuntimeSessionCapability,
    input: Record<string, unknown>,
  ): Promise<RuntimeSessionAdapterResult>;
  matrix(runtimeIds: string[]): Array<{ runtime_id: string; capabilities: RuntimeSessionCapabilities }>;
}

export interface PtySpawnRequest {
  panelId: string;
  /** Business correlation only; Runtime Host never reads or persists it. */
  sessionId?: string | null;
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
