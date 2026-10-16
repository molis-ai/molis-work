import type {
  ArtifactContentInput,
  ArtifactMetadata,
  ArtifactReference,
  ArtifactVersionRecord,
  ProcessItemRecord,
  ProcessItemResult,
} from "../modules/artifacts.js";
import type { ContractDescriptor } from "./package.js";

export const platformPluginWiringContract = {
  contractId: "io.molis.work.platform.plugin-wiring.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/PLUGIN-PLATFORM.md",
} as const satisfies ContractDescriptor;

export type PluginWiringErrorCode =
  | "plugin.port_declaration_invalid"
  | "plugin.port_type_mismatch"
  | "plugin.port_unknown"
  | "plugin.port_binding_invalid"
  | "plugin.port_artifact_invalid"
  | "plugin.input_group_invalid"
  | "plugin.input_group_unknown";

export class PluginWiringError extends Error {
  constructor(
    readonly code: PluginWiringErrorCode,
    message: string,
    readonly detail?: Readonly<Record<string, string | number>>,
  ) {
    super(message);
    this.name = "PluginWiringError";
  }
}

/** A named, typed connection point. Type identity is the contract, not the producer. */
export interface PluginPortDeclaration {
  port: string;
  artifact_type_id: string;
  schema_version: number;
}

/** Another plugin's output port, named by plugin id and port. */
export interface PluginPortSourceDeclaration {
  plugin_id: string;
  port: string;
}

export interface PluginInputPortDeclaration extends PluginPortDeclaration {
  /** Omitted means required. An optional port never blocks activation. */
  optional?: boolean;
  /**
   * The output this port reads in a project where nobody chose one for it (BL-087, W4-03): the Host binds it when both plugins
   * run there and the port reads nothing yet, never over another plugin's output or a fixed 成果 version the person gave it.
   * The types must match, as for any binding. For now it takes effect only between plugins that ship with the Host (both this
   * plugin and the source): an installed or generated plugin's declaration is read as absent, and so is its default group.
   * Installed plugins may not declare defaults (用户 2026-10-16 定：暂只在随宿主发的插件之间；装插件时的同意流程有了再议).
   */
  default_source?: PluginPortSourceDeclaration;
}

/**
 * Interchangeable input combinations. When groups are declared, exactly the
 * selected group's ports are required; the rest stay unbound without failing.
 */
export interface PluginInputGroupDeclaration {
  group_id: string;
  title: string;
  ports: string[];
  /** The group selected in a project where nobody selected one. At most one group is the default. */
  default?: boolean;
}

export interface PluginPortsDeclaration {
  inputs: PluginInputPortDeclaration[];
  outputs: PluginPortDeclaration[];
  input_groups?: PluginInputGroupDeclaration[];
}

export type PluginPortBindingOrigin = "user" | "default" | "unique";

export interface PluginPortBindingRecord {
  project_id: string;
  target_plugin_id: string;
  target_port: string;
  source_plugin_id: string;
  source_port: string;
  origin: PluginPortBindingOrigin;
  created_at: string;
  updated_at: string;
}

export interface PluginPortBindingInput {
  project_id: string;
  target_plugin_id: string;
  target_port: string;
  source_plugin_id: string;
  source_port: string;
  origin: PluginPortBindingOrigin;
  actor_id: string;
}

/**
 * A fixed 成果 version bound to an input port in place of another plugin's output (artifact-positioning, 2026-10-04):
 * the consumer reads exactly that version until someone changes the port. Only 成果库 versions, never process items.
 */
export interface PluginPortArtifactBindingRecord {
  project_id: string;
  target_plugin_id: string;
  target_port: string;
  artifact_id: string;
  version: number;
  actor_id: string;
  created_at: string;
}

export type PluginPortArtifactBindingInput = Pick<PluginPortArtifactBindingRecord,
  "target_plugin_id" | "target_port" | "artifact_id" | "version" | "actor_id">;

export interface PluginInputGroupSelectionRecord {
  project_id: string;
  plugin_id: string;
  group_id: string;
  updated_at: string;
}

/**
 * The current value of one output port. It is the port's head, not the Artifact
 * history: publishing advances it and invalidating withdraws it.
 */
export interface PluginPortOutputRecord {
  project_id: string;
  plugin_id: string;
  port: string;
  artifact_id: string | null;
  version: number | null;
  /** User-safe reason the producer withdrew this value. Null while it is usable. */
  invalidated_reason: string | null;
  /**
   * Opaque key the producer attaches so the Host can tell two inputs belong to
   * the same scope. The Host only compares keys; it never reads business fields
   * out of them, and a null key places no constraint.
   */
  scope_key: string | null;
  updated_at: string;
}

export type PluginInputPortState =
  | "selected"
  | "ambiguous"
  | "missing"
  | "unavailable"
  | "unrestored";

export type PluginInputSourceAvailability = "ready" | "waiting" | "unavailable";

export interface PluginInputSourceCandidate {
  source_plugin_id: string;
  source_port: string;
  title: string;
  availability: PluginInputSourceAvailability;
}

export interface PluginInputPortView {
  port: string;
  artifact_type_id: string;
  schema_version: number;
  optional: boolean;
  state: PluginInputPortState;
  origin?: PluginPortBindingOrigin;
  source?: { source_plugin_id: string; source_port: string };
  /** The fixed 成果 version bound to this port, when that is its source instead of another plugin's output. */
  artifact?: { artifact_id: string; version: number };
  reason?: string;
  candidates: PluginInputSourceCandidate[];
}

export interface PluginWiringPluginView {
  plugin_id: string;
  title: string;
  enabled: boolean;
  ports: PluginInputPortView[];
  groups: Array<{ group_id: string; title: string }>;
  selected_group?: string;
  group_reason?: string;
}

export interface PluginWiringView {
  project_id: string;
  plugins: PluginWiringPluginView[];
}

export type PluginInputStatus =
  | { status: "ready"; ports: string[] }
  | { status: "inconsistent"; ports: string[]; message: string }
  | { status: "missing"; missing: string[]; reason?: PluginUpstreamUnavailableReason };

export type PluginUpstreamUnavailableCode =
  | "input_inconsistent"
  | "source_unavailable"
  | "source_invalidated"
  | "content_unavailable"
  | "binding_removed"
  | "consumer_failed";

export interface PluginUpstreamUnavailableReason {
  binding_id: string;
  code: PluginUpstreamUnavailableCode;
  message: string;
}

/**
 * Inputs arrive as a complete, fixed set of Artifact versions. A consumer never
 * discovers sources itself and never sees a half-applied change.
 */
export interface PluginUpstreamReadyInputs {
  readonly [port: string]: ArtifactVersionRecord | ProcessItemRecord;
}

/** Input notifications refresh projections; they are not durable business commands. */
export interface PluginInputDeliveryContext {
  signal: AbortSignal;
  /** Recheck the current installation and fixed inputs after every async wait. */
  beforeEffect(): void;
}

export interface PluginInputsClient {
  status(): PluginInputStatus;
  /** The fixed version currently bound to this port, or null when not ready. */
  read(port: string): ArtifactVersionRecord | ProcessItemRecord | null;
  reference(port: string): ArtifactReference | null;
  /** Selected input group at activation. Undefined means no group was chosen. */
  selectedGroup(): string | undefined;
}

export interface PluginOutputPublishInput {
  port: string;
  content: ArtifactContentInput;
  metadata?: ArtifactMetadata;
  supersedes_version?: number | null;
}

export interface PluginOutputsClient {
  /** Records a process item on the port (artifact-positioning A2); a 成果 reaches a port by `select`. */
  publish(input: PluginOutputPublishInput): ProcessItemResult;
  /** Expose an existing, owned fixed version without copying its content. */
  select(input: { port: string; reference: ArtifactReference; expected_reference: ArtifactReference | null }): ArtifactReference;
  /** Current output selection; null when absent or withdrawn. */
  reference(port: string): ArtifactReference | null;
  /** Withdraw the current version of one output with a user-safe reason. */
  invalidate(port: string, safe_reason: string): void;
  /** Keep a published reference readable after the producing session ends. */
  retain(reference: ArtifactReference): void;
  read(reference: ArtifactReference): ArtifactVersionRecord | ProcessItemRecord | null;
}

export interface PluginWiringRepository {
  listBindings(projectId: string, targetPluginId?: string): PluginPortBindingRecord[];
  getBinding(
    projectId: string,
    targetPluginId: string,
    targetPort: string,
  ): PluginPortBindingRecord | null;
  /** A port has one source: saving a plugin binding drops a fixed-version binding on the same port, and the reverse. */
  saveBinding(record: PluginPortBindingRecord): void;
  getArtifactBinding(projectId: string, targetPluginId: string, targetPort: string): PluginPortArtifactBindingRecord | null;
  saveArtifactBinding(record: PluginPortArtifactBindingRecord): void;
  /** Removes the port's source of either kind. */
  deleteBinding(projectId: string, targetPluginId: string, targetPort: string): void;
  deleteBindingsForPlugin(projectId: string, pluginId: string): void;
  getInputGroup(projectId: string, pluginId: string): PluginInputGroupSelectionRecord | null;
  saveInputGroup(record: PluginInputGroupSelectionRecord): void;
  listInputGroups(projectId: string): PluginInputGroupSelectionRecord[];
  getOutput(projectId: string, pluginId: string, port: string): PluginPortOutputRecord | null;
  listOutputs(projectId: string): PluginPortOutputRecord[];
  saveOutput(record: PluginPortOutputRecord): void;
  deleteOutputsForPlugin(projectId: string, pluginId: string): void;
}

/**
 * The input graph's surface, as the implementation actually offers it.
 *
 * One instance serves one board — the board is fixed at construction, so no
 * method repeats it. An earlier version of this interface keyed every call by
 * board and actor; nothing implemented it, so the mismatch went unnoticed.
 * `PluginInputGraph` now declares `implements PluginWiringApi`, which makes the
 * two drift apart only as a compile error.
 */
export interface PluginWiringApi {
  view(): PluginWiringView;
  bind(input: PluginPortBindingInput): PluginPortBindingRecord;
  bindArtifact(input: PluginPortArtifactBindingInput): PluginPortArtifactBindingRecord;
  unbind(targetPluginId: string, targetPort: string): void;
  selectInputGroup(pluginId: string, groupId: string): PluginInputGroupSelectionRecord;
  status(pluginId: string): PluginInputStatus;
}

const PORT_TOKEN = /^[a-z0-9][a-z0-9-]*$/u;

export function isValidPortName(value: unknown): value is string {
  return typeof value === "string" && PORT_TOKEN.test(value);
}

export function portTypeKey(artifactTypeId: string, schemaVersion: number): string {
  return `${artifactTypeId}@${schemaVersion}`;
}

/** Ports required right now: the selected group's ports, else every non-optional input. */
export function requiredPorts(
  ports: PluginPortsDeclaration | undefined,
  selectedGroup: string | undefined,
): string[] {
  if (!ports) return [];
  const groups = ports.input_groups ?? [];
  if (groups.length > 0 && selectedGroup !== undefined) {
    const group = groups.find((candidate) => candidate.group_id === selectedGroup);
    if (group) return [...group.ports];
  }
  if (groups.length > 0) return [];
  return ports.inputs.filter((input) => input.optional !== true).map((input) => input.port);
}
