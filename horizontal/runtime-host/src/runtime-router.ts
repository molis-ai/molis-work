import {
  RUNTIME_SESSION_CAPABILITIES,
  type RuntimeHostApi,
  type RuntimeSessionAdapter,
  type RuntimeSessionAdapterResult,
  type RuntimeSessionCapabilities,
  type RuntimeSessionCapability,
} from "@molis-ai/molis-work-contracts/services/runtime-host";

export type RuntimeAdapterFallback = (runtimeId: string) => RuntimeSessionAdapter | null;

export class RuntimeHostRouter implements RuntimeHostApi {
  private readonly adapters = new Map<string, RuntimeSessionAdapter>();

  constructor(private readonly fallback: RuntimeAdapterFallback = () => null) {}

  register(adapter: RuntimeSessionAdapter): void {
    const runtimeId = adapter.runtime_id.trim();
    if (!runtimeId) throw new Error("Runtime Adapter 必须提供 runtime_id");
    assertCompleteRuntimeSessionCapabilities(adapter.capabilities);
    this.adapters.set(runtimeId, adapter);
  }

  adapter(runtimeId: string): RuntimeSessionAdapter {
    const normalized = runtimeId.trim();
    if (!normalized) throw new Error("Runtime 标识不能为空");
    const adapter = this.adapters.get(normalized) ?? this.fallback(normalized);
    return adapter ?? new UnsupportedRuntimeAdapter(normalized);
  }

  capabilities(runtimeId: string): RuntimeSessionCapabilities {
    return { ...this.adapter(runtimeId).capabilities };
  }

  invoke(
    runtimeId: string,
    capability: RuntimeSessionCapability,
    input: Record<string, unknown>,
  ): Promise<RuntimeSessionAdapterResult> {
    return this.adapter(runtimeId).invoke(capability, input);
  }

  matrix(runtimeIds: string[]): Array<{ runtime_id: string; capabilities: RuntimeSessionCapabilities }> {
    return [...new Set(runtimeIds.map((item) => item.trim()).filter(Boolean))]
      .sort()
      .map((runtimeId) => ({ runtime_id: runtimeId, capabilities: this.capabilities(runtimeId) }));
  }
}

export function assertCompleteRuntimeSessionCapabilities(capabilities: RuntimeSessionCapabilities): void {
  for (const capability of RUNTIME_SESSION_CAPABILITIES) {
    if (!["native", "registry", "unsupported"].includes(capabilities[capability])) {
      throw new Error(`Runtime Adapter 缺少 ${capability} 能力声明`);
    }
  }
}

const UNSUPPORTED_CAPABILITIES = Object.fromEntries(
  RUNTIME_SESSION_CAPABILITIES.map((capability) => [capability, "unsupported"]),
) as RuntimeSessionCapabilities;

class UnsupportedRuntimeAdapter implements RuntimeSessionAdapter {
  readonly capabilities = UNSUPPORTED_CAPABILITIES;

  constructor(readonly runtime_id: string) {}

  async invoke(capability: RuntimeSessionCapability): Promise<RuntimeSessionAdapterResult> {
    return {
      status: "unsupported",
      capability,
      code: "runtime.capability_unavailable",
      message: `${this.runtime_id} 没有声明 ${capability} 能力`,
    };
  }
}
