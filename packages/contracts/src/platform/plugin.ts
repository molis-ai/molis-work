export type { PluginBackgroundClient, PluginBackgroundExecution, PluginJobControl, PluginJobDeclaration, PluginKeptJob } from "./plugin-background.js";
export type { PluginInteractionClient, PluginInteractionNextSteps, PluginInteractionStep } from "./plugin-interaction.js";
import type { ConnectorDriver } from "../services/connector-host.js";
import type { RawEventAdapter } from "../services/listener-host.js";
import type { HostCapabilityDefinition } from "./app-host.js";
import type { ContractDescriptor } from "./package.js";
import type { UiCommandAvailability, UiContribution, UiOpenedObjectView } from "./ui.js";
import type { PluginEventRecord, PluginEventDeliveryContext, PluginEventType } from "./plugin-events.js";
import type { PluginInputDeliveryContext, PluginUpstreamReadyInputs, PluginUpstreamUnavailableReason } from "./plugin-wiring.js";
import type { AgentPromptText, AgentSkillDefinition } from "./plugin-agent.js";
import type { InstructionPrompt } from "./model-prompts.js";
export type { PluginMaterialsClient, PluginMaterialRequest, PluginMaterialSourceRequest, PluginMaterialDocumentsRequest, PluginLocalPageRequest, PluginOriginalRequest, PluginOriginalContent, PluginOriginalRangeRequest, PluginOriginalRangeContent, MaterialSourceContent } from "./plugin-materials.js";
export type { PluginArtifactClient, PluginArtifactPublishInput, PluginProcessItemClient, PluginProcessItemInput, PluginProcessItemHead, PluginConsumableVersion } from "./plugin-artifacts.js";
export type { PluginPackageFile, PluginPackagePayload, PluginPackageBundle, PluginPackageSigner } from "./plugin-package.js";
export * from "./plugin-events.js";
export * from "./plugin-wiring.js";
export * from "./plugin-agent.js";
export * from "./actions.js";
export * from "./plugin-database.js";
export type { PluginScheduleClient, PluginScheduleWriter, PluginScheduleJob, PluginScheduleRegisterInput, PluginWakeupDeclaration } from "./plugin-scheduler.js";
export type { PluginOwnerFileInfo, PluginOwnerFileEntry, PluginOwnerFilesReader, PluginOwnerFilesWriter, PluginOwnerFilesClient, PluginOwnerFilesDeclaration } from "./plugin-owner-files.js";
export * from "./plugin-model.js";
export type { PluginImageTarget, PluginImageConnectionState, PluginImageGenerationRequest, PluginImageGenerationClient, PluginImageGenerationDeclaration } from "./plugin-image-generation.js";
// The services, the Manifest and the route types are declared beside this file (W5-09); this subpath exports all of them.
export type { PluginPrivateStorage, PluginUiClient, PluginActionDirectory, PluginActionClient, PluginHostServices, PluginTerminalClient } from "./plugin-host-services.js";
import type { PluginPrivateStorage, PluginHostServices } from "./plugin-host-services.js";
export type { PluginDeployment, PluginKind, PluginPermissionDeclaration, PluginEntrypointManifest, PluginRequirementDeclaration, PluginUpgradeCompatibilityDeclaration, PluginRouteMethod, PluginRouteDeclaration, PluginManifest } from "./plugin-manifest.js";
export { SURFACE_BROWSER_PERMISSION, browserSiteDeclarations } from "./plugin-manifest.js";
import type { PluginDeployment, PluginManifest } from "./plugin-manifest.js";
export type { PluginCommandInput, PluginRouteRequest, PluginRouteStreamLine, PluginExecutionControl, PluginRouteResponse, PluginRouteBinding } from "./plugin-routes.js";
import type { PluginCommandInput, PluginRouteBinding } from "./plugin-routes.js";

/** Narrow, grant-checked access to Capabilities the Manifest declared as consumed. */
export interface PluginCapabilityClient {
  /** Inspect a declared dependency without invoking it. Actual calls still validate their input and authority. */
  availability(capability: import("./actions.js").ActionReference): import("./actions.js").ActionAvailability;
  invoke<Input, Output>(
    capability: HostCapabilityDefinition<Input, Output>,
    input: Input,
    options?: import("./app-host.js").HostCapabilityCallOptions,
  ): Promise<Output>;
}

export const platformPluginContract = {
  contractId: "io.molis.work.platform.plugin.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/PLUGIN-PLATFORM.md",
} as const satisfies ContractDescriptor;

export type PluginLifecycleState =
  | "installed"
  | "running"
  | "disabled"
  | "crashed"
  | "quarantined"
  | "uninstalled";

export interface PluginInstanceRecord {
  install_id: string;
  /** Changes on confirmed reinstall, unlike the stable private-data namespace. */
  installation_generation: string;
  plugin_id: string;
  version: string;
  publisher_id: string;
  publisher_signature: string;
  manifest_digest: string;
  deployment: PluginDeployment;
  selected_entrypoint: string;
  grants: string[];
  /** Trusted host provenance, never read from a plugin Manifest. */
  execution: "host" | "sandbox";
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
  actions?: readonly import("./actions.js").ActionHandlerBinding[];
  action_scenes?: readonly import("./actions.js").ActionSceneHandlerBinding[];
}

/**
 * A v2 application Plugin. Every member is optional except `kind`: the Host
 * calls only what the Manifest declared, and an undeclared handler is refused
 * before the Plugin runs.
 */
export interface PluginAppContribution {
  kind: "app";
  actions?: readonly import("./actions.js").ActionHandlerBinding[];
  action_scenes?: readonly import("./actions.js").ActionSceneHandlerBinding[];
  /** Renderers for the views the Manifest declares. */
  views?: readonly UiContribution[];
  /** Handlers for the routes the Manifest declares. */
  routes?: readonly PluginRouteBinding[];
  commandAvailability?(commandId: string): UiCommandAvailability;
  executeCommand?(
    commandId: string,
    input: PluginCommandInput,
  ): UiOpenedObjectView | Promise<UiOpenedObjectView>;
  /** Complete, fixed input set. The Host never delivers a partial change. */
  onUpstreamReady?(
    inputs: PluginUpstreamReadyInputs,
    context: PluginInputDeliveryContext,
  ): void | Promise<void>;
  onUpstreamUnavailable?(reason: PluginUpstreamUnavailableReason): void | Promise<void>;
  onEvent?(
    event: PluginEventRecord,
    context: PluginEventDeliveryContext,
  ): void | Promise<void>;
}

export type PluginContribution = PluginIntegrationContribution | PluginAppContribution;

export interface PluginStartContext {
  install_id: string;
  /**
   * The generation of the record this activation runs from. The Home half and the project half of a dual-instance plugin share
   * `install_id` and differ here, and the Host's services refuse a call from the other half (specs/dual-instance-plugins U3).
   */
  readonly installation_generation: string;
  /** Trusted action identity; Home built-ins use plugin_id, project installs use install_id. */
  readonly provider_id?: string;
  plugin_id: string;
  /** Executing implementation version; a compatible implementation may be newer than the persisted install. */
  version: string;
  deployment: PluginDeployment;
  grants: readonly string[];
  /** Project scope this activation belongs to. Absent for project-less reference runs. */
  project_id?: string;
  /** Trusted local owner for HTTP entrypoint binding; never read from business arguments. */
  readonly actor_id?: string;
  /** Input group the Host validated at activation. Undefined means no selection; never the first group. */
  input_group?: string;
  /** Available when running through the application Host, not a bare reference executor. */
  readonly services?: PluginHostServices;
  requireGrant(permission: string): void;
}

/** Restricted context for reading existing private data during upgrade preflight. */
export type PluginUpgradeContext = Omit<PluginStartContext, "services"> & {
  /** Preflight is deliberately read-only. Upgrade validation cannot mutate plugin data. */
  readonly services?: Omit<Partial<PluginHostServices>, "storage" | "database" | "project_database" | "project_statements" | "database_statements" | "files" | "ownerFiles" | "terminal" | "model" | "imageGeneration" | "materials" | "connections" | "directory" | "background" | "scheduler" | "agents" | "installations" | "notifications" | "interaction"> & {
    readonly storage?: Pick<PluginPrivateStorage, "get">;
  };
};

export interface PluginDefinition {
  manifest: PluginManifest;
  /** Set only by the trusted loading adapter. Generated bytes must never be imported by a native loader. */
  execution?: "host" | "sandbox";
  /** v2: validators for the event types this Plugin publishes. */
  event_types?: readonly PluginEventType[];
  /** v2: Prompt bodies for the Agent block. */
  agent_prompts?: readonly AgentPromptText[];
  /** v2: Skill bodies for the Agent block. */
  agent_skills?: readonly AgentSkillDefinition[];
  /**
   * The instructions this plugin sends the model through `services.model`, registered while it runs so the person sees and edits
   * them in “Prompt 与 Character”. Each is the plugin's own (`owner_id` is its plugin id). For a plugin the catalog registers nothing
   * for: one with a catalog entry declares its instructions on that entry, and a definition that carries them for an owner the catalog
   * registers anything for (instructions, Agent prompts, roles or methods) does not start, because an owner's definitions are in one place.
   */
  instructions?: readonly InstructionPrompt[];
  /**
   * Bodies of the Manifest's `methods`, matched by id and version, for a plugin the Host runs itself and the catalog registers
   * nothing for: registered while it runs, as the catalog's are when the Host starts, and withdrawn when it stops (disabled,
   * uninstalled, upgraded). A declared method without a body here is not registered; the developer diagnostics say so.
   */
  methods?: readonly AgentSkillDefinition[];
  start(context: PluginStartContext): Promise<PluginContribution>;
  stop?(context: PluginStartContext): Promise<void>;
  health?(context: PluginStartContext): Promise<{ ok: boolean; message: string }>;
  /** Read the existing private data before a declared non-compatible manual upgrade. Must not mutate it. */
  validateUpgrade?(input: { from: PluginInstanceRecord; context: PluginUpgradeContext }): void | Promise<void>;
}

export interface PluginExecutorHandle {
  contribution: PluginContribution;
}

/** A Host cleanup's user-visible scope, returned with the lifecycle receipt and never persisted as installation state. */
export interface PluginCleanupResult { readonly notes: readonly string[] }

export interface PluginExecutor {
  start(definition: PluginDefinition, context: PluginStartContext): Promise<PluginExecutorHandle>;
  stop(definition: PluginDefinition, context: PluginStartContext): Promise<void>;
  /** Supplies only the target Manifest's declared private storage for preflight. */
  validateUpgrade?(definition: PluginDefinition, context: PluginUpgradeContext, from: PluginInstanceRecord): Promise<void>;
  /** Host snapshot hooks keep persisted private data intact if candidate startup fails. */
  capturePrivateData?(installId: string): Promise<unknown> | unknown;
  restorePrivateData?(installId: string, snapshot: unknown): Promise<void> | void;
  /** The installation is uninstalled and its row saved: remove what the Host kept for it (PG-051 Q1 b). Must be idempotent: uninstall retries call this again, including after a cleanup failure or a completed uninstall. */
  uninstalled?(record: PluginInstanceRecord): Promise<PluginCleanupResult | void> | PluginCleanupResult | void;
  /** Before a replacement is registered or saved, finish a non-retaining uninstall or explicit discard_kept_data. Remove Host-owned files/libraries before KV; failure keeps the earlier uninstalled record and is retryable. `record` is that earlier record. */
  keptDataDiscarded?(record: PluginInstanceRecord): PluginCleanupResult | void;
}

export interface PluginRuntimeRepository {
  get(installId: string): PluginInstanceRecord | null;
  list(): PluginInstanceRecord[];
  save(record: PluginInstanceRecord): void;
}

export interface PluginLifecycleReceipt {
  receipt_id: string;
  operation: "install" | "grant" | "start" | "upgrade" | "rollback" | "stop" | "crash" | "recover" | "uninstall";
  install: PluginInstanceRecord;
  at: string;
  replayed: boolean;
  /** What the Host deliberately preserved outside this installation's cleanup scope. */
  notes?: readonly string[];
}

export interface PluginRuntimeApi {
  register(definition: PluginDefinition): void;
  install(input: {
    definition: PluginDefinition;
    deployment: PluginDeployment;
    grants?: string[];
    retain_private_data?: boolean;
  }): PluginLifecycleReceipt;
  /** Explicit, user-triggered replacement after version, grant and private-data preflight. */
  upgrade(input: { install_id: string; definition: PluginDefinition; deployment?: PluginDeployment; grants?: string[] }): Promise<PluginLifecycleReceipt>;
  /** Generated plugins only: restore earlier code while retaining current private data. */
  rollback(input: { install_id: string; definition: PluginDefinition }): Promise<PluginLifecycleReceipt>;
  grant(installId: string, permissions: string[]): PluginLifecycleReceipt;
  start(installId: string): Promise<PluginLifecycleReceipt>;
  /** Stop a running Plugin without uninstalling it. Restart goes back through `start`. */
  stop(installId: string, options?: { preserve_enabled?: boolean }): Promise<PluginLifecycleReceipt>;
  reportCrash(installId: string, errorCode?: string): Promise<PluginLifecycleReceipt>;
  /** Quarantine release requires an explicit Host action; ordinary recovery never releases it. */
  recover(installId: string, options?: { release_quarantine?: boolean }): Promise<PluginLifecycleReceipt>;
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
    account?: { login: string; account_id?: string };
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

export { pluginErrors } from "./plugin-errors.js";

export type { PluginAgentClient, PluginAgentRunInput, PluginAgentRunResult } from "./plugin-agents.js";

export type { PluginInstallationClient, PluginInstallationView } from "./plugin-installations.js";

export type { PluginNotificationClient, PluginNotificationInput, PluginNotificationReceipt } from "./plugin-notifications.js";
