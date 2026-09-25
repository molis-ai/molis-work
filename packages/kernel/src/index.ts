import type {
  HostCapabilityDefinition,
  HostCapabilityDescriptor,
} from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError, requireSynchronous, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-kernel",
  packagePath: "packages/kernel",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/kernel",
  migrationGoals: ["goal-reorg-f2","goal-reorg-f3","goal-reorg-ap2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["kernel.capability-registry.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export type CapabilityHandler<Context, Input, Output> = (
  context: Context,
  input: Input,
) => Output | Promise<Output>;

export class CapabilityRegistryError extends Error {
  constructor(
    readonly code: "kernel.capability_invalid" | "kernel.capability_duplicate" | "kernel.capability_missing",
    message: string,
  ) {
    super(message);
  }
}

interface RegisteredCapability<Context> {
  token: symbol;
  descriptor: HostCapabilityDescriptor;
  handler: CapabilityHandler<Context, unknown, unknown>;
  availability?: (context: Context) => ActionAvailability;
  synchronous?: boolean;
}

function normalizedDescriptor<Input, Output>(
  definition: HostCapabilityDefinition<Input, Output>,
): HostCapabilityDescriptor {
  const capabilityId = definition.capability_id.trim();
  if (!capabilityId || !Number.isInteger(definition.version) || definition.version < 1) {
    throw new CapabilityRegistryError("kernel.capability_invalid", "Capability 必须有非空 ID 和正整数版本");
  }
  if (definition.operation !== "query" && definition.operation !== "command" && definition.operation !== "wait") {
    throw new CapabilityRegistryError("kernel.capability_invalid", "Capability operation 必须是 query、command 或 wait");
  }
  return {
    capability_id: capabilityId,
    version: definition.version,
    operation: definition.operation,
    ...(definition.host_only ? { host_only: true } : {}),
    ...(definition.action ? { action: structuredClone(definition.action) } : {}),
    ...(definition.action_provider ? { action_provider: structuredClone(definition.action_provider) } : {}),
  };
}

type RegistryReference = Pick<HostCapabilityDescriptor, "capability_id" | "version" | "action_provider">;
function capabilityKey(descriptor: RegistryReference): string {
  return JSON.stringify([descriptor.capability_id, descriptor.version, descriptor.action_provider?.project_id ?? null]);
}

/** Provider-neutral registry. It owns routing, never business facts. */
export class CapabilityRegistry<Context> {
  private readonly entries = new Map<string, RegisteredCapability<Context>>();
  /** Registration order sorted once per change: every capability call looks something up here. */
  private ordered: HostCapabilityDescriptor[] | null = null;

  register<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: CapabilityHandler<Context, Input, Output>,
    options: { availability?: (context: Context) => ActionAvailability; synchronous?: boolean } = {},
  ): () => void {
    const descriptor = normalizedDescriptor(definition);
    const key = capabilityKey(descriptor);
    const overlapping = [...this.entries.values()].some(({ descriptor: current }) =>
      current.capability_id === descriptor.capability_id && current.version === descriptor.version
      && (!current.action_provider?.project_id || !descriptor.action_provider?.project_id
        || current.action_provider.project_id === descriptor.action_provider.project_id));
    if (overlapping) {
      throw new CapabilityRegistryError(
        "kernel.capability_duplicate",
        `Capability 已注册: ${key}`,
      );
    }
    const token = Symbol(key);
    this.ordered = null;
    this.entries.set(key, {
      token,
      descriptor,
      handler: handler as CapabilityHandler<Context, unknown, unknown>,
      ...options,
    });
    return () => {
      const current = this.entries.get(key);
      if (current?.token === token) { this.entries.delete(key); this.ordered = null; }
    };
  }

  /**
   * Copies of the registered descriptors, in key order. `match` narrows before copying: finding one capability must
   * not clone the whole registry, which grows with every project's Plugin actions and is consulted on every call.
   */
  descriptors(match?: (descriptor: Readonly<HostCapabilityDescriptor>) => boolean): HostCapabilityDescriptor[] {
    this.ordered ??= [...this.entries.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, entry]) => entry.descriptor);
    return (match ? this.ordered.filter(match) : this.ordered).map(descriptor => structuredClone(descriptor));
  }

  availability(context: Context, reference: RegistryReference): ActionAvailability {
    const entry = this.entries.get(capabilityKey(reference));
    return entry ? entry.availability?.(context) ?? { available: true }
      : { available: false, code: "actions.missing", reason: "能力未注册或已停用" };
  }

  /** Ephemeral identity distinguishes a restarted provider with the same public contract. */
  registrationToken(reference: RegistryReference): symbol | undefined {
    return this.entries.get(capabilityKey(reference))?.token;
  }

  async invoke<Input, Output>(
    context: Context,
    definition: HostCapabilityDefinition<Input, Output>,
    input: Input,
  ): Promise<Output> {
    return await this.requireCapability(context, definition).handler(context, input) as Output;
  }

  invokeSync<Input, Output>(context: Context, definition: HostCapabilityDefinition<Input, Output>, input: Input): Output {
    const registered = this.requireCapability(context, definition);
    if (!registered.synchronous) throw new ActionError("actions.async_required", "此能力未声明同步执行，不能在同步事务中调用");
    return requireSynchronous(registered.handler(context, input)) as Output;
  }

  private requireCapability(context: Context, definition: HostCapabilityDefinition): RegisteredCapability<Context> {
    const descriptor = normalizedDescriptor(definition);
    const registered = this.entries.get(capabilityKey(descriptor));
    if (!registered || registered.descriptor.operation !== descriptor.operation) {
      throw new CapabilityRegistryError(
        "kernel.capability_missing",
        `Capability 未注册: ${capabilityKey(descriptor)}`,
      );
    }
    const availability = requireSynchronous(registered.availability?.(context));
    if (availability && !availability.available) throw new ActionError(availability.code, availability.reason);
    return registered;
  }
}

export { ActionService } from "./action-service.js";
