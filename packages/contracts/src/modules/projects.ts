import type { ContractDescriptor } from "../platform/package.js";
import { defineErrorCodes, type ActionDefinition, type ActionMetadata, type ActionSchema } from "../platform/actions.js";
import { MATERIAL_ORIGIN_SCHEMA, MATERIAL_RECENT_KEEP, MATERIAL_RECENT_RECORD_MAX, MATERIAL_REF_SCHEMA, type MaterialRef, type RecentMaterial } from "../platform/project-materials.js";

export { projectDirectoryErrors } from "./projects-errors.js";

// Keep the Catalog's current transport classification; project absence is a 404.
const projectErrors = defineErrorCodes("catalog", {
  invalid_name: "invalid",
  plugin_always_on: "invalid",
  plugin_not_found: "invalid",
  project_not_found: "not_found",
  project_storage_invalid: "invalid",
  project_name_conflict: "conflict",
});
const workspaceErrors = defineErrorCodes("catalog.context", {
  user_confirmation_required: "invalid",
  workspace_default_unsupported: "invalid",
  workspace_membership_not_found: "invalid",
  workspace_required: "invalid",
});

export const projectCatalogErrors = { ...projectErrors, ...workspaceErrors };


export const modulesProjectsContract = {
  contractId: /* @version contract.io.molis.work.module.projects "io.molis.work.module.projects.v{version}" */ "io.molis.work.module.projects.v1",
  kind: "module",
  schemaVersion: /* @version contract.io.molis.work.module.projects */ 1,
  maturity: "partial",
  ssot: "docs/modules/projects.md",
} as const satisfies ContractDescriptor;

/** One project, one database: `project_id` names both the catalog entry and the Goals board inside it. */
export interface ProjectRecord {
  /** Inherited from the owning Catalog, never accepted from project creation input. */
  spaceId?: string;
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

/** The interface calls `input` 参考 and `output` 输出. */
export type DirectoryRole = "input" | "output";

export interface ProjectDirectory extends ProjectWorkspaceRef {
  /** One folder is linked once: when it is both input and output, `roles` has both. */
  roles: DirectoryRole[];
  state: "ok" | "missing";
}

/** Which folder a directory is named by: an existing one, a path to link, or the project's default location. */
export type DirectoryTarget =
  | { workspace_id: string }
  | { workspace_path: string }
  | { default_output: true };

export interface ProjectDirectories {
  project_id: string;
  /** Exactly one carries `output`, also in a project with no local input (the default location the owner creates with the project). */
  directories: ProjectDirectory[];
  /** Ids only, no paths. */
  source_links: { source_workspace_id: string; workspace_id: string }[];
  /** Where changes commit from, as `expected_revision`. */
  revision: string;
}

/**
 * Where a run works, frozen when it starts: this says where, never whether. Every read, write and execution still checks the current
 * roles and grants, so a revoked or removed folder is refused at once. Not `placement`, which names the project partition an object is in.
 */
export interface RunDirectories {
  /** The `ProjectDirectories.revision` read when the run started. */
  directories_revision: string;
  /** A `workspace_id`. */
  output: string;
  /** `workspace_id`s. */
  inputs: string[];
  execution: { kind: "output" } | { kind: "worktree"; worktree_id: string };
}

export interface CreateProjectInput {
  display_name: string;
  actor_id: string;
}

/**
 * What a module of the Host's own keeps in the Home for a project outside the project's own directory (its stores are
 * partitioned by `project_id`), and how to clear it when the project is deleted. The module exports one and the Host names it
 * among the deletion's owners. A plugin declares its data in its Manifest instead (`databases.home.project_rows`, PG-024), and the
 * platform deletes it without running the plugin's code.
 */
export interface ProjectDataDeclaration {
  /** What the confirmation dialog tells the person goes with the project (Chinese source text, translated when shown). */
  readonly label: string;
  /** Where this owner's step runs among the others, ascending; omitted, it runs after every numbered one, in catalog order. */
  readonly order?: number;
  /**
   * Clears the owner's data of the project from the Home. It works on the owner's own files, so any process on the Home
   * can run it without the owner's service running; it is idempotent (a failed receipt is retried, and a library that
   * does not exist yet is not created). Throws when something is left, and the step then stays pending in the receipt.
   */
  purge(homeDirectory: string, projectId: string): void | Promise<void>;
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
  wasProjectPluginRemoved(projectId:string,pluginId:ProjectPluginId):boolean;
  /** Stored display facts only, without derived membership or any assertion of plugin availability. Never use for authorization. */
  storedProjectPluginMembership(projectId: string): ProjectPluginMembership;
  /** Current derived membership and hidden marks, sharing one synchronous registry read. Later execution must read current state again. */
  projectPluginMembership(projectId: string): ProjectPluginMembership;
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
  /** expectedDisplayName is the name observed by the editor, not a fresh server read. */
  renameProject(projectId: string, displayName: string, actorId: string, expectedDisplayName: string): ProjectRecord;
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
    capability_id: "projects.workspaces.list",
    version: /* @version action.projects.workspaces.list */ 1,
    operation: "query",
    action: workspaceQuery("项目工作区", "列出当前项目已授权的工作区目录", false),
  } as ActionDefinition<[], readonly ProjectWorkspaceRef[]>,
  readWorkspace: {
    capability_id: "projects.workspace.read",
    version: /* @version action.projects.workspace.read */ 1,
    operation: "query",
    action: workspaceQuery("首选工作区", "读取当前项目的首选工作区；没有绑定时返回空值", true),
  } as ActionDefinition<[], ProjectWorkspaceRef | null>,
} as const;

/** Current-project settings: each item is independently declared in Manifest consumes.
 * No project selector, wildcard, private storage access, or arbitrary key bag.
 */
export const projectSettingsCapabilities = {
  workspaces: {
    capability_id: "projects.settings.workspaces.read",
    version: /* @version action.projects.settings.workspaces.read */ 1,
    operation: "query",
    action: workspaceQuery("工作区设置", "读取当前项目可供插件选择的工作区", false),
  } as ActionDefinition<[], readonly ProjectWorkspaceRef[]>,
  browsingWorkspace: {
    capability_id: "projects.settings.browsing-workspace.read",
    version: /* @version action.projects.settings.browsing-workspace.read */ 1,
    operation: "query",
    action: workspaceQuery("浏览工作区", "读取当前项目选中的浏览工作区；选择已失效时返回空值", true),
  } as ActionDefinition<[], ProjectWorkspaceRef | null>,
  /** Choosing which folder Files and Git browse is the person's own setting: the local user only. */
  selectBrowsingWorkspace: {
    capability_id: "projects.settings.browsing-workspace.select",
    version: /* @version action.projects.settings.browsing-workspace.select */ 1,
    operation: "command",
    action: { title: "选择浏览工作区", description: "从当前项目已授权的工作区中选一个，供文件、Git 等浏览；不改变工作区授权", kind: "operation", scope: "project",
      audiences: ["user"], permissions: ["projects:settings"], subject_kinds: ["project"],
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: { type: "string", minLength: 1, maxLength: 200 } },
      output_schema: WORKSPACE_SCHEMA, output_type: "project.workspace" },
  } as ActionDefinition<[workspaceId: string], ProjectWorkspaceRef>,
  /** The Runtime the person picked for this project's Agent sessions (`resolveProjectRuntime` reads it); null means the Home default. */
  runtime: {
    capability_id: "projects.settings.runtime.read",
    version: /* @version action.projects.settings.runtime.read */ 1,
    operation: "query",
    action: { title: "项目运行时", description: "读取当前项目选定的 Agent 运行时标识；没有选择时返回空值，表示用默认运行时", kind: "query", scope: "project",
      audiences: ["user", "agent", "workflow", "mcp"], permissions: [], subject_kinds: ["project"],
      input_schema: { type: "array", maxItems: 0 }, output_schema: RUNTIME_PICK_SCHEMA, output_type: "project.runtime.optional" },
  } as ActionDefinition<[], string | null>,
  /** Which Runtime this project's sessions run on is the person's own setting: the local user only. Null returns to the Home default. */
  selectRuntime: {
    capability_id: "projects.settings.runtime.select",
    version: /* @version action.projects.settings.runtime.select */ 1,
    operation: "command",
    action: { title: "选择项目运行时", description: "为当前项目选一个 Agent 运行时；空值恢复为默认运行时。选定的运行时不可用时，新会话与新一轮会被拒绝，不会换别的运行时", kind: "operation", scope: "project",
      audiences: ["user"], permissions: ["projects:settings"], subject_kinds: ["project"],
      input_schema: { type: "array", minItems: 1, maxItems: 1, items: RUNTIME_PICK_SCHEMA }, output_schema: RUNTIME_PICK_SCHEMA, output_type: "project.runtime.optional" },
  } as ActionDefinition<[runtimeId: string | null], string | null>,
} as const;

/** Which folders belong to this project is the person's own setting at this computer: local user only. Kept by the Home catalog. */
const membership = <Input, Output>(id: string, version: number, title: string, description: string, input: Record<string, unknown>, output: Record<string, unknown>): ActionDefinition<Input, Output> => ({
  capability_id: id, version: version, operation: "command", action: { title, description, kind: "operation", scope: "project", audiences: ["user"], permissions: ["projects:settings"],
    subject_kinds: ["project"], input_schema: { type: "object", properties: input, required: Object.keys(input), additionalProperties: false }, output_schema: { type: "object", properties: output, required: Object.keys(output) } },
});
const folderPath = { type: "string", minLength: 1, maxLength: 4096 }, folderId = { type: "string", minLength: 1, maxLength: 200 };
export const projectWorkspaceActions = {
  add: membership<{ workspace_path: string }, { workspace: ProjectWorkspaceDirectoryRecord }>("projects.workspaces.add", /* @version action.projects.workspaces.add */ 1, "关联工作目录", "把本机一个目录加入当前项目的工作目录",
    { workspace_path: folderPath }, { workspace: { type: "object" } }),
  // Sessions are retired (BL-177), so repair and unlink no longer move them or report how many moved.
  repair: membership<{ workspace_id: string; workspace_path: string }, { workspace: ProjectWorkspaceDirectoryRecord }>("projects.workspaces.repair", /* @version action.projects.workspaces.repair */ 1, "修复工作目录路径",
    "目录搬走或改名后，把项目关系指向新路径", { workspace_id: folderId, workspace_path: folderPath }, { workspace: { type: "object" } }),
  unlink: membership<{ workspace_id: string }, { changed: boolean }>("projects.workspaces.unlink", /* @version action.projects.workspaces.unlink */ 1, "解除工作目录", "解除当前项目与这个目录的关系；目录本身保留",
    { workspace_id: folderId }, { changed: { type: "boolean" } }),
};

/**
 * The provider that will answer the directory and recent-material actions below. They are declared only: no provider registers them
 * yet, so a call answers `actions.missing` until the implementation slice does.
 */
export const PROJECT_WORKSPACE_PROVIDER_ID = "system.project-workspaces";

const PROJECT_DIRECTORIES_SCHEMA: ActionSchema = { type: "object", properties: {
  project_id: { type: "string" },
  directories: { type: "array", items: { type: "object", properties: { ...WORKSPACE_SCHEMA.properties,
    roles: { type: "array", items: { enum: ["input", "output"] }, minItems: 1, uniqueItems: true },
    state: { enum: ["ok", "missing"] },
  }, required: [...WORKSPACE_SCHEMA.required, "roles", "state"], additionalProperties: false } },
  source_links: { type: "array", items: { type: "object", properties: { source_workspace_id: { type: "string" }, workspace_id: { type: "string" } },
    required: ["source_workspace_id", "workspace_id"], additionalProperties: false } },
  revision: { type: "string" },
}, required: ["project_id", "directories", "source_links", "revision"], additionalProperties: false };

const expectedRevision = { type: "string", minLength: 1, maxLength: 200 };
const closedInput = (properties: Record<string, unknown>): ActionSchema => ({ type: "object", properties: { ...properties, expected_revision: expectedRevision },
  required: [...Object.keys(properties), "expected_revision"], additionalProperties: false });
/** A change to this project's directories: the local user's, who stands for the confirmation, committed from the revision they read. */
const directoryCommand = <Input>(id: string, title: string, description: string, input_schema: ActionSchema, details: Pick<ActionMetadata, "effect"> = {}): ActionDefinition<Input & { expected_revision: string }, ProjectDirectories> => ({
  capability_id: id, version: 1, operation: "command", action: { title, description, kind: "operation", scope: "project", audiences: ["user"], permissions: ["projects:settings"],
    subject_kinds: ["project"], input_schema, output_schema: PROJECT_DIRECTORIES_SCHEMA, output_type: "project.directories", ...details },
});

/** A project's inputs and output (specs/shared-sources-and-surfaces §3). Reads and writes name no project: it comes from the call context. */
export const projectDirectoryActions = {
  get: {
    capability_id: "projects.directories.get",
    version: 1,
    operation: "query",
    action: { title: "项目目录", description: "读取当前项目的输入目录与输出目录；只读", kind: "query", scope: "project", audiences: ["user", "plugin", "agent", "mcp"],
      permissions: [], subject_kinds: ["project"], input_schema: { type: "object", properties: {}, additionalProperties: false },
      output_schema: PROJECT_DIRECTORIES_SCHEMA, output_type: "project.directories" },
  } as ActionDefinition<Record<string, never>, ProjectDirectories>,
  addInput: directoryCommand<{ workspace_path: string }>("projects.directories.add_input", "添加输入目录", "把本机一个文件夹加为当前项目的输入目录；路径核实不了时拒绝",
    closedInput({ workspace_path: folderPath })),
  // The folder stays on disk and can be added again, so the `remove` in the id does not make this irreversible.
  removeInput: directoryCommand<{ workspace_id: string }>("projects.directories.remove_input", "移除输入目录", "让一个文件夹不再是当前项目的输入目录；磁盘上的文件不动",
    closedInput({ workspace_id: folderId }), { effect: "write" }),
  setOutput: directoryCommand<DirectoryTarget>("projects.directories.set_output", "设置输出目录",
    "设或改当前项目的输出目录，也可以把一个输入目录设为输出，或设回默认位置；旧文件不搬移、不删除、不覆盖",
    { ...closedInput({ workspace_id: folderId, workspace_path: folderPath, default_output: { const: true } }),
      required: ["expected_revision"],
      oneOf: [{ required: ["workspace_id"] }, { required: ["workspace_path"] }, { required: ["default_output"] }] }),
  repair: directoryCommand<{ workspace_id: string; workspace_path: string }>("projects.directories.repair", "修复目录路径", "文件夹换了位置以后重新找到它：只在它失效时允许，目录的身份不变，关联它的每个项目一起跟着走",
    closedInput({ workspace_id: folderId, workspace_path: folderPath })),
  mapSource: directoryCommand<{ source_workspace_id: string } & DirectoryTarget>("projects.directories.map_source", "指定对应的文件夹",
    "把另一台设备或已换走的一个目录对应到当前项目的文件夹；已有对应就换掉；读的时候换算，引用不变",
    { ...closedInput({ source_workspace_id: folderId, workspace_id: folderId, workspace_path: folderPath, default_output: { const: true } }),
      required: ["source_workspace_id", "expected_revision"],
      oneOf: [{ required: ["workspace_id"] }, { required: ["workspace_path"] }, { required: ["default_output"] }] }),
  unmapSource: directoryCommand<{ source_workspace_id: string }>("projects.directories.unmap_source", "取消对应的文件夹",
    "取消对应；文件夹还是当前项目的目录，磁盘上的文件不动",
    closedInput({ source_workspace_id: folderId }), { effect: "write" }),
};

/** A person's and a plugin's recent materials in this project; the caller and the project come from the call context (§2.1). */
export const materialRecentActions = {
  /** To a plugin, only what it can read this moment: a material it cannot read is not named, and not counted. */
  read: {
    capability_id: "materials.recent",
    version: 1,
    operation: "query",
    action: { title: "最近用过的资料", description: "按调用方和当前项目读取最近用过的资料，新的在前，出处是现读的", kind: "query", scope: "project", audiences: ["user", "plugin"],
      permissions: [], subject_kinds: ["project"], input_schema: { type: "object", properties: {}, additionalProperties: false },
      output_schema: { type: "object", properties: { items: { type: "array", maxItems: MATERIAL_RECENT_KEEP, items: { type: "object",
        properties: { ref: MATERIAL_REF_SCHEMA, origin: MATERIAL_ORIGIN_SCHEMA }, required: ["ref", "origin"], additionalProperties: false } } }, required: ["items"], additionalProperties: false },
      output_type: "materials.recent" },
  } as ActionDefinition<Record<string, never>, { items: RecentMaterial[] }>,
  /** Answers nothing about what it kept: a reference the caller cannot read is dropped silently, so a call here cannot probe for one. */
  record: {
    capability_id: "materials.recent.record",
    version: 1,
    operation: "command",
    action: { title: "记下用过的资料", description: "在引用、加入任务或打开资料这件事提交成功之后调用；只记引用不记正文，调用方此刻读不了的引用不记", kind: "operation", scope: "project", audiences: ["user", "plugin"],
      permissions: [], subject_kinds: ["project"], input_schema: { type: "object", properties: { refs: { type: "array", items: MATERIAL_REF_SCHEMA, minItems: 1, maxItems: MATERIAL_RECENT_RECORD_MAX } }, required: ["refs"], additionalProperties: false },
      output_schema: { type: "object", properties: {}, additionalProperties: false } },
  } as ActionDefinition<{ refs: MaterialRef[] }, Record<string, never>>,
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
