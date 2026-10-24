import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createCogniaPlugin } from "@molis-ai/molis-work-plugin-cognia";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { createDatasetPlugin } from "@molis-ai/molis-work-plugin-dataset";
import { createDiffPlugin } from "@molis-ai/molis-work-plugin-diff";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { createFormPlugin } from "@molis-ai/molis-work-plugin-form";
import { createGitPlugin } from "@molis-ai/molis-work-plugin-git";
import { createImagesPlugin } from "@molis-ai/molis-work-plugin-images";
import { createIssuesPlugin } from "@molis-ai/molis-work-plugin-issues";
import { createJellyPlugin } from "@molis-ai/molis-work-plugin-jelly";
import { createLingguangPlugin } from "@molis-ai/molis-work-plugin-lingguang";
import { createPagesPlugin } from "@molis-ai/molis-work-plugin-pages";
import { createPptPlugin } from "@molis-ai/molis-work-plugin-ppt";
import { createSchedulePlugin } from "@molis-ai/molis-work-plugin-schedule";
import { createHomeShelfPlugin, createShelfPlugin } from "@molis-ai/molis-work-plugin-shelf";
import { createTextStatsPlugin } from "@molis-ai/molis-work-plugin-text-stats";
import { createTodoPlugin } from "@molis-ai/molis-work-plugin-todo";
import { createWorkflowsPlugin } from "@molis-ai/molis-work-plugin-workflows";

/**
 * Every built-in plugin's runtime definition (both of Shelf's halves). Since PG-051 a definition carries its own instructions, Agent
 * prompts and methods, which the Host registers while it runs; tests that check those texts read them here, one list for all of them.
 */
export const BUILTIN_DEFINITIONS: readonly PluginDefinition[] = [createCogniaPlugin(), createCodingPlugin(), createDatasetPlugin(), createDiffPlugin(),
  createFilesPlugin(), createFormPlugin(), createGitPlugin(), createImagesPlugin(), createIssuesPlugin(), createJellyPlugin(), createLingguangPlugin(),
  createPagesPlugin(), createPptPlugin(), createSchedulePlugin(), createShelfPlugin(), createHomeShelfPlugin(), createTextStatsPlugin(), createTodoPlugin(),
  createWorkflowsPlugin()];

/** Catalog plugins with no runtime definition to carry Agent texts, and why; with BUILTIN_DEFINITIONS they are the whole catalog. */
export const BUILTIN_WITHOUT_DEFINITION: Readonly<Record<string, string>> = {
  "io.molis.work.alchemist": "Host 承载（PG-051：它的指令在 Host 自己的列表里）",
  "io.molis.work.plugin-builder": "平台能力（PG-051 Q2：题面与 Agent 由 Host 登记）",
  "io.molis.work.artifacts": "包里没有 PluginDefinition",
  "io.molis.work.feed": "包里没有 PluginDefinition",
  "io.molis.work.goals": "包里没有 PluginDefinition",
  "io.molis.work.inbox": "包里没有 PluginDefinition",
  "io.molis.work.sessions": "包里没有 PluginDefinition",
};
