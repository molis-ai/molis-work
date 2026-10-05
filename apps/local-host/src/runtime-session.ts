import { findSessionForHostSignals } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeGoalSessionActivity, RuntimeSessionReadResult } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { openWorkSessionRegistry } from "./session-registry.js";
import { sessionSignalsForHost, type MolisWorkRuntimeContextHost } from "./runtime-context.js";

/** Composition only: Registry owns association validation and event persistence. */
export class RuntimeSessionHost {
  private failure: string | null = null;

  recordFailure(error: unknown): void {
    this.failure = error instanceof Error ? error.message : String(error);
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

  /** `boundProjectId`: the Runtime was just bound to this project, so its binding's Session is written first. */
  async read(host: MolisWorkRuntimeContextHost, boundProjectId: string | null = null): Promise<RuntimeSessionReadResult> {
    if (this.failure) return {
      sessionRegistry: { status: "unavailable" as const, message: this.failure, session: null },
      sessionGoalId: null,
    };
    try {
      const registry = await openWorkSessionRegistry({ homeDirectory: host.homeDirectory });
      try {
        const stableId = host.runtimeContext.stable_work_context_id?.trim();
        if (boundProjectId && stableId) registry.recordBindingSession({ runtime_id: host.runtimeContext.runtime_id,
          stable_work_context_id: stableId, project_id: boundProjectId, bound_by: `runtime:${host.runtimeContext.runtime_id}` },
          host.panelId?.trim() || null);
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
