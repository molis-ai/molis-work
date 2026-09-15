import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";
import { constants as fsConstants } from "node:fs";
import type { MigrateProjectInput as MigrateMolisWorkProjectInput, ProjectMigrationStep as MolisWorkProjectMigrationStep } from "@molis-ai/molis-work-contracts/modules/projects";
import type { CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
import { isWithin, statOrNull } from "./project-file-paths.js";
import { initializeProjectDatabase, readManagedBoard, validateManagedBoard } from "./managed-project-database.js";

/** Own recoverable file staging and migration; formal Project records stay with Projects. */
export class ManagedProjectFiles {
  constructor(private readonly projects: Pick<ProjectsModule, "query" | "lifecycle">,
    private readonly projectsDirectory: string, private readonly databasePath: string,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId">) {}
async createProject(input: CreateMolisWorkProjectInput): Promise<MolisWorkProjectRecord> {
    const actorId = this.validation.requiredActorId(input.actor_id);
    return this.provisionCreatedProject({ displayName: input.display_name, actorId }, (record) => {
      this.projects.lifecycle.register(record, "project.created", actorId);
      return record;
    });
  }

async provisionCreatedProject<T>(
    input: { displayName: string; actorId: string },
    commit: (record: MolisWorkProjectRecord) => T,
  ): Promise<T> {
    const record = this.projects.lifecycle.prepareRecord({
      display_name: input.displayName,
      board_id: "",
      projects_directory: this.projectsDirectory,
      source: "created",
      data_class: "user",
      migrated_from_path: null,
    });
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}`);
    const projectDirectory = path.dirname(record.database_path);
    let promoted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      await initializeProjectDatabase(
        path.join(stagingDirectory, "molis-work.db"),
        record.project_id,
        record.display_name,
        input.actorId,
      );
      await validateManagedBoard(path.join(stagingDirectory, "molis-work.db"), record.project_id);
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      return commit(record);
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }

async migrateLegacyDatabase(input: MigrateMolisWorkProjectInput): Promise<MolisWorkProjectRecord> {
    const legacyDatabasePath = path.resolve(input.legacy_database_path);
    if (legacyDatabasePath === this.databasePath || isWithin(legacyDatabasePath, this.projectsDirectory)) {
      throw new MolisWorkProjectCatalogError(
        "catalog.legacy_conflict",
        "不能把托管项目目录中的数据库再次作为旧库迁移",
      );
    }
    const sourceState = await statOrNull(legacyDatabasePath);
    if (!sourceState?.isFile()) {
      throw new MolisWorkProjectCatalogError("catalog.legacy_missing", `旧 Molis Work 数据库不存在: ${legacyDatabasePath}`);
    }

    const source = readManagedBoard(legacyDatabasePath, true);
    const record = this.projects.lifecycle.prepareRecord({
      display_name: input.display_name ?? source.snapshot.board.title,
      board_id: source.boardId,
      projects_directory: this.projectsDirectory,
      source: "migrated",
      data_class: "migrated_user",
      migrated_from_path: legacyDatabasePath,
    });
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}`);
    const projectDirectory = path.dirname(record.database_path);
    let promoted = false;
    let inserted = false;
    try {
      await fs.mkdir(stagingDirectory, { recursive: false });
      const stagedDatabasePath = path.join(stagingDirectory, "molis-work.db");
      await fs.copyFile(legacyDatabasePath, stagedDatabasePath, fsConstants.COPYFILE_EXCL);
      await runStep(input, "after_copy");
      const staged = readManagedBoard(stagedDatabasePath, false);
      if (source.boardId !== staged.boardId || source.serializedSnapshot !== staged.serializedSnapshot) {
        throw new MolisWorkProjectCatalogError("catalog.legacy_invalid", "旧数据库迁移后的事实快照不一致");
      }
      await runStep(input, "after_validation");
      await fs.rename(stagingDirectory, projectDirectory);
      promoted = true;
      await runStep(input, "before_catalog_commit");
      this.projects.lifecycle.register(record, "project.migrated", input.actor_id);
      inserted = true;
      await Promise.all([
        fs.rm(`${legacyDatabasePath}-wal`, { force: true }),
        fs.rm(`${legacyDatabasePath}-shm`, { force: true }),
      ]);
      await fs.rm(legacyDatabasePath);
      return record;
    } catch (error) {
      if (inserted) this.projects.lifecycle.rollbackRegistration(record.project_id);
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      if (promoted) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }
}

async function runStep(input: MigrateMolisWorkProjectInput, step: MolisWorkProjectMigrationStep): Promise<void> {
  await input.beforeStep?.(step);
}
