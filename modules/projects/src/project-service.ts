import { projectCatalogErrors as catalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";

import type {
  AddProjectPluginInput,
  ProjectDeletionReceipt,
  ProjectPluginId,
  ProjectPluginMembership,
  ProjectPluginRegistry,
  ProjectRecord,
  ProjectSelection,
  RemoveProjectPluginInput,
} from "@molis-ai/molis-work-contracts/modules/projects";

import { projectDatabasePath } from "./project-paths.js";
import { deletionRecord, type StoredProjectDeletion } from "./deletion-repository.js";
import type { ProjectsRepository } from "./repository.js";

export interface ProjectRecordDraftInput {
  project_id?: string;
  display_name: string;
  data_class: ProjectRecord["data_class"];
}

export class ProjectService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly projectsDirectory: string,
    private readonly now: () => string,
    private readonly id: (prefix: string) => string,
    /** Which Plugins exist is a Host fact. Projects only validates against it. */
    private readonly plugins: ProjectPluginRegistry,
  ) {}

  list(): ProjectRecord[] {
    return this.repository.projects.listProjects();
  }

  selections(): ProjectSelection[] {
    return this.list().map((project) => ({
      project_id: project.project_id,
      display_name: project.display_name,
    }));
  }

  get(projectId: string): ProjectRecord {
    const normalized = this.requiredProjectId(projectId);
    const project = this.repository.projects.getProject(normalized);
    if (!project) throw catalogErrors.project_not_found(`找不到 Molis Work 项目: ${normalized}`);
    return project;
  }

  prepareRecord(input: ProjectRecordDraftInput): ProjectRecord {
    const projectId = input.project_id?.trim() || this.id("project");
    const displayName = this.requiredName(input.display_name);
    const at = this.now();
    return {
      project_id: projectId,
      display_name: displayName,
      database_path: projectDatabasePath(this.projectsDirectory, projectId),
      source: "created",
      data_class: input.data_class,
      created_at: at,
      updated_at: at,
    };
  }

  register(record: ProjectRecord, eventType: string, actorId: string): void {
    this.repository.transaction(() => {
      this.repository.projects.insertProject(record);
      for (const pluginId of new Set(this.plugins.initial?.() ?? [])) {
        if (!this.plugins.has(pluginId)) throw catalogErrors.plugin_not_found("新项目的默认插件未在目录登记");
        this.repository.projects.addProjectPlugin(record.project_id, pluginId, record.created_at);
      }
      this.appendEvent(record.project_id, eventType, this.requiredActorId(actorId), { project_id: record.project_id });
    });
  }

  rollbackRegistration(projectId: string): void {
    this.repository.projects.removeProject(this.requiredProjectId(projectId));
  }

  /**
   * The members a project stored, and its 常开 plugins, which are members of every project without a stored row (ac-trust T3). A
   * personal plugin is not a stored member whatever it is (it is on unless hidden), so a 常开 one adds nothing here.
   */
  listPlugins(projectId: string, alwaysOn: readonly ProjectPluginId[] = this.plugins.alwaysOn?.() ?? []): ProjectPluginId[] {
    const stored = this.repository.projects.listProjectPlugins(this.get(projectId).project_id);
    const derived = alwaysOn.filter(id => this.plugins.isPersonal?.(id) !== true && !stored.includes(id));
    return derived.length === 0 ? stored : [...stored, ...derived].sort();
  }

  /** One synchronous reach judgement uses the same current registry answer for both membership and hidden marks. */
  pluginMembership(projectId: string): ProjectPluginMembership {
    const alwaysOn = this.plugins.alwaysOn?.() ?? [];
    const hidden = this.listHidden(projectId, alwaysOn);
    return { plugins: this.listPlugins(projectId, alwaysOn), hidden };
  }

  /** What the project hid. A hidden mark on a 常开 plugin (one made before it was) changes nothing, so it is not listed. */
  listHidden(projectId: string, alwaysOn: readonly ProjectPluginId[] = this.plugins.alwaysOn?.() ?? []): ProjectPluginId[] {
    return this.repository.projects.listHiddenPlugins(this.get(projectId).project_id).filter(id => !alwaysOn.includes(id));

  }

  addPlugin(input: AddProjectPluginInput): ProjectPluginId[] {
    const project = this.get(input.project_id);
    const actor = this.requiredActorId(input.actor_id);
    if (this.plugins.isPersonal?.(input.plugin_id) === true) {
      return this.repository.transaction(() => {
        if (this.repository.projects.showProjectPlugin(project.project_id, input.plugin_id)) {
          this.appendEvent(project.project_id, "project.plugin_added", actor, { plugin_id: input.plugin_id });
        }
        return this.listPlugins(project.project_id);
      });
    }
    if (!this.plugins.has(input.plugin_id)) {
      throw catalogErrors.plugin_not_found("找不到这个插件");
    }
    return this.repository.transaction(() => {
      const at = this.now();
      for (const pluginId of [input.plugin_id, ...this.plugins.companions(input.plugin_id)]) {
        if (this.repository.projects.addProjectPlugin(project.project_id, pluginId, at)) {
          this.appendEvent(project.project_id, "project.plugin_added", actor, { plugin_id: pluginId });
        }
      }
      return this.listPlugins(project.project_id);
    });
  }

  removePlugin(input: RemoveProjectPluginInput): ProjectPluginMembership {
    const project = this.get(input.project_id);
    const actor = this.requiredActorId(input.actor_id);
    const alwaysOn = this.plugins.alwaysOn?.() ?? [];
    if (alwaysOn.includes(input.plugin_id)) throw catalogErrors.plugin_always_on("常开插件不能从项目里移除");
    const personal = this.plugins.isPersonal?.(input.plugin_id) === true;
    if (!personal && !this.plugins.has(input.plugin_id)) {
      throw catalogErrors.plugin_not_found("找不到这个插件");
    }
    return this.repository.transaction(() => {
      const stored = this.listPlugins(project.project_id, alwaysOn);
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
      // A 常开 plugin that needs the one going would go with it, and it cannot.
      if (alwaysOn.some(id => removing.has(id))) throw catalogErrors.plugin_always_on("常开插件依赖它，不能一起移除");
      for (const id of removing) {
        const deleted = this.repository.projects.removeProjectPlugin(project.project_id, id);
        const hidden = personal && id === input.plugin_id
          && this.repository.projects.hideProjectPlugin(project.project_id, id, this.now());
        if (deleted || hidden) {
          this.appendEvent(project.project_id, "project.plugin_removed", actor, { plugin_id: id });
        }
      }
      return {
        plugins: this.listPlugins(project.project_id, alwaysOn),
        hidden: this.repository.projects.listHiddenPlugins(project.project_id),
      };
    });
  }

  rename(projectId: string, displayName: string, actorId: string): ProjectRecord {
    const existing = this.get(projectId);
    const nextName = this.requiredName(displayName);
    if (existing.display_name === nextName) return existing;
    this.repository.transaction(() => {
      this.repository.projects.renameProject(existing.project_id, nextName, this.now());
      this.appendEvent(existing.project_id, "project.renamed", this.requiredActorId(actorId), {
        previous_display_name: existing.display_name,
        display_name: nextName,
      });
    });
    return this.get(existing.project_id);
  }

  touch(projectId: string, eventType: string, actorId: string, payload: Record<string, unknown>): ProjectRecord {
    const project = this.get(projectId);
    this.repository.transaction(() => {
      this.repository.projects.touchProject(project.project_id, this.now());
      this.appendEvent(project.project_id, eventType, this.requiredActorId(actorId), payload);
    });
    return this.get(project.project_id);
  }

  appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void {
    this.repository.projects.appendEvent({
      event_id: this.id("project-event"),
      project_id: this.requiredProjectId(projectId),
      type,
      actor_id: this.requiredActorId(actorId),
      payload,
      created_at: this.now(),
    });
  }

  removeFacts(projectId: string): number {
    return this.repository.projects.removeProject(this.requiredProjectId(projectId));
  }

  listDeletions(): ProjectDeletionReceipt[] {
    return this.repository.deletions.listProjectDeletions();
  }

  findDeletion(actorId: string, idempotencyKey: string): StoredProjectDeletion | null {
    return this.repository.deletions.findDeletion(this.requiredActorId(actorId), idempotencyKey.trim());
  }

  insertDeletion(record: StoredProjectDeletion): void {
    this.repository.deletions.insertDeletion(record);
  }

  getDeletion(deletionId: string): StoredProjectDeletion {
    const record = this.repository.deletions.getDeletion(deletionId);
    if (!record) throw catalogErrors.project_storage_invalid("项目删除记录意外丢失");
    return record;
  }

  updateDeletionCleanup(
    deletionId: string,
    input: { state: "complete" | "pending"; error: string | null; cleaned_at: string | null },
  ): StoredProjectDeletion {
    this.repository.deletions.updateDeletionCleanup(deletionId, input);
    return this.getDeletion(deletionId);
  }

  deletionRecord(record: StoredProjectDeletion): ProjectDeletionReceipt { return deletionRecord(record); }

  requiredName(value: string): string {
    const name = value.trim();
    if (!name) throw catalogErrors.invalid_name("项目显示名称不能为空");
    return name;
  }

  private requiredProjectId(value: string): string {
    const projectId = value.trim();
    if (!projectId) throw catalogErrors.project_not_found("项目 ID 不能为空");
    return projectId;
  }

  private requiredActorId(value: string): string {
    const actorId = value.trim();
    if (!actorId) throw catalogErrors.user_confirmation_required("项目操作必须记录执行者");
    return actorId;
  }
}
