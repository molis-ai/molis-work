import { randomUUID } from "node:crypto";

import type { ProjectDeletionRecord, ProjectDeletionStep, ProjectPluginRegistry } from "@molis-ai/molis-work-contracts/modules/projects";

import type {
  ProjectsApplicationApi,
  ProjectsCommandApi,
  ProjectsQueryApi,
} from "@molis-ai/molis-work-contracts/modules/projects";

import {
  ProjectService,
  type ProjectRecordDraftInput,
} from "./project-service.js";
import type { StoredProjectDeletion } from "./deletion-repository.js";
import {
  createProjectsSchema,
  ProjectsRepository,
} from "./repository.js";
import type { ProjectsSqliteDatabase } from "./sqlite.js";
import { normalizeProjectWorkspace, ProjectWorkspaceService } from "./workspace.js";
import { ProjectDeletionSteps } from "./deletion-steps.js";

export interface ProjectsModuleOptions {
  db: ProjectsSqliteDatabase;
  now?: () => string;
  id?: (prefix: string) => string;
  /** The Plugins a project may enable and their companions; the Host derives it from what it ships. */
  plugins: ProjectPluginRegistry;
}

/**
 * Public Projects Module entrypoint. Consumers use `query` and `commands`;
 * the local composition root uses `lifecycle`; file provisioning stays with
 * the host's catalog adapter.
 */
export class ProjectsModule implements ProjectsApplicationApi {
  readonly records: ProjectService;
  readonly workspaces: ProjectWorkspaceService;
  readonly deletionSteps: ProjectDeletionSteps;

  readonly query: ProjectsQueryApi;
  readonly commands: ProjectsCommandApi;

  readonly lifecycle: {
    transaction<T>(operation: () => T): T;
    prepareRecord(input: ProjectRecordDraftInput): ReturnType<ProjectService["prepareRecord"]>;
    register(record: ReturnType<ProjectService["prepareRecord"]>, eventType: string, actorId: string): void;
    rollbackRegistration(projectId: string): void;
    touch(
      projectId: string,
      eventType: string,
      actorId: string,
      payload: Record<string, unknown>,
    ): ReturnType<ProjectService["touch"]>;
    appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void;
    removeFacts(projectId: string): number;
    removeWorkspaceMembershipsForProject(projectId: string): number;
    findDeletion(actorId: string, idempotencyKey: string): StoredProjectDeletion | null;
    insertDeletion(record: StoredProjectDeletion): void;
    /** The owners of project data that must clear it after this deletion, one pending step each; in the receipt's transaction. */
    insertDeletionSteps(deletionId: string, ownerIds: readonly string[]): void;
    updateDeletionStep(deletionId: string, ownerId: string, input: { state: ProjectDeletionStep["state"]; error: string | null }): void;
    deletionSteps(deletionId: string): ProjectDeletionStep[];
    getDeletion(deletionId: string): StoredProjectDeletion;
    /** Receipts whose clean-up is not finished, oldest first; a project id narrows them to that project's. */
    pendingDeletions(projectId?: string): StoredProjectDeletion[];
    updateDeletionCleanup(
      deletionId: string,
      input: { state: "complete" | "pending"; error: string | null; cleaned_at: string | null },
    ): StoredProjectDeletion;
    deletionRecord(record: StoredProjectDeletion): ProjectDeletionRecord;
    normalizeWorkspace: typeof normalizeProjectWorkspace;
    upsertWorkspaceMembership: ProjectWorkspaceService["upsertMembership"];
    unlinkWorkspaceMembership: ProjectWorkspaceService["unlink"];
    updateDatabasePath: ProjectService["updateDatabasePath"];
  };

  constructor(options: ProjectsModuleOptions) {
    const now = options.now ?? (() => new Date().toISOString());
    const id = options.id ?? ((prefix: string) => `${prefix}-${randomUUID()}`);
    const repository = new ProjectsRepository(options.db);
    this.records = new ProjectService(repository, now, id, options.plugins);
    this.workspaces = new ProjectWorkspaceService(repository, now, id);
    this.deletionSteps = new ProjectDeletionSteps(options.db, now);
    const withSteps = (receipt: StoredProjectDeletion): ProjectDeletionRecord => ({ ...this.records.deletionRecord(receipt), owner_steps: this.deletionSteps.list(receipt.deletion_id) });
    this.query = {
      storedProjectPluginMembership: projectId => {
        this.records.get(projectId);
        return { plugins: repository.projects.listProjectPlugins(projectId), hidden: repository.projects.listHiddenPlugins(projectId) };
      },
      projectPluginMembership: (projectId) => this.records.pluginMembership(projectId),
      listProjectPlugins: (projectId) => this.records.listPlugins(projectId),
      listHiddenPlugins: (projectId) => this.records.listHidden(projectId),
      listProjects: () => this.records.list(),
      getProject: (projectId) => this.records.get(projectId),
      selections: () => this.records.selections(),
      listWorkspaceMemberships: () => this.workspaces.listMemberships(),
      listWorkspaceDirectory: (projectId) => this.workspaces.listDirectory(projectId),
      preferredWorkspacePath: (projectId) => this.workspaces.preferredPath(projectId),
      workspaceProjectSelections: (workspaceId) => repository.workspaces.workspaceProjectSelections(workspaceId),
      listProjectDeletions: () => this.records.listDeletions().map(receipt => ({ ...receipt, owner_steps: this.deletionSteps.list(receipt.deletion_id) })),
    };
    this.commands = {
      addProjectPlugin: (input) => this.records.addPlugin(input),
      removeProjectPlugin: (input) => this.records.removePlugin(input),
      renameProject: (projectId, displayName, actorId) => this.records.rename(projectId, displayName, actorId),
      addWorkspaceProject: (input) => this.workspaces.add(input),
      repairWorkspaceProject: (input) => this.workspaces.repair(input),
      setWorkspaceDefault: (input) => this.workspaces.setDefault(input),
      removeWorkspaceMembership: (input) => this.workspaces.remove(input),
    };
    this.lifecycle = {
      transaction: <T>(operation: () => T) => repository.transaction(operation),
      prepareRecord: (input) => this.records.prepareRecord(input),
      register: (record, eventType, actorId) => this.records.register(record, eventType, actorId),
      rollbackRegistration: (projectId) => this.records.rollbackRegistration(projectId),
      touch: (projectId, eventType, actorId, payload) =>
        this.records.touch(projectId, eventType, actorId, payload),
      appendEvent: (projectId, type, actorId, payload) =>
        this.records.appendEvent(projectId, type, actorId, payload),
      removeFacts: (projectId) => this.records.removeFacts(projectId),
      removeWorkspaceMembershipsForProject: (projectId) =>
        repository.workspaces.removeWorkspaceMembershipsForProject(projectId),
      findDeletion: (actorId, idempotencyKey) => this.records.findDeletion(actorId, idempotencyKey),
      insertDeletion: (record) => this.records.insertDeletion(record),
      insertDeletionSteps: (deletionId, ownerIds) => this.deletionSteps.begin(deletionId, ownerIds),
      updateDeletionStep: (deletionId, ownerId, input) => this.deletionSteps.settle(deletionId, ownerId, input),
      deletionSteps: (deletionId) => this.deletionSteps.list(deletionId),
      getDeletion: (deletionId) => this.records.getDeletion(deletionId),
      pendingDeletions: (projectId) => this.records.listDeletions()
        .filter(receipt => receipt.cleanup_state === "pending" && (projectId === undefined || receipt.project_id === projectId))
        .map(receipt => this.records.getDeletion(receipt.deletion_id)),
      updateDeletionCleanup: (deletionId, input) => this.records.updateDeletionCleanup(deletionId, input),
      deletionRecord: withSteps,
      normalizeWorkspace: normalizeProjectWorkspace,
      upsertWorkspaceMembership: (workspace, projectId, actorId) =>
        this.workspaces.upsertMembership(workspace, projectId, actorId),
      unlinkWorkspaceMembership: (workspaceId, projectId, actorId) =>
        this.workspaces.unlink(workspaceId, projectId, actorId),
      updateDatabasePath: (projectId, databasePath) => this.records.updateDatabasePath(projectId, databasePath),
    };
  }
}

export {
  createProjectsSchema,
  normalizeProjectWorkspace,
  ProjectService,
  ProjectWorkspaceService,
};
export type {
  ProjectRecordDraftInput,
  ProjectsSqliteDatabase,
  StoredProjectDeletion,
};
export { listCatalogProjectsForUninstall } from "./installation-inspection.js";
export { listProjectDatabasePaths } from "./database-paths.js";
export { PROJECT_ROOT_SCHEMA_SQL, writeProjectRoot, listProjectRoots, type ProjectRootDatabase, type ProjectRootRow } from "./project-root.js";
