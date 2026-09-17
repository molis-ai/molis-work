import { randomUUID } from "node:crypto";

import type {
  ProjectsApplicationApi,
  ProjectsCommandApi,
  ProjectsQueryApi,
} from "@molis-ai/molis-work-contracts/modules/projects";

import {
  ProjectService,
  type ProjectRecordDraftInput,
  type ProjectsErrorFactory,
} from "./project-service.js";
import {
  createProjectsSchema,
  migrateProjectDataClassSchema,
  migrateProjectDropLegacyImportSchema,
  migrateProjectInboxPluginSchema,
  migrateProjectTaskPluginSchema,
  migrateProjectDropTaskPluginSchema,
  ProjectsRepository,
  type ProjectsSqliteDatabase,
  type StoredProjectDeletion,
} from "./repository.js";
import { normalizeProjectWorkspace, ProjectWorkspaceService } from "./workspace.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-projects",
  packagePath: "modules/projects",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/projects",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-ap1"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "project-identity",
    "project-catalog",
    "workspace-membership",
    "project-deletion-receipts",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export interface ProjectsModuleOptions {
  db: ProjectsSqliteDatabase;
  errorFactory: ProjectsErrorFactory;
  now?: () => string;
  id?: (prefix: string) => string;
}

/**
 * Public Projects Module entrypoint. Consumers use `query` and `commands`;
 * the local composition root uses `lifecycle` while file provisioning remains
 * in the legacy adapter during AP1.
 */
export class ProjectsModule implements ProjectsApplicationApi {
  readonly repository: ProjectsRepository;
  readonly records: ProjectService;
  readonly workspaces: ProjectWorkspaceService;

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
    updateDeletionCleanup(
      deletionId: string,
      input: { state: "complete" | "pending"; error: string | null; cleaned_at: string | null },
    ): StoredProjectDeletion;
    deletionRecord(record: StoredProjectDeletion): ReturnType<ProjectService["deletionRecord"]>;
    normalizeWorkspace: typeof normalizeProjectWorkspace;
    upsertWorkspaceMembership: ProjectWorkspaceService["upsertMembership"];
    unlinkWorkspaceMembership: ProjectWorkspaceService["unlink"];
    updateDatabasePath: ProjectService["updateDatabasePath"];
  };

  constructor(options: ProjectsModuleOptions) {
    const now = options.now ?? (() => new Date().toISOString());
    const id = options.id ?? ((prefix: string) => `${prefix}-${randomUUID()}`);
    this.repository = new ProjectsRepository(options.db);
    this.records = new ProjectService(this.repository, options.errorFactory, now, id);
    this.workspaces = new ProjectWorkspaceService(this.repository, options.errorFactory, now, id);
    this.query = {
      listProjectPlugins: (projectId) => this.records.listPlugins(projectId),
      listProjects: () => this.records.list(),
      getProject: (projectId) => this.records.get(projectId),
      selections: () => this.records.selections(),
      listWorkspaceMemberships: () => this.workspaces.listMemberships(),
      listWorkspaceDirectory: (projectId) => this.workspaces.listDirectory(projectId),
      preferredWorkspacePath: (projectId) => this.workspaces.preferredPath(projectId),
      workspaceProjectSelections: (workspaceId) => this.repository.workspaceProjectSelections(workspaceId),
      listProjectDeletions: () => this.records.listDeletions(),
    };
    this.commands = {
      addProjectPlugin: (input) => this.records.addPlugin(input),
      renameProject: (projectId, displayName, actorId) => this.records.rename(projectId, displayName, actorId),
      addWorkspaceProject: (input) => this.workspaces.add(input),
      repairWorkspaceProject: (input) => this.workspaces.repair(input),
      setWorkspaceDefault: (input) => this.workspaces.setDefault(input),
      removeWorkspaceMembership: (input) => this.workspaces.remove(input),
    };
    this.lifecycle = {
      transaction: <T>(operation: () => T) => this.repository.transaction(operation),
      prepareRecord: (input) => this.records.prepareRecord(input),
      register: (record, eventType, actorId) => this.records.register(record, eventType, actorId),
      rollbackRegistration: (projectId) => this.records.rollbackRegistration(projectId),
      touch: (projectId, eventType, actorId, payload) =>
        this.records.touch(projectId, eventType, actorId, payload),
      appendEvent: (projectId, type, actorId, payload) =>
        this.records.appendEvent(projectId, type, actorId, payload),
      removeFacts: (projectId) => this.records.removeFacts(projectId),
      removeWorkspaceMembershipsForProject: (projectId) =>
        this.repository.removeWorkspaceMembershipsForProject(projectId),
      findDeletion: (actorId, idempotencyKey) => this.records.findDeletion(actorId, idempotencyKey),
      insertDeletion: (record) => this.records.insertDeletion(record),
      updateDeletionCleanup: (deletionId, input) => this.records.updateDeletionCleanup(deletionId, input),
      deletionRecord: (record) => this.records.deletionRecord(record),
      normalizeWorkspace: normalizeProjectWorkspace,
      upsertWorkspaceMembership: (workspace, projectId, actorId) =>
        this.workspaces.upsertMembership(workspace, projectId, actorId),
      unlinkWorkspaceMembership: (workspaceId, projectId, actorId, removeEmptyWorkspace) =>
        this.workspaces.unlink(workspaceId, projectId, actorId, removeEmptyWorkspace),
      updateDatabasePath: (projectId, databasePath) => this.records.updateDatabasePath(projectId, databasePath),
    };
  }
}

export {
  createProjectsSchema,
  migrateProjectDataClassSchema,
  migrateProjectDropLegacyImportSchema,
  migrateProjectInboxPluginSchema,
  migrateProjectTaskPluginSchema,
  migrateProjectDropTaskPluginSchema,
  normalizeProjectWorkspace,
  ProjectService,
  ProjectsRepository,
  ProjectWorkspaceService,
};
export type {
  ProjectRecordDraftInput,
  ProjectsErrorFactory,
  ProjectsSqliteDatabase,
  StoredProjectDeletion,
};
export { inspectProjectCatalogForUninstall } from "./installation-inspection.js";
