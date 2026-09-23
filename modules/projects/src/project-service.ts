import path from "node:path";

import type {
  AddProjectPluginInput,
  ProjectDeletionRecord,
  ProjectPluginId,
  ProjectPluginMembership,
  ProjectPluginRegistry,
  ProjectRecord,
  ProjectSelection,
  RemoveProjectPluginInput,
} from "@molis-ai/molis-work-contracts/modules/projects";
import { BUILTIN_PROJECT_PLUGIN_REGISTRY } from "@molis-ai/molis-work-contracts/modules/projects";

import { ProjectsRepository, type StoredProjectDeletion } from "./repository.js";

export type ProjectsErrorFactory = (code: string, message: string) => Error;

export interface ProjectRecordDraftInput {
  project_id?: string;
  display_name: string;
  board_id?: string;
  projects_directory: string;
  data_class: ProjectRecord["data_class"];
}

export class ProjectService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly error: ProjectsErrorFactory,
    private readonly now: () => string,
    private readonly id: (prefix: string) => string,
    /** Which Plugins exist is a Host fact. Projects only validates against it. */
    private readonly plugins: ProjectPluginRegistry = BUILTIN_PROJECT_PLUGIN_REGISTRY,
  ) {}

  list(): ProjectRecord[] {
    return this.repository.listProjects();
  }

  selections(): ProjectSelection[] {
    return this.list().map((project) => ({
      project_id: project.project_id,
      display_name: project.display_name,
    }));
  }

  get(projectId: string): ProjectRecord {
    const normalized = this.requiredProjectId(projectId);
    const project = this.repository.getProject(normalized);
    if (!project) throw this.error("catalog.project_not_found", `找不到 Molis Work 项目: ${normalized}`);
    return project;
  }

  prepareRecord(input: ProjectRecordDraftInput): ProjectRecord {
    const projectId = input.project_id?.trim() || this.id("project");
    const displayName = this.requiredName(input.display_name);
    const at = this.now();
    return {
      project_id: projectId,
      display_name: displayName,
      board_id: input.board_id?.trim() || projectId,
      database_path: path.join(input.projects_directory, projectId, "molis-work.db"),
      source: "created",
      data_class: input.data_class,
      created_at: at,
      updated_at: at,
    };
  }

  register(record: ProjectRecord, eventType: string, actorId: string): void {
    this.repository.transaction(() => {
      this.repository.insertProject(record);
      this.repository.addProjectPlugin(record.project_id, "goals", record.created_at);
      this.appendEvent(record.project_id, eventType, this.requiredActorId(actorId), {
        board_id: record.board_id,
        database_path: record.database_path,
      });
    });
  }

  rollbackRegistration(projectId: string): void {
    this.repository.removeProject(this.requiredProjectId(projectId));
  }

  listPlugins(projectId: string): ProjectPluginId[] {
    return this.repository.listProjectPlugins(this.get(projectId).project_id);
  }

  listHidden(projectId: string): ProjectPluginId[] {
    return this.repository.listHiddenPlugins(this.get(projectId).project_id);
  }

  addPlugin(input: AddProjectPluginInput): ProjectPluginId[] {
    const project = this.get(input.project_id);
    const actor = this.requiredActorId(input.actor_id);
    if (this.plugins.isPersonal?.(input.plugin_id) === true) {
      return this.repository.transaction(() => {
        if (this.repository.showProjectPlugin(project.project_id, input.plugin_id)) {
          this.appendEvent(project.project_id, "project.plugin_added", actor, { plugin_id: input.plugin_id });
        }
        return this.listPlugins(project.project_id);
      });
    }
    if (!this.plugins.has(input.plugin_id)) {
      throw this.error("catalog.plugin_not_found", "找不到这个插件");
    }
    return this.repository.transaction(() => {
      const at = this.now();
      for (const pluginId of [input.plugin_id, ...this.plugins.companions(input.plugin_id)]) {
        if (this.repository.addProjectPlugin(project.project_id, pluginId, at)) {
          this.appendEvent(project.project_id, "project.plugin_added", actor, { plugin_id: pluginId });
        }
      }
      return this.listPlugins(project.project_id);
    });
  }

  removePlugin(input: RemoveProjectPluginInput): ProjectPluginMembership {
    const project = this.get(input.project_id);
    const actor = this.requiredActorId(input.actor_id);
    const personal = this.plugins.isPersonal?.(input.plugin_id) === true;
    if (!personal && !this.plugins.has(input.plugin_id)) {
      throw this.error("catalog.plugin_not_found", "找不到这个插件");
    }
    return this.repository.transaction(() => {
      const stored = this.listPlugins(project.project_id);
      const removing = new Set<ProjectPluginId>([input.plugin_id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const id of stored) {
          if (removing.has(id)) continue;
          if (this.plugins.companions(id).some((companion) => removing.has(companion))) {
            removing.add(id);
            changed = true;
          }
        }
      }
      for (const id of removing) {
        const deleted = this.repository.removeProjectPlugin(project.project_id, id);
        const hidden = personal && id === input.plugin_id
          && this.repository.hideProjectPlugin(project.project_id, id, this.now());
        if (deleted || hidden) {
          this.appendEvent(project.project_id, "project.plugin_removed", actor, { plugin_id: id });
        }
      }
      return {
        plugins: this.listPlugins(project.project_id),
        hidden: this.repository.listHiddenPlugins(project.project_id),
      };
    });
  }

  rename(projectId: string, displayName: string, actorId: string): ProjectRecord {
    const existing = this.get(projectId);
    const nextName = this.requiredName(displayName);
    if (existing.display_name === nextName) return existing;
    this.repository.transaction(() => {
      this.repository.renameProject(existing.project_id, nextName, this.now());
      this.appendEvent(existing.project_id, "project.renamed", this.requiredActorId(actorId), {
        previous_display_name: existing.display_name,
        display_name: nextName,
      });
    });
    return this.get(existing.project_id);
  }

  updateDatabasePath(projectId: string, databasePath: string): ProjectRecord {
    const existing = this.get(projectId);
    const next = databasePath.trim();
    if (path.resolve(existing.database_path) === path.resolve(next)) return existing;
    this.repository.updateDatabasePath(existing.project_id, next, this.now());
    return this.get(existing.project_id);
  }

  touch(projectId: string, eventType: string, actorId: string, payload: Record<string, unknown>): ProjectRecord {
    const project = this.get(projectId);
    this.repository.transaction(() => {
      this.repository.touchProject(project.project_id, this.now());
      this.appendEvent(project.project_id, eventType, this.requiredActorId(actorId), payload);
    });
    return this.get(project.project_id);
  }

  appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void {
    this.repository.appendEvent({
      event_id: this.id("project-event"),
      project_id: this.requiredProjectId(projectId),
      type,
      actor_id: this.requiredActorId(actorId),
      payload,
      created_at: this.now(),
    });
  }

  removeFacts(projectId: string): number {
    return this.repository.removeProject(this.requiredProjectId(projectId));
  }

  listDeletions(): ProjectDeletionRecord[] {
    return this.repository.listProjectDeletions();
  }

  findDeletion(actorId: string, idempotencyKey: string): StoredProjectDeletion | null {
    return this.repository.findDeletion(this.requiredActorId(actorId), idempotencyKey.trim());
  }

  insertDeletion(record: StoredProjectDeletion): void {
    this.repository.insertDeletion(record);
  }

  getDeletion(deletionId: string): StoredProjectDeletion {
    const record = this.repository.getDeletion(deletionId);
    if (!record) throw this.error("catalog.project_storage_invalid", "项目删除记录意外丢失");
    return record;
  }

  updateDeletionCleanup(
    deletionId: string,
    input: { state: "complete" | "pending"; error: string | null; cleaned_at: string | null },
  ): StoredProjectDeletion {
    this.repository.updateDeletionCleanup(deletionId, input);
    return this.getDeletion(deletionId);
  }

  deletionRecord(record: StoredProjectDeletion): ProjectDeletionRecord {
    return {
      deletion_id: record.deletion_id,
      project_id: record.project_id,
      display_name: record.display_name,
      board_id: record.board_id,
      actor_id: record.actor_id,
      deleted_binding_count: record.deleted_binding_count,
      cleanup_state: record.cleanup_state,
      cleanup_error: record.cleanup_error,
      deleted_at: record.deleted_at,
      cleaned_at: record.cleaned_at,
    };
  }

  requiredName(value: string): string {
    const name = value.trim();
    if (!name) throw this.error("catalog.invalid_name", "项目显示名称不能为空");
    return name;
  }

  private requiredProjectId(value: string): string {
    const projectId = value.trim();
    if (!projectId) throw this.error("catalog.project_not_found", "项目 ID 不能为空");
    return projectId;
  }

  private requiredActorId(value: string): string {
    const actorId = value.trim();
    if (!actorId) throw this.error("context.user_confirmation_required", "项目操作必须记录执行者");
    return actorId;
  }
}
