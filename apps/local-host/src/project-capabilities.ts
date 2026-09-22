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
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { goalContextCapabilities, goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { readWorkspaceFileCapability, readWorkspaceGitCapability } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { readWorkspaceGit } from "./workspace-git.js";
import { readWorkspaceFile } from "./workspace-files.js";
import { SqlitePluginRuntimeRepository, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { runPluginDevelopment } from "./plugin-development.js";
import { importV3Board } from "./board-v3-import.js";
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
  host.register(goalProgressCapabilities.record, (runtime, input) => runtime.coordinator.goalEvents.recordProgress({
    ...input, board_id: runtime.board_id,
  }));
  host.register(goalProgressCapabilities.receipt, (runtime, input) => runtime.coordinator.goalEvents.readProgressReceipt(
    runtime.board_id, input.goal_id, input.actor_id, input.idempotency_key,
  ));
  host.register(goalContextCapabilities.list, (runtime, input) => runtime.coordinator.goalEvents.listGoals({
    board_id: runtime.board_id, limit: 100, ...(input.after_cursor ? { after_cursor: input.after_cursor } : {}),
  }));
  host.register(goalContextCapabilities.read, (runtime, input) => {
    const goal = runtime.coordinator.goalQueries.getGoal(runtime.board_id, input.goal_id);
    if (!goal || goal.trashed_at || goal.archived_at) throw new Error("这个目标已归档、删除或不属于当前项目，请重新选择");
    const { observed_event_cursor: _cursor, ...state } = runtime.coordinator.goalEvents.readState(runtime.board_id, goal.goal_id);
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
  if (ports.workspacesFor) host.register(projectsCapabilities.listWorkspaces, runtime => ports.workspacesFor!(runtime.project_id));
  if (workspaceFor !== undefined) {
    // Scoped to the runtime's own project: the Capability takes no project id,
    // so a Plugin cannot ask about another project. The answer carries the
    // verified path and nothing a Plugin could widen into a write.
    host.register(projectsCapabilities.readWorkspace, (runtime) =>
      workspaceFor(runtime.project_id));
  }
  host.register(pluginDevelopmentCapability, async (runtime, input) => {
    runtime.coordinator.initializeBoard({ board_id: input.board_id, title: "Plugin Development",
      actor_id: input.actor_id, idempotency_key: "plugin-development-board" });
    const privateStorage = new SqlitePluginPrivateStorage(runtime.store.db);
    return runPluginDevelopment(input, { board_id: input.board_id, actor_id: input.actor_id,
      artifacts: runtime.coordinator.artifacts, ui: new UiHost(),
      repository: new SqlitePluginRuntimeRepository(runtime.store.db),
      privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) });
  });
  host.register(goalsEntryCapabilities.commands.addProjectGuidance, (runtime, input) =>
    runtime.coordinator.goals.commands.addProjectGuidance(...input));
  host.register(goalsEntryCapabilities.commands.updateProjectGuidance, (runtime, input) =>
    runtime.coordinator.goals.commands.updateProjectGuidance(...input));
  host.register(goalsEntryCapabilities.planning.saveProjectMethod, (runtime, input) =>
    runtime.coordinator.goals.planning.saveProjectMethod(...input));
  host.register(goalsEntryCapabilities.planning.analyzeChange, (runtime, input) =>
    runtime.coordinator.goals.planning.analyzeChange(...input));
  host.register(goalsEntryCapabilities.planning.validateBoardGraph, (runtime, input) =>
    runtime.coordinator.goals.planning.validateBoardGraph(...input));
  host.register(goalEntryCompositionCapabilities.setTrashedWithWorkState, (runtime, input) => {
    const result = runtime.coordinator.goals.lifecycle.setTrashed(...input);
    return {
      result,
      work_state: {
        goal_id: result.goal.goal_id,
        status: result.status === "trashed" || result.goal.trashed_at ? "trashed" : "open",
      },
    };
  });
  host.register(goalEntryCompositionCapabilities.readPlanningComposition, (runtime, [boardId]) => ({
    methods: runtime.coordinator.goals.planning.effectiveMethods(boardId),
    composition: runtime.coordinator.goals.planning.projectComposition(boardId),
  }));
  host.register(goalTreeCapabilities.submitGoalTreeProposal, (runtime, input) =>
    runtime.coordinator.goalTreeSubmission.submitGoalTreeProposal(...input));
  host.register(goalTreeCapabilities.listGoalTreeProposals, (runtime, input) =>
    runtime.coordinator.goalTree.listGoalTreeProposals(...input));
  host.register(goalTreeCapabilities.checkGoalTreeProposal, (runtime, input) =>
    runtime.coordinator.goalTreeCheck.checkGoalTreeProposal(...input));
  host.register(goalTreeCapabilities.decideGoalTreeProposal, (runtime, input) =>
    runtime.coordinator.goalTreeDecision.decideGoalTreeProposal(...input));
  host.register(readProjectGuidanceCapability, (runtime, input) =>
    runtime.coordinator.goalQueries.readProjectGuidance(input.board_id));
  host.register(setActiveGoalCapability, (runtime, input) =>
    runtime.coordinator.setActiveGoal(input.board_id, input.goal, input.write));
  host.register(initializeBoardCapability, (runtime, input) =>
    runtime.coordinator.initializeBoard(input));
  host.register(snapshotBoardCapability, (runtime, input) =>
    runtime.store.snapshot(input.board_id));
  host.register(importV3Capability, (runtime, { legacy, ...input }) =>
    importV3Board(runtime.store, runtime.coordinator, legacy, input));
  host.register(projectResumeFactsCapability, (runtime, input) => {
    const directory = runtime.coordinator.goalEvents.listGoals({ board_id: input.board_id, limit: 100 });
    const goals = [...directory.goals];
    const seen = new Set(goals.map((item) => item.goal_id));
    for (const goalId of uniqueFocusGoalIds(input.focus_goal_ids)) {
      if (seen.has(goalId)) continue;
      const focused = runtime.coordinator.goalEvents.readDirectoryItem(input.board_id, goalId);
      if (!focused) continue;
      goals.push(focused);
      seen.add(goalId);
    }
    return {
      goals,
      observed_event_cursor: directory.observed_event_cursor,
    };
  });
  host.register(trashedGoalsCapability, (runtime, input) => ({
    goals: runtime.coordinator.goalQueries.listTrashedGoals(input.board_id),
    observed_event_cursor: runtime.store.eventCursor(input.board_id),
  }));
  host.register(createGoalIntentCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.createIntent(input));
  host.register(listGoalDirectoryCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.listGoals(input));
  host.register(readGoalEventStateCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.readState(input.board_id, input.goal_id));
  host.register(configureGoalEventsCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.configure(input));
  host.register(reportGoalEventsCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.report(input));
  host.register(listGoalEventsCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.listEvents(input.board_id, input.goal_id, {
      after_cursor: input.after_cursor,
      limit: input.limit,
    }));
  host.register(listLatestGoalEventsCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.listLatestEvents(input.board_id, input.goal_id, {
      before_cursor: input.before_cursor,
      limit: input.limit,
    }));
  host.register(listLatestGoalTimelineCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.listLatestTimeline(input.board_id, input.goal_id, {
      before_cursor: input.before_cursor,
      limit: input.limit,
    }));
  host.register(readGoalEventCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.readEvent(input.board_id, input.goal_id, input.event_id));
  host.register(recordGoalProgressCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.recordProgress(input));
  host.register(applyGoalConcernCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.applyConcern(input));
  host.register(requestGoalDecisionCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.requestDecision(input));
  host.register(citeGoalDecisionCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.citeDecision(input));
  host.register(recordGoalUserDecisionCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.recordTrustedDecision(input));
  host.register(setGoalEventAgreementCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.setAgreement(input));
  host.register(submitGoalEventClosureCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.submitClosure(input));
  host.register(resumeGoalEventWorkCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.resumeWork(input));
  host.register(recordGoalNoteCapability, (runtime, input) =>
    runtime.coordinator.goalEvents.recordNote(input));
  registerHostScheduleCapabilities(host, (runtime) => runtime.store.db);
}

function uniqueFocusGoalIds(ids: string[] | undefined): string[] {
  const result: string[] = [];
  for (const raw of ids ?? []) {
    const id = raw.trim();
    if (!id || result.includes(id)) continue;
    result.push(id);
    if (result.length === 2) break;
  }
  return result;
}
