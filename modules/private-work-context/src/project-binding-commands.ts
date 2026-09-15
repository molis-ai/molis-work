import { randomUUID } from "node:crypto";
import type { ProjectsQueryApi } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeWorkContext, NormalizedRuntimeWorkContext, NormalizedRuntimeWorkspaceContext, RuntimeProjectSuggestionClue, MolisWorkRuntimeContextResolution, RejectRuntimeContextSuggestionInput, MolisWorkRuntimeContextSuggestionRejectionResult, BindRuntimeWorkContextInput, UnbindRuntimeWorkContextInput, MolisWorkRuntimeContextUnbindResult, MolisWorkProjectBindingScope, RuntimeContextBindingRecord as MolisWorkRuntimeContextBinding, RuntimeContextBindingEventRecord as MolisWorkRuntimeContextBindingEvent } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectWorkspaceMembership as MolisWorkWorkspaceMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeContextBindingRepository } from "./context-bindings.js";
import { boundResolution, type RuntimeProjectResolution } from "./project-resolution.js";
import type { RuntimeProjectBindingValidation, RuntimeProjectBindingErrorFactory } from "./project-binding-validation.js";

export interface RuntimeProjectBindingPorts {
  query: Pick<ProjectsQueryApi, "getProject" | "listWorkspaceMemberships">;
  lifecycle: {
    upsertWorkspaceMembership(workspace: NormalizedRuntimeWorkspaceContext, projectId: string, actorId: string): void;
    unlinkWorkspaceMembership(workspaceId: string, projectId: string, actorId: string, removeEmptyWorkspace: boolean): void;
    appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, string | null>): void;
  };
}
/** Session binding commands keep confirmation, mutation and journal updates in the existing transaction. */
export class RuntimeProjectBindingCommands {
  constructor(
    private readonly workContexts: RuntimeContextBindingRepository,
    private readonly contextResolution: RuntimeProjectResolution,
    private readonly projects: RuntimeProjectBindingPorts,
    private readonly validation: RuntimeProjectBindingValidation,
    private readonly error: RuntimeProjectBindingErrorFactory,
    private readonly transaction: <T>(operation: () => T) => T,
  ) {}
  resolveRuntimeContext(context: RuntimeWorkContext, clues: readonly RuntimeProjectSuggestionClue[] = []): MolisWorkRuntimeContextResolution {
    return this.contextResolution.resolveRuntimeContext(this.validation.normalizeRuntimeWorkContext(context), clues);
  }
rejectRuntimeContextSuggestion(
    input: RejectRuntimeContextSuggestionInput,
  ): MolisWorkRuntimeContextSuggestionRejectionResult {
    const normalized = this.validation.requireStableRuntimeWorkContext(input.context);
    const actorId = this.validation.requiredActorId(input.actor_id);
    const projectId = this.validation.requiredProjectId(input.project_id);
    if (input.user_confirmed !== true) {
      throw this.error(
        "context.user_confirmation_required",
        "只有用户在当前对话明确拒绝候选项目后才能停止在本 Session 推荐它",
      );
    }

    return this.transaction(() => {
      if (this.contextResolution.findRuntimeContextBinding(normalized)) {
        throw this.error(
          "context.suggestion_not_available",
          "当前 Runtime 工作入口已经绑定项目，不能拒绝未绑定 Session 的候选项目",
        );
      }
      const allSuggestions = this.contextResolution.runtimeContextSuggestions(normalized, input.suggestion_clues, true);
      const suggestion = allSuggestions.find((candidate) => candidate.project_id === projectId);
      if (!suggestion) {
        throw this.error(
          "context.suggestion_not_available",
          "这个项目不是当前 Runtime Session 的候选项目，不能把它标记为已拒绝",
        );
      }
      const changed = this.workContexts.rejectSuggestion({
        runtime_id: normalized.runtime_id,
        stable_work_context_id: normalized.stable_work_context_id!,
        project_id: projectId,
        actor_id: actorId,
        created_at: new Date().toISOString(),
      });
      if (changed) {
        this.projects.lifecycle.appendEvent(projectId, "project.runtime_context_suggestion_rejected", actorId, {
          runtime_id: normalized.runtime_id,
          stable_work_context_id: normalized.stable_work_context_id,
        });
      }
      return {
        resolution: this.resolveRuntimeContext(input.context, input.suggestion_clues),
        rejected_project: {
          project_id: suggestion.project_id,
          display_name: suggestion.display_name,
        },
        changed,
      };
    });
  }

bindRuntimeContext(input: BindRuntimeWorkContextInput): MolisWorkRuntimeContextResolution {
    const normalized = this.validation.requireRoutableRuntimeWorkContext(input.context);
    const actorId = this.validation.requiredActorId(input.actor_id);
    const projectId = input.project_id.trim();
    if (!projectId) {
      throw this.error("catalog.project_not_found", "绑定时必须选择一个 Molis Work 项目");
    }
    if (input.user_confirmed !== true) {
      throw this.error(
        "context.user_confirmation_required",
        "只有用户在当前对话明确选择项目后才能建立绑定",
      );
    }
    if (input.binding_scope === "workspace_default") {
      throw this.error(
        "context.workspace_default_unsupported",
        "工作目录不再保存默认项目；请为当前 Session 选择项目",
      );
    }

    return this.transaction(() => {
      const bindingScope = input.binding_scope
        ?? (normalized.stable_work_context_id ? "session" : "workspace_member");
      return this.bindRuntimeContextInTransaction({
        normalized,
        projectId,
        actorId,
        rebindConfirmed: input.rebind_confirmed === true,
        bindingScope,
      });
    });
  }

unbindRuntimeContext(input: UnbindRuntimeWorkContextInput): MolisWorkRuntimeContextUnbindResult {
    const normalized = this.validation.requireRoutableRuntimeWorkContext(input.context);
    const actorId = this.validation.requiredActorId(input.actor_id);
    if (input.user_confirmed !== true) {
      throw this.error(
        "context.user_confirmation_required",
        "只有用户在当前对话明确要求解除绑定后才能断开当前项目",
      );
    }

    return this.transaction(() => {
      if (input.binding_scope === "workspace") {
        if (!normalized.workspace) {
          throw this.error(
            "context.workspace_required",
            "解除目录关联时，Runtime 必须提供当前项目目录",
          );
        }
        const projectId = this.validation.requiredProjectId(input.project_id ?? "");
        const membership = this.findWorkspaceMembershipByIds(normalized.workspace.workspace_id, projectId);
        if (!membership) {
          return {
            resolution: this.resolveRuntimeContext(input.context),
            unbound_project: null,
            changed: false,
          };
        }
        this.projects.lifecycle.unlinkWorkspaceMembership(
          normalized.workspace.workspace_id,
          projectId,
          actorId,
          false,
        );
        const project = this.projects.query.getProject(projectId);
        return {
          resolution: this.resolveRuntimeContext(input.context),
          unbound_project: { project_id: project.project_id, display_name: project.display_name },
          changed: true,
        };
      }
      const current = this.contextResolution.findRuntimeContextBinding(normalized);
      if (!current) {
        return {
          resolution: this.resolveRuntimeContext(input.context),
          unbound_project: null,
          changed: false,
        };
      }
      const project = this.projects.query.getProject(current.project_id);
      this.removeSessionBinding(current, actorId);
      return {
        resolution: this.resolveRuntimeContext(input.context),
        unbound_project: { project_id: project.project_id, display_name: project.display_name },
        changed: true,
      };
    });
  }

bindRuntimeContextInTransaction(input: {
    normalized: NormalizedRuntimeWorkContext;
    projectId: string;
    actorId: string;
    rebindConfirmed: boolean;
    bindingScope: MolisWorkProjectBindingScope | "workspace_member";
  }): MolisWorkRuntimeContextResolution {
    const project = this.projects.query.getProject(input.projectId);
    if (input.bindingScope === "workspace_default") {
      throw this.error(
        "context.workspace_default_unsupported",
        "工作目录不再保存默认项目；请为当前 Session 选择项目",
      );
    }

    if (input.bindingScope === "workspace_member") {
      if (!input.normalized.workspace) {
        throw this.error(
          "context.workspace_required",
          "当前 Runtime 没有 Session 标识时，必须提供项目目录才能记录本次选择",
        );
      }
      this.upsertWorkspaceMembership(input.normalized.workspace, project.project_id, input.actorId);
      return boundResolution(input.normalized, project);
    }

    if (!input.normalized.stable_work_context_id) {
      throw this.error(
        "context.stable_identity_required",
        "只切换当前 Session 时需要 Runtime 提供稳定 Session 标识",
      );
    }
    if (input.normalized.workspace) {
      this.upsertWorkspaceMembership(input.normalized.workspace, project.project_id, input.actorId);
    }
    const current = this.contextResolution.findRuntimeContextBinding(input.normalized);
    if (!current) {
      const now = new Date().toISOString();
      const binding: MolisWorkRuntimeContextBinding = {
        binding_id: `context-binding-${randomUUID()}`,
        runtime_id: input.normalized.runtime_id,
        stable_work_context_id: input.normalized.stable_work_context_id!,
        project_id: project.project_id,
        bound_by: input.actorId,
        created_at: now,
        updated_at: now,
      };
      this.workContexts.insert(binding);
      this.appendRuntimeContextBindingEvent({
        binding,
        type: "context.bound",
        previousProjectId: null,
        actorId: input.actorId,
        createdAt: now,
      });
      this.projects.lifecycle.appendEvent(project.project_id, "project.runtime_context_bound", input.actorId, {
        binding_id: binding.binding_id,
        runtime_id: binding.runtime_id,
        stable_work_context_id: binding.stable_work_context_id,
      });
      return boundResolution(input.normalized, project);
    }

    if (current.project_id === project.project_id) {
      return boundResolution(input.normalized, project);
    }
    if (!input.rebindConfirmed) {
      throw this.error(
        "context.rebind_confirmation_required",
        "这个 Runtime 工作入口已绑定其他项目；请在当前对话明确确认后再切换",
      );
    }

    const now = new Date().toISOString();
    this.workContexts.updateProject(current.binding_id, project.project_id, input.actorId, now);
    const rebound: MolisWorkRuntimeContextBinding = {
      ...current,
      project_id: project.project_id,
      bound_by: input.actorId,
      updated_at: now,
    };
    this.appendRuntimeContextBindingEvent({
      binding: rebound,
      type: "context.rebound",
      previousProjectId: current.project_id,
      actorId: input.actorId,
      createdAt: now,
    });
    this.projects.lifecycle.appendEvent(current.project_id, "project.runtime_context_rebound_from", input.actorId, {
      binding_id: current.binding_id,
      runtime_id: current.runtime_id,
      stable_work_context_id: current.stable_work_context_id,
      next_project_id: project.project_id,
    });
    this.projects.lifecycle.appendEvent(project.project_id, "project.runtime_context_rebound_to", input.actorId, {
      binding_id: current.binding_id,
      runtime_id: current.runtime_id,
      stable_work_context_id: current.stable_work_context_id,
      previous_project_id: current.project_id,
    });
    return boundResolution(input.normalized, project);
  }

listRuntimeContextBindingEvents(
    context?: RuntimeWorkContext,
  ): MolisWorkRuntimeContextBindingEvent[] {
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

findWorkspaceMembershipByIds(
    workspaceId: string,
    projectId: string,
  ): MolisWorkWorkspaceMembership | null {
    return this.projects.query.listWorkspaceMemberships().find(
      (membership) => membership.workspace_id === workspaceId && membership.project_id === projectId,
    ) ?? null;
  }

upsertWorkspaceMembership(
    workspace: NormalizedRuntimeWorkspaceContext,
    projectId: string,
    actorId: string,
  ): void {
    this.projects.lifecycle.upsertWorkspaceMembership(workspace, projectId, actorId);
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
