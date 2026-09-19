import type {
  ArtifactContentInput,
  ArtifactMetadata,
  ArtifactReference,
  ArtifactVersionRecord,
  ArtifactVersionResult,
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
  | "port_declaration_invalid"
  | "port_type_mismatch"
  | "port_unknown"
  | "port_binding_invalid"
  | "input_group_invalid"
  | "input_group_unknown";

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

export interface PluginInputPortDeclaration extends PluginPortDeclaration {
  /** Omitted means required. An optional port never blocks activation. */
  optional?: boolean;
}

/**
 * Interchangeable input combinations. When groups are declared, exactly the
 * selected group's ports are required; the rest stay unbound without failing.
 */
export interface PluginInputGroupDeclaration {
  group_id: string;
  title: string;
  ports: string[];
}

export interface PluginPortsDeclaration {
  inputs: PluginInputPortDeclaration[];
  outputs: PluginPortDeclaration[];
  input_groups?: PluginInputGroupDeclaration[];
}

export type PluginPortBindingOrigin = "user" | "default" | "unique";

export interface PluginPortBindingRecord {
  board_id: string;
  target_plugin_id: string;
  target_port: string;
  source_plugin_id: string;
  source_port: string;
  origin: PluginPortBindingOrigin;
  created_at: string;
  updated_at: string;
}

export interface PluginPortBindingInput {
  board_id: string;
  target_plugin_id: string;
  target_port: string;
  source_plugin_id: string;
  source_port: string;
  origin: PluginPortBindingOrigin;
  actor_id: string;
}

export interface PluginInputGroupSelectionRecord {
  board_id: string;
  plugin_id: string;
  group_id: string;
  updated_at: string;
}

/**
 * The current value of one output port. It is the port's head, not the Artifact
 * history: publishing advances it and invalidating withdraws it.
 */
export interface PluginPortOutputRecord {
  board_id: string;
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
  board_id: string;
  plugins: PluginWiringPluginView[];
}

export type PluginInputStatus =
  | { status: "ready"; ports: string[] }
  | { status: "inconsistent"; ports: string[]; message: string }
  | { status: "missing"; missing: string[] };

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
  readonly [port: string]: ArtifactVersionRecord;
}

export interface PluginInputsClient {
  status(): PluginInputStatus;
  /** The fixed version currently bound to this port, or null when not ready. */
  read(port: string): ArtifactVersionRecord | null;
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
  publish(input: PluginOutputPublishInput): ArtifactVersionResult;
  /** Withdraw the current version of one output with a user-safe reason. */
  invalidate(port: string, safe_reason: string): void;
  /** Keep a published reference readable after the producing session ends. */
  retain(reference: ArtifactReference): void;
  read(reference: ArtifactReference): ArtifactVersionRecord | null;
}

export interface PluginWiringRepository {
  listBindings(boardId: string, targetPluginId?: string): PluginPortBindingRecord[];
  getBinding(
    boardId: string,
    targetPluginId: string,
    targetPort: string,
  ): PluginPortBindingRecord | null;
  saveBinding(record: PluginPortBindingRecord): void;
  deleteBinding(boardId: string, targetPluginId: string, targetPort: string): void;
  deleteBindingsForPlugin(boardId: string, pluginId: string): void;
  getInputGroup(boardId: string, pluginId: string): PluginInputGroupSelectionRecord | null;
  saveInputGroup(record: PluginInputGroupSelectionRecord): void;
  listInputGroups(boardId: string): PluginInputGroupSelectionRecord[];
  getOutput(boardId: string, pluginId: string, port: string): PluginPortOutputRecord | null;
  listOutputs(boardId: string): PluginPortOutputRecord[];
  saveOutput(record: PluginPortOutputRecord): void;
  deleteOutputsForPlugin(boardId: string, pluginId: string): void;
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

/** Validate one Plugin's port and group declarations. Returns every problem. */
export function inspectPortDeclarations(ports: PluginPortsDeclaration | undefined): string[] {
  if (!ports) return [];
  const problems: string[] = [];
  const inputs = new Set<string>();
  for (const input of ports.inputs ?? []) {
    if (!isValidPortName(input.port)) {
      problems.push("输入端口名不合法");
      continue;
    }
    if (inputs.has(input.port)) {
      problems.push(`输入端口重复：${input.port}`);
      continue;
    }
    if (typeof input.artifact_type_id !== "string" || input.artifact_type_id.trim() === "") {
      problems.push(`输入端口 ${input.port} 缺少 Artifact 类型`);
      continue;
    }
    if (!Number.isSafeInteger(input.schema_version) || input.schema_version < 1) {
      problems.push(`输入端口 ${input.port} 的 schema_version 无效`);
      continue;
    }
    inputs.add(input.port);
  }

  const outputs = new Set<string>();
  for (const output of ports.outputs ?? []) {
    if (!isValidPortName(output.port)) {
      problems.push("输出端口名不合法");
      continue;
    }
    if (outputs.has(output.port)) {
      problems.push(`输出端口重复：${output.port}`);
      continue;
    }
    if (typeof output.artifact_type_id !== "string" || output.artifact_type_id.trim() === "") {
      problems.push(`输出端口 ${output.port} 缺少 Artifact 类型`);
      continue;
    }
    if (!Number.isSafeInteger(output.schema_version) || output.schema_version < 1) {
      problems.push(`输出端口 ${output.port} 的 schema_version 无效`);
      continue;
    }
    outputs.add(output.port);
  }

  const groups = new Set<string>();
  for (const group of ports.input_groups ?? []) {
    if (typeof group.group_id !== "string" || group.group_id.trim() === "") {
      problems.push("输入组缺少 ID");
      continue;
    }
    if (groups.has(group.group_id)) {
      problems.push(`输入组重复：${group.group_id}`);
      continue;
    }
    groups.add(group.group_id);
    if (!Array.isArray(group.ports) || group.ports.length === 0) {
      problems.push(`输入组 ${group.group_id} 必须至少包含一个端口`);
      continue;
    }
    for (const port of group.ports) {
      if (!inputs.has(port)) {
        problems.push(`输入组 ${group.group_id} 引用了未声明的输入端口 ${port}`);
      }
    }
  }
  return problems;
}
