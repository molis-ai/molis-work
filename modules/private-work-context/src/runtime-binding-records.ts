import type { RuntimeContextBindingRecord as MolisWorkRuntimeContextBinding, RuntimeContextBindingEventRecord as MolisWorkRuntimeContextBindingEvent, NormalizedRuntimeWorkContext, RuntimeWorkContext } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectWorkspaceMembership as MolisWorkWorkspaceMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeContextBindingRepository } from "./context-bindings.js";
import type { RuntimeProjectBindingValidation } from "./project-binding-validation.js";
import type { RuntimeProjectBindingPorts } from "./project-binding-commands.js";

/** What the binding commands read and write around a binding: its ledger rows, the workspace membership beside it, the setup replay record. */
export class RuntimeBindingRecords {
  constructor(
    private readonly workContexts: RuntimeContextBindingRepository,
    private readonly projects: RuntimeProjectBindingPorts,
    private readonly validation: RuntimeProjectBindingValidation,
  ) {}

  listRuntimeContextBindingEvents(context?: RuntimeWorkContext): MolisWorkRuntimeContextBindingEvent[] {
    const normalized = context ? this.validation.normalizeRuntimeWorkContext(context) : null;
    if (normalized && !normalized.stable_work_context_id) return [];
    return normalized
      ? this.workContexts.listEvents({
          runtime_id: normalized.runtime_id,
          stable_work_context_id: normalized.stable_work_context_id!,
        })
      : this.workContexts.listEvents();
  }

  listRuntimeContextBindings(): MolisWorkRuntimeContextBinding[] {
    return this.workContexts.list();
  }

  findWorkspaceMembershipByIds(workspaceId: string, projectId: string): MolisWorkWorkspaceMembership | null {
    return this.projects.query.listWorkspaceMemberships().find(
      (membership) => membership.workspace_id === workspaceId && membership.project_id === projectId,
    ) ?? null;
  }

  removeSessionBinding(binding: MolisWorkRuntimeContextBinding, actorId: string): void {
    const now = new Date().toISOString();
    this.workContexts.remove(binding.binding_id, actorId, now);
    this.appendRuntimeContextBindingEvent({
      binding,
      type: "context.unbound",
      previousProjectId: binding.project_id,
      actorId,
      createdAt: now,
    });
    this.projects.lifecycle.appendEvent(binding.project_id, "project.runtime_context_unbound", actorId, {
      binding_id: binding.binding_id,
      runtime_id: binding.runtime_id,
      stable_work_context_id: binding.stable_work_context_id,
    });
  }

  findRuntimeContextSetupRequest(
    context: NormalizedRuntimeWorkContext,
    idempotencyKey: string,
  ): { request_fingerprint: string; project_id: string } | null {
    const persistenceId = this.validation.runtimeContextPersistenceId(context);
    return this.workContexts.findSetupRequest(context.runtime_id, persistenceId, idempotencyKey);
  }

  appendRuntimeContextBindingEvent(input: {
    binding: MolisWorkRuntimeContextBinding;
    type: MolisWorkRuntimeContextBindingEvent["type"];
    previousProjectId: string | null;
    actorId: string;
    createdAt: string;
  }): void {
    this.workContexts.appendEvent({
      binding: input.binding,
      type: input.type,
      previous_project_id: input.previousProjectId,
      actor_id: input.actorId,
      created_at: input.createdAt,
    });
  }
}
