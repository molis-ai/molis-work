import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectWorkspaceDirectoryRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { SessionContentService } from "../content.js";
import type { SessionDirectoryService } from "../directory.js";
import type { SessionHandoffService } from "../handoff.js";
import type { SessionHandoffGoalContext } from "../types.js";
import type { ProjectOperationsProject, ProjectWorkspaceRecord } from "../ui/types.js";

export interface WorkSessionHttpResources {
  registry: WorkSessionApi;
  directory: SessionDirectoryService;
  content: SessionContentService;
  handoff: SessionHandoffService;
}

/** The Local Host validates the HTTP channel; Work interprets only Session operations. */
export interface WorkSessionHttpContext {
  method: string | undefined;
  pathname: string;
  readBody(): Promise<Record<string, unknown>>;
  respond(status: number, body: unknown): void;
  resourcesPromise: Promise<WorkSessionHttpResources>;
  projectOptions: { project: ProjectOperationsProject | null; projects: readonly ProjectOperationsProject[] };
  hasCurrentGoal(goalId: string): boolean;
  readGoalContract(goalId: string): SessionHandoffGoalContext;
  workspace: {
    add(path: string, projectId: string): Promise<ProjectWorkspaceDirectoryRecord>;
    repair(current: ProjectWorkspaceRecord, path: string, projectId: string): Promise<{ workspace: ProjectWorkspaceDirectoryRecord; updated_session_count: number }>;
    unlink(current: ProjectWorkspaceRecord, projectId: string): Promise<{ changed: boolean; updated_session_count: number }>;
    isActionError(error: unknown): boolean;
    read(workspaceId: string): Promise<ProjectWorkspaceRecord | null>;
    normalize(path: string): { workspace_id: string; canonical_path: string } | null | undefined;
    exists(path: string): boolean;
    isDirectory(path: string): boolean;
  };
  /** Opens the system folder window on the computer running this host. */
  pickDirectory(): Promise<
    | { status: "picked"; path: string }
    | { status: "cancelled" }
    | { status: "busy" }
    | { status: "unavailable"; message: string }
  >;
}
