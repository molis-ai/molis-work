import { randomUUID } from "node:crypto";
import type { ProjectsQueryApi } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeWorkContext, NormalizedRuntimeWorkContext, NormalizedRuntimeWorkspaceContext, RuntimeProjectSuggestionClue, MolisWorkRuntimeContextResolution, RejectRuntimeContextSuggestionInput, MolisWorkRuntimeContextSuggestionRejectionResult, BindRuntimeWorkContextInput, UnbindRuntimeWorkContextInput, MolisWorkRuntimeContextUnbindResult, RuntimeContextBindingRecord as MolisWorkRuntimeContextBinding } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { RuntimeContextBindingRepository } from "./context-bindings.js";
import type { RuntimeBindingRecords } from "./runtime-binding-records.js";
import { boundResolution, type RuntimeProjectResolution } from "./project-resolution.js";
import type { RuntimeProjectBindingValidation } from "./project-binding-validation.js";
import { bindingErrors } from "./binding-errors.js";
import { projectCatalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";

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
    private readonly transaction: <T>(operation: () => T) => T,
    private readonly records: RuntimeBindingRecords,
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
      throw bindingErrors.user_confirmation_required("只有用户在当前对话明确拒绝候选项目后才能停止在本 Session 推荐它",
      );
    }

    return this.transaction(() => {
      if (this.contextResolution.findRuntimeContextBinding(normalized)) {
        throw bindingErrors.suggestion_not_available("当前 Runtime 工作入口已经绑定项目，不能拒绝未绑定 Session 的候选项目",
        );
      }
      const allSuggestions = this.contextResolution.runtimeContextSuggestions(normalized, input.suggestion_clues, true);
      const suggestion = allSuggestions.find((candidate) => candidate.project_id === projectId);
      if (!suggestion) {
        throw bindingErrors.suggestion_not_available("这个项目不是当前 Runtime Session 的候选项目，不能把它标记为已拒绝",
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
      throw projectCatalogErrors.project_not_found("绑定时必须选择一个 Molis Work 项目");
    }
    if (input.user_confirmed !== true) {
      throw bindingErrors.user_confirmation_required("只有用户在当前对话明确选择项目后才能建立绑定",
      );
    }
    if (input.binding_scope === "workspace_default") {
      throw bindingErrors.workspace_default_unsupported("工作目录不再保存默认项目；请为当前 Session 选择项目",
      );
    }

    const bindingScope = input.binding_scope
      ?? (normalized.stable_work_context_id ? "session" : "workspace_member");
    return this.transaction(() => {
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
      throw bindingErrors.user_confirmation_required("只有用户在当前对话明确要求解除绑定后才能断开当前项目",
      );
    }

    return this.transaction(() => {
      if (input.binding_scope === "workspace") {
        if (!normalized.workspace) {
          throw bindingErrors.workspace_required("解除目录关联时，Runtime 必须提供当前项目目录",
          );
        }
        const projectId = this.validation.requiredProjectId(input.project_id ?? "");
        const membership = this.records.findWorkspaceMembershipByIds(normalized.workspace.workspace_id, projectId);
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
      this.records.removeSessionBinding(current, actorId);
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
    /** workspace_default is refused by both entries before they get here, so the type leaves it out. */
    bindingScope: "session" | "workspace_member";
  }): MolisWorkRuntimeContextResolution {
    const project = this.projects.query.getProject(input.projectId);
    if (input.bindingScope === "workspace_member") {
      // Both entries ran requireRoutableRuntimeWorkContext: a context without a Session id has a workspace.
      this.projects.lifecycle.upsertWorkspaceMembership(input.normalized.workspace!, project.project_id, input.actorId);
      return boundResolution(input.normalized, project);
    }

    if (!input.normalized.stable_work_context_id) {
      throw bindingErrors.stable_identity_required("只切换当前 Session 时需要 Runtime 提供稳定 Session 标识",
      );
    }
    if (input.normalized.workspace) {
      this.projects.lifecycle.upsertWorkspaceMembership(input.normalized.workspace, project.project_id, input.actorId);
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
      this.records.appendRuntimeContextBindingEvent({
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
      throw bindingErrors.rebind_confirmation_required("这个 Runtime 工作入口已绑定其他项目；请在当前对话明确确认后再切换",
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
    this.records.appendRuntimeContextBindingEvent({
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
}
