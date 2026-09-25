import { SHELF_TEXT_MATERIAL_TYPE } from "@molis-ai/molis-work-contracts/modules/shelf";
import { CHARACTER_ARTIFACT_TYPE } from "@molis-ai/molis-work-contracts/modules/characters";
import { DIFF_CHANGESET_TYPE, GIT_RESULT_TYPE, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_TYPE, writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities, projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { goalContextCapabilities, goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { CODING_GOAL_CONTEXT_TYPE, CODING_PLAN_TYPE } from "./artifacts.js";
import {
  CODING_CHANGESET_TYPE,
  CODING_DIAGRAM_TYPE,
  CODING_REPORT_TYPE,
} from "./artifacts.js";
import { CODING_FILE_CHANGED_EVENT, CODING_PREFERENCE_EVENT, CODING_WORKSPACE_INVALIDATED_EVENT } from "./events.js";
import { codingAgentManifest } from "./roles.js";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, CODING_UI_CONTRIBUTION_ID } from "./ui.js";

export const CODING_PLUGIN_ID = "io.molis.work.coding";
/** What the project database stores for this Plugin. */
export const CODING_PROJECT_PLUGIN_ID = "coding";

/**
 * Coding's declarations.
 *
 * `app`, and that is now true: the Host starts this Plugin through Plugin
 * Runtime and renders its directory from the contribution it returns
 * (`apps/local-host/src/coding-surface.ts`). It was `native` until that path
 * existed, because a Manifest claiming `app` while the shell drew the Plugin
 * itself would have been a lie.
 *
 * The other six built-ins stay `native`: they are still composed at build time.
 *
 * Files, Git, Shelf and Goal supply optional fixed source material.
 * Their absence never blocks an ordinary task.
 */
export const codingManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: CODING_PLUGIN_ID,
  version: "1.32.0",
  name: "Coding",
  kind: "app",
  upgrade_compatibility: { compatible_from_versions: ["1.31.0", "1.30.0"] },
  publisher: { publisher_id: "molis", signature: "official-coding-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "读取本项目固定文件、差异、Git 结果、Shelf 材料与已保存的执行报告" },
    { permission: "storage:private", required: true, reason: "保存编码会话的未发送草稿" },
    {
      permission: "artifact:write",
      required: true,
      reason: "把变更集、报告与图作为 Artifact 发布，带来源与版本",
    },
  ],
  capabilities: {
    provides: [],
    consumes: [
      ...Object.values(agentHostCapabilities).map((entry) => entry.capability_id),
      ...Object.values(goalContextCapabilities).map((entry) => entry.capability_id),
      ...Object.values(goalProgressCapabilities).map((entry) => entry.capability_id),
      projectsCapabilities.readWorkspace.capability_id,
      projectSettingsCapabilities.workspaces.capability_id,
      ...Object.values(writerDirectoryCapabilities).map(entry => entry.capability_id),
      ...Object.values(writerIntegrationCapabilities).map(entry => entry.capability_id),
    ],
  },
  artifacts: {
    produces: [
      { artifact_type_id: CODING_PLAN_TYPE, schema_version: 1 },
      { artifact_type_id: CODING_GOAL_CONTEXT_TYPE, schema_version: 1 },
      { artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1 },
      { artifact_type_id: CODING_REPORT_TYPE, schema_version: 1 },
      { artifact_type_id: CODING_DIAGRAM_TYPE, schema_version: 1 },
    ],
    consumes: [CODING_PLAN_TYPE, CHARACTER_ARTIFACT_TYPE, SHELF_TEXT_MATERIAL_TYPE, CODING_GOAL_CONTEXT_TYPE, CODING_REPORT_TYPE, CODING_CHANGESET_TYPE, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_TYPE, DIFF_CHANGESET_TYPE, GIT_RESULT_TYPE].map(artifact_type_id => ({ artifact_type_id, schema_version: 1 })),
  },
  ports: {
    inputs: [
      { port: "materials", artifact_type_id: SHELF_TEXT_MATERIAL_TYPE, schema_version: 1, optional: true },
      { port: "git-changeset", artifact_type_id: DIFF_CHANGESET_TYPE, schema_version: 1, optional: true },
      { port: "git-result", artifact_type_id: GIT_RESULT_TYPE, schema_version: 1, optional: true },
      { port: "before", artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: 1, optional: true },
      { port: "after", artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: 1, optional: true },
      { port: "selection", artifact_type_id: FILE_TEXT_SELECTION_TYPE, schema_version: 1, optional: true },
    ],
    outputs: [
      { port: "changeset", artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1 },
      { port: "report", artifact_type_id: CODING_REPORT_TYPE, schema_version: 1 },
      { port: "diagram", artifact_type_id: CODING_DIAGRAM_TYPE, schema_version: 1 },
    ],
  },
  events: {
    // What Coding tells the project: a file under the workspace changed, and a
    // prepared change set no longer matches what is on disk.
    publishes: [
      { event_type_id: CODING_FILE_CHANGED_EVENT, type_version: 1 },
      { event_type_id: CODING_WORKSPACE_INVALIDATED_EVENT, type_version: 1 },
      { event_type_id: CODING_PREFERENCE_EVENT, type_version: 1 },
    ],
    subscribes: [],
  },
  agent: codingAgentManifest,
  routes: [
    { route_id: "coding.evaluate-step", method: "POST", path: "/sessions/:sessionId/runs/:runId/steps/:stepId" },
    { route_id: "coding.writer-directories", method: "GET", path: "/workspaces/:workspaceId/writers" },
    { route_id: "coding.prepare-writer-directory", method: "POST", path: "/workspaces/:workspaceId/writers" },
    { route_id: "coding.read-integration", method: "GET", path: "/sessions/:sessionId/runs/:runId/subagents/:childId/integration" },
    { route_id: "coding.prepare-integration", method: "POST", path: "/sessions/:sessionId/runs/:runId/subagents/:childId/integration" },
    { route_id: "coding.control-subagent", method: "POST", path: "/sessions/:sessionId/runs/:runId/subagents/:childId" },
    { route_id: "coding.read-plan", method: "GET", path: "/sessions/:sessionId/plan" },
    { route_id: "coding.save-plan", method: "POST", path: "/sessions/:sessionId/plan" },
    { route_id: "coding.confirm-plan", method: "POST", path: "/sessions/:sessionId/plan/confirm" },
    { route_id: "coding.characters", method: "GET", path: "/sessions/:sessionId/characters" },
    { route_id: "coding.read-changeset", method: "GET", path: "/sessions/:sessionId/runs/:runId/changeset" },
    { route_id: "coding.save-changeset", method: "POST", path: "/sessions/:sessionId/runs/:runId/changeset" },
    { route_id: "coding.changeset-feedback", method: "POST", path: "/sessions/:sessionId/runs/:runId/changeset/feedback" },
    { route_id: "coding.changeset-output", method: "POST", path: "/sessions/:sessionId/runs/:runId/changeset/output" },
    { route_id: "coding.reports", method: "GET", path: "/reports" },
    { route_id: "coding.artifacts", method: "GET", path: "/artifacts" },
    { route_id: "coding.goals", method: "GET", path: "/goals" },
    { route_id: "coding.goal-context", method: "GET", path: "/goals/:goalId" },
    { route_id: "coding.read-goal", method: "GET", path: "/sessions/:sessionId/goal" },
    { route_id: "coding.select-goal", method: "PUT", path: "/sessions/:sessionId/goal" },
    { route_id: "coding.materials", method: "GET", path: "/sessions/:sessionId/materials" },
    { route_id: "coding.read-report", method: "GET", path: "/sessions/:sessionId/runs/:runId/report" },
    { route_id: "coding.save-report", method: "POST", path: "/sessions/:sessionId/runs/:runId/report" },
    { route_id: "coding.report-output", method: "GET", path: "/sessions/:sessionId/runs/:runId/report/output" },
    { route_id: "coding.select-report-output", method: "POST", path: "/sessions/:sessionId/runs/:runId/report/output" },
    { route_id: "coding.report-progress", method: "GET", path: "/sessions/:sessionId/runs/:runId/report/progress" },
    { route_id: "coding.record-report-progress", method: "POST", path: "/sessions/:sessionId/runs/:runId/report/progress" },
    { route_id: "coding.recovery", method: "GET", path: "/sessions/:sessionId/recovery" },
    { route_id: "coding.recover-run", method: "POST", path: "/sessions/:sessionId/runs/:runId/recover" },
    { route_id: "coding.checkpoints", method: "GET", path: "/sessions/:sessionId/checkpoints" },
    { route_id: "coding.prepare-rewind", method: "POST", path: "/sessions/:sessionId/checkpoints/:checkpointId/rewind" },
    { route_id: "coding.save-mcp", method: "POST", path: "/mcp" },
    { route_id: "coding.control-mcp", method: "POST", path: "/mcp/:serverId/control" },
    { route_id: "coding.discover-methods", method: "POST", path: "/methods/discover" },
    { route_id: "coding.install-method", method: "POST", path: "/methods/install" },
    { route_id: "coding.read-method", method: "GET", path: "/methods/:skillId/:version" },
    { route_id: "coding.state", method: "GET", path: "/state" },
    { route_id: "coding.create-session", method: "POST", path: "/sessions" },
    { route_id: "coding.read-session", method: "GET", path: "/sessions/:sessionId" },
    { route_id: "coding.command-output", method: "GET", path: "/sessions/:sessionId/runs/:runId/commands/:callId" },
    { route_id: "coding.update-session", method: "PATCH", path: "/sessions/:sessionId" },
    { route_id: "coding.start-run", method: "POST", path: "/sessions/:sessionId/runs" },
    { route_id: "coding.control-run", method: "POST", path: "/sessions/:sessionId/control" },
  ],
  ui: {
    embedded_plugins: ["io.molis.work.files", "io.molis.work.git", "io.molis.work.diff", "io.molis.work.text-stats"],
    contributions: [CODING_UI_CONTRIBUTION_ID, CODING_SETTINGS_UI_CONTRIBUTION_ID],
    /**
     * Entries the command menu and content actions offer.
     *
     * Each names the object it acts on rather than assuming the current one, so
     * "open this report" works from anywhere the report is visible instead of
     * only from inside the session that made it.
     */
    commands: [
      {
        command_id: "coding.new-session",
        title: "开一条编码会话",
        input_kinds: ["current"],
        opens_view_id: "directory",
      },
      {
        command_id: "coding.open-changeset",
        title: "查看这一轮的变更",
        input_kinds: ["agent-session"],
        opens_view_id: "directory",
      },
      {
        command_id: "coding.open-report",
        title: "打开报告",
        input_kinds: ["artifacts"],
        opens_view_id: "directory",
      },
    ],
    views: [
      { view_id: "conversation", slot: "stage", title: "Coding", contribution_id: CODING_UI_CONTRIBUTION_ID },
      {
        view_id: "directory",
        slot: "navigator",
        title: "Coding",
        contribution_id: CODING_UI_CONTRIBUTION_ID,
        icon: "code",
        order: 55,
      },
      {
        view_id: "settings",
        slot: "settings",
        title: "Coding",
        contribution_id: CODING_SETTINGS_UI_CONTRIBUTION_ID,
      },
    ],
  },
};
