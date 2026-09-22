import type { ArtifactReference } from "../modules/artifacts.js";
import type { ConnectorDriver } from "../services/connector-host.js";
import type { RawEventAdapter } from "../services/listener-host.js";
import type { HostCapabilityDefinition } from "./app-host.js";
import type { ContractDescriptor } from "./package.js";
import type {
  UiCommandAvailability,
  UiCommandDeclaration,
  UiCommandInputKind,
  UiContribution,
  UiOpenedObjectView,
  UiViewDeclaration,
  UiViewObjectRef,
} from "./ui.js";
import type { PluginArtifactClient } from "./plugin-artifacts.js";
import type {
  PluginEventRecord,
  PluginEventDeliveryContext,
  PluginEventsClient,
  PluginEventsDeclaration,
  PluginEventType,
} from "./plugin-events.js";
import type {
  PluginInputsClient,
  PluginOutputsClient,
  PluginPortsDeclaration,
  PluginUpstreamReadyInputs,
  PluginUpstreamUnavailableReason,
} from "./plugin-wiring.js";
import type { AgentManifest, AgentPromptText, AgentSkillDefinition } from "./plugin-agent.js";
import type {
  PluginMcpExportDeclaration,
  PluginMcpHandlerBinding,
} from "./plugin-mcp.js";

export { parsePluginManifest, PluginManifestError, canonicalPluginId } from "./plugin-manifest.js";
export type { PluginArtifactClient, PluginArtifactPublishInput } from "./plugin-artifacts.js";
export type { PluginPackageFile, PluginPackagePayload, PluginPackageBundle, PluginPackageSigner } from "./plugin-package.js";
export * from "./plugin-events.js";
export * from "./plugin-wiring.js";
export * from "./plugin-agent.js";
export * from "./plugin-mcp.js";
export * from "./plugin-behaviors.js";

/** Opaque, personal installation data. The author owns serialization, not storage paths or SQL. */
export interface PluginPrivateStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): boolean;
  /**
   * Optional atomic replacement within this installation. null expects an absent
   * key; a string expects that exact stored value. false means nothing changed.
   * Authors needing conflict detection must reject a Host without this method;
   * get followed by set is not an equivalent implementation.
   */
  compareAndSet?(key: string, expected: string | null, value: string): boolean;
}

export interface PluginUiClient {
  register<TModel>(contribution: UiContribution<TModel>): void;
  unregister(contributionId: string): void;
}

/** Narrow, grant-checked access to Capabilities the Manifest declared as consumed. */
export interface PluginCapabilityClient {
  invoke<Input, Output>(
    capability: HostCapabilityDefinition<Input, Output>,
    input: Input,
  ): Promise<Output>;
}

export interface PluginHostServices {
  /** Present only when the Manifest declares private storage. Actual grant is checked on each operation. */
  readonly storage?: PluginPrivateStorage;
  readonly artifacts: PluginArtifactClient;
  readonly ui: PluginUiClient;
  /** Present when the Manifest declares published events. */
  readonly events?: PluginEventsClient;
  /** Present when the Manifest declares input ports. */
  readonly inputs?: PluginInputsClient;
  /** Present when the Manifest declares output ports. */
  readonly outputs?: PluginOutputsClient;
  /** Present when the Manifest declares consumed Capabilities. */
  readonly capabilities?: PluginCapabilityClient;
}

export const platformPluginContract = {
  contractId: "io.molis.work.platform.plugin.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/PLUGIN-PLATFORM.md",
} as const satisfies ContractDescriptor;

export type PluginDeployment = "local" | "server";
/**
 * `app` is a v2 Plugin that contributes views, commands, routes, ports and
 * events. `native` stays the v1 first-party entry; `integration` stays the
 * Provider shape. The kind selects the contribution, never the trust level.
 */
export type PluginKind = "native" | "integration" | "app";
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

/**
 * A contract dependency, never an implementation dependency. Any registered
 * provider of `capability_id@version` satisfies it.
 */
export interface PluginRequirementDeclaration {
  capability_id: string;
  version: number;
  /** An unsatisfied optional requirement degrades the Plugin; it does not block it. */
  optional?: boolean;
  reason: string;
}

export type PluginRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * One HTTP route the Host mounts under `/api/plugins/<plugin_id>/`. `path` is a
 * pattern with `:name` segments; the Plugin never owns the prefix or the router.
 */
export interface PluginRouteDeclaration {
  route_id: string;
  method: PluginRouteMethod;
  path: string;
  /** Permission the caller's session must hold. Omitted means the Plugin's own grants suffice. */
  permission?: string;
}

export interface PluginManifest {
  /** 1 is the original shape. 2 adds ports, events, views, commands, routes and agent. */
  schema_version: 1 | 2;
  plugin_id: string;
  version: string;
  name: string;
  kind: PluginKind;
  publisher: {
    publisher_id: string;
    /** Signature identity. A changed value creates a different Plugin identity. */
    signature: string;
  };
  host_api_version: 1 | 2;
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
    /** v2: where each contribution is placed. Absent means the Host places nothing. */
    views?: UiViewDeclaration[];
    /** v2: commands offered to the command menu and content actions. */
    commands?: UiCommandDeclaration[];
  };
  /** v2: named, typed connection points wired by the user inside a project. */
  ports?: PluginPortsDeclaration;
  /** v2: events this Plugin publishes and the exact sources it listens to. */
  events?: PluginEventsDeclaration;
  /** v2: HTTP routes the Host mounts on the Plugin's behalf. */
  routes?: PluginRouteDeclaration[];
  /** v2: Capability contracts required before activation. */
  requires?: PluginRequirementDeclaration[];
  /** v2: roles, prompts, skills and subagents for an Agent-backed Plugin. */
  agent?: AgentManifest;
  /**
   * Tools this Plugin contributes to the Host's unified MCP catalog.
   * Public names and enablement stay with the Host; `agent.mcp` is the
   * opposite direction and must not be reused here.
   */
  mcp_exports?: PluginMcpExportDeclaration[];
  /** Local actions the Host may offer on objects; not MCP and not events. */
  behaviors?: import("./plugin-behaviors.js").PluginBehaviorDeclaration[];
  /** Places where a user can bind a function. Binding values are not in the Manifest. */
  function_scenes?: import("./plugin-behaviors.js").PluginFunctionSceneDeclaration[];
  /** Object kinds this Plugin can project into a judgment input. */
  judgment_subjects?: import("./plugin-behaviors.js").PluginJudgmentSubjectDeclaration[];
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

/** Each variant's `kind` must stay a declared UI command input kind. */
type PluginCommandInputOf<Kind extends UiCommandInputKind, Payload = unknown> =
  { kind: Kind } & Payload;

export type PluginCommandInput =
  | PluginCommandInputOf<"current">
  | PluginCommandInputOf<"object", { ref: UiViewObjectRef }>
  | PluginCommandInputOf<"agent-session", { session_id: string }>
  | PluginCommandInputOf<"artifacts", { references: readonly ArtifactReference[] }>;

export interface PluginRouteRequest {
  method: PluginRouteMethod;
  pathname: string;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  body: unknown;
  actor_id: string;
}

export interface PluginRouteResponse {
  status: number;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  bytes?: Uint8Array;
  filename?: string;
  mime?: string;
}

export interface PluginRouteBinding {
  route_id: string;
  handle(request: PluginRouteRequest): PluginRouteResponse | Promise<PluginRouteResponse>;
}

/**
 * A v2 application Plugin. Every member is optional except `kind`: the Host
 * calls only what the Manifest declared, and an undeclared handler is refused
 * before the Plugin runs.
 */
export interface PluginAppContribution {
  kind: "app";
  /** Renderers for the views the Manifest declares. */
  views?: readonly UiContribution[];
  /** Handlers for the routes the Manifest declares. */
  routes?: readonly PluginRouteBinding[];
  /** Handlers for the MCP tools the Manifest registers. */
  mcp?: readonly PluginMcpHandlerBinding[];
  /** Handlers for Manifest `behaviors`. Native plugins composed at build time may omit these. */
  behaviors?: readonly { behavior_id: string; handle(input: Record<string, unknown>): unknown | Promise<unknown> }[];
  commandAvailability?(commandId: string): UiCommandAvailability;
  executeCommand?(
    commandId: string,
    input: PluginCommandInput,
  ): UiOpenedObjectView | Promise<UiOpenedObjectView>;
  /** Complete, fixed input set. The Host never delivers a partial change. */
  onUpstreamReady?(
    inputs: PluginUpstreamReadyInputs,
    context: { signal: AbortSignal },
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
  plugin_id: string;
  version: string;
  deployment: PluginDeployment;
  grants: readonly string[];
  /** Project scope this activation belongs to. Absent for project-less reference runs. */
  board_id?: string;
  /** Input group the Host validated at activation. Undefined means no selection; never the first group. */
  input_group?: string;
  /** Available when running through the application Host, not a bare reference executor. */
  readonly services?: PluginHostServices;
  requireGrant(permission: string): void;
}

export interface PluginDefinition {
  manifest: PluginManifest;
  /** v2: validators for the event types this Plugin publishes. */
  event_types?: readonly PluginEventType[];
  /** v2: Prompt bodies for the Agent block. */
  agent_prompts?: readonly AgentPromptText[];
  /** v2: Skill bodies for the Agent block. */
  agent_skills?: readonly AgentSkillDefinition[];
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
  operation: "install" | "grant" | "start" | "stop" | "crash" | "recover" | "uninstall";
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
    /** Host-authorized replacement of an inactive version; identity and private data remain. */
    replace_version?: boolean;
  }): PluginLifecycleReceipt;
  grant(installId: string, permissions: string[]): PluginLifecycleReceipt;
  start(installId: string): Promise<PluginLifecycleReceipt>;
  /** Stop a running Plugin without uninstalling it. Restart goes back through `start`. */
  stop(installId: string): Promise<PluginLifecycleReceipt>;
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
