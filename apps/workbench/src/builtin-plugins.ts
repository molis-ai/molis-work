import { CODING_WORKBENCH_SETUP_SCRIPT } from "./scripts/client/coding-setup.js";
import { COGNIA_INSTRUCTIONS, COGNIA_PROJECT_PLUGIN_ID, cogniaManifest, COGNIA_CLIENT_FACTORY_SCRIPT, COGNIA_STYLES, cogniaUiContribution, COGNIA_DATABASE, createCogniaPlugin } from "@molis-ai/molis-work-plugin-cognia";
import { BUILDER_CHOICE_INSTRUCTIONS, builderManifest, builderUiContribution, AGENT_STUDIO_STYLES, AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-builder";
import { PLUGIN_COMPONENT_STYLES } from "@molis-ai/molis-work-design-system";
import { IMAGES_PROJECT_PLUGIN_ID, IMAGES_MESSAGES, imagesManifest, imagesUiContribution, IMAGES_STYLES, IMAGES_CLIENT_FACTORY_SCRIPT, imagesProjectData, createImagesPlugin, IMAGES_DATABASE, IMAGES_FILES, IMAGES_IMAGE_GENERATION } from "@molis-ai/molis-work-plugin-images";
import { JELLY_INSTRUCTIONS, JELLY_PROJECT_PLUGIN_ID, jellyManifest, JELLY_CLIENT_FACTORY_SCRIPT, JELLY_STYLES, jellyUiContribution, createJellyPlugin, JELLY_DATABASE, JELLY_MODEL_CONFIGURATION, JELLY_MESSAGES } from "@molis-ai/molis-work-plugin-jelly";
import { issuesManifest, issuesMethods, issuesUiContribution, createIssuesPlugin, ISSUES_DATABASE, ISSUES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-issues";
import { ARTIFACTS_PROJECT_PLUGIN_ID, artifactsManifest, artifactReferenceUiContribution, artifactBrowserUiContribution } from "@molis-ai/molis-work-plugin-artifacts";
import { CODING_PROJECT_PLUGIN_ID, CODING_INSTRUCTIONS, codingManifest, codingPrompts, codingMethods, codingSettingsContribution } from "@molis-ai/molis-work-plugin-coding";
import { DIFF_PROJECT_PLUGIN_ID, diffManifest, DIFF_MESSAGES } from "@molis-ai/molis-work-plugin-diff";
import { FILES_PROJECT_PLUGIN_ID, filesManifest, FILES_MESSAGES } from "@molis-ai/molis-work-plugin-files";
import { GIT_PROJECT_PLUGIN_ID, gitManifest } from "@molis-ai/molis-work-plugin-git";
import { TEXT_STATS_PROJECT_PLUGIN_ID, textStatsManifest, TEXT_STATS_MESSAGES } from "@molis-ai/molis-work-plugin-text-stats";
import { FEED_PROJECT_PLUGIN_ID, feedManifest, feedUiContribution, FEED_STYLES } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PROJECT_PLUGIN_ID, goalsManifest, goalsContextUiContribution, goalsDecisionResultsUiContribution, goalsDialogsUiContribution, goalsDocumentUiContribution, goalsFactorsUiContribution, goalsMomentumUiContribution, goalsPlanningUiContribution, goalsPolicyUiContribution, goalsProposalUiContribution, goalsRelationUiContribution, goalsSettingsUiContribution, goalsStatusUiContribution, goalsTreeUiContribution } from "@molis-ai/molis-work-plugin-goals";
import { INBOX_PROJECT_PLUGIN_ID, inboxManifest, inboxUiContribution } from "@molis-ai/molis-work-plugin-inbox";
import { SCHEDULE_PROJECT_PLUGIN_ID, scheduleManifest, schedulePrompts, SCHEDULE_CLIENT_FACTORY_SCRIPT, SCHEDULE_STYLES, scheduleUiContribution } from "@molis-ai/molis-work-plugin-schedule";
import { SHELF_INSTRUCTIONS, SHELF_PROJECT_PLUGIN_ID, shelfManifest, SHELF_CLIENT_FACTORY_SCRIPT, SHELF_SETTINGS_CLIENT_SCRIPT, SHELF_STYLES, shelfSettingsUiContribution, shelfUiContribution } from "@molis-ai/molis-work-plugin-shelf";
import { CHARACTERS_PROJECT_PLUGIN_ID, charactersManifest, charactersSettingsUiContribution, CHARACTERS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-characters";
import { PAGES_INSTRUCTIONS, PAGES_PROJECT_PLUGIN_ID, pagesManifest, pagesMethods, PAGES_CLIENT_FACTORY_SCRIPT, PAGES_STYLES, pagesUiContribution, pagesProjectData, PAGES_HOME_STORE } from "@molis-ai/molis-work-plugin-pages";
import { FORM_INSTRUCTIONS, FORM_PROJECT_PLUGIN_ID, formManifest, FORM_CLIENT_FACTORY_SCRIPT, FORM_STYLES, formUiContribution, formProjectData, FORM_HOME_STORE } from "@molis-ai/molis-work-plugin-form";
import { DATASET_INSTRUCTIONS, DATASET_PROJECT_PLUGIN_ID, datasetManifest, DATASET_CLIENT_FACTORY_SCRIPT, DATASET_STYLES, datasetUiContribution, datasetProjectData, DATASET_HOME_STORE } from "@molis-ai/molis-work-plugin-dataset";
import { PPT_INSTRUCTIONS, PPT_PROJECT_PLUGIN_ID, pptManifest, PPT_CLIENT_FACTORY_SCRIPT, PPT_STYLES, pptUiContribution, pptProjectData, PPT_HOME_STORE } from "@molis-ai/molis-work-plugin-ppt";
import { LINGGUANG_INSTRUCTIONS, LINGGUANG_PROJECT_PLUGIN_ID, lingguangManifest, LINGGUANG_CLIENT_FACTORY_SCRIPT, LINGGUANG_STYLES, lingguangUiContribution, lingguangProjectData, LINGGUANG_HOME_STORE } from "@molis-ai/molis-work-plugin-lingguang";
import { TODO_INSTRUCTIONS, TODO_PROJECT_PLUGIN_ID, todoManifest, todoMethods, todoPrompts, TODO_CLIENT_FACTORY_SCRIPT, TODO_STYLES, todoUiContribution, todoProjectData, createTodoPlugin, TODO_DATABASE } from "@molis-ai/molis-work-plugin-todo";
import { ALCHEMIST_PROJECT_PLUGIN_ID, ALCHEMIST_INSTRUCTIONS, alchemistManifest, ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_STYLES, alchemistUiContribution } from "@molis-ai/molis-work-plugin-alchemist";
import { WORKFLOWS_INSTRUCTIONS, WORKFLOWS_PROJECT_PLUGIN_ID, workflowsManifest, WORKFLOWS_CLIENT_FACTORY_SCRIPT, WORKFLOWS_STYLES, workflowsUiContribution, workflowsProjectData, WORKFLOWS_HOME_STORE } from "@molis-ai/molis-work-plugin-workflows";
import { WORK_PROJECT_PLUGIN_ID, workManifest, workTerminalUiContribution, workUiContribution } from "@molis-ai/molis-work-plugin-work";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

/** Shared build composition for catalog and UI resources. */
export const BUILTIN_PLUGIN_CATALOG: readonly PluginRegistration[] = [
  {
    project_plugin_id: "issues", catalog_order: 1, manifest: issuesManifest, methods: issuesMethods, personal: true, summary: "记录、查看和整理自己的问题。",
    runtime: { scope: "home", create: createIssuesPlugin, database: ISSUES_DATABASE, package_name: "@molis-ai/molis-work-plugin-issues", factory_export: "createIssuesPlugin", keys: "Mod+Shift+I" },
    workbench: { order: 5, contributions: [issuesUiContribution], clientFactory: ISSUES_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-issue-id]", idDataset: "issueId" } },
  },
  {
    project_plugin_id: COGNIA_PROJECT_PLUGIN_ID, catalog_order: 2,
    runtime: { scope: "home", create: createCogniaPlugin, database: COGNIA_DATABASE, package_name: "@molis-ai/molis-work-plugin-cognia", factory_export: "createCogniaPlugin" },
    manifest: cogniaManifest,
    instructions: COGNIA_INSTRUCTIONS,
    personal: true,
    summary: "导入本地知识，带来源检索问答。",
    workbench: {
      order: 0,
      contributions: [cogniaUiContribution],
      stylesheet: COGNIA_STYLES,
      clientFactory: COGNIA_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-cognia-id]", idDataset: "cogniaId" },
    },
  },
  {
    project_plugin_id: "plugin-builder", catalog_order: 3,
    manifest: builderManifest,
    instructions: BUILDER_CHOICE_INSTRUCTIONS,
    personal: true,
    summary: "用自然语言设计、构建并使用自己的插件。",
    workbench: {
      order: 1,
      contributions: [builderUiContribution],
      // The studio is drawn in the plugin's stage; generated plugin parts in its canvas use the plugin components.
      stylesheet: AGENT_STUDIO_STYLES + PLUGIN_COMPONENT_STYLES,
      clientFactory: AGENT_STUDIO_WORKBENCH_CLIENT_FACTORY_SCRIPT,
    },
  },
  {
    project_plugin_id: IMAGES_PROJECT_PLUGIN_ID, catalog_order: 4,
    runtime: { scope: "home", create: createImagesPlugin, database: IMAGES_DATABASE, files: IMAGES_FILES, image_generation: IMAGES_IMAGE_GENERATION,
      package_name: "@molis-ai/molis-work-plugin-images", factory_export: "createImagesPlugin" },
    manifest: imagesManifest,
    messages: IMAGES_MESSAGES,
    project_data: imagesProjectData,
    personal: true,
    summary: "连接生图服务，按描述生成图片。",
    workbench: {
      order: 2,
      contributions: [imagesUiContribution],
      stylesheet: IMAGES_STYLES,
      clientFactory: IMAGES_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-images-job]", idDataset: "imagesJob" },
    },
  },
  {
    project_plugin_id: JELLY_PROJECT_PLUGIN_ID, catalog_order: 5,
    runtime: { scope: "home", create: createJellyPlugin, database: JELLY_DATABASE, model_configuration: JELLY_MODEL_CONFIGURATION,
      package_name: "@molis-ai/molis-work-plugin-jelly", factory_export: "createJellyPlugin" },
    manifest: jellyManifest,
    messages: JELLY_MESSAGES,
    instructions: JELLY_INSTRUCTIONS,
    personal: true,
    summary: "日历与笔记，按天安排。",
    workbench: {
      order: 3,
      contributions: [jellyUiContribution],
      stylesheet: JELLY_STYLES,
      clientFactory: JELLY_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-jelly-id]", idDataset: "jellyId" },
    },
  },
  {
    project_plugin_id: GOALS_PROJECT_PLUGIN_ID, catalog_order: 6,
    manifest: goalsManifest,
    summary: "确定目标，推进工作，留下结果。",
    workbench: {
      order: 19,
      contributions: [
      goalsPolicyUiContribution,
      goalsProposalUiContribution,
      goalsDecisionResultsUiContribution,
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
      recordRow: { selector: "[data-tree-item][data-goal-id]", idDataset: "goalId" },
    },
  },
  {
    project_plugin_id: WORK_PROJECT_PLUGIN_ID, catalog_order: 7,
    manifest: workManifest,
    summary: "回到你的会话，继续正在做的事。",
    workbench: {
      order: 17,
      contributions: [workUiContribution, workTerminalUiContribution],
      recordRow: { selector: "[data-operation-select]", idDataset: "operationSelect" },
    },
  },
  {
    project_plugin_id: INBOX_PROJECT_PLUGIN_ID, catalog_order: 8,
    manifest: inboxManifest,
    summary: "只看需要你介入的事项。",
    workbench: {
      order: 6,
      contributions: [inboxUiContribution],
      recordRow: { selector: "[data-inbox-row][data-inbox-entry-id]", idDataset: "inboxEntryId" },
    },
  },
  {
    project_plugin_id: SCHEDULE_PROJECT_PLUGIN_ID, catalog_order: 9,
    manifest: scheduleManifest,
    summary: "定时跑对话任务，也替插件准时提醒。",
    agent: { prompts: schedulePrompts },
    workbench: {
      order: 7,
      contributions: [scheduleUiContribution],
      stylesheet: SCHEDULE_STYLES,
      clientFactory: SCHEDULE_CLIENT_FACTORY_SCRIPT, clientServed: true,
      searchRow: { selector: "[data-schedule-row][data-schedule-task-id]", idDataset: "scheduleTaskId" },
    },
  },
  {
    project_plugin_id: FEED_PROJECT_PLUGIN_ID, catalog_order: 10,
    manifest: feedManifest,
    // Enabling Feed always enables Inbox, so the attention entry cannot disappear.
    companions: ["inbox"],
    summary: "订阅来源，读消息，留下值得留的。",
    workbench: {
      order: 5,
      contributions: [feedUiContribution],
      stylesheet: FEED_STYLES,
      recordRow: { selector: "[data-feed-entry-id]", idDataset: "feedEntryId" },
    },
  },
  {
    project_plugin_id: SHELF_PROJECT_PLUGIN_ID, catalog_order: 11,
    manifest: shelfManifest,
    instructions: SHELF_INSTRUCTIONS,
    personal: true,
    summary: "把文件放上来处理副本，原件不动。",
    workbench: {
      order: 8,
      contributions: [shelfUiContribution, shelfSettingsUiContribution],
      stylesheet: SHELF_STYLES,
      clientFactory: SHELF_CLIENT_FACTORY_SCRIPT,
      // Its terminal well runs xterm, which the side tab's own document has to load (the page loads it for the stage).
      clientAssets: ["/desktop/pty-client.js"],
      settingsClient: SHELF_SETTINGS_CLIENT_SCRIPT,
    },
  },
  {
    project_plugin_id: LINGGUANG_PROJECT_PLUGIN_ID, catalog_order: 12,
    home_store: LINGGUANG_HOME_STORE,
    manifest: lingguangManifest,
    project_data: lingguangProjectData,
    instructions: LINGGUANG_INSTRUCTIONS,
    personal: true,
    summary: "先记下想法，再决定留下或丢掉。",
    workbench: {
      order: 13,
      contributions: [lingguangUiContribution],
      stylesheet: LINGGUANG_STYLES,
      clientFactory: LINGGUANG_CLIENT_FACTORY_SCRIPT, clientServed: true,
      searchRow: { selector: "[data-lingguang-id]", idDataset: "lingguangId" },
    },
  },
  {
    project_plugin_id: TODO_PROJECT_PLUGIN_ID, catalog_order: 13,
    manifest: todoManifest,
    runtime: { scope: "home", create: createTodoPlugin, database: TODO_DATABASE, package_name: "@molis-ai/molis-work-plugin-todo", factory_export: "createTodoPlugin" },
    project_data: todoProjectData,
    instructions: TODO_INSTRUCTIONS,
    personal: true,
    summary: "记下要做的事，分清今天、在等谁。",
    agent: { prompts: todoPrompts },
    methods: todoMethods,
    workbench: {
      order: 14,
      contributions: [todoUiContribution],
      stylesheet: TODO_STYLES,
      clientFactory: TODO_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-todo-id]", idDataset: "todoId" },
    },
  },
  {
    project_plugin_id: CHARACTERS_PROJECT_PLUGIN_ID, catalog_order: 14,
    manifest: charactersManifest,
    personal: true,
    summary: "定义 AI 做事方式，供任务选用。",
    // Its page is rendered by the project's running plugin and shown as Settings › 角色; this registers that page.
    workbench: {
      order: 14,
      contributions: [charactersSettingsUiContribution],
      clientFactory: CHARACTERS_CLIENT_FACTORY_SCRIPT,
    },
  },
  {
    project_plugin_id: PAGES_PROJECT_PLUGIN_ID, catalog_order: 15,
    home_store: PAGES_HOME_STORE,
    manifest: pagesManifest,
    project_data: pagesProjectData,
    instructions: PAGES_INSTRUCTIONS,
    methods: pagesMethods,
    personal: true,
    summary: "写文档，可导出 Markdown / PDF。",
    workbench: {
      order: 9,
      contributions: [pagesUiContribution],
      stylesheet: PAGES_STYLES,
      clientFactory: PAGES_CLIENT_FACTORY_SCRIPT, clientServed: true,
      clientAssets: ["/assets/molis-work-pages-editor.js"],
      searchRow: { selector: "button.feed-stage-entry[data-page-id]", idDataset: "pageId" },
    },
  },
  {
    project_plugin_id: FORM_PROJECT_PLUGIN_ID, catalog_order: 16,
    home_store: FORM_HOME_STORE,
    manifest: formManifest,
    project_data: formProjectData,
    instructions: FORM_INSTRUCTIONS,
    personal: true,
    summary: "建问卷，收答卷，看逐题汇总。",
    workbench: {
      order: 10,
      contributions: [formUiContribution],
      stylesheet: FORM_STYLES,
      clientFactory: FORM_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-form-id]", idDataset: "formId" },
    },
  },
  {
    project_plugin_id: DATASET_PROJECT_PLUGIN_ID, catalog_order: 17,
    home_store: DATASET_HOME_STORE,
    manifest: datasetManifest,
    project_data: datasetProjectData,
    instructions: DATASET_INSTRUCTIONS,
    personal: true,
    summary: "做表格，导入 CSV，可回到旧版。",
    workbench: {
      order: 11,
      contributions: [datasetUiContribution],
      stylesheet: DATASET_STYLES,
      clientFactory: DATASET_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-dataset-id]", idDataset: "datasetId" },
    },
  },
  {
    project_plugin_id: PPT_PROJECT_PLUGIN_ID, catalog_order: 18,
    home_store: PPT_HOME_STORE,
    manifest: pptManifest,
    project_data: pptProjectData,
    instructions: PPT_INSTRUCTIONS,
    personal: true,
    summary: "写大纲，放映或导出 PowerPoint。",
    workbench: {
      order: 12,
      contributions: [pptUiContribution],
      stylesheet: PPT_STYLES,
      clientFactory: PPT_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-ppt-id]", idDataset: "pptId" },
    },
  },
  {
    project_plugin_id: ALCHEMIST_PROJECT_PLUGIN_ID, catalog_order: 19,
    manifest: alchemistManifest,
    instructions: ALCHEMIST_INSTRUCTIONS,
    personal: true,
    summary: "写下方向，炼成可比较的卡再决定。",
    workbench: {
      order: 15,
      contributions: [alchemistUiContribution],
      stylesheet: ALCHEMIST_STYLES,
      clientFactory: ALCHEMIST_CLIENT_FACTORY_SCRIPT,
      searchRow: { selector: "[data-alchemist-id]", idDataset: "alchemistId" },
    },
  },
  {
    project_plugin_id: WORKFLOWS_PROJECT_PLUGIN_ID, catalog_order: 20,
    home_store: WORKFLOWS_HOME_STORE,
    manifest: workflowsManifest,
    project_data: workflowsProjectData,
    instructions: WORKFLOWS_INSTRUCTIONS,
    personal: true,
    summary: "把插件串成流程，一步步做完。",
    workbench: {
      order: 16,
      contributions: [workflowsUiContribution],
      stylesheet: WORKFLOWS_STYLES,
      clientFactory: WORKFLOWS_CLIENT_FACTORY_SCRIPT,
    },
  },
  {
    project_plugin_id: ARTIFACTS_PROJECT_PLUGIN_ID, catalog_order: 21,
    manifest: artifactsManifest,
    summary: "项目的固定成果，各版本可回看。",
    workbench: {
      order: 18,
      contributions: [artifactReferenceUiContribution, artifactBrowserUiContribution],
    },
  },
  {
    project_plugin_id: CODING_PROJECT_PLUGIN_ID, catalog_order: 22,
    manifest: codingManifest,
    instructions: CODING_INSTRUCTIONS,
    summary: "和 Agent 一起写代码，留每轮记录。",
    agent: { prompts: codingPrompts, skills: codingMethods },
    workbench: {
      order: 20,
      contributions: [codingSettingsContribution],
      clientFactory: CODING_WORKBENCH_SETUP_SCRIPT,
    },
  },
  {
    project_plugin_id: FILES_PROJECT_PLUGIN_ID, catalog_order: 23,
    manifest: filesManifest,
    messages: FILES_MESSAGES,
    workbench: { order: 21, contributions: [], clientFrom: CODING_PROJECT_PLUGIN_ID },
    summary: "查看工作区文件与保留的内容。",
  },
  {
    project_plugin_id: GIT_PROJECT_PLUGIN_ID, catalog_order: 24,
    manifest: gitManifest,
    workbench: { order: 22, contributions: [], clientFrom: CODING_PROJECT_PLUGIN_ID },
    summary: "查看工作区的版本与变更。",
  },
  {
    project_plugin_id: DIFF_PROJECT_PLUGIN_ID, catalog_order: 25,
    manifest: diffManifest,
    messages: DIFF_MESSAGES,
    workbench: { order: 23, contributions: [], clientFrom: CODING_PROJECT_PLUGIN_ID },
    summary: "比较固定版本，逐项阅读差异。",
  },
  {
    project_plugin_id: TEXT_STATS_PROJECT_PLUGIN_ID, catalog_order: 26,
    manifest: textStatsManifest,
    messages: TEXT_STATS_MESSAGES,
    developer: true,
    workbench: { order: 24, contributions: [], clientFrom: CODING_PROJECT_PLUGIN_ID },
    summary: "统计文件快照的字数、字节与行数。",
  },
];
