import { ProjectBrowsingSettings } from "./project-browsing-settings.js";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { registerCasebookCapabilities } from './casebook/integration.js';
import { initializeBoardCapability, snapshotBoardCapability, goalTreeCapabilities, readProjectGuidanceCapability, setActiveGoalCapability,
  createGoalIntentCapability, recordGoalUserDecisionCapability } from "@molis-ai/molis-work-plugin-goals";
import { pluginDevelopmentCapability } from "@molis-ai/molis-work-contracts/platform/tooling";
import { projectsCapabilities, projectSettingsCapabilities, projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { goalContextCapabilities, goalProgressCapabilities, type GoalProgressActor } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { readWorkspaceFileCapability, readWorkspaceGitCapability, workspaceReadActions, type WorkspaceFileQuery, type WorkspaceGitQuery, type WorkspaceGitResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { readConflictFile, readGitSummary, readPullRequestSupport } from "./git-operations.js";
import { readWorkspaceGit } from "./workspace-git.js";
import { readWorkspaceFile } from "./workspace-files.js";
import { SqlitePluginRuntimeRepository, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { runPluginDevelopment } from "./plugin-development.js";
import type { LocalHost } from "./local-host.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { registerHostScheduleCapabilities } from "./schedule-runtime.js";

export interface ProjectCapabilityPorts {
  /** Resolves the workspace a project is bound to. See `MolisWorkLocalHostOptions`. */
  workspacesFor?: (projectId: string) => readonly ProjectWorkspaceRef[] | Promise<readonly ProjectWorkspaceRef[]>;
  workspaceFor?: (projectId: string) => ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
}

/**
 * Only the management entries (the CLI and the management MCP) reach the board and decision capabilities, and they act as the
 * person on this machine: the host fixes that identity and refuses any other carried in the arguments
 * (repository-anti-corruption §9.5 #6; trusted identity comes from the call context, never from input).
 */
function requireLocalPerson(authority: { actor_id: string; actor_kind: string; authority_source: string }, code: string): void {
  if (authority.actor_id !== LOCAL_PERSON_ACTOR_ID || authority.actor_kind !== "user" || authority.authority_source !== "management") {
    throw new ActionError(code, "管理入口以本机这个人的身份决定，不接受参数里的身份或出处");
  }
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

/** The host decides who writes (the person on this machine, or a plugin's own call context); the arguments carry no identity. */
function refusePayloadIdentity(input: object): void {
  if (Object.hasOwn(input, "actor_id") || Object.hasOwn(input, "actor_kind")) {
    throw new ActionError("actions.input_invalid", "写入者由宿主确定（管理入口是本机这个人，插件取自调用上下文），参数里不能带 actor_id 或 actor_kind");
  }
}

function managementIdentity(runtime: MolisWorkProjectRuntime, key: string) {
  return {
    actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, user_action: { source: "management" as const,
      conversation_ref: `management:${runtime.project_id}`, message_ref: `management:${key}` },
  };
}

function managementPayload<Input extends { project_id: string; idempotency_key: string }>(
  runtime: MolisWorkProjectRuntime, input: Input,
): Omit<Input, "project_id"> {
  if (input.project_id !== runtime.project_id) throw new ActionError("actions.scope_mismatch", "目标请求不属于当前项目");
  refusePayloadIdentity(input);
  const { project_id: _board, ...payload } = input;
  return payload;
}

export function registerProjectCapabilities(
  host: LocalHost<MolisWorkProjectRuntime>,
  ports: ProjectCapabilityPorts = {},
): void {
  registerCasebookCapabilities(host);
  const { workspaceFor } = ports;
  // goalAction uses only the identity this registration supplies. Management writes stamp the person on
  // this machine and refuse actor_id or actor_kind in the arguments. Tree submit still forwards the
  // identity its own callers supply. What stays here has a caller in the product (the CLI, the management MCP,
  // the first-run setup, Agent Host's guidance read, Coding); the rest of Goals is reached through its actions.
  const goalAction = <Input, Output>(runtime: MolisWorkProjectRuntime, definition: ActionDefinition<Input, Output>,
    input: Input, identity: { actor_id: string; actor_kind?: "user" | "runtime"; audit_actor_id?: string; runtime_session_id?: string; user_action?: ActionCallContext["user_action"] }, invocation: HostCapabilityInvocation) => {
    const reference = { project_id: runtime.project_id, storage_key: runtime.store.path };
    return bindActionClient(host.actionClient(reference), () => ({ actor_id: identity.actor_id, actor_kind: identity.actor_kind ?? null,
      audit_actor_id: identity.audit_actor_id, runtime_session_id: identity.runtime_session_id,
      ...(identity.user_action ? { user_action: identity.user_action } : {}),
      audience: identity.actor_kind === "runtime" ? "agent" : "user", project_id: runtime.project_id,
      permissions: definition.action.permissions, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id: GOALS_PLUGIN_ID }],
      validate_authority: () => invocation.beforeEffect(),
    })).invoke({ ...definition, provider_id: GOALS_PLUGIN_ID }, Object.fromEntries(Object.entries(input as object).filter(([, value]) => value !== undefined)) as Input);
  };
  const requireRuntimeProject = (runtime: MolisWorkProjectRuntime, projectId: string) => {
    if (projectId !== runtime.project_id) throw new ActionError("actions.scope_mismatch", "目标请求不属于当前项目");
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
  const readFile = async (runtime: MolisWorkProjectRuntime, query: WorkspaceFileQuery) => {
    const selected = ports.workspacesFor ? await ports.workspacesFor(runtime.project_id) : [await workspaceFor!(runtime.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    return readWorkspaceFile(query, selected);
  };
  if (ports.workspacesFor || workspaceFor) {
    // Plugins that consume the Host capabilities keep them; everyone else reads through the same handlers as directory actions.
    host.register(readWorkspaceGitCapability, readGit);
    host.register(readWorkspaceFileCapability, readFile);
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
  host.register(pluginDevelopmentCapability, async (runtime, input) => {
    runtime.coordinator.initializeBoard({ project_id: input.project_id, title: "Plugin Development",
      actor_id: input.actor_id, idempotency_key: "plugin-development-board" });
    const privateStorage = new SqlitePluginPrivateStorage(runtime.store.db);
    const reference = { project_id: runtime.project_id, storage_key: runtime.store.path };
    return runPluginDevelopment(input, { project_id: input.project_id, actor_id: input.actor_id,
      actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: runtime.project_id },
      artifacts: runtime.coordinator.artifacts, processItems: runtime.coordinator.processItems, ui: new UiHost(),
      repository: new SqlitePluginRuntimeRepository(runtime.store.db),
      privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
  });
  host.register(goalTreeCapabilities.submitGoalTreeProposal, (runtime, [input], invocation) => {
    const { project_id, actor_id, submitted_session_id, ...payload } = input;
    requireRuntimeProject(runtime, project_id);
    return goalAction(runtime, goalsActions.treeSubmit, payload, { actor_id, runtime_session_id: submitted_session_id }, invocation);
  });
  host.register(goalTreeCapabilities.listGoalTreeProposals, (runtime, [{ project_id, ...query }], invocation) => {
    requireRuntimeProject(runtime, project_id);
    return goalAction(runtime, goalsActions.treeRead, query, { actor_id: "local-host" }, invocation);
  });
  host.register(goalTreeCapabilities.checkGoalTreeProposal, (runtime, [input], invocation) =>
    goalAction(runtime, goalsActions.treeCheck, managementPayload(runtime, input), managementIdentity(runtime, input.idempotency_key), invocation));
  host.register(goalTreeCapabilities.decideGoalTreeProposal, (runtime, [{ project_id, authority, runtime_actor_id, ...input }], invocation) => {
    requireRuntimeProject(runtime, project_id);
    requireLocalPerson(authority, "goal_tree_proposal.authority_source_invalid");
    return goalAction(runtime, goalsActions.treeDecide, input, { actor_id: authority.actor_id, actor_kind: authority.actor_kind,
      audit_actor_id: runtime_actor_id ?? undefined, user_action: { source: authority.authority_source,
        conversation_ref: authority.conversation_ref, message_ref: authority.message_ref,
        whole_confirmation_prompted: authority.whole_confirmation_prompted, prompted_subject_id: authority.prompted_proposal_id } }, invocation);
  });
  host.register(readProjectGuidanceCapability, (runtime, input, invocation) => {
    requireRuntimeProject(runtime, input.project_id);
    return goalAction(runtime, goalsActions.guidanceRead, {}, { actor_id: "local-host" }, invocation);
  });
  host.register(setActiveGoalCapability, (runtime, input, invocation) => {
    requireRuntimeProject(runtime, input.project_id);
    refusePayloadIdentity(input.write);
    return goalAction(runtime, goalsActions.active, { ...input.goal, idempotency_key: input.write.idempotency_key }, managementIdentity(runtime, input.write.idempotency_key), invocation);
  });
  host.register(initializeBoardCapability, (runtime, { project_id, ...input }, invocation) => {
    requireRuntimeProject(runtime, project_id);
    return goalAction(runtime, goalsActions.initialize, input, managementIdentity(runtime, input.idempotency_key), invocation);
  });
  host.register(snapshotBoardCapability, (runtime, input, invocation) => {
    requireRuntimeProject(runtime, input.project_id);
    return goalAction(runtime, goalsActions.snapshot, {}, { actor_id: "local-host" }, invocation);
  });
  host.register(createGoalIntentCapability, (runtime, input, invocation) => {
    const payload = managementPayload(runtime, input);
    return goalAction(runtime, goalsActions.create, { ...payload, source_kind: payload.source_kind ?? "web" }, managementIdentity(runtime, input.idempotency_key), invocation);
  });
  host.register(recordGoalUserDecisionCapability, (runtime, input, invocation) => {
    const { project_id, authority, ...payload } = input;
    requireRuntimeProject(runtime, project_id);
    if (!authority) throw new ActionError("event_decision.untrusted_actor", "用户决定需要受保护入口提供出处");
    requireLocalPerson(authority, "event_decision.untrusted_actor");
    return goalAction(runtime, goalsActions.decide, payload, { actor_id: authority.actor_id, actor_kind: authority.actor_kind,
      user_action: { source: authority.authority_source, conversation_ref: authority.conversation_ref, message_ref: authority.message_ref } }, invocation);
  });
  registerHostScheduleCapabilities(host, (runtime) => runtime.store.db);
}
