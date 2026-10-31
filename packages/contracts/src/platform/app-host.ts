import type { ContractDescriptor } from "./package.js";
import type { ActionCallOrigin } from "./actions.js";
export * from "./runtime-project-host.js";

/** Async boundary for an existing, finite method API; does not add or dispatch operation names. */
export type AsyncApplicationMethods<Application> = {
  [Method in keyof Application]: Application[Method] extends (...args: infer Args) => infer Result
    ? (...args: Args) => Promise<Awaited<Result>> : never;
};

export const platformAppHostContract = {
  contractId: "io.molis.work.platform.app-host.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/system/ARCHITECTURE.md",
} as const satisfies ContractDescriptor;

/** A read that may hold until something changes (following a live round) is a query declared `scheduling: "concurrent"`. */
export type HostCapabilityOperation = "query" | "command";

export interface HostCapabilityDescriptor {
  capability_id: string;
  version: number;
  operation: HostCapabilityOperation;
  /** Transport-neutral metadata for discoverable system actions. */
  readonly action?: import("./actions.js").ActionMetadata;
  /** Injected by the registration owner, not supplied by tool callers. */
  readonly action_provider?: import("./actions.js").ActionProvider;
}

/** Opaque local storage locator. It is never a Project business identity. */
export interface LocalHostProjectReference {
  project_id: string;
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

/** Bound by the Home or project Plugin Host executor; never parsed from a request body. */
export interface HostPluginCaller {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly actor_id: string;
  readonly project_id: string | null;
  readonly declaration: Pick<import("./plugin.js").PluginDefinition, "manifest" | "agent_prompts" | "agent_skills">;
  /** Installation lifetime, also usable by the original Agent after this call ends. */
  readonly assertActive: () => void;
}

/** In-process authority callbacks are separate from serializable business inputs. */
export interface HostCapabilityCallOptions {
  /** Host-enforced narrowing inherited from a read-only callback; Plugin invocation options cannot remove it. */
  query_only?: true;
  /** Cancellation narrows this invocation; it never grants caller authority. */
  signal?: AbortSignal;
  before_effect?: () => void | Promise<void>;
  /** A stricter original-call fence, invoked synchronously without borrowing the target's authority. */
  assert_authority_current?: () => void;
}
export interface HostCapabilityInvocation extends ActionCallOrigin {
  readonly signal?: AbortSignal;
  readonly plugin?: HostPluginCaller;
  readonly consumer?: "plugin";
  /** Recheck original authority and live project policy immediately before a side effect. */
  beforeEffect(): Promise<void>;
  /** Final synchronous fence after the last await and immediately before the owner's effect. */
  assertAuthorityCurrent(): void;
}

export interface LocalHostProjectClient {
  readonly host_instance_id: string;
  readonly project: LocalHostProjectReference;
  /** Synchronous registry/readiness facts only; never opens a runtime or grants invocation. */
  /** `consumer: "plugin"`: asked for a plugin, so an action offered to plugins is checked as the plugin audience. Not caller authority. */
  availability(capability: import("./actions.js").ActionReference, options?: { readonly consumer?: "plugin" }): import("./actions.js").ActionAvailability;
  /** Open before adapting the request and retain resources through response composition; exposes no Runtime. */
  withScope<Result>(operation: (client: LocalHostProjectClient) => Result | Promise<Result>): Promise<Result>;
  /** Calls a registered action through the action service, in this project's operation queue. */
  invoke<Input, Output>(
    capability: import("./actions.js").ActionDefinition<Input, Output>,
    input: Input,
    options?: HostCapabilityCallOptions,
  ): Promise<Output>;
}

export { SUPPORTED_RUNTIME_IDS, RUNTIME_DISPLAY_NAMES, type SupportedRuntimeId, type RuntimeConnectionState, type RuntimeIntegrationDetection, type MolisWorkWebServiceState, type MolisWorkWebServiceDetection } from "./installation-detection.js";
