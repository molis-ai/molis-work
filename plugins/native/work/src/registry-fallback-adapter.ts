import type {
  RuntimeSessionAdapter,
  RuntimeSessionAdapterResult,
  RuntimeSessionCapabilities,
  RuntimeSessionCapability,
} from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";

const FALLBACK_CAPABILITIES: RuntimeSessionCapabilities = {
  create: "registry",
  list: "registry",
  discover: "unsupported",
  read: "unsupported",
  resume: "unsupported",
  events: "unsupported",
  handoff: "unsupported",
};

export class RegistryFallbackSessionAdapter implements RuntimeSessionAdapter {
  readonly capabilities = FALLBACK_CAPABILITIES;

  constructor(
    readonly runtime_id: string,
    private readonly registry: WorkSessionApi,
  ) {}

  async invoke(
    capability: RuntimeSessionCapability,
    input: Record<string, unknown>,
  ): Promise<RuntimeSessionAdapterResult> {
    try {
      if (capability === "create") {
        const record = this.registry.createSession({
          runtime_id: this.runtime_id,
          actor_id: typeof input.actor_id === "string" ? input.actor_id : "",
          user_confirmed: input.user_confirmed === true,
          native_runtime_session_id: optionalString(input.native_runtime_session_id),
          surface_id: optionalString(input.surface_id),
          project_id: optionalString(input.project_id),
          current_goal_id: optionalString(input.current_goal_id),
          workspace_id: optionalString(input.workspace_id),
          workspace_path: optionalString(input.workspace_path),
          title: optionalString(input.title),
          provenance: "molis_work_created",
          metadata: objectValue(input.metadata),
        });
        return { status: "ok", source: "registry", capability, value: record };
      }
      if (capability === "list") {
        const value = this.registry.list({
          runtime_id: this.runtime_id,
          project_id: optionalString(input.project_id) ?? undefined,
          workspace_id: optionalString(input.workspace_id) ?? undefined,
          status: input.status === "discovered" || input.status === "active" || input.status === "closed"
            ? input.status
            : undefined,
        });
        return { status: "ok", source: "registry", capability, value };
      }
      return {
        status: "unsupported",
        capability,
        code: "runtime.capability_unavailable",
        message: `${this.runtime_id} 没有声明 ${capability} 原生能力；fallback 不会伪造结果`,
      };
    } catch (error) {
      return {
        status: "failed",
        capability,
        code: "runtime.operation_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
