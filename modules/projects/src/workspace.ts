import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import path from "node:path";

import type {
  AddWorkspaceProjectInput,
  ChangeDirectoriesInput,
  DirectoryRole,
  DirectoryTarget,
  ProjectDirectories,
  ProjectWorkspaceDirectoryRecord,
  ProjectWorkspaceMembership,
  ProjectWorkspaceRef,
} from "@molis-ai/molis-work-contracts/modules/projects";
import { projectCatalogErrors as catalogErrors, projectDirectoryErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

import { PROJECT_OUTPUT_PATH_PREFIX, projectOutputId } from "./project-output.js";
import type { ProjectsRepository } from "./repository.js";
import { toolBoundBy, type ProjectDirectoryRow } from "./workspace-repository.js";

/** What a tool's unlink did: only `unlinked` changed anything. The output stays (SSC-17), and so does a relation the person made. */
export type WorkspaceUnlinkOutcome = "unlinked" | "absent" | "output_kept" | "person_kept";

/**
 * A folder a runtime context names, before it is matched to a row: its resolved path and whether `realpathSync.native` could resolve it.
 * `workspace_id` is a key for this path alone (a hash of it), for keying a request; it is never a directory's id, which the catalog gives
 * when the folder is first linked and keeps whatever its path (specs/shared-sources-and-surfaces §3 「目录的 id 和路径脱钩」).
 */
export function normalizeProjectWorkspace(
  input: { canonical_path: string; realpath_verified: boolean } | null | undefined,
): { canonical_path: string; realpath_verified: boolean; display_name: string } | undefined {
  if (!input || typeof input.canonical_path !== "string") return undefined;
  const suppliedPath = input.canonical_path.trim();
  if (!suppliedPath || !path.isAbsolute(suppliedPath)) return undefined;
  let canonicalPath = path.resolve(suppliedPath);
  let realpathVerified = false;
  try {
    canonicalPath = realpathSync.native(canonicalPath);
    realpathVerified = true;
  } catch {
    realpathVerified = input.realpath_verified === true;
  }
  // No folder id: a path names its row only through `workspaceIdAt` (§3 「路径到行」).
  return {
    canonical_path: canonicalPath,
    realpath_verified: realpathVerified,
    display_name: path.basename(canonicalPath) || canonicalPath,
  };
}

const inside = (relative: string) => relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

/**
 * A project's directories: which folders are its inputs and which one is its output (specs/shared-sources-and-surfaces §3). Every write
 * that names a folder by path goes through `link`, which finds the folder's row by its verified path; a folder gets its id when it is
 * first linked and keeps it, so `repair` moves the row and every project and reference follows.
 */
export class ProjectWorkspaceService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly now: () => string,
    private readonly id: (prefix: string) => string,
    /** The root Home: a folder named for another device's directory may neither be in it nor hold it (SSC-27). */
    private readonly rootHomeDirectory: string,
  ) {}

  listMemberships(): ProjectWorkspaceMembership[] {
    return this.repository.workspaces.listWorkspaceMemberships();
  }

  listDirectory(projectId?: string): ProjectWorkspaceDirectoryRecord[] {
    return this.repository.workspaces.listWorkspaceDirectory(projectId?.trim() || undefined);
  }

  /** The project's inputs and output as `projects.directories.get@1` answers them; a folder's state is looked at now. */
  directories(projectId: string): ProjectDirectories {
    const id = this.requiredProjectId(projectId);
    const rows = this.repository.workspaces.projectDirectoryRows(id);
    const sourceLinks = this.repository.workspaces.sourceLinks(id);
    return {
      project_id: id,
      directories: rows.map(row => ({ workspace_id: row.workspace_id, canonical_path: row.canonical_path, realpath_verified: row.realpath_verified,
        display_name: row.display_name, roles: row.roles, state: this.state(row) })),
      source_links: sourceLinks,
      revision: revisionOf(rows, sourceLinks),
    };
  }

  /** Where a read, a write or a run that names no folder goes. Every registered project has one; a project in the recycle bin answers none. */
  outputDirectory(projectId: string): ProjectWorkspaceRef {
    const output = this.repository.workspaces.projectDirectoryRows(this.requiredProjectId(projectId)).find(row => row.roles.includes("output"));
    if (!output) throw catalogErrors.project_storage_invalid("这个项目没有输出目录（项目可能在回收站里）");
    return { workspace_id: output.workspace_id, canonical_path: output.canonical_path, realpath_verified: output.realpath_verified, display_name: output.display_name };
  }

  /** A folder the person linked from a trusted entry (the first-run page, a writer's directory): an input of the project. */
  add(input: AddWorkspaceProjectInput): ProjectWorkspaceDirectoryRecord {
    const projectId = this.requiredProjectId(input.project_id);
    const actorId = this.requiredActorId(input.actor_id);
    this.requireConfirmation(input.user_confirmed, "只有用户明确确认后才能关联工作目录");
    const linked = this.repository.transaction(() => this.link(projectId, actorId, input.canonical_path, "explicit", ["input"]));
    return this.requireDirectory(linked!.workspace_id);
  }

  /** One change of `projects.directories.*`, committed from the revision the person read (§3). */
  change(input: ChangeDirectoriesInput): ProjectDirectories {
    const projectId = this.requiredProjectId(input.project_id);
    const actorId = this.requiredActorId(input.actor_id);
    return this.repository.transaction(() => {
      const current = this.directories(projectId);
      if (current.revision !== input.expected_revision) throw new ActionError("actions.conflict", "项目目录已经变了，请刷新后再改");
      const change = input.change;
      switch (change.kind) {
        case "add_input": {
          const linked = this.link(projectId, actorId, change.workspace_path, "explicit", ["input"])!;
          this.addRole(current, linked.workspace_id, projectId, "input");
          break;
        }
        case "remove_input": this.removeInput(current, change.workspace_id, projectId, actorId); break;
        case "set_output": this.setOutput(current, change.target, projectId, actorId); break;
        case "repair": this.repair(current, change.workspace_id, change.workspace_path, actorId); break;
        case "map_source": this.mapSource(current, change.source_workspace_id, change.target, projectId, actorId); break;
        case "unmap_source": this.repository.workspaces.removeSourceLink(projectId, change.source_workspace_id); break;
      }
      return this.directories(projectId);
    });
  }

  /**
   * A runtime context's folder, linked when a session or terminal is bound (`session`, `workspace_member`). It cannot be refused, or the
   * terminal could not open: a path that cannot be verified, another project's default output directory and anywhere else inside `outputs`
   * are bound to the session alone and write no row.
   */
  upsertMembership(workspace: { canonical_path: string; realpath_verified: boolean }, projectId: string, actorId: string): void {
    this.link(this.requiredProjectId(projectId), this.requiredActorId(actorId), workspace.canonical_path, "session", ["input"]);
  }

  /**
   * A runtime context's folder stops offering this project: a link a tool brought in goes. The project's output is left as it is: every
   * project keeps its one output (SSC-17), and which folder that is changes only in the project's settings (`set_output`). A relation the
   * person made is left too: a tool cannot narrow what the person linked, they unlink it in the project's settings.
   */
  unlink(workspaceId: string, projectId: string, actorId: string): WorkspaceUnlinkOutcome {
    // The relation is read once; one this project does not list is absent (a project in the recycle bin lists none).
    return this.repository.transaction(() => {
      const project = this.requiredProjectId(projectId);
      const workspace = this.requiredWorkspaceId(workspaceId);
      const own = this.repository.workspaces.projectDirectoryRows(project).find(row => row.workspace_id === workspace);
      if (!own) return "absent";
      if (own.roles.includes("output")) return "output_kept";
      if (this.repository.workspaces.isPersonMembership(workspace, project)) return "person_kept";
      // Who acted is asked for only when something is recorded, as the event needs it.
      const actor = this.requiredActorId(actorId);
      this.repository.workspaces.removeWorkspaceMembership(workspace, project);
      this.repository.workspaces.removeWorkspaceIfEmpty(workspace);
      this.appendEvent(project, "project.workspace_unlinked", actor, { workspace_id: workspace });
      return "unlinked";
    });
  }

  requireDirectory(workspaceId: string): ProjectWorkspaceDirectoryRecord {
    const record = this.listDirectory().find((workspace) => workspace.workspace_id === workspaceId);
    if (!record) throw catalogErrors.workspace_membership_not_found("找不到这条工作目录记录");
    return record;
  }

  /**
   * Links the folder at `candidate` to the project (§3 「路径到行」) and answers its row, or null when a runtime context binds the session
   * alone. A new link gets `roles`; an existing one keeps its roles. A `session` link is a tool's, the person's own terminal included, and
   * is marked so (`toolBoundBy`); an `explicit` one records its actor, the person on every entry that reaches it. An `explicit` link insists the path resolves and refuses what it may
   * not name: another project's default output directory, or anywhere else inside `outputs` (`projects.directory_duplicate`).
   */
  private link(projectId: string, actorId: string, candidate: string, intent: "explicit" | "session", roles: readonly DirectoryRole[]): { workspace_id: string; created: boolean } | null {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate.trim())) throw catalogErrors.workspace_required("工作目录必须是绝对路径");
    const boundBy = intent === "session" ? toolBoundBy(actorId) : actorId;
    const place = this.repository.workspaces.placeOf(candidate.trim());
    const refuse = (message: string) => { if (intent === "explicit") throw projectDirectoryErrors.directory_duplicate(message); return null; };
    if (place.kind === "inside-outputs") return refuse("这个位置在 Molis Work 的输出目录里，不能单独关联");
    if (place.kind === "project-output") {
      if (place.project_id !== projectId) return refuse("这是另一个项目的默认输出目录，不能关联到这个项目");
      return this.member(place.row?.workspace_id ?? this.ownOutputRow(projectId), projectId, actorId, boundBy, roles);
    }
    let verified = true;
    try { realpathSync.native(place.canonical_path); } catch { verified = false; }
    if (!verified) {
      if (intent === "explicit") throw projectDirectoryErrors.directory_missing("找不到这个文件夹，或没有权限读取它");
      return null;
    }
    let workspaceId = place.row?.workspace_id;
    if (!workspaceId) {
      workspaceId = this.id("workspace");
      this.repository.workspaces.upsertWorkspace({ workspace_id: workspaceId, canonical_path: place.canonical_path, realpath_verified: true,
        display_name: path.basename(place.canonical_path) || place.canonical_path }, this.now());
    }
    return this.member(workspaceId, projectId, actorId, boundBy, roles);
  }

  /** `actorId` acted, as events record it; `boundBy` made the relation. An existing one is written again too, so the person can claim it; only a new one is announced. */
  private member(workspaceId: string, projectId: string, actorId: string, boundBy: string, roles: readonly DirectoryRole[]): { workspace_id: string; created: boolean } {
    const existing = this.repository.workspaces.projectDirectoryRows(projectId).some(row => row.workspace_id === workspaceId);
    this.repository.workspaces.upsertWorkspaceMembership({ membership_id: this.id("workspace-membership"), workspace_id: workspaceId, project_id: projectId, bound_by: boundBy, now: this.now(), roles });
    if (!existing) {
      // A folder that is this project's own is read as itself: a link that named it for another device's id goes.
      this.repository.workspaces.removeSourceLink(projectId, workspaceId);
      this.appendEvent(projectId, "project.workspace_member_bound", actorId, { workspace_id: workspaceId });
    }
    return { workspace_id: workspaceId, created: !existing };
  }

  private addRole(current: ProjectDirectories, workspaceId: string, projectId: string, role: DirectoryRole): void {
    const before = current.directories.find(item => item.workspace_id === workspaceId);
    if (before && !before.roles.includes(role)) this.repository.workspaces.setMembershipRoles(workspaceId, projectId, [...before.roles, role], this.now());
  }

  private removeInput(current: ProjectDirectories, workspaceId: string, projectId: string, actorId: string): void {
    const directory = current.directories.find(item => item.workspace_id === workspaceId);
    if (!directory?.roles.includes("input")) throw catalogErrors.workspace_membership_not_found("这个目录不是当前项目的输入目录");
    if (directory.roles.includes("output")) {
      this.repository.workspaces.setMembershipRoles(workspaceId, projectId, ["output"], this.now());
      return;
    }
    this.repository.workspaces.removeWorkspaceMembership(workspaceId, projectId);
    this.repository.workspaces.removeWorkspaceIfEmpty(workspaceId);
    this.appendEvent(projectId, "project.workspace_unlinked", actorId, { workspace_id: workspaceId });
  }

  /**
   * Makes the target the project's one output. The old output stays an input when it was one; otherwise its link goes, and its row with it when
   * no project is left (the files stay where they are, WMD-09). Setting the default back needs no path: its id is computed again.
   */
  private setOutput(current: ProjectDirectories, target: DirectoryTarget, projectId: string, actorId: string): void {
    const previous = current.directories.find(item => item.roles.includes("output"));
    const chosen = this.target(current, target, projectId, actorId);
    if (previous?.workspace_id === chosen.workspace_id) return;
    if (previous) {
      if (previous.roles.includes("input")) this.repository.workspaces.setMembershipRoles(previous.workspace_id, projectId, ["input"], this.now());
      else {
        this.repository.workspaces.removeWorkspaceMembership(previous.workspace_id, projectId);
        this.repository.workspaces.removeWorkspaceIfEmpty(previous.workspace_id);
      }
    }
    const kept = chosen.created ? [] : current.directories.find(item => item.workspace_id === chosen.workspace_id)?.roles.filter(role => role === "input") ?? [];
    this.repository.workspaces.setMembershipRoles(chosen.workspace_id, projectId, [...kept, "output"], this.now());
    this.appendEvent(projectId, "project.workspace_output_set", actorId, { workspace_id: chosen.workspace_id, previous_workspace_id: previous?.workspace_id ?? null });
  }

  /** A `DirectoryTarget` as one of this project's folders: an existing one, a path linked now (as an input), or the default output directory. */
  private target(current: ProjectDirectories, target: DirectoryTarget, projectId: string, actorId: string): { workspace_id: string; created: boolean } {
    if ("workspace_id" in target) {
      if (!current.directories.some(item => item.workspace_id === target.workspace_id)) throw catalogErrors.workspace_membership_not_found("这个文件夹不是当前项目的目录");
      return { workspace_id: target.workspace_id, created: false };
    }
    if ("workspace_path" in target) return this.link(projectId, actorId, target.workspace_path, "explicit", ["input"])!;
    return this.member(this.ownOutputRow(projectId), projectId, actorId, actorId, ["input"]);
  }

  /** The row of this project's default output directory, written again under the same id when it went with an earlier change of output. */
  private ownOutputRow(projectId: string): string {
    const workspaceId = projectOutputId(this.repository.db, projectId);
    if (!this.repository.workspaces.workspace(workspaceId)) {
      this.repository.workspaces.upsertWorkspace({ workspace_id: workspaceId, canonical_path: `${PROJECT_OUTPUT_PATH_PREFIX}${projectId}`, realpath_verified: false, display_name: "project-output" }, this.now());
    }
    return workspaceId;
  }

  /** The folder moved: only a folder that is gone may be repaired, its id stays, and every project linked to it follows (§3). */
  private repair(current: ProjectDirectories, workspaceId: string, workspacePath: string, actorId: string): void {
    const directory = current.directories.find(item => item.workspace_id === workspaceId);
    if (!directory) throw catalogErrors.workspace_membership_not_found("这个文件夹不是当前项目的目录");
    if (directory.state !== "missing") throw new ActionError("actions.input_invalid", "这个文件夹还在原处，不用修复；要换成别的文件夹，先移除再添加");
    if (typeof workspacePath !== "string" || !path.isAbsolute(workspacePath.trim())) throw catalogErrors.workspace_required("新的工作目录必须是绝对路径");
    const place = this.repository.workspaces.placeOf(workspacePath.trim());
    if (place.kind !== "folder") throw projectDirectoryErrors.directory_duplicate("不能把文件夹修到 Molis Work 的输出目录里");
    try { realpathSync.native(place.canonical_path); } catch { throw projectDirectoryErrors.directory_missing("找不到新的位置，或没有权限读取它"); }
    if (place.row) throw projectDirectoryErrors.directory_duplicate("新的位置已经是另一个目录，不会合并两个目录");
    if (this.repository.workspaces.hasSourceLinks(workspaceId)) this.assertOutsideHome(place.canonical_path);
    this.repository.workspaces.repairWorkspacePath(workspaceId, place.canonical_path, path.basename(place.canonical_path) || place.canonical_path, this.now());
    for (const projectId of this.repository.workspaces.projectsOf(workspaceId)) {
      this.appendEvent(projectId, "project.workspace_path_repaired", actorId, { workspace_id: workspaceId });
    }
  }

  /** Names this project's folder for another device's directory (§3 「另一台设备上的引用」); the user only, by the action's declaration. */
  private mapSource(current: ProjectDirectories, sourceWorkspaceId: string, target: DirectoryTarget, projectId: string, actorId: string): void {
    if (current.directories.some(item => item.workspace_id === sourceWorkspaceId)) throw projectDirectoryErrors.directory_duplicate("这个目录已经是当前项目的文件夹，不需要指定");
    const ownOutput = projectOutputId(this.repository.db, projectId);
    if ("workspace_path" in target) {
      const place = this.repository.workspaces.placeOf(target.workspace_path.trim());
      if (place.kind === "folder") {
        try { this.assertOutsideHome(realpathSync.native(place.canonical_path)); } catch (error) {
          if (error instanceof ActionError) throw error;
          throw projectDirectoryErrors.directory_missing("找不到这个文件夹，或没有权限读取它");
        }
      }
    }
    const chosen = this.target(current, target, projectId, actorId);
    if (chosen.workspace_id === sourceWorkspaceId) return;
    if (chosen.workspace_id !== ownOutput) {
      const folder = this.repository.workspaces.workspace(chosen.workspace_id);
      if (folder) this.assertOutsideHome(folder.canonical_path);
    }
    this.repository.workspaces.upsertSourceLink({ project_id: projectId, source_workspace_id: sourceWorkspaceId, workspace_id: chosen.workspace_id, actor_id: actorId, now: this.now() });
  }

  /**
   * A folder named for another device's directory reads that device's relative paths: it may not be inside the root Home (an account Home
   * is inside it) nor hold it. Both sides by `realpathSync.native`, which folds case.
   */
  private assertOutsideHome(folder: string): void {
    let home = this.rootHomeDirectory, target = folder;
    try { home = realpathSync.native(home); } catch { /* compared as given */ }
    try { target = realpathSync.native(target); } catch { /* compared as given */ }
    if (inside(path.relative(home, target)) || inside(path.relative(target, home))) {
      throw new ActionError("actions.input_invalid", "这个文件夹和 Molis Work 的数据目录互相包含，不能用来对应另一台设备的文件夹");
    }
  }

  private state(row: ProjectDirectoryRow): "ok" | "missing" {
    if (row.stored_path !== row.canonical_path) return "ok";
    try { return statSync(row.canonical_path).isDirectory() ? "ok" : "missing"; } catch { return "missing"; }
  }

  private appendEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void {
    this.repository.projects.appendEvent({
      event_id: this.id("project-event"),
      project_id: projectId,
      type,
      actor_id: actorId,
      payload,
      created_at: this.now(),
    });
  }

  private requireConfirmation(value: boolean, message: string): void {
    if (value !== true) throw catalogErrors.user_confirmation_required(message);
  }

  private requiredProjectId(value: string): string {
    const projectId = value.trim();
    if (!projectId) throw catalogErrors.project_not_found("项目 ID 不能为空");
    if (!this.repository.projects.getProject(projectId)) throw catalogErrors.project_not_found("找不到 Molis Work 项目");
    return projectId;
  }

  private requiredWorkspaceId(value: string): string {
    const workspaceId = value.trim();
    if (!workspaceId) throw catalogErrors.workspace_required("必须选择一个项目目录");
    return workspaceId;
  }

  private requiredActorId(value: string): string {
    const actorId = value.trim();
    if (!actorId) throw catalogErrors.user_confirmation_required("项目操作必须记录执行者");
    return actorId;
  }
}

/** A project's directories as a revision: the rows and links that make them up, never a folder's live state. */
function revisionOf(rows: readonly ProjectDirectoryRow[], links: readonly { source_workspace_id: string; workspace_id: string }[]): string {
  const facts = { rows: rows.map(row => [row.workspace_id, row.stored_path, row.display_name, row.roles]).sort(), links: links.map(link => [link.source_workspace_id, link.workspace_id]).sort() };
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 32);
}
