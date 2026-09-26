import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import type { CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
import { initializeProjectDatabase, validateManagedBoard } from "./managed-project-database.js";

/** Own recoverable file staging; formal Project records stay with Projects. */
export class ManagedProjectFiles {
  constructor(private readonly projects: Pick<ProjectsModule, "query" | "lifecycle">,
    private readonly projectsDirectory: string,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId">) {}
async createProject(input: CreateMolisWorkProjectInput): Promise<MolisWorkProjectRecord> {
    const actorId = this.validation.requiredActorId(input.actor_id);
    if (input.project_id) {
      if (!/^project-onboarding-[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(input.project_id)) throw new Error("无效的恢复项目标识");
      const existing = this.projects.query.listProjects().find(p => p.project_id === input.project_id);
      if (existing) return existing;
      // Recover a crash after staging was promoted but before catalog registration.
      const databasePath = path.join(this.projectsDirectory, input.project_id, "molis-work.db");
      const exists = await fs.stat(databasePath).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; });
      if (exists) {
        await validateManagedBoard(databasePath, input.project_id);
        const record = this.projects.lifecycle.prepareRecord({ project_id: input.project_id, display_name: input.display_name, projects_directory: this.projectsDirectory, data_class: "user" });
        this.projects.lifecycle.register(record, "project.created", actorId);
        return record;
      }
      // A previous incomplete staging database belongs only to this stable request.
      await fs.rm(path.join(this.projectsDirectory, `.staging-${input.project_id}`), { recursive: true, force: true });
    }
    return this.provisionCreatedProject({ displayName: input.display_name, actorId, projectId: input.project_id }, (record) => {
      this.projects.lifecycle.register(record, "project.created", actorId);
      return record;
    });
  }

async provisionCreatedProject<T>(
    input: { displayName: string; actorId: string; projectId?: string },
    commit: (record: MolisWorkProjectRecord) => T,
  ): Promise<T> {
    const record = this.projects.lifecycle.prepareRecord({
      project_id: input.projectId,
      display_name: input.displayName,
      board_id: "",
      projects_directory: this.projectsDirectory,
      data_class: "user",
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
}
