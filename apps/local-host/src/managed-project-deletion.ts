import type { CatalogCommit } from "./catalog-commit.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { RuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
import { randomUUID } from "node:crypto";
import type { StoredProjectDeletion } from "@molis-ai/molis-work-module-projects";
import type { DeleteProjectInput as DeleteMolisWorkProjectInput, ProjectDeletionResult as MolisWorkProjectDeletionResult, ProjectDeletionRecord as MolisWorkProjectDeletionRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import { managedProjectDirectory } from "./project-file-paths.js";
import type { ProjectDeletedPort } from "./project-deleted-hooks.js";
export interface ProjectDeletionCleanupPorts {
  removeBindings(projectId: string, actorId: string, at: string): number;
  removePanels(projectId: string): void;
}
/**
 * Stage a managed directory, commit the catalog's own cleanup and the receipt (one pending step for each owner of
 * project data in the Home), then run those steps and the physical cleanup, and retry whatever is left from that receipt.
 */
export class ManagedProjectDeletion {
  constructor(private readonly projects: Pick<ProjectsModule, "query" | "lifecycle">,
    private readonly projectsDirectory: string, private readonly cleanup: ProjectDeletionCleanupPorts,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId" | "requiredProjectId">, private readonly commit: CatalogCommit,
    private readonly owners: ProjectDeletedPort) {}
async deleteProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> {
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
    const stagedDirectory = path.join(this.projectsDirectory, `.deleting-${project.project_id}-${randomUUID()}`);
    await fs.rename(projectDirectory, stagedDirectory);
    let catalogCommitted = false;
    try {
      const deletion = await this.commit(() => this.projects.lifecycle.transaction(() => {
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
          staged_directory: stagedDirectory,
          deleted_binding_count: deletedSessionBindingCount + deletedWorkspaceMembershipCount,
          cleanup_state: "pending",
          cleanup_error: null,
          deleted_at: now,
          cleaned_at: null,
        };
        this.projects.lifecycle.insertDeletion(record);
        this.projects.lifecycle.insertDeletionSteps(record.deletion_id, this.owners.owners().map(owner => owner.id));
        return record;
      }));
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
    const problems: string[] = [];
    // Each owner clears what it keeps for the project, once the catalog no longer has it; a step that fails stays pending.
    for (const step of this.projects.lifecycle.deletionSteps(record.deletion_id)) {
      if (step.state !== "pending") continue;
      try {
        const ran = await this.owners.clear(step.owner_id, record.project_id);
        await this.commit(() => this.projects.lifecycle.updateDeletionStep(record.deletion_id, step.owner_id, { state: ran ? "complete" : "skipped", error: null }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        problems.push(`${step.owner_id}：${message}`);
        await this.commit(() => this.projects.lifecycle.updateDeletionStep(record.deletion_id, step.owner_id, { state: "pending", error: message }));
      }
    }
    try {
      await fs.rm(record.staged_directory, { recursive: true, force: true });
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    record = await this.commit(() => this.projects.lifecycle.updateDeletionCleanup(record.deletion_id, problems.length
      ? { state: "pending", error: problems.join("；"), cleaned_at: null }
      : { state: "complete", error: null, cleaned_at: new Date().toISOString() }));
    return this.projects.lifecycle.deletionRecord(record);
  }

  /**
   * Finishes the clean-up of earlier deletions of this project id that is still pending, so a project made again under
   * the same id (the fixed-id demo) never starts on what the old one left. Refuses while something is still left.
   */
  async settleProject(projectId: string): Promise<void> {
    for (const pending of this.projects.lifecycle.pendingDeletions(projectId)) {
      const settled = await this.finishProjectDeletionCleanup(pending);
      if (settled.cleanup_state !== "complete") {
        throw new MolisWorkProjectCatalogError("catalog.project_storage_invalid", `这个项目上一次删除的清理还没有完成，先重试清理：${settled.cleanup_error ?? ""}`);
      }
    }
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
