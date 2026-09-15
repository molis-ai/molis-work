import type { MolisWorkRuntimeConnection, RuntimeProjectConnectionState } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { RuntimeWorkContext } from "@molis-ai/molis-work-contracts/modules/private-work-context";

function contextKey(context: RuntimeWorkContext): string {
  const workspace = context.workspace?.canonical_path ?? "no-workspace";
  return `${context.runtime_id}:${context.stable_work_context_id ?? "no-session"}:${workspace}`;
}

/** Preserve the existing cache invalidation protocol without changing canonical bindings. */
export class RuntimeProjectConnection implements RuntimeProjectConnectionState {
  connection: MolisWorkRuntimeConnection | null;
  private key: string | null;
  private refreshKey: string | null = null;

  constructor(connection: MolisWorkRuntimeConnection | null = null) {
    this.connection = connection;
    this.key = connection ? "explicit" : null;
  }

  get explicit(): boolean { return this.key === "explicit"; }

  observe(context: RuntimeWorkContext): "current" | "refresh_required" {
    if (this.explicit) return "current";
    const currentKey = contextKey(context);
    if (this.key !== currentKey) {
      const invalidated = this.connection !== null;
      this.connection = null;
      this.key = null;
      if (invalidated) this.refreshKey = currentKey;
    }
    return !this.connection && this.refreshKey === currentKey ? "refresh_required" : "current";
  }

  clear(clearRefresh: boolean = true): void {
    this.connection = null;
    this.key = null;
    if (clearRefresh) this.refreshKey = null;
  }

  accept(connection: MolisWorkRuntimeConnection | null, context: RuntimeWorkContext): void {
    this.refreshKey = null;
    this.connection = connection;
    this.key = connection ? contextKey(context) : null;
  }
}
