import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";

import type {
  AddWorkspaceProjectInput,
  ChangeWorkspaceProjectInput,
  ProjectWorkspaceDirectoryRecord,
  ProjectWorkspaceMembership,
  ProjectWorkspaceRef,
  RepairWorkspaceProjectInput,
} from "@molis-ai/molis-work-contracts/modules/projects";

import type { ProjectsErrorFactory } from "./project-service.js";
import { ProjectsRepository } from "./repository.js";

export function normalizeProjectWorkspace(
  input: { canonical_path: string; realpath_verified: boolean } | null | undefined,
): ProjectWorkspaceRef | undefined {
  if (!input || typeof input.canonical_path !== "string") return undefined;
  const suppliedPath = input.canonical_path.trim();
  if (!suppliedPath || !path.isAbsolute(suppliedPath)) return undefined;
  let canonicalPath = path.resolve(suppliedPath);
  let realpathVerified = false;
  try {
    canonicalPath = realpathSync.native(canonicalPath);
    realpathVerified = true;
  } catch {
    realpathVerified = input.realpath_verified === true;
  }
  return {
    workspace_id: `workspace-${createHash("sha256").update(canonicalPath).digest("hex").slice(0, 24)}`,
    canonical_path: canonicalPath,
    realpath_verified: realpathVerified,
    display_name: path.basename(canonicalPath) || canonicalPath,
  };
}

export class ProjectWorkspaceService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly error: ProjectsErrorFactory,
    private readonly now: () => string,
    private readonly id: (prefix: string) => string,
  ) {}

  normalize(input: { canonical_path: string; realpath_verified: boolean } | null | undefined): ProjectWorkspaceRef | undefined {
    return normalizeProjectWorkspace(input);
  }

  listMemberships(): ProjectWorkspaceMembership[] {
    return this.repository.listWorkspaceMemberships();
  }

  listDirectory(projectId?: string): ProjectWorkspaceDirectoryRecord[] {
    return this.repository.listWorkspaceDirectory(projectId?.trim() || undefined);
  }

  preferredPath(projectId: string): string | null {
    return this.repository.preferredWorkspacePath(this.requiredProjectId(projectId));
  }

  add(input: AddWorkspaceProjectInput): ProjectWorkspaceDirectoryRecord {
    const projectId = this.requiredProjectId(input.project_id);
    const actorId = this.requiredActorId(input.actor_id);
    this.requireConfirmation(input.user_confirmed, "只有用户明确确认后才能关联工作目录");
    const workspace = this.normalize({ canonical_path: input.canonical_path, realpath_verified: false });
    if (!workspace) throw this.error("context.workspace_required", "工作目录必须是绝对路径");
    this.repository.transaction(() => this.upsertMembership(workspace, projectId, actorId));
    return this.requireDirectory(workspace.workspace_id);
  }

  repair(input: RepairWorkspaceProjectInput): ProjectWorkspaceDirectoryRecord {
    const workspaceId = this.requiredWorkspaceId(input.workspace_id);
    const projectId = this.requiredProjectId(input.project_id);
    const actorId = this.requiredActorId(input.actor_id);
    this.requireConfirmation(input.user_confirmed, "只有用户明确确认后才能修复工作目录路径");
    const current = this.requireDirectory(workspaceId);
    if (!current.project_ids.includes(projectId)) {
      throw this.error("context.workspace_membership_not_found", "这个目录尚未关联当前项目");
    }
    const next = this.normalize({ canonical_path: input.canonical_path, realpath_verified: false });
    if (!next) throw this.error("context.workspace_required", "新的工作目录必须是绝对路径");
    this.repository.transaction(() => {
      this.upsertMembership(next, projectId, actorId);
      if (next.workspace_id !== workspaceId) {
        this.repository.removeWorkspaceMembership(workspaceId, projectId);
        this.repository.removeWorkspaceIfEmpty(workspaceId);
      }
      this.appendEvent(projectId, "project.workspace_path_repaired", actorId, {
        previous_workspace_id: workspaceId,
        workspace_id: next.workspace_id,
      });
    });
    return this.requireDirectory(next.workspace_id);
  }

  setDefault(input: ChangeWorkspaceProjectInput): ProjectWorkspaceMembership[] {
    this.requireConfirmation(input.user_confirmed, "只有用户明确确认后才能更改目录的默认项目");
    throw this.error(
      "context.workspace_default_unsupported",
      "工作目录不再保存默认项目；请为当前 Session 选择项目",
    );
  }

  remove(input: ChangeWorkspaceProjectInput): ProjectWorkspaceMembership[] {
    const workspaceId = this.requiredWorkspaceId(input.workspace_id);
    const projectId = this.requiredProjectId(input.project_id);
    const actorId = this.requiredActorId(input.actor_id);
    this.requireConfirmation(input.user_confirmed, "只有用户明确确认后才能解除目录与项目的关联");
    this.repository.transaction(() => {
      const changes = this.repository.removeWorkspaceMembership(workspaceId, projectId);
      if (changes > 0) {
        this.repository.removeWorkspaceIfEmpty(workspaceId);
        this.appendEvent(projectId, "project.workspace_unlinked", actorId, { workspace_id: workspaceId });
      }
    });
    return this.listMemberships();
  }

  upsertMembership(workspace: ProjectWorkspaceRef, projectId: string, actorId: string): void {
    const now = this.now();
    this.repository.upsertWorkspace(workspace, now);
    this.repository.upsertWorkspaceMembership({
      membership_id: this.id("workspace-membership"),
      workspace_id: workspace.workspace_id,
      project_id: this.requiredProjectId(projectId),
      actor_id: this.requiredActorId(actorId),
      now,
    });
    this.appendEvent(projectId, "project.workspace_member_bound", actorId, {
      workspace_id: workspace.workspace_id,
    });
  }

  unlink(
    workspaceId: string,
    projectId: string,
    actorId: string,
    removeEmptyWorkspace = true,
  ): boolean {
    return this.repository.transaction(() => {
      const changes = this.repository.removeWorkspaceMembership(
        this.requiredWorkspaceId(workspaceId),
        this.requiredProjectId(projectId),
      );
      if (changes === 0) return false;
      if (removeEmptyWorkspace) this.repository.removeWorkspaceIfEmpty(workspaceId);
      this.appendEvent(projectId, "project.workspace_unlinked", this.requiredActorId(actorId), {
        workspace_id: workspaceId,
      });
      return true;
    });
  }

  requireDirectory(workspaceId: string): ProjectWorkspaceDirectoryRecord {
    const record = this.listDirectory().find((workspace) => workspace.workspace_id === workspaceId);
    if (!record) throw this.error("context.workspace_membership_not_found", "找不到这条工作目录记录");
    return record;
  }

  private appendEvent(
    projectId: string,
    type: string,
    actorId: string,
    payload: Record<string, unknown>,
  ): void {
    this.repository.appendEvent({
      event_id: this.id("project-event"),
      project_id: projectId,
      type,
      actor_id: actorId,
      payload,
      created_at: this.now(),
    });
  }

  private requireConfirmation(value: boolean, message: string): void {
    if (value !== true) throw this.error("context.user_confirmation_required", message);
  }

  private requiredProjectId(value: string): string {
    const projectId = value.trim();
    if (!projectId) throw this.error("catalog.project_not_found", "项目 ID 不能为空");
    return projectId;
  }

  private requiredWorkspaceId(value: string): string {
    const workspaceId = value.trim();
    if (!workspaceId) throw this.error("context.workspace_required", "必须选择一个项目目录");
    return workspaceId;
  }

  private requiredActorId(value: string): string {
    const actorId = value.trim();
    if (!actorId) throw this.error("context.user_confirmation_required", "项目操作必须记录执行者");
    return actorId;
  }
}
