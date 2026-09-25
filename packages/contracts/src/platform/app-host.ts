import type { ContractDescriptor } from "./package.js";
export * from "./runtime-project-host.js";

/** Async boundary for an existing, finite method API; does not add or dispatch operation names. */
export type AsyncApplicationMethods<Application> = {
  [Method in keyof Application]: Application[Method] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Promise<Awaited<Result>> : never;
};

export type HostMethodCapability<Method> = Method extends (...args: infer Args) => infer Result
  ? HostCapabilityDefinition<Args, Result> : never;

export const platformAppHostContract = {
  contractId: "io.molis.work.platform.app-host.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/system/ARCHITECTURE.md",
} as const satisfies ContractDescriptor;

/**
 * `wait` is a read that may hold until something changes, such as following a live round. The Host runs it beside
 * the project's queued operations rather than in line with them, so a held wait never delays a stop, an answer or a read.
 */
export type HostCapabilityOperation = "query" | "command" | "wait";

export interface DesktopPanelRecord {
  panel_id: string;
  project_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args: string[];
  cwd: string | null;
  work_context_id: string;
  host_session_id: string | null;
  tab_index: number;
  title: string;
  status: "open" | "exited";
  created_at: string;
  updated_at: string;
}

export interface OpenDesktopPanelInput {
  project_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args?: string[];
  cwd?: string | null;
  title?: string;
  actor_id: string;
  host_session_id?: string | null;
  user_confirmed: boolean;
}

export interface AliasDesktopPanelSessionInput {
  panel_id: string;
  runtime_id: string;
  host_session_id: string;
  actor_id: string;
}

/** Public panel lifecycle used by Work; repositories remain private to the app implementation. */
export interface DesktopPanelApi {
  list(projectId: string, goalId?: string): DesktopPanelRecord[];
  get(panelId: string): DesktopPanelRecord;
  open(input: OpenDesktopPanelInput): DesktopPanelRecord;
  close(panelId: string, actorId: string): void;
  markOpen(panelId: string): DesktopPanelRecord;
  markExited(panelId: string): DesktopPanelRecord;
}

export interface HostCapabilityDescriptor {
  capability_id: string;
  version: number;
  operation: HostCapabilityOperation;
  /** Legacy adapter for authenticated Host composition only; a plugin's consumes declaration cannot grant access. */
  readonly host_only?: boolean;
  /**
   * The call touches no project state (a model draft written in a directory of its own, say): it runs beside the
   * project's operation queue instead of holding every later operation until it answers. The Host reads this from the
   * registered descriptor, so a caller cannot claim it for a queued operation.
   */
  readonly scheduling?: "concurrent";
  /** Optional transport-neutral metadata for discoverable system actions. */
  readonly action?: import("./actions.js").ActionMetadata;
  /** Injected by the registration owner, not supplied by tool callers. */
  readonly action_provider?: import("./actions.js").ActionProvider;
}

/**
 * Stable, transport-neutral capability identity. The optional type member is
 * compile-time only; JSON transports use the three public descriptor fields.
 */
export interface HostCapabilityDefinition<Input = unknown, Output = unknown>
  extends HostCapabilityDescriptor {
  readonly __types__?: { input: Input; output: Output };
}

export type HostCapabilityInput<Capability> = Capability extends HostCapabilityDefinition<infer Input, unknown>
  ? Input
  : never;

export type HostCapabilityOutput<Capability> = Capability extends HostCapabilityDefinition<unknown, infer Output>
  ? Output
  : never;

/** Opaque local storage locator. It is never a Project business identity. */
export interface LocalHostProjectReference {
  project_id: string;
  board_id: string;
  storage_key: string;
}

export interface LocalHostProjectState extends LocalHostProjectReference {
  state: "opening" | "ready" | "closing";
}

export interface LocalHostStatus {
  instance_id: string;
  state: "running" | "closing" | "closed";
  projects: LocalHostProjectState[];
  capabilities: HostCapabilityDescriptor[];
}

/** In-process authority callbacks are separate from serializable business inputs. */
export interface HostCapabilityCallOptions {
  before_effect?: () => void | Promise<void>;
  /** SDK-enforced restriction, not caller authority; plugins cannot remove it through invocation options. */
  consumer?: "plugin";
}
export interface HostCapabilityInvocation {
  /** Recheck original authority and live project policy immediately before a side effect. */
  beforeEffect(): Promise<void>;
}

export interface LocalHostProjectClient {
  readonly host_instance_id: string;
  readonly project: LocalHostProjectReference;
  /** Synchronous registry/readiness facts only; never opens a runtime or grants invocation. */
  availability(capability: import("./actions.js").ActionReference, options?: Pick<HostCapabilityCallOptions, "consumer">): import("./actions.js").ActionAvailability;
  /** Open before adapting the request and retain resources through response composition; exposes no Runtime. */
  withScope<Result>(operation: (client: LocalHostProjectClient) => Result | Promise<Result>): Promise<Result>;
  invoke<Input, Output>(
    capability: HostCapabilityDefinition<Input, Output>,
    input: Input,
    options?: HostCapabilityCallOptions,
  ): Promise<Output>;
}

export { SUPPORTED_RUNTIME_IDS, type SupportedRuntimeId, type RuntimeConnectionState, type RuntimeIntegrationDetection, type MolisWorkWebServiceState, type MolisWorkWebServiceDetection } from "./installation-detection.js";

export type DesktopPanelErrorCode =
  | "catalog.invalid_name"
  | "catalog.project_not_found"
  | "catalog.panel_not_found"
  | "catalog.panel_confirmation_required"
  | "context.stable_identity_required"
  | "context.user_confirmation_required";

export interface DesktopPanelRepository {
  transaction<T>(operation: () => T): T;
  nextTabIndex(projectId: string, goalId: string): number;
  insert(record: DesktopPanelRecord): void;
  addAlias(panelId: string, runtimeId: string, workContextId: string, createdAt: string): void;
  list(projectId: string, goalId?: string): DesktopPanelRecord[];
  get(panelId: string): DesktopPanelRecord | null;
  updateStatus(panelId: string, status: DesktopPanelRecord["status"], updatedAt: string): void;
  updateHostSession(panelId: string, hostSessionId: string, updatedAt: string): void;
  delete(panelId: string): void;
  findByWorkContext(runtimeId: string, workContextId: string): DesktopPanelRecord | null;
  deleteForProject(projectId: string): void;
}

export interface DesktopPanelContextPort {
  assertProject(projectId: string): void;
  bind(input: {
    runtime_id: string;
    stable_work_context_id: string;
    project_id: string;
    actor_id: string;
    cwd?: string;
  }): void;
  appendProjectEvent(
    projectId: string,
    type: "project.desktop_panel_opened" | "project.desktop_panel_closed",
    actorId: string,
    payload: Record<string, unknown>,
  ): void;
}

export interface DesktopPanelServiceOptions {
  repository: DesktopPanelRepository;
  context: DesktopPanelContextPort;
  errorFactory: (code: DesktopPanelErrorCode, message: string) => Error;
  now?: () => string;
  createId?: () => string;
}

export interface DesktopPanelCatalogApi extends DesktopPanelApi {
  aliasSession(input: AliasDesktopPanelSessionInput): DesktopPanelRecord;
  findByWorkContext(runtimeId: string, workContextId: string): DesktopPanelRecord | null;
  deleteForProject(projectId: string): void;
}
