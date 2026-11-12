import { memoryLearningActions } from "@molis-ai/molis-work-contracts/services/memory";
import { searchActions, SEARCH_READ_PERMISSION } from "@molis-ai/molis-work-contracts/services/search";
import { CHARACTER_ARTIFACT_TYPE, characterPluginActions } from "@molis-ai/molis-work-contracts/modules/characters";
import { workspaceReadActions, writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities, agentOfferActions } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentInputActions } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { projectDirectoryActions, projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { GOALS_ACTIONS } from "./goals-actions.js";
import { KNOWLEDGE_READ_PERMISSION, knowledgeActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { SKILLS_READ_PERMISSION, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { CODING_GOAL_CONTEXT_TYPE, CODING_PLAN_TYPE } from "./artifacts.js";
import {
  CODING_CHANGESET_TYPE,
  CODING_DIAGRAM_TYPE,
  CODING_REPORT_TYPE,
} from "./artifacts.js";
import { CODING_RUN_UPDATED_EVENT, CODING_FILE_CHANGED_EVENT, CODING_PREFERENCE_EVENT, CODING_WORKSPACE_INVALIDATED_EVENT } from "./events.js";
import { CODING_PUBLISHER_BINDING } from "./identity.js";
import { codingAgentManifest } from "./roles.js";
import { CODING_SETTINGS_UI_CONTRIBUTION_ID, CODING_UI_CONTRIBUTION_ID } from "./ui.js";
import { CODING_ACTIONS } from "./route-actions.js";
import { codingExecutorActions } from "./executor-actions.js";
import { codingArtifactPreview } from "./artifact-preview.js";
import { CODING_ARTIFACT_SCHEMA_VERSIONS } from "./artifacts.js";
import { codingSync } from './session-replication.js';
import { codingHomeBackgroundTasks } from "./home-background.js";
import { codingResultDocument } from "./contract.js";
import { CODING_PROJECT_DATABASE } from "./database.js";

export const CODING_PLUGIN_ID = "io.molis.work.coding";
/** What the project database stores for this Plugin. */
export const CODING_PROJECT_PLUGIN_ID = "coding";

/**
 * Coding's declarations.
 *
 * `app`, and that is true: the Host starts this Plugin through Plugin
 * Runtime and draws its stage from the view it returns (`project-plugin-stages.ts`),
 * with the companions it embeds filling the slots that view opens. It was
 * `native` until that path existed, because a Manifest claiming `app` while
 * the shell drew the Plugin itself would have been a lie.
 *
 * The other six built-ins stay `native`: they are still composed at build time.
 *
 * Files, Git, Shelf and Goal supply optional fixed source material.
 * Their absence never blocks an ordinary task.
 */
export const codingManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: CODING_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "Coding",
  sync: codingSync,
  summary: "和 Agent 一起写代码，留每轮记录。", summary_text: { key: "coding.directory.summary" },
  kind: "app",
  publisher: { publisher_id: "molis", signature: CODING_PUBLISHER_BINDING },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: SEARCH_READ_PERMISSION, required: true, reason: "在问题卡中查找当前有权读取的引用对象" },
    { permission: "goals:read", required: true, reason: "读取已关联目标的当前约定、状态和固定来源" },
    { permission: "goals:write", required: true, reason: "按用户确认把固定执行报告记录为原目标的进展" },
    { permission: "artifact:read", required: true, reason: "读取本项目已保存的执行报告、计划与变更集" },
    { permission: KNOWLEDGE_READ_PERMISSION, required: true, reason: "读取用户为下一轮选定的项目资料" },
    { permission: SKILLS_READ_PERMISSION, required: true, reason: "列出共同目录里给 Coding 用的技能，并按这一轮选定的技能读取正文" },
    { permission: "storage:private", required: true, reason: "保存编码会话的未发送草稿" },
    {
      permission: "artifact:write",
      required: true,
      reason: "把变更集、报告与图作为成果发布，带来源与版本",
    },
    { permission: "workspace:read", required: true, reason: "读取已关联工作目录里的目录与文本，用于任务里 @ 提到的文件与目录" },
    { permission: "model:read", required: true, reason: "读取全局模型设置里可用的模型，供每一轮选用；不发起模型请求" },
    // The round's model call is the Agent runtime's; `model:invoke` covers only Coding's two explicit drafts (`agent.draft-text`):
    // the commit message and the digest of earlier rounds. Turned off, only those two stop (PG-035).
    { permission: "model:invoke", required: false, reason: "起草提交说明与历史摘要（显式调用）" },
    // Starting a review only: the directory is made and the child's files are brought back only once a person approves (PG-009).
    { permission: "review:git-worktree", required: true, reason: "发起创建独立工作树的审查，由用户批准后才建目录并授权" },
    { permission: "review:git-integration", required: true, reason: "发起把子任务的文件改动整合回主工作区的审查，由用户批准后才写入" },
  ],
  capabilities: {
    provides: [],
    consumes: [
      memoryLearningActions.enqueue.capability_id, memoryLearningActions.form.capability_id,
      searchActions.references.capability_id, "goals.subject.read", "goals.search.entries",
      "files.state", "files.directory", "files.open", "files.capture", "diff.state", "text-stats.state",
      "git.state", "git.select-diff", "git.prepare-index", "git.results", "git.summary", "git.pr-support", "git.conflict", "git.operations", "git.prepare-operation", "git.save-result",
      ...Object.values(agentHostCapabilities).map((entry) => entry.capability_id),
      ...Object.values(agentCollaborationActions).map((entry) => entry.capability_id),
      ...Object.values(agentInputActions).map((entry) => entry.capability_id),
      ...Object.values(agentOfferActions).map((entry) => entry.capability_id),
      ...Object.values(GOALS_ACTIONS).map(entry => entry.capability_id),
      // The person's published Characters, and whether a version can run now (PG-086).
      ...Object.values(characterPluginActions).map(entry => entry.capability_id),
      knowledgeActions.read.capability_id,
      knowledgeActions.list.capability_id,
      skillCatalogActions.list.capability_id,
      skillCatalogActions.readBodies.capability_id,
      projectDirectoryActions.get.capability_id,
      workspaceReadActions.file.capability_id,
      workspaceReadActions.git.capability_id,
      projectSettingsCapabilities.runtime.capability_id,
      ...Object.values(writerDirectoryCapabilities).map(entry => entry.capability_id),
      ...Object.values(writerIntegrationCapabilities).map(entry => entry.capability_id),
    ],
  },
  // The run report is the version people keep; plans, goal context, change sets and diagrams are exchange data.
  artifacts: {
    produces: [{ artifact_type_id: CODING_REPORT_TYPE, schema_version: /* @version type.coding.report */ 1, title: "Coding 执行报告", title_text: { key: "coding.artifacts.type-title" }, preview: { capability_id: "coding.artifacts.preview", version: /* @version action.coding.artifacts.preview */ 1 } }],
    consumes: [CHARACTER_ARTIFACT_TYPE, CODING_REPORT_TYPE].map(artifact_type_id => ({ artifact_type_id, schema_version: artifact_type_id === CHARACTER_ARTIFACT_TYPE ? /* @version type.character.definition */ 1 : CODING_ARTIFACT_SCHEMA_VERSIONS[artifact_type_id]! })),
  },
  process_items: {
    produces: [CODING_PLAN_TYPE, CODING_GOAL_CONTEXT_TYPE, CODING_CHANGESET_TYPE, CODING_DIAGRAM_TYPE].map(artifact_type_id => ({ artifact_type_id, schema_version: CODING_ARTIFACT_SCHEMA_VERSIONS[artifact_type_id]! })),
    consumes: [CODING_PLAN_TYPE, CODING_GOAL_CONTEXT_TYPE, CODING_CHANGESET_TYPE].map(artifact_type_id => ({ artifact_type_id, schema_version: CODING_ARTIFACT_SCHEMA_VERSIONS[artifact_type_id]! })),
  },
  ports: {
    // What a round takes from elsewhere is picked from project knowledge (specs/project-knowledge §9), not wired in by port.
    inputs: [],
    outputs: [
      { port: "changeset", artifact_type_id: CODING_CHANGESET_TYPE, schema_version: /* @version type.coding.changeset */ 1 },
      { port: "report", artifact_type_id: CODING_REPORT_TYPE, schema_version: /* @version type.coding.report */ 1 },
      { port: "diagram", artifact_type_id: CODING_DIAGRAM_TYPE, schema_version: /* @version type.coding.diagram */ 1 },
    ],
  },
  events: {
    // What Coding tells the project: a file under the workspace changed, and a
    // prepared change set no longer matches what is on disk.
    publishes: [
      { event_type_id: CODING_RUN_UPDATED_EVENT, type_version: /* @version event.io.molis.work.coding.run-updated */ 1 },
      { event_type_id: CODING_FILE_CHANGED_EVENT, type_version: /* @version event.io.molis.work.coding.file-changed */ 1 },
      { event_type_id: CODING_WORKSPACE_INVALIDATED_EVENT, type_version: /* @version event.io.molis.work.coding.workspace-invalidated */ 1 },
      { event_type_id: CODING_PREFERENCE_EVENT, type_version: /* @version event.io.molis.work.coding.preference */ 1 },
    ],
    subscribes: [],
  },
  agent: codingAgentManifest,
  databases: { project: CODING_PROJECT_DATABASE },
  // What runs on after the call that set it off, each stopping with the activation. PG-038: an accepted round is followed until it
  // settles, and a step's wait, once over, starts the session's next round (start-round.ts, wake-loop.ts). The session state and goal
  // titles are read and saved apart from the page's read-only queries (observation-job.ts).
  background: { jobs: [
    { job_id: "follow", reason: "跟住已经开始的这一轮，直到它结束，把会话记下的状态改对", permissions: [] },
    { job_id: "wake", reason: "会话等的事有了结果，接着开这个会话的下一轮", permissions: ["artifact:read", "storage:private"] },
    { job_id: "observe", reason: "独立读取并保存会话状态与关联目标标题，页面查询保持只读", permissions: ["artifact:read", "storage:private", "goals:read"] },
  ] },
  // Redeemed by this Runtime instance and bound to the person who owns the sessions; their routes forward to them.
  actions: [memoryLearningActions.run, ...CODING_ACTIONS, ...Object.values(codingExecutorActions), codingArtifactPreview, codingResultDocument, codingHomeBackgroundTasks],
  routes: [
    { route_id: "coding.evaluate-step", method: "POST", path: "/sessions/:sessionId/runs/:runId/steps/:stepId" },
    { route_id: "coding.writer-directories", method: "GET", path: "/workspaces/:workspaceId/writers" },
    { route_id: "coding.prepare-writer-directory", method: "POST", path: "/workspaces/:workspaceId/writers" },
    { route_id: "coding.read-integration", method: "GET", path: "/sessions/:sessionId/runs/:runId/subagents/:childId/integration" },
    { route_id: "coding.prepare-integration", method: "POST", path: "/sessions/:sessionId/runs/:runId/subagents/:childId/integration" },
    { route_id: "coding.read-worktree-integration", method: "GET", path: "/sessions/:sessionId/worktrees/:worktreeId/integration" },
    { route_id: "coding.prepare-worktree-integration", method: "POST", path: "/sessions/:sessionId/worktrees/:worktreeId/integration" },
    { route_id: "coding.control-subagent", method: "POST", path: "/sessions/:sessionId/runs/:runId/subagents/:childId" },
    { route_id: "coding.read-plan", method: "GET", path: "/sessions/:sessionId/plan" },
    { route_id: "coding.save-plan", method: "POST", path: "/sessions/:sessionId/plan" },
    { route_id: "coding.confirm-plan", method: "POST", path: "/sessions/:sessionId/plan/confirm" },
    { route_id: "coding.characters", method: "GET", path: "/sessions/:sessionId/characters" },
    { route_id: "coding.actions", method: "GET", path: "/sessions/:sessionId/actions" },
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
    { route_id: "coding.read-report", method: "GET", path: "/sessions/:sessionId/runs/:runId/report" },
    { route_id: "coding.save-report", method: "POST", path: "/sessions/:sessionId/runs/:runId/report" },
    { route_id: "coding.report-output", method: "GET", path: "/sessions/:sessionId/runs/:runId/report/output" },
    { route_id: "coding.select-report-output", method: "POST", path: "/sessions/:sessionId/runs/:runId/report/output" },
    { route_id: "coding.report-progress", method: "GET", path: "/sessions/:sessionId/runs/:runId/report/progress" },
    { route_id: "coding.record-report-progress", method: "POST", path: "/sessions/:sessionId/runs/:runId/report/progress" },
    { route_id: "coding.recovery", method: "GET", path: "/sessions/:sessionId/recovery" },
    { route_id: "coding.recover-run", method: "POST", path: "/sessions/:sessionId/runs/:runId/recover" },
    { route_id: "coding.continuation", method: "GET", path: "/sessions/:sessionId/runs/:runId/continuation" },
    { route_id: "coding.plan-amendments", method: "POST", path: "/sessions/:sessionId/runs/:runId/plan-amendments" },
    { route_id: "coding.checkpoints", method: "GET", path: "/sessions/:sessionId/checkpoints" },
    { route_id: "coding.prepare-rewind", method: "POST", path: "/sessions/:sessionId/checkpoints/:checkpointId/rewind" },
    { route_id: "coding.save-mcp", method: "POST", path: "/mcp" },
    { route_id: "coding.control-mcp", method: "POST", path: "/mcp/:serverId/control" },
    { route_id: "coding.state", method: "GET", path: "/state" },
    { route_id: "coding.list-sessions", method: "GET", path: "/sessions" },
    { route_id: "coding.create-session", method: "POST", path: "/sessions" },
    { route_id: "coding.read-session", method: "GET", path: "/sessions/:sessionId" },
    { route_id: "coding.session-binding", method: "GET", path: "/sessions/:sessionId/binding" },
    { route_id: "coding.subject-state", method: "GET", path: "/sessions/:sessionId/subject-state" },
    { route_id: "coding.subject", method: "GET", path: "/sessions/:sessionId/subject" },
    { route_id: "coding.search-entries", method: "GET", path: "/search/entries" },
    { route_id: "coding.read-runs", method: "GET", path: "/sessions/:sessionId/runs" },
    { route_id: "coding.taskboard", method: "GET", path: "/sessions/:sessionId/taskboard" },
    { route_id: "coding.live", method: "GET", path: "/sessions/:sessionId/runs/:runId/live" },
    { route_id: "coding.commit-draft", method: "POST", path: "/sessions/:sessionId/runs/:runId/commit-draft" },
    { route_id: "coding.files", method: "GET", path: "/sessions/:sessionId/files" },
    { route_id: "coding.symbols", method: "GET", path: "/sessions/:sessionId/symbols" },
    { route_id: "coding.compact-next", method: "POST", path: "/sessions/:sessionId/compact" },
    { route_id: "coding.delegations", method: "GET", path: "/sessions/:sessionId/delegations" },
    { route_id: "coding.delegate", method: "POST", path: "/sessions/:sessionId/delegations" },
    { route_id: "coding.delegation-action", method: "POST", path: "/sessions/:sessionId/delegations/:delegationId" },
    { route_id: "coding.delegation-deliver", method: "POST", path: "/sessions/:sessionId/delegations/:delegationId/deliveries" },
    { route_id: "coding.delegation-decide", method: "POST", path: "/sessions/:sessionId/delegations/:delegationId/deliveries/:deliveryId" },
    { route_id: "coding.command-output", method: "GET", path: "/sessions/:sessionId/runs/:runId/commands/:callId" },
    { route_id: "coding.update-session", method: "PATCH", path: "/sessions/:sessionId" },
    { route_id: "coding.start-run", method: "POST", path: "/sessions/:sessionId/runs" },
    { route_id: "coding.scope-check", method: "POST", path: "/sessions/:sessionId/scope-check" },
    { route_id: "coding.queued-round", method: "POST", path: "/sessions/:sessionId/queued" },
    { route_id: "coding.messages", method: "GET", path: "/sessions/:sessionId/messages" },
    { route_id: "coding.message-cancel", method: "POST", path: "/sessions/:sessionId/messages/:messageId/cancel" },
    { route_id: "coding.background", method: "GET", path: "/sessions/:sessionId/background" },
    { route_id: "coding.priority", method: "POST", path: "/sessions/:sessionId/priority" },
    { route_id: "coding.background-stop", method: "POST", path: "/sessions/:sessionId/background/:taskId/stop" },
    { route_id: "coding.control-run", method: "POST", path: "/sessions/:sessionId/control" },
    { route_id: "coding.card-run", method: "POST", path: "/sessions/:sessionId/cards/:cardId/run" },
    { route_id: "coding.card-dismiss", method: "POST", path: "/sessions/:sessionId/cards/:cardId/dismiss" },
  ],
  ui: { locales: { default: "zh", available: ["zh", "en"] },
    embedded_plugins: ["io.molis.work.files", "io.molis.work.git", "io.molis.work.diff", "io.molis.work.text-stats"],
    contributions: [CODING_UI_CONTRIBUTION_ID, CODING_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "conversation", slot: "stage", title: "Coding", contribution_id: CODING_UI_CONTRIBUTION_ID, accepts_objects: true },
      {
        view_id: "directory",
        slot: "navigator",
        title: "Coding",
        contribution_id: CODING_UI_CONTRIBUTION_ID,
        icon: "code",
        hue: "cyan",
        order: 55,
        group: "code",
      },
      {
        view_id: "settings",
        slot: "settings",
        title: "Coding",
        contribution_id: CODING_SETTINGS_UI_CONTRIBUTION_ID,
        settings_runtimes: true,
        icon: "code",
      },
    ],
  },
};
