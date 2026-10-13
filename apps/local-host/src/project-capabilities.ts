import { ProjectBrowsingSettings } from "./project-browsing-settings.js";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { projectsCapabilities, projectSettingsCapabilities, projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { goalContextCapabilities, goalProgressCapabilities, type GoalProgressActor } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { workspaceReadActions, type WorkspaceFileQuery, type WorkspaceGitQuery, type WorkspaceGitResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { readConflictFile, readGitSummary, readPullRequestSupport } from "./git-operations.js";
import { readWorkspaceGit } from "./workspace-git.js";
import { readWorkspaceFile } from "./workspace-files.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { registerHostScheduleCapabilities } from "./schedule-runtime.js";
import { refusePayloadIdentity } from "./goals-actions.js";

export interface ProjectCapabilityPorts {
  /** Resolves the workspace a project is bound to. See `MolisWorkLocalHostOptions`. */
  workspacesFor?: (projectId: string) => readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor?: (projectId: string) => ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
}

/**
 * Who a Goal progress call acts as. A plugin acts as the actor its own call context carries (the person whose page it serves)
 * and cannot name another; the arguments hold no identity for it. A Host-direct receipt lookup (the CLI, MCP and tests) still
 * names the actor it reads for. Recording is different: no caller names its actor (see the record handler).
 */
function progressActor(named: GoalProgressActor, invocation: HostCapabilityInvocation): { actor_id: string; actor_kind?: "user" | "runtime" } {
  if (invocation.consumer !== "plugin") {
    if (!named.actor_id) throw new ActionError("actions.unauthenticated", "缺少调用者身份");
    return { actor_id: named.actor_id, actor_kind: named.actor_kind };
  }
  if (!invocation.plugin) throw new ActionError("actions.forbidden", "插件调用缺少调用上下文，不能记录目标进展");
  if (named.actor_id !== undefined || named.actor_kind !== undefined) throw new ActionError("actions.input_invalid", "插件的调用者身份来自调用上下文，参数里不能带 actor_id 或 actor_kind");
  return { actor_id: invocation.plugin.actor_id, actor_kind: "user" };
}

function managementIdentity(runtime: MolisWorkProjectRuntime, key: string) {
  return {
    actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, user_action: { source: "management" as const,
      conversation_ref: `management:${runtime.project_id}`, message_ref: `management:${key}` },
  };
}

export function registerProjectCapabilities(
  host: LocalHost<MolisWorkProjectRuntime>,
  ports: ProjectCapabilityPorts = {},
): void {
  const { workspaceFor } = ports;
  // Coding's four remaining typed protocols forward to the same Goals actions and preserve their trusted caller.
  const goalAction = <Input, Output>(runtime: MolisWorkProjectRuntime, definition: ActionDefinition<Input, Output>,
    input: Input, identity: { actor_id: string; actor_kind?: "user" | "runtime"; audit_actor_id?: string; runtime_session_id?: string; user_action?: ActionCallContext["user_action"] }, invocation: HostCapabilityInvocation) => {
    const reference = { project_id: runtime.project_id, storage_key: runtime.store.path };
    return bindActionClient(host.actionClient(reference), () => ({ actor_id: identity.actor_id, actor_kind: identity.actor_kind ?? null,
      audit_actor_id: identity.audit_actor_id, runtime_session_id: identity.runtime_session_id,
      ...(identity.user_action ? { user_action: identity.user_action } : {}),
      audience: identity.actor_kind === "runtime" ? "agent" : "user", project_id: runtime.project_id,
      permissions: definition.action.permissions, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id: GOALS_PLUGIN_ID }],
      validate_authority: () => invocation.beforeEffect(),
      assert_authority_current: () => invocation.assertAuthorityCurrent(),
    })).invoke({ ...definition, provider_id: GOALS_PLUGIN_ID }, Object.fromEntries(Object.entries(input as object).filter(([, value]) => value !== undefined)) as Input);
  };
  host.register(goalProgressCapabilities.record, (runtime, input, invocation) => {
    // A plugin acts as the actor its own call context carries; every other caller is the management door and acts as the person
    // on this machine. Neither names an actor in the arguments.
    const writer = invocation.consumer === "plugin" ? progressActor({}, invocation) : managementIdentity(runtime, input.idempotency_key);
    refusePayloadIdentity(input);
    return goalAction(runtime, goalsActions.progress, input, writer, invocation);
  });
  host.register(goalProgressCapabilities.receipt, (runtime, input, invocation) => {
    const { actor_id, ...payload } = input;
    return goalAction(runtime, goalsActions.progressReceipt, payload, progressActor({ actor_id }, invocation), invocation);
  });
  host.register(goalContextCapabilities.list, (runtime, input, invocation) => goalAction(runtime, goalsActions.list,
    { limit: 100, ...(input.after_cursor ? { after_cursor: input.after_cursor } : {}) }, { actor_id: "local-host" }, invocation));
  host.register(goalContextCapabilities.read, async (runtime, input, invocation) => {
    const { goal } = await goalAction(runtime, goalsActions.contract, { goal_id: input.goal_id }, { actor_id: "local-host" }, invocation);
    if (!goal || goal.trashed_at || goal.archived_at) throw new Error("这个目标已归档、删除或不属于当前项目，请重新选择");
    const { observed_event_cursor: _cursor, ...state } = await goalAction(runtime, goalsActions.state, { goal_id: goal.goal_id }, { actor_id: "local-host" }, invocation);
    return { goal, state };
  });
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
    host.register(workspaceReadActions.git, readGit);
    host.register(workspaceReadActions.file, readFile);
  }
  if (ports.workspacesFor) {
    const list = async (runtime: MolisWorkProjectRuntime) => (await ports.workspacesFor!(runtime.project_id)).map(projectWorkspaceRef);
    host.register(projectsCapabilities.listWorkspaces, list);
    host.register(projectSettingsCapabilities.workspaces, list);
    host.register(projectSettingsCapabilities.browsingWorkspace, async (runtime) => {
      return new ProjectBrowsingSettings(runtime.store.db).read(runtime.project_id, await list(runtime));
    });
    host.register(projectSettingsCapabilities.selectBrowsingWorkspace, async (runtime, [workspaceId], invocation) => {
      const workspaces = await list(runtime);
      if (!workspaces.some(item => item.workspace_id === workspaceId && item.realpath_verified)) throw new ActionError("projects.workspace_unavailable", "请选择当前项目已关联且可用的工作目录");
      await invocation.beforeEffect?.();
      invocation.assertAuthorityCurrent();
      return new ProjectBrowsingSettings(runtime.store.db).select(runtime.project_id, workspaceId, workspaces);
    });
  }
  if (workspaceFor !== undefined) {
    // Scoped to the runtime's own project: the Capability takes no project id,
    // so a Plugin cannot ask about another project. The answer carries the
    // verified path and nothing a Plugin could widen into a write.
    host.register(projectsCapabilities.readWorkspace, async (runtime) => {
      const workspace = await workspaceFor(runtime.project_id);
      return workspace ? projectWorkspaceRef(workspace) : null;
    });
  }
  registerHostScheduleCapabilities(host, (runtime) => runtime.store.db);
}
