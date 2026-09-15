import { findSessionForHostSignals, type MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeGoalSessionActivity, RuntimeSessionReadResult } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { openWorkSessionRegistry } from "./session-registry.js";
import { sessionSignalsForHost, type MolisWorkRuntimeContextHost } from "./runtime-context.js";

/** Composition only: Registry owns association validation and event persistence. */
export class RuntimeSessionHost {
  private failure: string | null = null;

  constructor(private readonly reconcileLegacy: (homeDirectory: string | undefined, registry: MolisWorkSessionRegistry) => Promise<void>) {}

  recordFailure(error: unknown): void {
    this.failure = error instanceof Error ? error.message : String(error);
  }

  async reconcile(homeDirectory?: string): Promise<void> {
    const registry = await openWorkSessionRegistry({ homeDirectory });
    try { await this.reconcileLegacy(homeDirectory, registry); }
    finally { registry.close(); }
  }

  async record(activity: RuntimeGoalSessionActivity, host: MolisWorkRuntimeContextHost, projectId: string | undefined): Promise<void> {
    try {
      const registry = await openWorkSessionRegistry({ homeDirectory: host.homeDirectory });
      try {
        const session = findSessionForHostSignals(registry, sessionSignalsForHost(host));
        if (!session || session.project_id !== projectId) return;
        if (session.current_goal_id !== activity.goal_id) {
          registry.updateAssociations({
            session_id: session.session_id,
            current_goal_id: activity.goal_id,
            actor_id: activity.actor_id,
            // A committed Goal operation, not a workspace hint, supplies this focus.
            user_confirmed: true,
          });
        }
        registry.appendEvent({ session_id: session.session_id, ...activity.event });
      } finally { registry.close(); }
    } catch (error) {
      // The primary Goal write already committed; expose this secondary failure on context read.
      this.recordFailure(error);
    }
  }

  async read(host: MolisWorkRuntimeContextHost, reconcileLegacy: boolean = false): Promise<RuntimeSessionReadResult> {
    if (this.failure) return {
      sessionRegistry: { status: "unavailable" as const, message: this.failure, session: null },
      sessionGoalId: null,
    };
    try {
      const registry = await openWorkSessionRegistry({ homeDirectory: host.homeDirectory });
      try {
        if (reconcileLegacy) await this.reconcileLegacy(host.homeDirectory, registry);
        const session = findSessionForHostSignals(registry, sessionSignalsForHost(host));
        return {
          sessionGoalId: session?.current_goal_id ?? null,
          sessionRegistry: {
            status: "ready" as const,
            session: session ? {
              session_id: session.session_id,
              runtime_id: session.runtime_id,
              native_runtime_session_id: session.native_runtime_session_id,
              surface_id: session.surface_id,
              project_id: session.project_id,
              current_goal_id: session.current_goal_id,
              workspace_id: session.workspace_id,
              status: session.status,
              provenance: session.provenance,
            } : null,
          },
        };
      } finally { registry.close(); }
    } catch (error) {
      return {
        sessionRegistry: { status: "unavailable" as const, message: error instanceof Error ? error.message : String(error), session: null },
        sessionGoalId: null,
      };
    }
  }
}
