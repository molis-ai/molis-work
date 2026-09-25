import type {
  HostCapabilityDefinition,
  HostCapabilityDescriptor,
} from "@molis-ai/molis-work-contracts/platform/app-host";

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
  descriptor: HostCapabilityDescriptor;
  handler: CapabilityHandler<Context, unknown, unknown>;
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
  };
}

function capabilityKey(descriptor: HostCapabilityDescriptor): string {
  return `${descriptor.capability_id}@${descriptor.version}`;
}

/** Provider-neutral registry. It owns routing, never business facts. */
export class CapabilityRegistry<Context> {
  private readonly entries = new Map<string, RegisteredCapability<Context>>();

  register<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: CapabilityHandler<Context, Input, Output>,
  ): () => void {
    const descriptor = normalizedDescriptor(definition);
    const key = capabilityKey(descriptor);
    if (this.entries.has(key)) {
      throw new CapabilityRegistryError(
        "kernel.capability_duplicate",
        `Capability 已注册: ${key}`,
      );
    }
    this.entries.set(key, {
      descriptor,
      handler: handler as CapabilityHandler<Context, unknown, unknown>,
    });
    return () => {
      const current = this.entries.get(key);
      if (current?.handler === handler) this.entries.delete(key);
    };
  }

  descriptors(): HostCapabilityDescriptor[] {
    return [...this.entries.values()]
      .map(({ descriptor }) => ({ ...descriptor }))
      .sort((left, right) => capabilityKey(left).localeCompare(capabilityKey(right)));
  }

  async invoke<Input, Output>(
    context: Context,
    definition: HostCapabilityDefinition<Input, Output>,
    input: Input,
  ): Promise<Output> {
    const descriptor = normalizedDescriptor(definition);
    const registered = this.entries.get(capabilityKey(descriptor));
    if (!registered || registered.descriptor.operation !== descriptor.operation) {
      throw new CapabilityRegistryError(
        "kernel.capability_missing",
        `Capability 未注册: ${capabilityKey(descriptor)}`,
      );
    }
    return await registered.handler(context, input) as Output;
  }
}
