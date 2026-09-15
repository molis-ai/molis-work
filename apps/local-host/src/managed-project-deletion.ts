import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { RuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
import { randomUUID } from "node:crypto";
import type { StoredProjectDeletion } from "@molis-ai/molis-work-module-projects";
import type { DeleteProjectInput as DeleteMolisWorkProjectInput, ProjectDeletionResult as MolisWorkProjectDeletionResult, ProjectDeletionRecord as MolisWorkProjectDeletionRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import { managedProjectDirectory } from "./project-file-paths.js";
import { assertProjectHasNoActiveWork } from "./managed-project-database.js";
export interface ProjectDeletionCleanupPorts {
  removeBindings(projectId: string, actorId: string, at: string): number;
  removePanels(projectId: string): void;
}
/** Stage a managed directory, commit owner cleanup/receipt, then retry physical cleanup from that receipt. */
export class ManagedProjectDeletion {
  constructor(private readonly projects: Pick<ProjectsModule, "query" | "lifecycle">,
    private readonly projectsDirectory: string, private readonly cleanup: ProjectDeletionCleanupPorts,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId" | "requiredProjectId">) {}
async deleteProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> {
    return this.deleteProjectInternal(input, false);
  }

async deleteProjectInternal(
    input: DeleteMolisWorkProjectInput,
    allowActiveDemoWork: boolean,
  ): Promise<MolisWorkProjectDeletionResult> {
    const projectId = this.validation.requiredProjectId(input.project_id);
    const actorId = this.validation.requiredActorId(input.actor_id);
    if (input.delete_confirmed !== true) {
      throw new MolisWorkProjectCatalogError(
        "catalog.delete_confirmation_required",
        "删除 Molis Work 项目及其数据库需要当前对话中的单独明确确认",
      );
    }
    const idempotencyKey = requiredDeletionIdempotencyKey(input.idempotency_key);
    const requestFingerprint = JSON.stringify({ project_id: projectId, delete_confirmed: true });
    const replay = this.projects.lifecycle.findDeletion(actorId, idempotencyKey);
    if (replay) {
      if (replay.request_fingerprint !== requestFingerprint) {
        throw new MolisWorkProjectCatalogError(
          "catalog.deletion_idempotency_conflict",
          "同一个项目删除请求键不能用于不同的项目或删除确认",
        );
      }
      const deletion = await this.finishProjectDeletionCleanup(replay);
      return { deletion, replayed: true };
    }

    const project = this.projects.query.getProject(projectId);
    const projectDirectory = managedProjectDirectory(this.projectsDirectory, project);
    if (!allowActiveDemoWork) assertProjectHasNoActiveWork(project);
    const stagedDirectory = path.join(this.projectsDirectory, `.deleting-${project.project_id}-${randomUUID()}`);
    await fs.rename(projectDirectory, stagedDirectory);
    let catalogCommitted = false;
    try {
      const deletion = this.projects.lifecycle.transaction(() => {
        const racedReplay = this.projects.lifecycle.findDeletion(actorId, idempotencyKey);
        if (racedReplay) {
          throw new MolisWorkProjectCatalogError(
            "catalog.deletion_idempotency_conflict",
            "同一个项目删除请求正在或已经由另一个调用处理，请重新读取项目列表",
          );
        }
        const now = new Date().toISOString();
        const deletedSessionBindingCount = this.cleanup.removeBindings(project.project_id, actorId, now);
        const deletedWorkspaceMembershipCount =
          this.projects.lifecycle.removeWorkspaceMembershipsForProject(project.project_id);
        this.cleanup.removePanels(project.project_id);
        this.projects.lifecycle.removeFacts(project.project_id);
        const record: StoredProjectDeletion = {
          deletion_id: `project-deletion-${randomUUID()}`,
          actor_id: actorId,
          idempotency_key: idempotencyKey,
          request_fingerprint: requestFingerprint,
          project_id: project.project_id,
          display_name: project.display_name,
          board_id: project.board_id,
          staged_directory: stagedDirectory,
          deleted_binding_count: deletedSessionBindingCount + deletedWorkspaceMembershipCount,
          cleanup_state: "pending",
          cleanup_error: null,
          deleted_at: now,
          cleaned_at: null,
        };
        this.projects.lifecycle.insertDeletion(record);
        return record;
      });
      catalogCommitted = true;
      return { deletion: await this.finishProjectDeletionCleanup(deletion), replayed: false };
    } catch (error) {
      if (!catalogCommitted) {
        await restoreMovedProject(projectDirectory, stagedDirectory);
      }
      throw error;
    }
  }

async finishProjectDeletionCleanup(record: StoredProjectDeletion): Promise<MolisWorkProjectDeletionRecord> {
    if (record.cleanup_state === "complete") return this.projects.lifecycle.deletionRecord(record);
    try {
      await fs.rm(record.staged_directory, { recursive: true, force: true });
      const cleanedAt = new Date().toISOString();
      record = this.projects.lifecycle.updateDeletionCleanup(record.deletion_id, {
        state: "complete",
        error: null,
        cleaned_at: cleanedAt,
      });
    } catch (error) {
      record = this.projects.lifecycle.updateDeletionCleanup(record.deletion_id, {
        state: "pending",
        error: error instanceof Error ? error.message : String(error),
        cleaned_at: null,
      });
    }
    return this.projects.lifecycle.deletionRecord(record);
  }
}

function requiredDeletionIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw new MolisWorkProjectCatalogError(
      "catalog.deletion_idempotency_conflict",
      "删除项目需要幂等请求键",
    );
  }
  return key;
}

async function restoreMovedProject(projectDirectory: string, stagedDirectory: string): Promise<void> {
  try {
    await fs.rename(stagedDirectory, projectDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
