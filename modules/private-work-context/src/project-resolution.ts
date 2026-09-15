import type { ProjectRecord as MolisWorkProjectRecord, ProjectSelection as MolisWorkProjectSelection, ProjectsQueryApi } from "@molis-ai/molis-work-contracts/modules/projects";
import type { NormalizedRuntimeWorkContext, NormalizedRuntimeWorkspaceContext, RuntimeProjectSuggestionClue, MolisWorkProjectSuggestion, MolisWorkRuntimeContextResolution, RuntimeContextBindingRecord as MolisWorkRuntimeContextBinding } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { RuntimeContextBindingRepository } from "./context-bindings.js";
import { normalizeRuntimeProjectSuggestionClues, scoreProjectSuggestion } from "./project-suggestions.js";

/** Resolve confirmed Session and workspace facts before offering non-authoritative suggestions. Never writes a binding. */
export class RuntimeProjectResolution {
  constructor(
    private readonly projects: Pick<ProjectsQueryApi, "getProject" | "listProjects" | "selections" | "workspaceProjectSelections">,
    private readonly workContexts: Pick<RuntimeContextBindingRepository, "find" | "rejectedProjectIds" | "hasUnboundEvent" | "confirmedProjectIdsForOtherSessions">,
  ) {}
resolveRuntimeContext(
    normalized: NormalizedRuntimeWorkContext,
    suggestionClues: readonly RuntimeProjectSuggestionClue[] = [],
  ): MolisWorkRuntimeContextResolution {
    const availableProjects = this.projectSelections();
    if (!normalized.stable_work_context_id && !normalized.workspace) {
      return unboundResolution(normalized, "missing_stable_context", availableProjects);
    }
    const binding = this.findRuntimeContextBinding(normalized);
    if (binding) {
      return boundResolution(normalized, this.projects.getProject(binding.project_id));
    }
    const workspaceSuggestions = this.workspaceMemberSuggestions(normalized.workspace);
    if (normalized.workspace?.realpath_verified && workspaceSuggestions.length === 1) {
      return boundResolution(normalized, this.projects.getProject(workspaceSuggestions[0]!.project_id));
    }
    if (workspaceSuggestions.length > 0) {
      return suggestedResolution(normalized, workspaceSuggestions, availableProjects);
    }
    const suggestedProjects = this.runtimeContextSuggestions(normalized, suggestionClues);
    if (suggestedProjects.length > 0) {
      return suggestedResolution(normalized, suggestedProjects, availableProjects);
    }
    return unboundResolution(normalized, "unknown_context", availableProjects);
  }

private projectSelections(): MolisWorkProjectSelection[] {
    return this.projects.selections();
  }

private workspaceMemberSuggestions(
    workspace: NormalizedRuntimeWorkspaceContext | undefined,
  ): MolisWorkProjectSuggestion[] {
    if (!workspace) return [];
    return this.projects.workspaceProjectSelections(workspace.workspace_id).map((project) => ({
      project_id: project.project_id,
      display_name: project.display_name,
      reasons: ["这个项目已经与当前目录精确关联"],
    }));
  }

runtimeContextSuggestions(
    context: NormalizedRuntimeWorkContext,
    clues: readonly RuntimeProjectSuggestionClue[],
    includeRejected = false,
  ): MolisWorkProjectSuggestion[] {
    if (!context.stable_work_context_id) return [];
    // An explicit unbind means “stop using Molis Work in this current Session”.
    // Do not immediately turn a prior Session's history into another prompt.
    if (this.hasRuntimeContextUnboundEvent(context)) return [];
    const normalizedClues = normalizeRuntimeProjectSuggestionClues(clues);
    const recentProjectId = this.latestConfirmedProjectIdForOtherSession(context);
    if (recentProjectId && !normalizedClues.some(
      (clue) => clue.kind === "recent_project" && clue.value === recentProjectId,
    )) {
      normalizedClues.push({ kind: "recent_project", value: recentProjectId });
    }
    if (normalizedClues.length === 0) return [];
    const rejectedProjectIds = includeRejected ? new Set<string>() : this.rejectedSuggestionProjectIds(context);
    return this.projects.listProjects()
      .map((project, index) => {
        const match = scoreProjectSuggestion(project, normalizedClues);
        return match
          ? {
              project_id: project.project_id,
              display_name: project.display_name,
              reasons: match.reasons,
              score: match.score,
              index,
            }
          : null;
      })
      .filter((suggestion): suggestion is MolisWorkProjectSuggestion & { score: number; index: number } =>
        suggestion !== null && !rejectedProjectIds.has(suggestion.project_id),
      )
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ project_id, display_name, reasons }) => ({ project_id, display_name, reasons }));
  }

private rejectedSuggestionProjectIds(context: NormalizedRuntimeWorkContext): Set<string> {
    if (!context.stable_work_context_id) return new Set<string>();
    return this.workContexts.rejectedProjectIds(context.runtime_id, context.stable_work_context_id);
  }

private hasRuntimeContextUnboundEvent(context: NormalizedRuntimeWorkContext): boolean {
    if (!context.stable_work_context_id) return false;
    return this.workContexts.hasUnboundEvent(context.runtime_id, context.stable_work_context_id);
  }

private latestConfirmedProjectIdForOtherSession(context: NormalizedRuntimeWorkContext): string | null {
    if (!context.stable_work_context_id) return null;
    const projectIds = this.workContexts.confirmedProjectIdsForOtherSessions(
      context.runtime_id,
      context.stable_work_context_id,
    );
    const currentProjectIds = new Set(this.projects.listProjects().map((project) => project.project_id));
    return projectIds.find((projectId) => currentProjectIds.has(projectId)) ?? null;
  }

findRuntimeContextBinding(
    context: NormalizedRuntimeWorkContext,
  ): MolisWorkRuntimeContextBinding | null {
    if (!context.stable_work_context_id) return null;
    return this.workContexts.find(context.runtime_id, context.stable_work_context_id);
  }
}

export function boundResolution(
  context: NormalizedRuntimeWorkContext,
  project: MolisWorkProjectRecord,
): MolisWorkRuntimeContextResolution {
  return {
    status: "bound",
    reason: null,
    next_action: "continue",
    context,
    project: { project_id: project.project_id, display_name: project.display_name },
    connection: {
      project_id: project.project_id,
      board_id: project.board_id,
      database_path: project.database_path,
    },
    suggested_projects: [],
    available_projects: [],
  };
}

function suggestedResolution(
  context: NormalizedRuntimeWorkContext,
  suggestedProjects: MolisWorkProjectSuggestion[],
  availableProjects: MolisWorkProjectSelection[],
): MolisWorkRuntimeContextResolution {
  return {
    status: "suggested",
    reason: null,
    next_action: "use_explicit_existing_selection_or_ask_user_to_confirm_suggestion",
    context,
    project: null,
    connection: null,
    suggested_projects: suggestedProjects,
    available_projects: availableProjects,
  };
}

function unboundResolution(
  context: NormalizedRuntimeWorkContext,
  reason: "missing_stable_context" | "unknown_context",
  availableProjects: MolisWorkProjectSelection[],
): MolisWorkRuntimeContextResolution {
  return {
    status: "unbound",
    reason,
    next_action: "use_explicit_existing_selection_or_ask_user_to_select_or_create",
    context,
    project: null,
    connection: null,
    suggested_projects: [],
    available_projects: availableProjects,
  };
}
