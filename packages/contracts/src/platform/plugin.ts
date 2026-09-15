import type { ConnectorDriver } from "../services/connector-host.js";
import type { RawEventAdapter } from "../services/listener-host.js";
import type { ContractDescriptor } from "./package.js";
import type { UiContribution } from "./ui.js";
import type { PluginArtifactClient } from "./plugin-artifacts.js";

export { parsePluginManifest, PluginManifestError, canonicalPluginId } from "./plugin-manifest.js";
export type { PluginArtifactClient, PluginArtifactPublishInput } from "./plugin-artifacts.js";
export type { PluginPackageFile, PluginPackagePayload, PluginPackageBundle, PluginPackageSigner } from "./plugin-package.js";

/** Opaque, personal installation data. The author owns serialization, not storage paths or SQL. */
export interface PluginPrivateStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): boolean;
}

export interface PluginUiClient {
  register<TModel>(contribution: UiContribution<TModel>): void;
  unregister(contributionId: string): void;
}

export interface PluginHostServices {
  /** Present only when the Manifest declares private storage. Actual grant is checked on each operation. */
  readonly storage?: PluginPrivateStorage;
  readonly artifacts: PluginArtifactClient;
  readonly ui: PluginUiClient;
}

export const platformPluginContract = {
  contractId: "io.molis.work.platform.plugin.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/PLUGIN-PLATFORM.md",
} as const satisfies ContractDescriptor;

export type PluginDeployment = "local" | "server";
export type PluginKind = "native" | "integration";
export type PluginLifecycleState =
  | "installed"
  | "running"
  | "disabled"
  | "crashed"
  | "quarantined"
  | "uninstalled";

export interface PluginPermissionDeclaration {
  permission: string;
  required: boolean;
  reason: string;
}

export interface PluginEntrypointManifest {
  deployment: PluginDeployment;
  entrypoint: string;
}

export interface PluginManifest {
  schema_version: 1;
  plugin_id: string;
  version: string;
  name: string;
  kind: PluginKind;
  publisher: {
    publisher_id: string;
    /** Signature identity. A changed value creates a different Plugin identity. */
    signature: string;
  };
  host_api_version: 1;
  entrypoints: PluginEntrypointManifest[];
  permissions: PluginPermissionDeclaration[];
  capabilities: {
    provides: string[];
    consumes: string[];
  };
  artifacts: {
    produces: Array<{ artifact_type_id: string; schema_version: number }>;
    consumes: Array<{ artifact_type_id: string; schema_version: number }>;
  };
  ui: {
    contributions: string[];
  };
}

export interface PluginInstanceRecord {
  install_id: string;
  plugin_id: string;
  version: string;
  publisher_id: string;
  publisher_signature: string;
  manifest_digest: string;
  deployment: PluginDeployment;
  selected_entrypoint: string;
  grants: string[];
  state: PluginLifecycleState;
  recovery_count: number;
  last_error_code: string | null;
  installed_at: string;
  updated_at: string;
  uninstalled_at: string | null;
  retain_private_data: boolean;
}

export interface PluginIntegrationContribution {
  kind: "integration";
  connector_driver: ConnectorDriver;
  signal_adapter: RawEventAdapter;
}

export type PluginContribution = PluginIntegrationContribution;

export interface PluginStartContext {
  install_id: string;
  plugin_id: string;
  version: string;
  deployment: PluginDeployment;
  grants: readonly string[];
  /** Available when running through the application Host, not a bare reference executor. */
  readonly services?: PluginHostServices;
  requireGrant(permission: string): void;
}

export interface PluginDefinition {
  manifest: PluginManifest;
  start(context: PluginStartContext): Promise<PluginContribution>;
  stop?(context: PluginStartContext): Promise<void>;
  health?(context: PluginStartContext): Promise<{ ok: boolean; message: string }>;
}

export interface PluginExecutorHandle {
  contribution: PluginContribution;
}

export interface PluginExecutor {
  start(definition: PluginDefinition, context: PluginStartContext): Promise<PluginExecutorHandle>;
  stop(definition: PluginDefinition, context: PluginStartContext): Promise<void>;
}

export interface PluginRuntimeRepository {
  get(installId: string): PluginInstanceRecord | null;
  list(): PluginInstanceRecord[];
  save(record: PluginInstanceRecord): void;
}

export interface PluginLifecycleReceipt {
  receipt_id: string;
  operation: "install" | "grant" | "start" | "crash" | "recover" | "uninstall";
  install: PluginInstanceRecord;
  at: string;
  replayed: boolean;
}

export interface PluginRuntimeApi {
  register(definition: PluginDefinition): void;
  install(input: {
    definition: PluginDefinition;
    deployment: PluginDeployment;
    grants?: string[];
    retain_private_data?: boolean;
  }): PluginLifecycleReceipt;
  grant(installId: string, permissions: string[]): PluginLifecycleReceipt;
  start(installId: string): Promise<PluginLifecycleReceipt>;
  reportCrash(installId: string, errorCode?: string): Promise<PluginLifecycleReceipt>;
  recover(installId: string): Promise<PluginLifecycleReceipt>;
  uninstall(installId: string, options?: { retain_private_data?: boolean }): Promise<PluginLifecycleReceipt>;
  get(installId: string): PluginInstanceRecord;
  list(): PluginInstanceRecord[];
  contribution(installId: string): PluginContribution | null;
}

export interface IntegrationProviderItem {
  externalId: string;
  title: string;
  summary: string;
  body?: string;
  url?: string;
  occurredAt?: string;
  kind?: "message" | "notification" | "issue" | "pr" | "mention" | "update";
  priority?: "low" | "medium" | "high" | "urgent";
  tags?: string[];
  author?: string;
  /** Provider hint only. Feed owns the final Attention decision. */
  attention?: false | { reason: "source_rule"; detail?: Record<string, unknown> };
}

export type IntegrationProviderFailure =
  | "needs_auth"
  | "configuration"
  | "network"
  | "provider"
  | "rate_limited"
  | "stale_history";

export type IntegrationProviderSyncResult =
  | {
      ok: true;
      mode: "live" | "fixture";
      items: IntegrationProviderItem[];
      cursor: unknown;
    }
  | {
      ok: false;
      mode: "live";
      failure: IntegrationProviderFailure;
      message: string;
      action?: string;
      httpStatus?: number;
      retryAfterAt?: string;
    };

export interface IntegrationProviderPort {
  readonly type: string;
  health(): Promise<{
    ok: boolean;
    status: "connected" | "disconnected" | "error" | "mock" | "needs_auth";
    message: string;
    action?: string;
  }>;
  sync(input: {
    cursor: unknown;
    mode?: "normal" | "rebuild_cursor";
  }): Promise<IntegrationProviderSyncResult>;
}
