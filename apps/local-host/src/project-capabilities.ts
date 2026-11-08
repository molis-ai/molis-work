import { ProjectRuntimeSettings } from "./project-runtime-settings.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { workspaceReadActions, type WorkspaceFileQuery, type WorkspaceFileResult, type WorkspaceGitQuery, type WorkspaceGitResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { readConflictFile, readGitSummary, readPullRequestSupport } from "./workspace-git-operations.js";
import { readWorkspaceGit } from "./workspace-git.js";
import { readWorkspaceFile } from "./workspace-files.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

/** Whether a folder of the project is on disk yet, checked before it is read (§3 「碰磁盘之前」); a folder the person chose always is. */
export type PrepareProjectDirectory = (projectId: string, workspaceId: string, mode: "read" | "write") => { exists: boolean } | Promise<{ exists: boolean }>;

interface ProjectCapabilityPorts {
  /** Resolves the workspace a project is bound to. See `MolisWorkLocalHostOptions`. */
  workspacesFor?: (projectId: string) => readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor?: (projectId: string) => ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
  /** See `MolisWorkLocalHostOptions.prepareDirectory`. Absent, every folder a port answers is taken to be there. */
  prepareDirectory?: PrepareProjectDirectory;
}

const NOT_MADE_GIT: WorkspaceGitResult = { outcome: "not-a-repository", message: "这个文件夹还没有建立，不是 Git 仓库" };

export function registerProjectCapabilities(
  host: LocalHost<MolisWorkProjectRuntime>,
  ports: ProjectCapabilityPorts = {},
): void {
  const { workspaceFor } = ports;
  const current = async (projectId: string) => ports.workspacesFor ? await ports.workspacesFor(projectId) : [await workspaceFor!(projectId)].filter((item): item is ProjectWorkspaceRef => item !== null);
  /** A default output directory that is not made yet reads as an empty folder; nothing here makes it. */
  const made = async (projectId: string, workspaceId: string) => !ports.prepareDirectory || (await ports.prepareDirectory(projectId, workspaceId, "read")).exists;
  const readGit = async (runtime: MolisWorkProjectRuntime, query: WorkspaceGitQuery): Promise<WorkspaceGitResult> => {
    // Where committing, branching, pushing or a PR starts from; reads only.
    if (query.kind === "summary" || query.kind === "pr-support" || query.kind === "conflict") {
      const workspace = (await current(runtime.project_id)).find(item => item.workspace_id === query.workspace_id && item.realpath_verified);
      if (!workspace) return { outcome: "denied", message: "此工作区不属于当前项目或已取消授权" };
      if (!await made(runtime.project_id, workspace.workspace_id)) return NOT_MADE_GIT;
      try { return query.kind === "summary" ? await readGitSummary(workspace) : query.kind === "conflict" ? await readConflictFile(workspace, query.path) : await readPullRequestSupport(workspace); }
      catch (error) { return { outcome: /not a git repository/i.test(String((error as { stderr?: unknown }).stderr ?? (error as Error).message)) ? "not-a-repository" : "error", message: error instanceof Error ? error.message : "读取 Git 失败" }; }
    }
    const granted = await current(runtime.project_id);
    const accepted = granted.find(item => item.workspace_id === query.workspace_id);
    if (accepted && !await made(runtime.project_id, accepted.workspace_id)) return NOT_MADE_GIT;
    const result = await readWorkspaceGit(query, granted);
    if (!(await current(runtime.project_id)).some(item => item.workspace_id === query.workspace_id && item.realpath_verified && item.canonical_path === accepted?.canonical_path)) return { outcome: "denied", message: "工作区授权已变化，请重新读取" };
    return result;
  };
  const readFile = async (runtime: MolisWorkProjectRuntime, query: WorkspaceFileQuery, invocation: HostCapabilityInvocation): Promise<WorkspaceFileResult> => {
    // A whole file (an image, a PDF) is for the preview of a plugin the Host runs: told by the Host-confirmed plugin identity (`consumer`), not by audience.
    if (query.kind === "bytes" && invocation.consumer !== "plugin") throw new ActionError("actions.forbidden", "整份文件只供宿主运行的插件预览，请读取目录或文本");
    const selected = await current(runtime.project_id);
    const folder = selected.find(item => item.workspace_id === query.workspace_id);
    if (folder && !await made(runtime.project_id, folder.workspace_id)) {
      return query.kind === "directory" && query.path.length === 0 ? { outcome: "directory", entries: [], truncated: false } : { outcome: "missing" };
    }
    return readWorkspaceFile(query, selected);
  };
  if (ports.workspacesFor || workspaceFor) {
    // One id per read, for every caller: the Files, Git and Coding plugins call these two actions as the plugin audience.
    host.registerAction(workspaceReadActions.git, readGit);
    host.registerAction(workspaceReadActions.file, readFile);
  }
  // The Runtime pick does not depend on where the project's folders are kept: it is registered with the other current-project settings.
  host.registerAction(projectSettingsCapabilities.runtime, runtime => new ProjectRuntimeSettings(runtime.store.db).read(runtime.project_id));
  host.registerAction(projectSettingsCapabilities.selectRuntime, async (runtime, [runtimeId], invocation) => {
    await invocation.beforeEffect?.();
    invocation.assertAuthorityCurrent();
    return new ProjectRuntimeSettings(runtime.store.db).select(runtime.project_id, runtimeId);
  });
}
