import type { CatalogCommit } from "./catalog-commit.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeProjectBindingValidation } from "@molis-ai/molis-work-module-private-work-context";
import type { CreateMolisWorkProjectInput } from "./project-catalog-contract.js";
import { initializeProjectDatabase, validateManagedBoard } from "./managed-project-database.js";

/** Own recoverable file staging; formal Project records stay with Projects. */
export class ManagedProjectFiles {
  constructor(private readonly projects: Pick<ProjectsModule, "query" | "lifecycle">,
    private readonly projectsDirectory: string,
    private readonly validation: Pick<RuntimeProjectBindingValidation, "requiredActorId">, private readonly commit: CatalogCommit) {}
async createProject(input: CreateMolisWorkProjectInput): Promise<MolisWorkProjectRecord> {
    const actorId = this.validation.requiredActorId(input.actor_id);
    if (input.project_id) {
      if (!/^project-onboarding-[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(input.project_id)) throw new Error("无效的恢复项目标识");
      const existing = this.projects.query.listProjects().find(p => p.project_id === input.project_id);
      if (existing) return existing;
    }
    return this.provisionCreatedProject({ displayName: input.display_name, actorId, projectId: input.project_id }, (record) => {
      // Another connection may have recovered the promoted database while this one waited for its write lock.
      const existing = this.projects.query.listProjects().find(p => p.project_id === record.project_id);
      if (existing) return existing;
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
    const stagingDirectory = path.join(this.projectsDirectory, `.staging-${record.project_id}-${randomUUID()}`);
    const projectDirectory = path.dirname(record.database_path);
    if (input.projectId && await fs.stat(record.database_path).then(() => true, error => {
      if (error.code === "ENOENT") return false;
      throw error;
    })) {
      validateManagedBoard(record.database_path, record.board_id);
      return this.commit(() => commit(record));
    }
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
      try {
        await fs.rename(stagingDirectory, projectDirectory);
        promoted = true;
      } catch (error) {
        if (!input.projectId || !["EEXIST", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
        // A competing stable request owns the promoted directory. Adopt only its validated database.
        validateManagedBoard(record.database_path, record.board_id);
        await fs.rm(stagingDirectory, { recursive: true, force: true });
      }
      return await this.commit(() => commit(record));
    } catch (error) {
      await fs.rm(stagingDirectory, { recursive: true, force: true });
      // Fixed identities can be adopted by a concurrent/restarted request; retain their promoted database for recovery.
      if (promoted && !input.projectId) await fs.rm(projectDirectory, { recursive: true, force: true });
      throw error;
    }
  }
}
