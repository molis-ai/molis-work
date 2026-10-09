import type { CatalogCommit } from "./catalog-commit.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { RuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
import { randomUUID } from "node:crypto";
import type { DeleteProjectInput as DeleteMolisWorkProjectInput, ProjectDeletionResult as MolisWorkProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ManageMolisWorkDemoProjectInput, MolisWorkDemoProjectResult } from "./project-catalog-contract.js";
import { managedProjectDirectory } from "./project-file-paths.js";
import { validateManagedBoard } from "./managed-project-database.js";
import type { ManagedProjectDeletion } from "./managed-project-deletion.js";
import type { ProjectDeletedPort } from "./project-deleted-hooks.js";
import {
  enableDemoProjectPlugins,
  seedDemoPluginSurfaces,
  seedDemoProjectExtras,
} from "./demo-plugin-seed.js";
/** The demo project has a fixed id; its seed writes under whichever project id it is given (an older demo keeps its own). */
export interface DemoProjectSeedPort { projectId: string; seed(databasePath: string, projectId: string): void }
/** Rebuild only explicitly classified demonstration data through the supplied production seed. */
export class DemoProjectLifecycle {
  constructor(
    private readonly projects: Pick<ProjectsModule, "query" | "lifecycle" | "commands">,
    private readonly homeDirectory: string,
    private readonly projectsDirectory: string,
    private readonly demo: DemoProjectSeedPort,
    private readonly deletion: ManagedProjectDeletion,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId" | "requiredProjectId">,
    private readonly commit: CatalogCommit,
    private readonly owners: Pick<ProjectDeletedPort, "clearAll" | "ready">,
  ) {}

  async ensureDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> {
    this.requireDemoConfirmation(input.user_confirmed);
    const existing = this.projects.query.listProjects().find((project) => project.data_class === "regenerable_demo");
    const actorId = this.validation.requiredActorId(input.actor_id);
    if (existing) {
      await this.finishDemoProject(existing.project_id, existing.database_path, actorId);
      return { status: "existing", project: existing };
    }
    // The demo has a fixed id, so an earlier demo may have left data under it. A deletion that is still pending is finished
    // first (or the demo is not made). Once an earlier demo has been deleted, every owner clears again before the new one
    // starts; an owner that cannot clear here (memory and search in a process without their services) is left out only
    // when every earlier receipt has owner steps, which say it already ran. A demo that never existed has nothing to
    // clear, and no owner has to be reachable to make it.
    await this.deletion.settleProject(this.demo.projectId);
    const earlier = this.projects.query.listProjectDeletions().filter(receipt => receipt.project_id === this.demo.projectId);
    if (earlier.length) await this.owners.clearAll(this.demo.projectId, { skipDeferred: earlier.every(receipt => receipt.owner_steps.length > 0) });
    const record = this.projects.lifecycle.prepareRecord({
      project_id: this.demo.projectId,
      display_name: input.display_name ?? "Molis Work 示例项目",
      projects_directory: this.projectsDirectory,
      data_class: "regenerable_demo",
    });
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}`);
    const projectDirectory = path.dirname(record.database_path);
    let promoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "molis-work.db");
      this.demo.seed(stagedDatabasePath, record.project_id);
      seedDemoPluginSurfaces(stagedDatabasePath, record.project_id);
      validateManagedBoard(stagedDatabasePath, record.project_id);
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      await this.commit(() => this.projects.lifecycle.register(record, "project.demo_created", actorId));
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
    await this.finishDemoProject(record.project_id, record.database_path, actorId);
    return { status: "created", project: record };
  }

  async resetDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> {
    this.requireDemoConfirmation(input.user_confirmed);
    const actorId = this.validation.requiredActorId(input.actor_id);
    const project = this.projects.query.listProjects().find((candidate) => candidate.data_class === "regenerable_demo");
    if (!project) throw new MolisWorkProjectCatalogError("catalog.demo_not_found", "没有可重建的 Molis Work 示例项目");
    // Refuse before anything is changed when an owner only has to wait (another process is using the Agent runtime right now:
    // a retry can clear it). An owner whose service is another process's for good (the CLI has no Agent runtime or search
    // index of its own) is left to the running Molis Work, and reported: a rebuild never waits for it.
    await this.owners.ready({ leaveElsewhere: true });
    const projectDirectory = managedProjectDirectory(this.projectsDirectory, project);
    const stagingDirectory = path.join(this.projectsDirectory, `.resetting-${project.project_id}-${randomUUID()}`);
    const backupDirectory = path.join(this.projectsDirectory, `.reset-backup-${project.project_id}-${randomUUID()}`);
    let previousMoved = false;
    let resetPromoted = false;
    let updated: MolisWorkDemoProjectResult["project"];
    let left: string[] = [];
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "molis-work.db");
      this.demo.seed(stagedDatabasePath, project.project_id);
      seedDemoPluginSurfaces(stagedDatabasePath, project.project_id);
      validateManagedBoard(stagedDatabasePath, project.project_id);
      await fs.rename(projectDirectory, backupDirectory);
      previousMoved = true;
      await fs.rename(stagingDirectory, projectDirectory);
      resetPromoted = true;
      // A rebuilt demo starts without what the owners kept for the old one, except what only a running Molis Work can clear.
      left = await this.owners.clearAll(project.project_id, { leaveElsewhere: true });
      await this.seedDemoExtras(project.project_id, project.database_path, actorId);
      updated = await this.commit(() => {
        enableDemoProjectPlugins(this.projects, project.project_id, actorId);
        return this.projects.lifecycle.touch(project.project_id, "project.demo_reset", actorId, {});
      });
    } catch (error) {
      try {
        if (resetPromoted) await fs.rm(projectDirectory, { recursive: true, force: true });
        if (previousMoved) await fs.rename(backupDirectory, projectDirectory);
        await fs.rm(stagingDirectory, { recursive: true, force: true });
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], `示例项目重置及恢复失败，请检查项目目录 ${projectDirectory} 与备份 ${backupDirectory}`);
      }
      throw error;
    }
    // Cleanup is after success: its failure must never roll back by deleting the official database.
    await fs.rm(backupDirectory, { recursive: true, force: true });
    return { status: "reset", project: updated, ...(left.length ? { owners_left: left } : {}) };
  }

  async removeDemoProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> {
    const project = this.projects.query.getProject(this.validation.requiredProjectId(input.project_id));
    if (project.data_class !== "regenerable_demo") {
      throw new MolisWorkProjectCatalogError("catalog.not_demo", "只有明确标记为可重建演示数据的项目能走 demo 删除流程");
    }
    return this.deletion.deleteProject(input);
  }

  requireDemoConfirmation(userConfirmed: boolean): void {
    if (userConfirmed === true) return;
    throw new MolisWorkProjectCatalogError(
      "catalog.demo_confirmation_required",
      "创建、重置或删除演示数据前需要用户明确确认",
    );
  }

  private async finishDemoProject(projectId: string, databasePath: string, actorId: string): Promise<void> {
    await this.commit(() => enableDemoProjectPlugins(this.projects, projectId, actorId));
    await this.seedDemoExtras(projectId, databasePath, actorId);
  }

  private async seedDemoExtras(projectId: string, databasePath: string, actorId: string): Promise<void> {
    seedDemoPluginSurfaces(databasePath, projectId);
    await seedDemoProjectExtras({
      projectId,
      homeDirectory: this.homeDirectory,
      actorId,
    });
  }
}
