import type { ContractDescriptor } from "../platform/package.js";
import { defineErrorCodes, type ActionDefinition, type ActionMetadata } from "../platform/actions.js";

// Keep the Catalog's current transport classification; project absence is a 404.
const projectErrors = defineErrorCodes("catalog", {
  invalid_name: "invalid",
  plugin_always_on: "invalid",
  plugin_not_found: "invalid",
  project_not_found: "not_found",
  project_storage_invalid: "invalid",
});
const workspaceErrors = defineErrorCodes("catalog.context", {
  user_confirmation_required: "invalid",
  workspace_default_unsupported: "invalid",
  workspace_membership_not_found: "invalid",
  workspace_required: "invalid",
});

export const projectCatalogErrors = { ...projectErrors, ...workspaceErrors };


export const modulesProjectsContract = {
  contractId: "io.molis.work.module.projects.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/projects.md",
} as const satisfies ContractDescriptor;

/** One project, one database: `project_id` names both the catalog entry and the Goals board inside it. */
export interface ProjectRecord {
  project_id: string;
  display_name: string;
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

/** Body-free source request identity; the Catalog owns the original deletion plan and completion. */
export interface ProjectDeletionSourceRequest {
  deletion_id: string;
  project_id: string;
  actor_id: string;
  idempotency_key: string;
  request_fingerprint: string;
}

/** One durable mapping in the Memory recovery parent; never a copy of Catalog plans or steps. */
export interface ProjectDeletionRecoveryGroup {
  project_id: string;
  sources: readonly ProjectDeletionSourceRequest[];
  targets: readonly { source_deletion_id: string; target_deletion_id: string }[];
  disposal: { primary_target: string | null; dependent_targets: readonly string[] };
}

/**
 * A project plugin id is an open string validated at runtime against the
 * installed registry, not a closed literal set. Adding a Plugin is an install,
 * not a schema migration.
 */
export type ProjectPluginId = string;

/**
 * What the Host knows is installable right now. Projects validates against this
 * instead of a compiled-in list, so a new Plugin needs no change here.
 */
export interface ProjectPluginRegistry {
  has(pluginId: ProjectPluginId): boolean;
  /** Initial memberships for a new project; never applied when reading or reopening an existing project. */
  initial?(): readonly ProjectPluginId[];
  /** Plugins that must be enabled together with this one. */
  companions(pluginId: ProjectPluginId): readonly ProjectPluginId[];
  /** Always-on plugins a project may hide. Absent means none are personal. */
  isPersonal?(pluginId: ProjectPluginId): boolean;
  /**
   * 常开插件 (the Manifest's `always_on`): the plugins that are on in every project, and that no project may hide or remove. The
   * Host answers from what is installed and agreed to, each time it is asked, so a revoked or newly installed one counts at once.
   * Absent means none are.
   */
  alwaysOn?(): readonly ProjectPluginId[];
}

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

/**
 * What an owner (a plugin, a module) keeps in the Home for a project outside the project's own directory (its stores are
 * partitioned by `project_id`), and how to clear it when the project is deleted. The owner exports one; a built-in plugin
 * attaches it to its catalog entry (`project_data`), and the Host builds the deletion's owners from the declarations it
 * already collects, so it never names a plugin or lists its tables. The owner's id in the deletion receipt is the
 * plugin's `project_plugin_id`.
 */
/** Live maintenance authority: the real owner rechecks after waits/locks and before writes/commit.
 * Controlled paths must preserve the original physical target and refuse redirected files or ancestors. */
export interface ProjectDeletionControl { assertCurrent(): void }

export interface ProjectDataDeclaration {
  /** What the confirmation dialog tells the person goes with the project (Chinese source text, translated when shown). */
  readonly label: string;
  /** Where this owner's step runs among the others, ascending; omitted, it runs after every numbered one, in catalog order. */
  readonly order?: number;
  /**
   * Clears the owner's data of the project from the Home. It works on the owner's own files, so any process on the Home
   * can run it without the owner's service running; it is idempotent (a failed receipt is retried, and a library that
   * does not exist yet is not created). Throws when something is left, and the step then stays pending in the receipt.
   * Only a plugin whose Home library is partitioned by project may leave it out: the Host removes that project's library.
   */
  purge?(homeDirectory: string, projectId: string, control?: ProjectDeletionControl): void | Promise<void>;
}

/** One owner's part of a deletion: it clears the data it keeps in the Home for the deleted project. */
export interface ProjectDeletionStep {
  /** The owner that registered the step, e.g. `pages` or `memory`. */
  owner_id: string;
  /**
   * `pending` until the owner ran: a step whose owner is not registered in the process that finishes the receipt stays
   * pending, with the error it last had, for a process that has the owner.
   */
  state: "pending" | "complete";
  error: string | null;
  updated_at: string;
}

/** The facts of a deletion receipt that the catalog itself keeps. */
export interface ProjectDeletionReceipt {
  deletion_id: string;
  project_id: string;
  display_name: string;
  actor_id: string;
  deleted_binding_count: number;
  cleanup_state: "complete" | "pending";
  cleanup_error: string | null;
  deleted_at: string;
  cleaned_at: string | null;
}

export interface ProjectDeletionRecord extends ProjectDeletionReceipt {
  /** What each owner of project data in the Home did after the catalog committed; `cleanup_state` is complete only when every one is. */
  owner_steps: ProjectDeletionStep[];
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
  /** Stored display facts only, without derived membership or any assertion of plugin availability. Never use for authorization. */
  storedProjectPluginMembership(projectId: string): ProjectPluginMembership;
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
const WORKSPACE_SCHEMA = { type: "object", properties: {
  workspace_id: { type: "string" }, canonical_path: { type: "string" },
  realpath_verified: { type: "boolean" }, display_name: { type: "string" },
}, required: ["workspace_id", "canonical_path", "realpath_verified", "display_name"], additionalProperties: false };

const RUNTIME_PICK_SCHEMA = { anyOf: [{ type: "string", minLength: 1, maxLength: 200 }, { type: "null" }] };

export const projectsCapabilities = {
  listWorkspaces: {
    capability_id: "projects.workspaces.list.v1",
    version: 1,
    operation: "query",
    action: workspaceQuery("项目工作区", "列出当前项目已授权的工作区目录", false),
  } as ActionDefinition<[], readonly ProjectWorkspaceRef[]>,
  readWorkspace: {
    capability_id: "projects.workspace.read.v1",
    version: 1,
    operation: "query",
    action: workspaceQuery("首选工作区", "读取当前项目的首选工作区；没有绑定时返回空值", true),
  } as ActionDefinition<[], ProjectWorkspaceRef | null>,
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
  } as ActionDefinition<[], readonly ProjectWorkspaceRef[]>,
  browsingWorkspace: {
    capability_id: "projects.settings.browsing-workspace.read.v1",
    version: 1,
    operation: "query",
    action: workspaceQuery("浏览工作区", "读取当前项目选中的浏览工作区；选择已失效时返回空值", true),
  } as ActionDefinition<[], ProjectWorkspaceRef | null>,
  /** Choosing which folder Files and Git browse is the person's own setting: the local user only. */
  selectBrowsingWorkspace: {
    capability_id: "projects.settings.browsing-workspace.select.v1",
    version: 1,
    operation: "command",
    action: { title: "选择浏览工作区", description: "从当前项目已授权的工作区中选一个，供文件、Git 等浏览；不改变工作区授权", kind: "operation", scope: "project",
      audiences: ["user"], permissions: ["projects:settings"], subject_kinds: ["project"],
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", minLength: 1, maxLength: 200 } },
      output_schema: WORKSPACE_SCHEMA, output_type: "project.workspace" },
  } as ActionDefinition<[workspaceId: string], ProjectWorkspaceRef>,
  /** The Runtime the person picked for this project's Agent sessions (`resolveProjectRuntime` reads it); null means the Home default. */
  runtime: {
    capability_id: "projects.settings.runtime.read.v1",
    version: 1,
    operation: "query",
    action: { title: "项目运行时", description: "读取当前项目选定的 Agent 运行时标识；没有选择时返回空值，表示用默认运行时", kind: "query", scope: "project",
      audiences: ["user", "agent", "workflow", "mcp"], permissions: [], subject_kinds: ["project"],
      input_schema: { type: "array", maxItems: 0 }, output_schema: RUNTIME_PICK_SCHEMA, output_type: "project.runtime.optional" },
  } as ActionDefinition<[], string | null>,
  /** Which Runtime this project's sessions run on is the person's own setting: the local user only. Null returns to the Home default. */
  selectRuntime: {
    capability_id: "projects.settings.runtime.select.v1",
    version: 1,
    operation: "command",
    action: { title: "选择项目运行时", description: "为当前项目选一个 Agent 运行时；空值恢复为默认运行时。选定的运行时不可用时，新会话与新一轮会被拒绝，不会换别的运行时", kind: "operation", scope: "project",
      audiences: ["user"], permissions: ["projects:settings"], subject_kinds: ["project"],
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: RUNTIME_PICK_SCHEMA }, output_schema: RUNTIME_PICK_SCHEMA, output_type: "project.runtime.optional" },
  } as ActionDefinition<[runtimeId: string | null], string | null>,
} as const;

/** Which folders belong to this project is the person's own setting at this computer: local user only. Kept by the Home catalog. */
const membership = <Input, Output>(id: string, title: string, description: string, input: Record<string, unknown>, output: Record<string, unknown>, version = 1): ActionDefinition<Input, Output> => ({
  capability_id: id, version, operation: "command", action: { title, description, kind: "operation", scope: "project", audiences: ["user"], permissions: ["projects:settings"],
    subject_kinds: ["project"], input_schema: { type: "object", properties: input, required: Object.keys(input), additionalProperties: false }, output_schema: { type: "object", properties: output, required: Object.keys(output) } },
});
const folderPath = { type: "string", minLength: 1, maxLength: 4096 }, folderId = { type: "string", minLength: 1, maxLength: 200 };
export const projectWorkspaceActions = {
  add: membership<{ workspace_path: string }, { workspace: ProjectWorkspaceDirectoryRecord }>("projects.workspaces.add", "关联工作目录", "把本机一个目录加入当前项目的工作目录",
    { workspace_path: folderPath }, { workspace: { type: "object" } }),
  // v2: Sessions are retired (BL-177), so repair and unlink no longer move them or report how many moved.
  repair: membership<{ workspace_id: string; workspace_path: string }, { workspace: ProjectWorkspaceDirectoryRecord }>("projects.workspaces.repair", "修复工作目录路径",
    "目录搬走或改名后，把项目关系指向新路径", { workspace_id: folderId, workspace_path: folderPath }, { workspace: { type: "object" } }, 2),
  unlink: membership<{ workspace_id: string }, { changed: boolean }>("projects.workspaces.unlink", "解除工作目录", "解除当前项目与这个目录的关系；目录本身保留",
    { workspace_id: folderId }, { changed: { type: "boolean" } }, 2),
};

function workspaceQuery(title: string, description: string, nullable: boolean): ActionMetadata {
  const workspace = WORKSPACE_SCHEMA;
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
