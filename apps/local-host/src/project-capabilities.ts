import { hostErrors } from "./host-errors.js";
import { ProjectBrowsingSettings } from "./project-browsing-settings.js";
import { ProjectRuntimeSettings } from "./project-runtime-settings.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import { projectsCapabilities, projectSettingsCapabilities, projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { workspaceReadActions, type WorkspaceFileQuery, type WorkspaceGitQuery, type WorkspaceGitResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { readConflictFile, readGitSummary, readPullRequestSupport } from "./workspace-git-operations.js";
import { readWorkspaceGit } from "./workspace-git.js";
import { readWorkspaceFile } from "./workspace-files.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

interface ProjectCapabilityPorts {
  /** Resolves the workspace a project is bound to. See `MolisWorkLocalHostOptions`. */
  workspacesFor?: (projectId: string) => readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor?: (projectId: string) => ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
}

export function registerProjectCapabilities(
  host: LocalHost<MolisWorkProjectRuntime>,
  ports: ProjectCapabilityPorts = {},
): void {
  const { workspaceFor } = ports;
  const readGit = async (runtime: MolisWorkProjectRuntime, query: WorkspaceGitQuery): Promise<WorkspaceGitResult> => {
    const current = async () => ports.workspacesFor ? await ports.workspacesFor(runtime.project_id) : [await workspaceFor!(runtime.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    // Where committing, branching, pushing or a PR starts from; reads only.
    if (query.kind === "summary" || query.kind === "pr-support" || query.kind === "conflict") {
      const workspace = (await current()).find(item => item.workspace_id === query.workspace_id && item.realpath_verified);
      if (!workspace) return { outcome: "denied", message: "此工作区不属于当前项目或已取消授权" };
      try { return query.kind === "summary" ? await readGitSummary(workspace) : query.kind === "conflict" ? await readConflictFile(workspace, query.path) : await readPullRequestSupport(workspace); }
      catch (error) { return { outcome: /not a git repository/i.test(String((error as { stderr?: unknown }).stderr ?? (error as Error).message)) ? "not-a-repository" : "error", message: error instanceof Error ? error.message : "读取 Git 失败" }; }
    }
    const granted = await current(), result = await readWorkspaceGit(query, granted);
    const accepted = granted.find(item => item.workspace_id === query.workspace_id);
    if (!(await current()).some(item => item.workspace_id === query.workspace_id && item.realpath_verified && item.canonical_path === accepted?.canonical_path)) return { outcome: "denied", message: "工作区授权已变化，请重新读取" };
    return result;
  };
  const readFile = async (runtime: MolisWorkProjectRuntime, query: WorkspaceFileQuery, invocation: HostCapabilityInvocation) => {
    // A whole file (an image, a PDF) is for the preview of a plugin the Host runs: told by the Host-confirmed plugin identity (`consumer`), not by audience.
    if (query.kind === "bytes" && invocation.consumer !== "plugin") throw new ActionError("actions.forbidden", "整份文件只供宿主运行的插件预览，请读取目录或文本");
    const selected = ports.workspacesFor ? await ports.workspacesFor(runtime.project_id) : [await workspaceFor!(runtime.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    return readWorkspaceFile(query, selected);
  };
  if (ports.workspacesFor || workspaceFor) {
    // One id per read, for every caller: the Files, Git and Coding plugins call these two actions as the plugin audience.
    host.registerAction(workspaceReadActions.git, readGit);
    host.registerAction(workspaceReadActions.file, readFile);
  }
  if (ports.workspacesFor) {
    const list = async (runtime: MolisWorkProjectRuntime) => (await ports.workspacesFor!(runtime.project_id)).map(projectWorkspaceRef);
    host.registerAction(projectsCapabilities.listWorkspaces, list);
    host.registerAction(projectSettingsCapabilities.workspaces, list);
    host.registerAction(projectSettingsCapabilities.browsingWorkspace, async (runtime) => {
      return new ProjectBrowsingSettings(runtime.store.db).read(runtime.project_id, await list(runtime));
    });
    host.registerAction(projectSettingsCapabilities.selectBrowsingWorkspace, async (runtime, [workspaceId], invocation) => {
      const workspaces = await list(runtime);
      if (!workspaces.some(item => item.workspace_id === workspaceId && item.realpath_verified)) throw hostErrors.workspace_unavailable("请选择当前项目已关联且可用的工作目录");
      await invocation.beforeEffect?.();
      invocation.assertAuthorityCurrent();
      return new ProjectBrowsingSettings(runtime.store.db).select(runtime.project_id, workspaceId, workspaces);
    });
  }
  // The Runtime pick does not depend on where the project's folders are kept: it is registered with the other current-project settings.
  host.registerAction(projectSettingsCapabilities.runtime, runtime => new ProjectRuntimeSettings(runtime.store.db).read(runtime.project_id));
  host.registerAction(projectSettingsCapabilities.selectRuntime, async (runtime, [runtimeId], invocation) => {
    await invocation.beforeEffect?.();
    invocation.assertAuthorityCurrent();
    return new ProjectRuntimeSettings(runtime.store.db).select(runtime.project_id, runtimeId);
  });
  if (workspaceFor !== undefined) {
    // Scoped to the runtime's own project: the Capability takes no project id,
    // so a Plugin cannot ask about another project. The answer carries the
    // verified path and nothing a Plugin could widen into a write.
    host.registerAction(projectsCapabilities.readWorkspace, async (runtime) => {
      const workspace = await workspaceFor(runtime.project_id);
      return workspace ? projectWorkspaceRef(workspace) : null;
    });
  }
}
