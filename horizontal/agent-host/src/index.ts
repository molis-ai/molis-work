import type {
  AgentManifest,
  AgentPromptText,
  AgentRoleDeclaration,
  AgentRoleExecution,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { orderPromptsByLayer } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type {
  AgentHostApi,
  AgentHostErrorCode,
  AgentRunHandle,
  AgentRuntimeAdapter,
  AgentRuntimeCapability,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  AgentStartRequest,
} from "@molis-ai/molis-work-contracts/services/agent-host";

import { AgentReviewQueue } from "./reviews.js";

export { AgentReviewQueue, AgentReviewError } from "./reviews.js";
export { emptyCapabilityMatrix } from "./capabilities.js";
export {
  PrologueCredentialBridge,
  prologueAcceptsProtocol,
  prologueProtocolFacts,
  type PrologueCredentialHost,
} from "./adapters/prologue-node.js";
export {
  createModelConfigurationPort,
  prologueModelConfiguration,
  prologueProtocolFor,
  type ModelSelectionPort,
  type ResolvedModelSelection,
} from "./model-configuration.js";
export { registerAgentHostCapabilities } from "./capability-registration.js";
export type {
  AgentCapabilityPorts,
  AgentCapabilityRegistrar,
} from "./capability-registration.js";
export { PrologueAgentAdapter, PrologueAdapterError, PROLOGUE_RUNTIME_ID } from "./adapters/prologue.js";
export { createPrologueNodeAdapter } from "./adapters/prologue-node.js";
export { PrologueApprovalBridge, PrologueApprovalError } from "./adapters/prologue-approvals.js";
export {
  applyPrologueEvent,
  emptyPrologueStreamState,
  prologuePhaseOf,
  settleProloguePending,
} from "./adapters/prologue-stream.js";
export type {
  PrologueApprovalWaiting,
  PrologueControlState,
  PrologueEvent,
  PrologueStreamState,
  PrologueUsageReceipt,
} from "./adapters/prologue-stream.js";
export { CliAgentAdapter, CliAgentError } from "./adapters/cli-runtime.js";
export type {
  CliAgentAdapterOptions,
  CliProcessEvent,
  CliProcessHandle,
  CliProcessPort,
} from "./adapters/cli-runtime.js";
export {
  CLI_RECEIPT_MAX_BYTES, applyCliStreamLine, emptyStreamState } from "./adapters/cli-stream.js";
export type { CliStreamState } from "./adapters/cli-stream.js";
export { createNodeCliProcessPort } from "./adapters/cli-node-process.js";
export type {
  MirrorPendingInput,
  ProloguePending,
  ProloguePendingPort,
  ProloguePendingState,
  PrologueApprovalBridgeOptions,
} from "./adapters/prologue-approvals.js";
export type { PrologueNodeAdapterOptions } from "./adapters/prologue-node.js";
export type {
  PrologueAdapterOptions,
  PrologueAdapterPorts,
  PrologueControlPort,
  PrologueModelConfiguration,
  PrologueRunPort,
  PrologueRuntimePort,
  PrologueStartInput,
} from "./adapters/prologue.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-service-agent-host",
  packagePath: "horizontal/agent-host",
  kind: "horizontal",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/services/agent-host",
  migrationGoals: ["goal-reorg-f2", "goal-plugin-platform-v2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "agent.host.v1",
    "agent.review-queue.v1",
    "agent.runtimes.v1",
    "agent.run.start.v1",
    "agent.reviews.list.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export class AgentHostError extends Error {
  constructor(
    readonly code: Extract<AgentHostErrorCode,
      | "agent.runtime_unknown"
      | "agent.runtime_duplicate"
      | "agent.capability_unavailable"
      | "agent.role_not_declared"
      | "agent.role_execution_exceeded"
      | "agent.directory_unauthorized">,
    message: string,
  ) {
    super(message);
    this.name = "AgentHostError";
  }
}

/** Capabilities a role needs before it may run. Omitted execution means read-only. */
const EXECUTION_CAPABILITIES: Readonly<Record<AgentRoleExecution, AgentRuntimeCapability[]>> = {
  "read-only": [],
  "text-edit": ["text-edit"],
  "workspace-write": ["text-edit", "command"],
};

/**
 * The prompt bodies this role runs with, layer by layer.
 *
 * A role that names its prompts gets exactly those. A role that names none
 * falls back to every declared prompt, which is right only when all of them are
 * shared — an earlier version did that unconditionally, so a read-only role was
 * handed the writer's prompt.
 *
 * The project layer is appended from what the **Host** supplies, not from the
 * Plugin package: a project's conventions belong to the project, and a Plugin
 * that could ship them would be speaking for every project it is installed in.
 * Layers are then ordered base → role → project, stably, so the order inside a
 * layer stays the one the role meant.
 *
 * The task is not here. It travels as its own argument, because it is what the
 * user typed this time and nothing in a package may stand in for it.
 */
function composeRolePrompts(
  role: AgentRoleDeclaration,
  authority: AgentStartAuthority,
): AgentPromptText[] {
  const available = authority.prompts ?? [];
  const named = role.prompts;
  const own = named === undefined
    ? (() => {
      const declared = new Set((authority.manifest.prompts ?? []).map((item) => item.prompt_id));
      return available.filter((prompt) => declared.has(prompt.prompt_id));
    })()
    : named.flatMap((promptId) => {
      const found = available.find((prompt) => prompt.prompt_id === promptId);
      return found === undefined ? [] : [found];
    });
  const project = (authority.project_prompts ?? []).map((prompt) => ({
    ...prompt,
    // Forced rather than trusted: whatever the Host called it, a prompt that
    // arrives on the project channel is the project layer.
    layer: "project" as const,
  }));
  return orderPromptsByLayer([...own, ...project]);
}

/** Omitting `execution` means read-only. Callers must not reimplement this default. */
function roleExecution(role: AgentRoleDeclaration): AgentRoleExecution {
  return role.execution ?? "read-only";
}

export interface AgentStartAuthority {
  /** The Plugin's own Agent block. A role outside it can never start. */
  manifest: AgentManifest;
  /** Directories the Host authorized for this Plugin, already realpath-verified. */
  authorizedDirectories: readonly string[];
  /**
   * Prompt bodies shipped in the Plugin package. The Host composes the role's
   * prompts from these; an adapter never invents one.
   */
  prompts?: readonly AgentPromptText[];
  /**
   * The project's own instructions, from a source the Host owns — today the
   * confirmed project guidance. Absent means this project has stated none,
   * which is different from stating an empty one and is shown differently.
   */
  project_prompts?: readonly AgentPromptText[];
}

/**
 * Agent Runtime registry and start authority.
 *
 * The Host decides what may run before any Runtime is asked: the role must be
 * declared, the Runtime must really support what that role needs, and the
 * directory must be one the Host authorized. An adapter reports facts and
 * executes approved work; it never widens its own authority.
 */
export class AgentHost implements AgentHostApi {
  readonly #adapters = new Map<string, AgentRuntimeAdapter>();
  readonly reviews: AgentReviewQueue;

  constructor(options: { reviews?: AgentReviewQueue } = {}) {
    this.reviews = options.reviews ?? new AgentReviewQueue();
  }

  register(adapter: AgentRuntimeAdapter): void {
    const runtimeId = adapter.descriptor.runtime_id;
    if (this.#adapters.has(runtimeId)) {
      throw new AgentHostError("agent.runtime_duplicate", `Agent Runtime ${runtimeId} 已注册`);
    }
    this.#adapters.set(runtimeId, adapter);
  }

  descriptors(): AgentRuntimeDescriptor[] {
    return [...this.#adapters.values()]
      .map((adapter) => structuredClone(adapter.descriptor))
      .sort((left, right) => left.runtime_id.localeCompare(right.runtime_id));
  }

  adapter(runtimeId: string): AgentRuntimeAdapter {
    const adapter = this.#adapters.get(runtimeId);
    if (!adapter) {
      throw new AgentHostError("agent.runtime_unknown", `没有注册 Agent Runtime ${runtimeId}`);
    }
    return adapter;
  }

  matrix(runtimeIds: string[]): Array<{
    runtime_id: string;
    capabilities: AgentRuntimeCapabilityMatrix;
  }> {
    return runtimeIds.map((runtimeId) => ({
      runtime_id: runtimeId,
      capabilities: structuredClone(this.adapter(runtimeId).descriptor.capabilities),
    }));
  }

  /**
   * Roles this Runtime can actually carry, with a reason for each one it cannot.
   * The product shows an unavailable role as unavailable instead of hiding it.
   */
  availableRoles(runtimeId: string, manifest: AgentManifest): Array<{
    role_id: string;
    available: boolean;
    reason?: string;
  }> {
    const capabilities = this.adapter(runtimeId).descriptor.capabilities;
    return manifest.roles.map((role) => {
      const missing = EXECUTION_CAPABILITIES[roleExecution(role)]
        .filter((capability) => capabilities[capability] === "unsupported");
      return missing.length === 0
        ? { role_id: role.role_id, available: true }
        : {
          role_id: role.role_id,
          available: false,
          reason: `${runtimeId} 不支持 ${missing.join("、")}`,
        };
    });
  }

  /**
   * Check the Host's own preconditions, then hand the request to the Runtime.
   * Nothing reaches an adapter until the role, capability and directory all pass.
   */
  async start(
    runtimeId: string,
    request: AgentStartRequest,
    authority: AgentStartAuthority,
  ): Promise<AgentRunHandle> {
    const adapter = this.adapter(runtimeId);
    const role = authority.manifest.roles.find((item) => item.role_id === request.role_id);
    if (!role) {
      throw new AgentHostError(
        "agent.role_not_declared",
        `插件没有声明角色 ${request.role_id}`,
      );
    }
    const execution = roleExecution(role);
    const missing = EXECUTION_CAPABILITIES[execution]
      .filter((capability) => adapter.descriptor.capabilities[capability] === "unsupported");
    if (missing.length > 0) {
      throw new AgentHostError(
        "agent.capability_unavailable",
        `${runtimeId} 不支持 ${missing.join("、")}，角色 ${role.role_id} 不能在它上面运行`,
      );
    }
    if (!request.directory.realpath_verified
      || !authority.authorizedDirectories.includes(request.directory.canonical_path)) {
      throw new AgentHostError(
        "agent.directory_unauthorized",
        "这个目录没有被授权给当前插件",
      );
    }

    // Freeze the role here, from the Plugin's own declarations, so the adapter
    // receives exactly what it is allowed to run instead of resolving it itself.
    const prompts = composeRolePrompts(role, authority);
    const handle = await adapter.start({
      ...request,
      role: {
        role_id: role.role_id,
        version: role.version,
        execution,
        prompts: prompts.map((prompt) => ({ ...prompt })),
        host_tools: [...(role.host_tools ?? [])],
      },
    });
    // The Runtime cannot widen what the Manifest froze. A mismatch is the
    // adapter's fault, and the run does not continue on a wider authority.
    if (handle.frozen.role_id !== role.role_id
      || handle.frozen.role_version !== role.version
      || handle.frozen.execution !== execution) {
      await adapter.control(handle.ref, { kind: "cancel" });
      throw new AgentHostError(
        "agent.role_execution_exceeded",
        `Runtime 返回的角色权限与 Manifest 冻结的不一致，已取消该 Run`,
      );
    }
    return handle;
  }
}
