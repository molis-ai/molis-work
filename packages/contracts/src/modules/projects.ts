import type { ContractDescriptor } from "../platform/package.js";

export const modulesProjectsContract = {
  contractId: "io.molis.work.module.projects.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/projects.md",
} as const satisfies ContractDescriptor;

/** `project_id` is canonical. `board_id` remains only as the V1 database identity. */
export interface ProjectRecord {
  project_id: string;
  display_name: string;
  board_id: string;
  database_path: string;
  source: "created" | "migrated";
  data_class: "user" | "migrated_user" | "regenerable_demo";
  migrated_from_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSelection {
  project_id: string;
  display_name: string;
}

/** Bundled project navigation entries; activation does not grant API permissions. */
export const BUILTIN_PROJECT_PLUGIN_IDS = ["goals", "task", "sessions", "inbox", "feed", "artifacts"] as const;
export type BuiltinProjectPluginId = typeof BUILTIN_PROJECT_PLUGIN_IDS[number];
/** Enabling Feed always enables Inbox so the attention entry cannot disappear. */
export const PROJECT_PLUGIN_COMPANIONS: {
  readonly [K in BuiltinProjectPluginId]: readonly BuiltinProjectPluginId[];
} = {
  goals: [],
  task: [],
  sessions: [],
  inbox: [],
  feed: ["inbox"],
  artifacts: [],
};
export interface AddProjectPluginInput {
  project_id: string;
  plugin_id: BuiltinProjectPluginId;
  actor_id: string;
}

export interface ProjectWorkspaceRef {
  workspace_id: string;
  canonical_path: string;
  realpath_verified: boolean;
  display_name: string;
}

export interface ProjectWorkspaceMembership {
  membership_id: string;
  workspace_id: string;
  workspace_name: string;
  realpath_verified: boolean;
  project_id: string;
  is_default: boolean;
  bound_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectWorkspaceDirectoryRecord extends ProjectWorkspaceRef {
  project_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface AddWorkspaceProjectInput {
  canonical_path: string;
  project_id: string;
  actor_id: string;
  user_confirmed: boolean;
}

export interface RepairWorkspaceProjectInput extends AddWorkspaceProjectInput {
  workspace_id: string;
}

export interface ChangeWorkspaceProjectInput {
  workspace_id: string;
  project_id: string;
  actor_id: string;
  user_confirmed: boolean;
}

export interface CreateProjectInput {
  display_name: string;
  actor_id: string;
}

export interface ProjectDeletionRecord {
  deletion_id: string;
  project_id: string;
  display_name: string;
  board_id: string;
  actor_id: string;
  deleted_binding_count: number;
  cleanup_state: "complete" | "pending";
  cleanup_error: string | null;
  deleted_at: string;
  cleaned_at: string | null;
}

export interface DeleteProjectInput {
  project_id: string;
  actor_id: string;
  delete_confirmed: boolean;
  idempotency_key: string;
}

export interface ProjectDeletionResult {
  deletion: ProjectDeletionRecord;
  replayed: boolean;
}

export type ProjectMigrationStep = "after_copy" | "after_validation" | "before_catalog_commit";

export interface MigrateProjectInput {
  legacy_database_path: string;
  display_name?: string;
  actor_id: string;
  beforeStep?: (step: ProjectMigrationStep) => void | Promise<void>;
}

export interface ProjectsQueryApi {
  listProjectPlugins(projectId: string): BuiltinProjectPluginId[];
  listProjects(): ProjectRecord[];
  getProject(projectId: string): ProjectRecord;
  selections(): ProjectSelection[];
  listWorkspaceMemberships(): ProjectWorkspaceMembership[];
  listWorkspaceDirectory(projectId?: string): ProjectWorkspaceDirectoryRecord[];
  preferredWorkspacePath(projectId: string): string | null;
  workspaceProjectSelections(workspaceId: string): ProjectSelection[];
  listProjectDeletions(): ProjectDeletionRecord[];
}

export interface ProjectsCommandApi {
  addProjectPlugin(input: AddProjectPluginInput): BuiltinProjectPluginId[];
  renameProject(projectId: string, displayName: string, actorId: string): ProjectRecord;
  addWorkspaceProject(input: AddWorkspaceProjectInput): ProjectWorkspaceDirectoryRecord;
  repairWorkspaceProject(input: RepairWorkspaceProjectInput): ProjectWorkspaceDirectoryRecord;
  setWorkspaceDefault(input: ChangeWorkspaceProjectInput): ProjectWorkspaceMembership[];
  removeWorkspaceMembership(input: ChangeWorkspaceProjectInput): ProjectWorkspaceMembership[];
}

export interface ProjectsApplicationApi {
  query: ProjectsQueryApi;
  commands: ProjectsCommandApi;
}
