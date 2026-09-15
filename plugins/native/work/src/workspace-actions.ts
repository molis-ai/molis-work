import type {
  ProjectsQueryApi,
  ProjectsCommandApi,
  ProjectWorkspaceDirectoryRecord as MolisWorkWorkspaceDirectoryRecord,
} from "@molis-ai/molis-work-contracts/modules/projects";
import type { WorkSessionCommandApi, WorkSessionRecord as MolisWorkSessionRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";

export interface ProjectWorkspaceActionRecord {
  id: string;
  path: string;
  projectLinked?: boolean;
}

type WorkspaceActionCatalog = Pick<
  ProjectsQueryApi & ProjectsCommandApi,
  "addWorkspaceProject" | "listWorkspaceDirectory" | "removeWorkspaceMembership" | "repairWorkspaceProject"
>;

type WorkspaceActionRegistry = Pick<WorkSessionCommandApi, "reassignWorkspaceSessions">;

export class MolisWorkWorkspaceActionError extends Error {
  constructor(
    readonly code: "workspace.change_rolled_back" | "workspace.recovery_required",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MolisWorkWorkspaceActionError";
  }
}

export function repairProjectWorkspace(input: {
  catalog: WorkspaceActionCatalog;
  registry: WorkspaceActionRegistry;
  current: ProjectWorkspaceActionRecord;
  canonicalPath: string;
  projectId: string;
  actorId: string;
}): { workspace: MolisWorkWorkspaceDirectoryRecord; sessions: MolisWorkSessionRecord[] } {
  const beforeWorkspaceIds = new Set(
    input.catalog.listWorkspaceDirectory(input.projectId).map((workspace) => workspace.workspace_id),
  );
  const workspace = input.current.projectLinked
    ? input.catalog.repairWorkspaceProject({
        workspace_id: input.current.id,
        canonical_path: input.canonicalPath,
        project_id: input.projectId,
        actor_id: input.actorId,
        user_confirmed: true,
      })
    : input.catalog.addWorkspaceProject({
        canonical_path: input.canonicalPath,
        project_id: input.projectId,
        actor_id: input.actorId,
        user_confirmed: true,
      });
  try {
    const sessions = input.registry.reassignWorkspaceSessions({
      project_id: input.projectId,
      actor_id: input.actorId,
      user_confirmed: true,
      previous_workspace_id: input.current.id,
      previous_workspace_path: input.current.path,
      workspace_id: workspace.workspace_id,
      workspace_path: workspace.canonical_path,
    });
    return { workspace, sessions };
  } catch (cause) {
    try {
      if (input.current.projectLinked) {
        input.catalog.addWorkspaceProject({
          canonical_path: input.current.path,
          project_id: input.projectId,
          actor_id: input.actorId,
          user_confirmed: true,
        });
      }
      if (!beforeWorkspaceIds.has(workspace.workspace_id)) {
        input.catalog.removeWorkspaceMembership({
          workspace_id: workspace.workspace_id,
          project_id: input.projectId,
          actor_id: input.actorId,
          user_confirmed: true,
        });
      }
    } catch (recoveryCause) {
      throw new MolisWorkWorkspaceActionError(
        "workspace.recovery_required",
        `Session 关系更新失败，且目录关系自动恢复失败：${errorMessage(recoveryCause)}`,
        { cause },
      );
    }
    throw new MolisWorkWorkspaceActionError(
      "workspace.change_rolled_back",
      `Session 关系更新失败；目录关系已自动恢复：${errorMessage(cause)}`,
      { cause },
    );
  }
}

export function unlinkProjectWorkspace(input: {
  catalog: WorkspaceActionCatalog;
  registry: WorkspaceActionRegistry;
  current: ProjectWorkspaceActionRecord;
  projectId: string;
  actorId: string;
}): { changed: boolean; sessions: MolisWorkSessionRecord[] } {
  if (input.current.projectLinked) {
    input.catalog.removeWorkspaceMembership({
      workspace_id: input.current.id,
      project_id: input.projectId,
      actor_id: input.actorId,
      user_confirmed: true,
    });
  }
  try {
    const sessions = input.registry.reassignWorkspaceSessions({
      project_id: input.projectId,
      actor_id: input.actorId,
      user_confirmed: true,
      previous_workspace_id: input.current.id,
      previous_workspace_path: input.current.path,
      workspace_id: null,
      workspace_path: null,
    });
    return { changed: input.current.projectLinked || sessions.length > 0, sessions };
  } catch (cause) {
    if (input.current.projectLinked) {
      try {
        input.catalog.addWorkspaceProject({
          canonical_path: input.current.path,
          project_id: input.projectId,
          actor_id: input.actorId,
          user_confirmed: true,
        });
      } catch (recoveryCause) {
        throw new MolisWorkWorkspaceActionError(
          "workspace.recovery_required",
          `Session 关系更新失败，且目录关系自动恢复失败：${errorMessage(recoveryCause)}`,
          { cause },
        );
      }
    }
    throw new MolisWorkWorkspaceActionError(
      "workspace.change_rolled_back",
      `Session 关系更新失败；目录关系已自动恢复：${errorMessage(cause)}`,
      { cause },
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
