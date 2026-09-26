import { ProjectBrowsingSettings } from "./project-browsing-settings.js";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import { goalsActions, GOALS_PLUGIN_ID, readGoalResumeFacts, readGoalContractCapability } from "@molis-ai/molis-work-plugin-goals";
import { registerCasebookCapabilities } from './casebook/integration.js';
import { importV3Capability, projectResumeFactsCapability, trashedGoalsCapability, initializeBoardCapability, snapshotBoardCapability,
  goalsEntryCapabilities, goalEntryCompositionCapabilities,
  goalTreeCapabilities,
  readProjectGuidanceCapability, setActiveGoalCapability,
  createGoalIntentCapability, listGoalDirectoryCapability, readGoalEventStateCapability, configureGoalEventsCapability,
  reportGoalEventsCapability, listGoalEventsCapability, listLatestGoalEventsCapability,
  listLatestGoalTimelineCapability, readGoalEventCapability,
  recordGoalProgressCapability, applyGoalConcernCapability, requestGoalDecisionCapability,
  citeGoalDecisionCapability, recordGoalUserDecisionCapability, setGoalEventAgreementCapability,
  submitGoalEventClosureCapability, resumeGoalEventWorkCapability,
  recordGoalNoteCapability } from "@molis-ai/molis-work-plugin-goals";
import { pluginDevelopmentCapability } from "@molis-ai/molis-work-contracts/platform/tooling";
import { projectsCapabilities, projectSettingsCapabilities, projectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { goalContextCapabilities, goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { readWorkspaceFileCapability, readWorkspaceGitCapability } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
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

export function registerProjectCapabilities(
  host: LocalHost<MolisWorkProjectRuntime>,
  ports: ProjectCapabilityPorts = {},
): void {
  registerCasebookCapabilities(host);
  const { workspaceFor } = ports;
  // These typed clients already belong to trusted Host composition. The bridge
  // preserves their audit identity and narrows execution to this exact action.
  const goalAction = <Input, Output>(runtime: MolisWorkProjectRuntime, definition: ActionDefinition<Input, Output>,
    input: Input, identity: { actor_id: string; actor_kind?: "user" | "runtime"; audit_actor_id?: string; runtime_session_id?: string; user_action?: ActionCallContext["user_action"] }, invocation: HostCapabilityInvocation) => {
    const reference = { project_id: runtime.project_id, board_id: runtime.board_id, storage_key: runtime.store.path };
    return bindActionClient(host.actionClient(reference), () => ({ actor_id: identity.actor_id, actor_kind: identity.actor_kind ?? null,
      audit_actor_id: identity.audit_actor_id, runtime_session_id: identity.runtime_session_id,
      ...(identity.user_action ? { user_action: identity.user_action } : {}),
      audience: identity.actor_kind === "runtime" ? "agent" : "user", project_id: runtime.project_id,
      permissions: definition.action.permissions, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version, provider_id: GOALS_PLUGIN_ID }],
      validate_authority: () => invocation.beforeEffect(),
    })).invoke({ ...definition, provider_id: GOALS_PLUGIN_ID }, Object.fromEntries(Object.entries(input as object).filter(([, value]) => value !== undefined)) as Input);
  };
  const checkGoalBoard = (runtime: MolisWorkProjectRuntime, boardId: string) => {
    if (boardId !== runtime.board_id) throw new ActionError("actions.scope_mismatch", "目标请求不属于当前项目");
  };
  host.register(goalProgressCapabilities.record, (runtime, input, invocation) => {
    const { actor_id, actor_kind, ...payload } = input;
    return goalAction(runtime, goalsActions.progress, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(goalProgressCapabilities.receipt, (runtime, input, invocation) => {
    const { actor_id, ...payload } = input;
    return goalAction(runtime, goalsActions.progressReceipt, payload, { actor_id }, invocation);
  });
  host.register(goalContextCapabilities.list, (runtime, input, invocation) => goalAction(runtime, goalsActions.list,
    { limit: 100, ...(input.after_cursor ? { after_cursor: input.after_cursor } : {}) }, { actor_id: "local-host" }, invocation));
  host.register(goalContextCapabilities.read, async (runtime, input, invocation) => {
    const { goal } = await goalAction(runtime, goalsActions.contract, { goal_id: input.goal_id }, { actor_id: "local-host" }, invocation);
    if (!goal || goal.trashed_at || goal.archived_at) throw new Error("这个目标已归档、删除或不属于当前项目，请重新选择");
    const { observed_event_cursor: _cursor, ...state } = await goalAction(runtime, goalsActions.state, { goal_id: goal.goal_id }, { actor_id: "local-host" }, invocation);
    return { goal, state };
  });
  if (ports.workspacesFor || workspaceFor) host.register(readWorkspaceGitCapability, async (runtime, query) => {
    const current = async () => ports.workspacesFor ? await ports.workspacesFor(runtime.project_id) : [await workspaceFor!(runtime.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    const granted = await current(), result = await readWorkspaceGit(query, granted);
    const accepted = granted.find(item => item.workspace_id === query.workspace_id);
    if (!(await current()).some(item => item.workspace_id === query.workspace_id && item.realpath_verified && item.canonical_path === accepted?.canonical_path)) return { outcome: "denied", message: "工作区授权已变化，请重新读取" };
    return result;
  });
  if (ports.workspacesFor || workspaceFor) host.register(readWorkspaceFileCapability, async (runtime, query) => {
    const selected = ports.workspacesFor ? await ports.workspacesFor(runtime.project_id) : [await workspaceFor!(runtime.project_id)].filter((item): item is ProjectWorkspaceRef => item !== null);
    return readWorkspaceFile(query, selected);
  });
  if (ports.workspacesFor) {
    const list = async (runtime: MolisWorkProjectRuntime) => (await ports.workspacesFor!(runtime.project_id)).map(projectWorkspaceRef);
    host.register(projectsCapabilities.listWorkspaces, list);
    host.register(projectSettingsCapabilities.workspaces, list);
    host.register(projectSettingsCapabilities.browsingWorkspace, async (runtime) => {
      return new ProjectBrowsingSettings(runtime.store.db).read(runtime.board_id, await list(runtime));
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
    runtime.coordinator.initializeBoard({ board_id: input.board_id, title: "Plugin Development",
      actor_id: input.actor_id, idempotency_key: "plugin-development-board" });
    const privateStorage = new SqlitePluginPrivateStorage(runtime.store.db);
    const reference = { project_id: runtime.project_id, board_id: runtime.board_id, storage_key: runtime.store.path };
    return runPluginDevelopment(input, { board_id: input.board_id, actor_id: input.actor_id,
      actions: { registry: host.actionRegistry(reference), client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: runtime.project_id },
      artifacts: runtime.coordinator.artifacts, ui: new UiHost(),
      repository: new SqlitePluginRuntimeRepository(runtime.store.db),
      privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
  });
  host.register(goalsEntryCapabilities.commands.addProjectGuidance, (runtime, [input], invocation) => {
    const { board_id, actor_id, ...payload } = input; checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.guidanceAdd, payload, { actor_id }, invocation);
  });
  host.register(goalsEntryCapabilities.commands.updateProjectGuidance, (runtime, [input], invocation) => {
    const { board_id, actor_id, ...payload } = input; checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.guidanceUpdate, payload, { actor_id }, invocation);
  });
  host.register(goalsEntryCapabilities.planning.saveProjectMethod, (runtime, [input], invocation) => {
    const { board_id, actor_id, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.planningSave, payload, { actor_id }, invocation);
  });
  host.register(goalsEntryCapabilities.planning.analyzeChange, (runtime, [boardId, changedGoalIds], invocation) => {
    checkGoalBoard(runtime, boardId);
    return goalAction(runtime, goalsActions.planningImpact, { changed_goal_ids: [...changedGoalIds] }, { actor_id: "local-host" }, invocation);
  });
  host.register(goalsEntryCapabilities.planning.validateBoardGraph, (runtime, [boardId], invocation) => {
    checkGoalBoard(runtime, boardId);
    return goalAction(runtime, goalsActions.planningGraph, {}, { actor_id: "local-host" }, invocation);
  });
  host.register(goalEntryCompositionCapabilities.setTrashedWithWorkState, async (runtime, [boardId, input, write], invocation) => {
    checkGoalBoard(runtime, boardId);
    const result = await goalAction(runtime, goalsActions.trash, { ...input, user_confirmed: true, idempotency_key: write.idempotency_key }, write, invocation);
    return { result, work_state: { goal_id: result.goal.goal_id, status: result.status === "trashed" || result.goal.trashed_at ? "trashed" : "open" } };
  });
  host.register(goalEntryCompositionCapabilities.readPlanningComposition, (runtime, [boardId], invocation) => {
    checkGoalBoard(runtime, boardId);
    return goalAction(runtime, goalsActions.planningRead, {}, { actor_id: "local-host" }, invocation);
  });
  host.register(goalTreeCapabilities.submitGoalTreeProposal, (runtime, [input], invocation) => {
    const { board_id, actor_id, submitted_session_id, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.treeSubmit, payload, { actor_id, runtime_session_id: submitted_session_id }, invocation);
  });
  host.register(goalTreeCapabilities.listGoalTreeProposals, (runtime, [{ board_id, ...query }], invocation) => {
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.treeRead, query, { actor_id: "local-host" }, invocation);
  });
  host.register(goalTreeCapabilities.checkGoalTreeProposal, (runtime, [{ board_id, actor_id, ...input }], invocation) => {
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.treeCheck, input, { actor_id }, invocation);
  });
  host.register(goalTreeCapabilities.decideGoalTreeProposal, (runtime, [{ board_id, authority, runtime_actor_id, ...input }], invocation) => {
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.treeDecide, input, { actor_id: authority.actor_id, actor_kind: authority.actor_kind,
      audit_actor_id: runtime_actor_id ?? undefined, user_action: { source: authority.authority_source,
        conversation_ref: authority.conversation_ref, message_ref: authority.message_ref,
        whole_confirmation_prompted: authority.whole_confirmation_prompted, prompted_subject_id: authority.prompted_proposal_id } }, invocation);
  });
  host.register(readProjectGuidanceCapability, (runtime, input, invocation) => {
    checkGoalBoard(runtime, input.board_id);
    return goalAction(runtime, goalsActions.guidanceRead, {}, { actor_id: "local-host" }, invocation);
  });
  host.register(setActiveGoalCapability, (runtime, input, invocation) => {
    checkGoalBoard(runtime, input.board_id);
    return goalAction(runtime, goalsActions.active, { ...input.goal, idempotency_key: input.write.idempotency_key }, input.write, invocation);
  });
  const managementIdentity = (runtime: MolisWorkProjectRuntime, actorId: string, key: string) => ({
    actor_id: actorId, actor_kind: "user" as const, user_action: { source: "management" as const,
      conversation_ref: `management:${runtime.board_id}`, message_ref: `management:${key}` },
  });
  host.register(initializeBoardCapability, (runtime, { board_id, actor_id, ...input }, invocation) => {
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.initialize, input, managementIdentity(runtime, actor_id, input.idempotency_key), invocation);
  });
  host.register(snapshotBoardCapability, (runtime, input, invocation) => {
    checkGoalBoard(runtime, input.board_id);
    return goalAction(runtime, goalsActions.snapshot, {}, { actor_id: "local-host" }, invocation);
  });
  host.register(readGoalContractCapability, (runtime, input, invocation) => {
    checkGoalBoard(runtime, input.board_id);
    return goalAction(runtime, goalsActions.contract, { goal_id: input.goal_id }, { actor_id: "local-host" }, invocation);
  });
  host.register(importV3Capability, (runtime, { target_board_id, actor_id, ...input }, invocation) => {
    checkGoalBoard(runtime, target_board_id);
    return goalAction(runtime, goalsActions.importV3, input, managementIdentity(runtime, actor_id, input.idempotency_key), invocation);
  });
  host.register(projectResumeFactsCapability, async (runtime, input, invocation) => {
    checkGoalBoard(runtime, input.board_id);
    return readGoalResumeFacts({ invoke: (definition, query) => goalAction(runtime, definition, query, { actor_id: "local-host" }, invocation) }, input.focus_goal_ids);
  });
  host.register(trashedGoalsCapability, (runtime, input, invocation) => {
    checkGoalBoard(runtime, input.board_id);
    return goalAction(runtime, goalsActions.trashed, {}, { actor_id: "local-host" }, invocation);
  });
  host.register(createGoalIntentCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.create, { ...payload, source_kind: payload.source_kind ?? "web" }, { actor_id, actor_kind }, invocation);
  });
  host.register(listGoalDirectoryCapability, (runtime, input, invocation) => {
    const { board_id, ...query } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.list, query, { actor_id: "local-host" }, invocation);
  });
  host.register(readGoalEventStateCapability, (runtime, input, invocation) => {
    const { board_id, ...query } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.state, query, { actor_id: "local-host" }, invocation);
  });
  host.register(configureGoalEventsCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.configure, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(reportGoalEventsCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.report, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(listGoalEventsCapability, (runtime, input, invocation) => {
    const { board_id, ...query } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.events, query, { actor_id: "local-host" }, invocation);
  });
  host.register(listLatestGoalEventsCapability, (runtime, input, invocation) => {
    const { board_id, ...query } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.latestEvents, query, { actor_id: "local-host" }, invocation);
  });
  host.register(listLatestGoalTimelineCapability, (runtime, input, invocation) => {
    const { board_id, ...query } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.timeline, query, { actor_id: "local-host" }, invocation);
  });
  host.register(readGoalEventCapability, (runtime, input, invocation) => {
    const { board_id, ...query } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.event, query, { actor_id: "local-host" }, invocation);
  });
  host.register(recordGoalProgressCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.progress, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(applyGoalConcernCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.concern, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(requestGoalDecisionCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.requestDecision, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(citeGoalDecisionCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.citeDecision, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(recordGoalUserDecisionCapability, (runtime, input, invocation) => {
    const { board_id, authority, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    if (!authority) throw new ActionError("event_decision.untrusted_actor", "用户决定需要受保护入口提供出处");
    return goalAction(runtime, goalsActions.decide, payload, { actor_id: authority.actor_id, actor_kind: authority.actor_kind,
      user_action: { source: authority.authority_source, conversation_ref: authority.conversation_ref, message_ref: authority.message_ref } }, invocation);
  });
  host.register(setGoalEventAgreementCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.agree, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(submitGoalEventClosureCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.close, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(resumeGoalEventWorkCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.resume, payload, { actor_id, actor_kind }, invocation);
  });
  host.register(recordGoalNoteCapability, (runtime, input, invocation) => {
    const { board_id, actor_id, actor_kind, ...payload } = input;
    checkGoalBoard(runtime, board_id);
    return goalAction(runtime, goalsActions.note, payload, { actor_id, actor_kind }, invocation);
  });
  registerHostScheduleCapabilities(host, (runtime) => runtime.store.db);
}
