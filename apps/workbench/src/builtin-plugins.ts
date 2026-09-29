import { COGNIA_INSTRUCTIONS, COGNIA_PROJECT_PLUGIN_ID, cogniaManifest, COGNIA_CLIENT_FACTORY_SCRIPT, COGNIA_STYLES, cogniaUiContribution, runCogniaMcpTool } from "@molis-ai/molis-work-plugin-cognia";
import { builderManifest, builderPrompts, builderUiContribution, BUILDER_STYLES, BUILDER_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-builder";
import { IMAGES_PROJECT_PLUGIN_ID, imagesManifest, imagesUiContribution, IMAGES_STYLES, IMAGES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-images";
import { JELLY_INSTRUCTIONS, JELLY_PROJECT_PLUGIN_ID, jellyManifest, JELLY_CLIENT_FACTORY_SCRIPT, JELLY_STYLES, jellyUiContribution, runJellyMcpTool } from "@molis-ai/molis-work-plugin-jelly";
import { experimentsManifest, EXPERIMENTS_CLIENT_FACTORY_SCRIPT, EXPERIMENTS_STYLES, experimentsUiContribution } from "@molis-ai/molis-work-plugin-experiments";
import { type ProjectPluginId } from "@molis-ai/molis-work-contracts/modules/projects";
import { type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ARTIFACTS_PROJECT_PLUGIN_ID, artifactsManifest, artifactReferenceUiContribution, artifactBrowserUiContribution } from "@molis-ai/molis-work-plugin-artifacts";
import { CODING_PROJECT_PLUGIN_ID, codingManifest, codingPrompts, codingMethods, codingSettingsContribution } from "@molis-ai/molis-work-plugin-coding";
import { DIFF_PROJECT_PLUGIN_ID, diffManifest } from "@molis-ai/molis-work-plugin-diff";
import { FILES_PROJECT_PLUGIN_ID, filesManifest } from "@molis-ai/molis-work-plugin-files";
import { GIT_PROJECT_PLUGIN_ID, gitManifest } from "@molis-ai/molis-work-plugin-git";
import { TEXT_STATS_PROJECT_PLUGIN_ID, textStatsManifest } from "@molis-ai/molis-work-plugin-text-stats";
import { type AgentPromptText, type AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { FEED_PROJECT_PLUGIN_ID, feedManifest, feedUiContribution, FEED_STYLES } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PROJECT_PLUGIN_ID, goalsManifest, goalsContextUiContribution, goalsDecisionResultsUiContribution, goalsDialogsUiContribution, goalsDocumentUiContribution, goalsFactorsUiContribution, goalsMomentumUiContribution, goalsPlanningUiContribution, goalsPolicyUiContribution, goalsProposalUiContribution, goalsRelationUiContribution, goalsSafetyUiContribution, goalsSettingsUiContribution, goalsStatusUiContribution, goalsTreeUiContribution } from "@molis-ai/molis-work-plugin-goals";
import { INBOX_PROJECT_PLUGIN_ID, inboxManifest, inboxUiContribution } from "@molis-ai/molis-work-plugin-inbox";
import { SCHEDULE_PROJECT_PLUGIN_ID, scheduleManifest, schedulePrompts, SCHEDULE_CLIENT_FACTORY_SCRIPT, SCHEDULE_STYLES, scheduleUiContribution } from "@molis-ai/molis-work-plugin-schedule";
import { SHELF_PROJECT_PLUGIN_ID, shelfManifest, SHELF_CLIENT_FACTORY_SCRIPT, SHELF_SETTINGS_CLIENT_SCRIPT, SHELF_STYLES, shelfSettingsUiContribution, shelfUiContribution } from "@molis-ai/molis-work-plugin-shelf";
import { CHARACTERS_PROJECT_PLUGIN_ID, charactersManifest } from "@molis-ai/molis-work-plugin-characters";
import { PAGES_INSTRUCTIONS, PAGES_PROJECT_PLUGIN_ID, pagesManifest, PAGES_CLIENT_FACTORY_SCRIPT, PAGES_STYLES, pagesUiContribution, runPagesMcpTool } from "@molis-ai/molis-work-plugin-pages";
import { FORM_INSTRUCTIONS, FORM_PROJECT_PLUGIN_ID, formManifest, FORM_CLIENT_FACTORY_SCRIPT, FORM_STYLES, formUiContribution, runFormMcpTool } from "@molis-ai/molis-work-plugin-form";
import { DATASET_INSTRUCTIONS, DATASET_PROJECT_PLUGIN_ID, datasetManifest, DATASET_CLIENT_FACTORY_SCRIPT, DATASET_STYLES, datasetUiContribution, runDatasetMcpTool } from "@molis-ai/molis-work-plugin-dataset";
import { PPT_PROJECT_PLUGIN_ID, pptManifest, PPT_CLIENT_FACTORY_SCRIPT, PPT_STYLES, pptUiContribution, runPptMcpTool } from "@molis-ai/molis-work-plugin-ppt";
import { LINGGUANG_INSTRUCTIONS, LINGGUANG_PROJECT_PLUGIN_ID, lingguangManifest, LINGGUANG_CLIENT_FACTORY_SCRIPT, LINGGUANG_STYLES, lingguangUiContribution } from "@molis-ai/molis-work-plugin-lingguang";
import { ALCHEMIST_PROJECT_PLUGIN_ID, alchemistManifest, ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_STYLES, alchemistUiContribution } from "@molis-ai/molis-work-plugin-alchemist";
import { WORKFLOWS_INSTRUCTIONS, WORKFLOWS_PROJECT_PLUGIN_ID, workflowsManifest, WORKFLOWS_CLIENT_FACTORY_SCRIPT, WORKFLOWS_STYLES, workflowsUiContribution } from "@molis-ai/molis-work-plugin-workflows";
import { WORK_PROJECT_PLUGIN_ID, workManifest, workTerminalUiContribution, workUiContribution } from "@molis-ai/molis-work-plugin-work";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";

import type { InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

export interface PluginSearchRow { readonly selector: string; readonly idDataset: string }
export interface BuiltinPluginWorkbench {
  /** Asset cascade/initialization order, independent of navigation order in the Manifest. */
  readonly order: number;
  readonly contributions: readonly UiContribution[];
  readonly stylesheet?: string;
  readonly clientFactory?: string;
  readonly settingsClient?: string;
  readonly searchRow?: PluginSearchRow;
}

/** One build-shipped plugin and its already exported implementations. This declaration grants no authority. */
export interface BuiltinPluginEntry {
  readonly project_plugin_id: ProjectPluginId;
  readonly manifest: PluginManifest;
  readonly personal?: boolean;
  readonly summary?: string;
  /** Fixed model-call instructions, exported by this plugin and registered by the Host. */
  readonly instructions?: readonly InstructionPrompt[];
  readonly agent?: { readonly prompts: readonly AgentPromptText[]; readonly skills?: readonly AgentSkillDefinition[] };
  readonly workbench?: BuiltinPluginWorkbench;
  /** Historical MCP spellings only; new public functions use Manifest.actions. No Host I/O or credentials. */
  readonly legacyMcp?: (actions: BoundActionClient, request: PluginMcpHandleRequest) => Promise<string>;
}

/** Shared build composition for catalog, UI resources and optional legacy MCP adapters. */
export const BUILTIN_PLUGIN_CATALOG: readonly BuiltinPluginEntry[] = [
  {
    project_plugin_id: COGNIA_PROJECT_PLUGIN_ID,
    manifest: cogniaManifest,
    instructions: COGNIA_INSTRUCTIONS,
    personal: true,
    summary: "导入本地知识，保留来源，整理为可追溯的知识。",
    workbench: {
      order: 0,
      contributions: [cogniaUiContribution],
      stylesheet: COGNIA_STYLES,
      clientFactory: COGNIA_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-cognia-id]", idDataset: "cogniaId" },
    },
    legacyMcp: runCogniaMcpTool,
  },
  {
    project_plugin_id: "plugin-builder",
    manifest: builderManifest,
    personal: true,
    summary: "用自然语言设计、构建并使用自己的插件。",
    agent: { prompts: builderPrompts },
    workbench: {
      order: 1,
      contributions: [builderUiContribution],
      stylesheet: BUILDER_STYLES,
      clientFactory: BUILDER_CLIENT_FACTORY_SCRIPT,
    },
  },
  {
    project_plugin_id: IMAGES_PROJECT_PLUGIN_ID,
    manifest: imagesManifest,
    personal: true,
    summary: "连接生图服务，描述图片，预览并保存生成结果。",
    workbench: {
      order: 2,
      contributions: [imagesUiContribution],
      stylesheet: IMAGES_STYLES,
      clientFactory: IMAGES_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-images-job]", idDataset: "imagesJob" },
    },
  },
  {
    project_plugin_id: JELLY_PROJECT_PLUGIN_ID,
    manifest: jellyManifest,
    instructions: JELLY_INSTRUCTIONS,
    personal: true,
    summary: "安排事项、写笔记、收集灵感，把想法放进每天。",
    workbench: {
      order: 3,
      contributions: [jellyUiContribution],
      stylesheet: JELLY_STYLES,
      clientFactory: JELLY_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-jelly-id]", idDataset: "jellyId" },
    },
    legacyMcp: runJellyMcpTool,
  },
  {
    project_plugin_id: "experiments",
    manifest: experimentsManifest,
    personal: true,
    summary: "同一任务，独立比较模型的判断、耗时与成本。",
    workbench: {
      order: 4,
      contributions: [experimentsUiContribution],
      stylesheet: EXPERIMENTS_STYLES,
      clientFactory: EXPERIMENTS_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-exp-open]", idDataset: "expOpen" },
    },
  },
  {
    project_plugin_id: GOALS_PROJECT_PLUGIN_ID,
    manifest: goalsManifest,
    summary: "确定目标，推进工作，留下结果。",
    workbench: {
      order: 18,
      contributions: [
      goalsPolicyUiContribution,
      goalsProposalUiContribution,
      goalsDecisionResultsUiContribution,
      goalsSafetyUiContribution,
      goalsRelationUiContribution,
      goalsTreeUiContribution,
      goalsMomentumUiContribution,
      goalsDocumentUiContribution,
      goalsContextUiContribution,
      goalsPlanningUiContribution,
      goalsStatusUiContribution,
      goalsFactorsUiContribution,
      goalsDialogsUiContribution,
      goalsSettingsUiContribution,
    ],
    },
  },
  {
    project_plugin_id: WORK_PROJECT_PLUGIN_ID,
    manifest: workManifest,
    summary: "回到你的会话，继续正在做的事。",
    workbench: {
      order: 16,
      contributions: [workUiContribution, workTerminalUiContribution],
    },
  },
  {
    project_plugin_id: INBOX_PROJECT_PLUGIN_ID,
    manifest: inboxManifest,
    summary: "只看需要你介入的事项。",
    workbench: {
      order: 6,
      contributions: [inboxUiContribution],
    },
  },
  {
    project_plugin_id: SCHEDULE_PROJECT_PLUGIN_ID,
    manifest: scheduleManifest,
    summary: "到点跑自己的对话任务，也叫醒其他插件的闹钟。",
    agent: { prompts: schedulePrompts },
    workbench: {
      order: 7,
      contributions: [scheduleUiContribution],
      stylesheet: SCHEDULE_STYLES,
      clientFactory: SCHEDULE_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-schedule-row][data-schedule-task-id]", idDataset: "scheduleTaskId" },
    },
  },
  {
    project_plugin_id: FEED_PROJECT_PLUGIN_ID,
    manifest: feedManifest,
    summary: "查看来源消息和完整流水。",
    workbench: {
      order: 5,
      contributions: [feedUiContribution],
      stylesheet: FEED_STYLES,
    },
  },
  {
    project_plugin_id: SHELF_PROJECT_PLUGIN_ID,
    manifest: shelfManifest,
    personal: true,
    summary: "把文件放到置物架，处理副本，原件不动。",
    workbench: {
      order: 8,
      contributions: [shelfUiContribution, shelfSettingsUiContribution],
      stylesheet: SHELF_STYLES,
      clientFactory: SHELF_CLIENT_FACTORY_SCRIPT,
      settingsClient: SHELF_SETTINGS_CLIENT_SCRIPT,
    },
  },
  {
    project_plugin_id: LINGGUANG_PROJECT_PLUGIN_ID,
    manifest: lingguangManifest,
    instructions: LINGGUANG_INSTRUCTIONS,
    personal: true,
    summary: "先记下还没想清楚的想法，再决定留下或丢掉。",
    workbench: {
      order: 13,
      contributions: [lingguangUiContribution],
      stylesheet: LINGGUANG_STYLES,
      clientFactory: LINGGUANG_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-lingguang-id]", idDataset: "lingguangId" },
    },
  },
  {
    project_plugin_id: CHARACTERS_PROJECT_PLUGIN_ID,
    manifest: charactersManifest,
    personal: true,
    summary: "编辑角色的做事方式，发布固定版本供 AI 任务选择。",
  },
  {
    project_plugin_id: PAGES_PROJECT_PLUGIN_ID,
    manifest: pagesManifest,
    instructions: PAGES_INSTRUCTIONS,
    personal: true,
    summary: "写文档，用块和格式，保存在这台电脑。",
    workbench: {
      order: 9,
      contributions: [pagesUiContribution],
      stylesheet: PAGES_STYLES,
      clientFactory: PAGES_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "button.feed-stage-entry[data-page-id]", idDataset: "pageId" },
    },
    legacyMcp: runPagesMcpTool,
  },
  {
    project_plugin_id: FORM_PROJECT_PLUGIN_ID,
    manifest: formManifest,
    instructions: FORM_INSTRUCTIONS,
    personal: true,
    summary: "建问卷，预览填写，看结果。",
    workbench: {
      order: 10,
      contributions: [formUiContribution],
      stylesheet: FORM_STYLES,
      clientFactory: FORM_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-form-id]", idDataset: "formId" },
    },
    legacyMcp: runFormMcpTool,
  },
  {
    project_plugin_id: DATASET_PROJECT_PLUGIN_ID,
    manifest: datasetManifest,
    instructions: DATASET_INSTRUCTIONS,
    personal: true,
    summary: "改表格，导入 CSV，留下版本。",
    workbench: {
      order: 11,
      contributions: [datasetUiContribution],
      stylesheet: DATASET_STYLES,
      clientFactory: DATASET_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-dataset-id]", idDataset: "datasetId" },
    },
    legacyMcp: runDatasetMcpTool,
  },
  {
    project_plugin_id: PPT_PROJECT_PLUGIN_ID,
    manifest: pptManifest,
    personal: true,
    summary: "写幻灯片大纲，预览并导出 JSON。",
    workbench: {
      order: 12,
      contributions: [pptUiContribution],
      stylesheet: PPT_STYLES,
      clientFactory: PPT_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-ppt-id]", idDataset: "pptId" },
    },
    legacyMcp: runPptMcpTool,
  },
  {
    project_plugin_id: ALCHEMIST_PROJECT_PLUGIN_ID,
    manifest: alchemistManifest,
    personal: true,
    summary: "写下方向，炼成可比较的卡，再决定做不做。",
    workbench: {
      order: 14,
      contributions: [alchemistUiContribution],
      stylesheet: ALCHEMIST_STYLES,
      clientFactory: ALCHEMIST_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-alchemist-id]", idDataset: "alchemistId" },
    },
  },
  {
    project_plugin_id: WORKFLOWS_PROJECT_PLUGIN_ID,
    manifest: workflowsManifest,
    instructions: WORKFLOWS_INSTRUCTIONS,
    personal: true,
    summary: "把已有插件按顺序串成一件可以做完的事。",
    workbench: {
      order: 15,
      contributions: [workflowsUiContribution],
      stylesheet: WORKFLOWS_STYLES,
      clientFactory: WORKFLOWS_CLIENT_FACTORY_SCRIPT,
    },
  },
  {
    project_plugin_id: ARTIFACTS_PROJECT_PLUGIN_ID,
    manifest: artifactsManifest,
    summary: "打开项目成果，查看保留下来的版本。",
    workbench: {
      order: 17,
      contributions: [artifactReferenceUiContribution, artifactBrowserUiContribution],
    },
  },
  {
    project_plugin_id: CODING_PROJECT_PLUGIN_ID,
    manifest: codingManifest,
    summary: "围绕代码讨论、执行和审查，保留连续的任务记录。",
    agent: { prompts: codingPrompts, skills: codingMethods },
    workbench: {
      order: 19,
      contributions: [codingSettingsContribution],
    },
  },
  {
    project_plugin_id: FILES_PROJECT_PLUGIN_ID,
    manifest: filesManifest,
    summary: "查看工作区文件与保留的内容。",
  },
  {
    project_plugin_id: GIT_PROJECT_PLUGIN_ID,
    manifest: gitManifest,
    summary: "查看工作区的版本与变更。",
  },
  {
    project_plugin_id: DIFF_PROJECT_PLUGIN_ID,
    manifest: diffManifest,
    summary: "比较固定版本，逐项阅读差异。",
  },
  {
    project_plugin_id: TEXT_STATS_PROJECT_PLUGIN_ID,
    manifest: textStatsManifest,
    summary: "查看材料与成果的文本统计。",
  },
];
