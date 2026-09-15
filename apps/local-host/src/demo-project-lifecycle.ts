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
export interface DemoProjectSeedPort { boardId: string; seed(databasePath: string): void }
/** Rebuild only explicitly classified demonstration data through the supplied production seed. */
export class DemoProjectLifecycle {
  constructor(private readonly projects: Pick<ProjectsModule, "query" | "lifecycle">,
    private readonly projectsDirectory: string, private readonly demo: DemoProjectSeedPort,
    private readonly deletion: ManagedProjectDeletion,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId" | "requiredProjectId">) {}
async ensureDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> {
    this.requireDemoConfirmation(input.user_confirmed);
    const existing = this.projects.query.listProjects().find((project) => project.data_class === "regenerable_demo");
    if (existing) return { status: "existing", project: existing };
    const actorId = this.validation.requiredActorId(input.actor_id);
    const record = this.projects.lifecycle.prepareRecord({
      display_name: input.display_name ?? "Molis Work 示例项目",
      board_id: this.demo.boardId,
      projects_directory: this.projectsDirectory,
      source: "created",
      data_class: "regenerable_demo",
      migrated_from_path: null,
    });
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}`);
    const projectDirectory = path.dirname(record.database_path);
    let promoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "molis-work.db");
      this.demo.seed(stagedDatabasePath);
      validateManagedBoard(stagedDatabasePath, this.demo.boardId);
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      this.projects.lifecycle.register(record, "project.demo_created", actorId);
      return { status: "created", project: record };
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

async resetDemoProject(input: ManageMolisWorkDemoProjectInput): Promise<MolisWorkDemoProjectResult> {
    this.requireDemoConfirmation(input.user_confirmed);
    const actorId = this.validation.requiredActorId(input.actor_id);
    const project = this.projects.query.listProjects().find((candidate) => candidate.data_class === "regenerable_demo");
    if (!project) throw new MolisWorkProjectCatalogError("catalog.demo_not_found", "没有可重建的 Molis Work 示例项目");
    const projectDirectory = managedProjectDirectory(this.projectsDirectory, project);
    const stagingDirectory = path.join(this.projectsDirectory, `.resetting-${project.project_id}-${randomUUID()}`);
    const backupDirectory = path.join(this.projectsDirectory, `.reset-backup-${project.project_id}-${randomUUID()}`);
    let previousMoved = false;
    let resetPromoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "molis-work.db");
      this.demo.seed(stagedDatabasePath);
      validateManagedBoard(stagedDatabasePath, this.demo.boardId);
      await fs.rename(projectDirectory, backupDirectory);
      previousMoved = true;
      await fs.rename(stagingDirectory, projectDirectory);
      resetPromoted = true;
      await fs.rm(backupDirectory, { recursive: true, force: true });
      const updated = this.projects.lifecycle.touch(
        project.project_id,
        "project.demo_reset",
        actorId,
        { board_id: project.board_id },
      );
      return { status: "reset", project: updated };
    } catch (error) {
      if (resetPromoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      if (previousMoved) await fs.rename(backupDirectory, projectDirectory).catch(() => undefined);
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

async removeDemoProject(input: DeleteMolisWorkProjectInput): Promise<MolisWorkProjectDeletionResult> {
    const project = this.projects.query.getProject(this.validation.requiredProjectId(input.project_id));
    if (project.data_class !== "regenerable_demo") {
      throw new MolisWorkProjectCatalogError("catalog.not_demo", "只有明确标记为可重建演示数据的项目能走 demo 删除流程");
    }
    return this.deletion.deleteProjectInternal(input, true);
  }

requireDemoConfirmation(userConfirmed: boolean): void {
    if (userConfirmed === true) return;
    throw new MolisWorkProjectCatalogError(
      "catalog.demo_confirmation_required",
      "创建、重置或删除演示数据前需要用户明确确认",
    );
  }
}
