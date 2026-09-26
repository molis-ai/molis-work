import type { ContractDescriptor } from "../platform/package.js";
import type { HostCapabilityDefinition } from "../platform/app-host.js";
import type { ActionMetadata } from "../platform/actions.js";

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
  source: "created";
  data_class: "user" | "regenerable_demo";
  created_at: string;
  updated_at: string;
}

export interface ProjectSelection {
  project_id: string;
  display_name: string;
}

/** Bundled project navigation entries; activation does not grant API permissions. */
export const BUILTIN_PROJECT_PLUGIN_IDS = ["goals", "sessions", "inbox", "feed", "artifacts"] as const;
export type BuiltinProjectPluginId = typeof BUILTIN_PROJECT_PLUGIN_IDS[number];
/**
 * A project plugin id is an open string validated at runtime against the
 * installed registry, not a closed literal set. Adding a Plugin is an install,
 * not a schema migration.
 */
export type ProjectPluginId = string;
/** Enabling Feed always enables Inbox so the attention entry cannot disappear. */
export const PROJECT_PLUGIN_COMPANIONS: {
  readonly [K in BuiltinProjectPluginId]: readonly BuiltinProjectPluginId[];
} = {
  goals: [],
  sessions: [],
  inbox: [],
  feed: ["inbox"],
  artifacts: [],
};

/**
 * What the Host knows is installable right now. Projects validates against this
 * instead of a compiled-in list, so a new Plugin needs no change here.
 */
export interface ProjectPluginRegistry {
  has(pluginId: ProjectPluginId): boolean;
  /** Plugins that must be enabled together with this one. */
  companions(pluginId: ProjectPluginId): readonly ProjectPluginId[];
  /** Always-on plugins a project may hide. Absent means none are personal. */
  isPersonal?(pluginId: ProjectPluginId): boolean;
}

/** The bundled registry: the ids this build ships with, and their companions. */
export const BUILTIN_PROJECT_PLUGIN_REGISTRY: ProjectPluginRegistry = {
  has(pluginId) {
    return (BUILTIN_PROJECT_PLUGIN_IDS as readonly string[]).includes(pluginId);
  },
  companions(pluginId) {
    return PROJECT_PLUGIN_COMPANIONS[pluginId as BuiltinProjectPluginId] ?? [];
  },
};

export interface AddProjectPluginInput {
  project_id: string;
  plugin_id: ProjectPluginId;
  actor_id: string;
}

export interface RemoveProjectPluginInput {
  project_id: string;
  plugin_id: ProjectPluginId;
  actor_id: string;
}

export interface ProjectPluginMembership {
  plugins: ProjectPluginId[];
  hidden: ProjectPluginId[];
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

export interface ProjectsQueryApi {
  listProjectPlugins(projectId: string): ProjectPluginId[];
  listHiddenPlugins(projectId: string): ProjectPluginId[];
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
  addProjectPlugin(input: AddProjectPluginInput): ProjectPluginId[];
  removeProjectPlugin(input: RemoveProjectPluginInput): ProjectPluginMembership;
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

/**
 * What a Plugin may learn about this project's workspace.
 *
 * Scoped to the project it is running in: there is no project id parameter, so
 * a Plugin cannot name another project and read its path. Read-only by
 * construction — the answer is a verified path and nothing else, never a handle
 * a Plugin could widen into a write. A project with no workspace bound answers
 * null rather than a guessed path.
 */
export const projectsCapabilities = {
  listWorkspaces: {
    capability_id: "projects.workspaces.list.v1",
    version: 1,
    operation: "query",
    action: workspaceQuery("项目工作区", "列出当前项目已授权的工作区目录", false),
  } as HostCapabilityDefinition<[], readonly ProjectWorkspaceRef[]>,
  readWorkspace: {
    capability_id: "projects.workspace.read.v1",
    version: 1,
    operation: "query",
    action: workspaceQuery("首选工作区", "读取当前项目的首选工作区；没有绑定时返回空值", true),
  } as HostCapabilityDefinition<[], ProjectWorkspaceRef | null>,
} as const;

/** Current-project settings: each item is independently declared in Manifest consumes.
 * No project selector, wildcard, private storage access, or arbitrary key bag.
 */
export const projectSettingsCapabilities = {
  workspaces: {
    capability_id: "projects.settings.workspaces.read.v1",
    version: 1,
    operation: "query",
    action: workspaceQuery("工作区设置", "读取当前项目可供插件选择的工作区", false),
  } as HostCapabilityDefinition<[], readonly ProjectWorkspaceRef[]>,
  browsingWorkspace: {
    capability_id: "projects.settings.browsing-workspace.read.v1",
    version: 1,
    operation: "query",
    action: workspaceQuery("浏览工作区", "读取当前项目选中的浏览工作区；选择已失效时返回空值", true),
  } as HostCapabilityDefinition<[], ProjectWorkspaceRef | null>,
} as const;

function workspaceQuery(title: string, description: string, nullable: boolean): ActionMetadata {
  const workspace = { type: "object", properties: {
    workspace_id: { type: "string" }, canonical_path: { type: "string" },
    realpath_verified: { type: "boolean" }, display_name: { type: "string" },
  }, required: ["workspace_id", "canonical_path", "realpath_verified", "display_name"], additionalProperties: false };
  return { title, description, kind: "query", scope: "project", audiences: ["user", "agent", "workflow", "mcp"],
    permissions: [], subject_kinds: ["project"], input_schema: { type: "array", maxItems: 0 },
    output_schema: nullable ? { anyOf: [workspace, { type: "null" }] } : { type: "array", items: workspace },
    output_type: nullable ? "project.workspace.optional" : "project.workspace.list",
  };
}

/** Explicit projection: catalog records also contain other projects' memberships. */
export function projectWorkspaceRef(value: ProjectWorkspaceRef): ProjectWorkspaceRef {
  return { workspace_id: value.workspace_id, canonical_path: value.canonical_path,
    realpath_verified: value.realpath_verified, display_name: value.display_name };
}
