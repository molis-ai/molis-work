import type {
  ProjectPluginId,
  ProjectPluginRegistry,
} from "@molis-ai/molis-work-contracts/modules/projects";
import { PROJECT_PLUGIN_COMPANIONS } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UiViewRegistry, type UiPlacedView } from "@molis-ai/molis-work-ui-host";
import { ARTIFACTS_PROJECT_PLUGIN_ID, artifactsManifest } from "@molis-ai/molis-work-plugin-artifacts";
import { CODING_PROJECT_PLUGIN_ID, codingManifest, codingPrompts, codingMethods } from "@molis-ai/molis-work-plugin-coding";
import { DIFF_PROJECT_PLUGIN_ID, diffManifest } from "@molis-ai/molis-work-plugin-diff";
import { FILES_PROJECT_PLUGIN_ID, filesManifest } from "@molis-ai/molis-work-plugin-files";
import { GIT_PROJECT_PLUGIN_ID, gitManifest } from "@molis-ai/molis-work-plugin-git";
import { TEXT_STATS_PROJECT_PLUGIN_ID, textStatsManifest } from "@molis-ai/molis-work-plugin-text-stats";
import { WORKSPACE_PROJECT_PLUGIN_ID, workspaceManifest } from "@molis-ai/molis-work-plugin-workspace";
import type { AgentManifest, AgentPromptText, AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { FEED_PROJECT_PLUGIN_ID, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PROJECT_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { INBOX_PROJECT_PLUGIN_ID, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { SCHEDULE_PROJECT_PLUGIN_ID, scheduleManifest, schedulePrompts } from "@molis-ai/molis-work-plugin-schedule";
import { SHELF_PROJECT_PLUGIN_ID, shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import { FUNCTIONS_PROJECT_PLUGIN_ID, functionsManifest } from "@molis-ai/molis-work-plugin-functions";
import { CHARACTERS_PROJECT_PLUGIN_ID, charactersManifest } from "@molis-ai/molis-work-plugin-characters";
import { PAGES_PROJECT_PLUGIN_ID, pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { FORM_PROJECT_PLUGIN_ID, formManifest } from "@molis-ai/molis-work-plugin-form";
import { DATASET_PROJECT_PLUGIN_ID, datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { PPT_PROJECT_PLUGIN_ID, pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { LINGGUANG_PROJECT_PLUGIN_ID, lingguangManifest } from "@molis-ai/molis-work-plugin-lingguang";
import { WORK_PROJECT_PLUGIN_ID, workManifest } from "@molis-ai/molis-work-plugin-work";

/**
 * One Plugin this build ships. Adding a Plugin means adding an entry here and
 * nothing else: navigation, settings placement and project enablement are all
 * derived from its Manifest.
 */
export interface BuiltinPluginEntry {
  /** Identity the project database stores. Distinct from the Manifest's global id. */
  project_plugin_id: ProjectPluginId;
  manifest: PluginManifest;
  /** Always available rather than per-project. Shelf and Functions are personal, not project scoped. */
  personal?: boolean;
  /** Market card copy. Presence means this Plugin is listed in the built-in market. */
  summary?: string;
}

export interface PluginMarketCard {
  readonly id: ProjectPluginId;
  readonly label: string;
  readonly glyph: string;
  readonly copy: string;
  readonly personal: boolean;
}

export const BUILTIN_PLUGIN_CATALOG: readonly BuiltinPluginEntry[] = [
  { project_plugin_id: GOALS_PROJECT_PLUGIN_ID, manifest: goalsManifest, summary: "确定目标，推进工作，留下结果。" },
  { project_plugin_id: WORK_PROJECT_PLUGIN_ID, manifest: workManifest, summary: "回到你的会话，继续正在做的事。" },
  { project_plugin_id: INBOX_PROJECT_PLUGIN_ID, manifest: inboxManifest, summary: "只看需要你介入的事项。" },
  { project_plugin_id: SCHEDULE_PROJECT_PLUGIN_ID, manifest: scheduleManifest, summary: "到点跑自己的对话任务，也叫醒其他插件的闹钟。" },
  { project_plugin_id: FEED_PROJECT_PLUGIN_ID, manifest: feedManifest, summary: "查看来源消息和完整流水。" },
  { project_plugin_id: SHELF_PROJECT_PLUGIN_ID, manifest: shelfManifest, personal: true, summary: "把文件放到置物架，处理副本，原件不动。" },
  { project_plugin_id: LINGGUANG_PROJECT_PLUGIN_ID, manifest: lingguangManifest, personal: true, summary: "先记下还没想清楚的想法，再决定留下或丢掉。" },
  { project_plugin_id: FUNCTIONS_PROJECT_PLUGIN_ID, manifest: functionsManifest, personal: true, summary: "Inbox、首页、Feed 显示哪个按钮。" },
  { project_plugin_id: CHARACTERS_PROJECT_PLUGIN_ID, manifest: charactersManifest, personal: true, summary: "编辑角色的做事方式，发布固定版本供 AI 任务选择。" },
  { project_plugin_id: PAGES_PROJECT_PLUGIN_ID, manifest: pagesManifest, personal: true, summary: "写文档，用块和格式，保存在这台电脑。" },
  { project_plugin_id: FORM_PROJECT_PLUGIN_ID, manifest: formManifest, personal: true, summary: "建问卷，预览填写，看结果。" },
  { project_plugin_id: DATASET_PROJECT_PLUGIN_ID, manifest: datasetManifest, personal: true, summary: "改表格，导入 CSV，留下版本。" },
  { project_plugin_id: PPT_PROJECT_PLUGIN_ID, manifest: pptManifest, personal: true, summary: "写幻灯片大纲，预览并导出 JSON。" },
  { project_plugin_id: ARTIFACTS_PROJECT_PLUGIN_ID, manifest: artifactsManifest, summary: "打开项目成果，查看保留下来的版本。" },
  { project_plugin_id: CODING_PROJECT_PLUGIN_ID, manifest: codingManifest, summary: "围绕代码讨论、执行和审查，保留连续的任务记录。" },
  { project_plugin_id: WORKSPACE_PROJECT_PLUGIN_ID, manifest: workspaceManifest, summary: "查看当前项目的工作区。" },
  { project_plugin_id: FILES_PROJECT_PLUGIN_ID, manifest: filesManifest, summary: "查看工作区文件与保留的内容。" },
  { project_plugin_id: GIT_PROJECT_PLUGIN_ID, manifest: gitManifest, summary: "查看工作区的版本与变更。" },
  { project_plugin_id: DIFF_PROJECT_PLUGIN_ID, manifest: diffManifest, summary: "比较固定版本，逐项阅读差异。" },
  { project_plugin_id: TEXT_STATS_PROJECT_PLUGIN_ID, manifest: textStatsManifest, summary: "查看材料与成果的文本统计。" },
];

/** Plugins a project can enable. Personal Plugins are always on and not listed. */
export const PROJECT_SCOPED_PLUGIN_IDS: readonly ProjectPluginId[] = BUILTIN_PLUGIN_CATALOG
  .filter((entry) => entry.personal !== true)
  .map((entry) => entry.project_plugin_id);

/** Personal Plugins are enabled for every project without being stored per project. */
export const PERSONAL_PLUGIN_IDS: readonly ProjectPluginId[] = BUILTIN_PLUGIN_CATALOG
  .filter((entry) => entry.personal === true)
  .map((entry) => entry.project_plugin_id);

/**
 * Host chrome that opens a Plugin's own stage instead of a nested directory.
 * Personal Plugins join this set automatically.
 */
export const DIRECT_WORK_SURFACE_IDS: ReadonlySet<string> = new Set([
  "home",
  "market",
  "feed",
  "goals",
  "sessions",
  "inbox",
  "schedule",
  "artifacts",
  ...PERSONAL_PLUGIN_IDS,
]);

/** Directory panels owned by a Plugin stage, including Feed's sources alias. */
export const OWN_DIRECTORY_SURFACES: readonly string[] = [
  "feed",
  "sources",
  "sessions",
  "inbox",
  "schedule",
  "artifacts",
  ...PERSONAL_PLUGIN_IDS,
];

/**
 * Plugins that must come along, worked out from the Manifests.
 *
 * A Plugin with a **required** input port needs somebody in this project able
 * to publish that type; enabled on its own it could never be bound, and the
 * user would get a navigation entry that is permanently empty with no way to
 * tell why. Optional ports pull in nothing: Diff with nothing connected is a
 * legitimate state that explains itself.
 *
 * The closure is computed here because the Projects service applies companions
 * one level deep — it enables what this returns, not what that in turn needs.
 * Deriving it from the Manifests is also what keeps the promise above this
 * file true: adding a Plugin is adding a catalog entry and nothing else.
 */
function requiredCompanions(projectPluginId: ProjectPluginId): ProjectPluginId[] {
  const producers = new Map<string, ProjectPluginId>();
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    for (const port of entry.manifest.ports?.outputs ?? []) {
      const key = `${port.artifact_type_id}@${port.schema_version}`;
      if (!producers.has(key)) producers.set(key, entry.project_plugin_id);
    }
  }
  const needed = new Set<ProjectPluginId>();
  const pending = [projectPluginId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    const manifest = entryFor(current)?.manifest;
    if (manifest === undefined) continue;
    for (const port of manifest.ports?.inputs ?? []) {
      if (port.optional === true) continue;
      const producer = producers.get(`${port.artifact_type_id}@${port.schema_version}`);
      // A required port with no producer in this build is left alone: enabling
      // an unrelated Plugin would not help, and saying nothing is honest.
      if (producer === undefined || producer === projectPluginId || needed.has(producer)) continue;
      needed.add(producer);
      pending.push(producer);
    }
  }
  return [...needed];
}

/** The registry Projects validates against, derived from what this build ships. */
export const BUILTIN_PLUGIN_REGISTRY: ProjectPluginRegistry = {
  has: (pluginId) => PROJECT_SCOPED_PLUGIN_IDS.includes(pluginId),
  companions: (pluginId) => [
    ...(PROJECT_PLUGIN_COMPANIONS[pluginId as keyof typeof PROJECT_PLUGIN_COMPANIONS] ?? []),
    ...requiredCompanions(pluginId),
  ],
};

export interface RailEntry {
  id: ProjectPluginId;
  surface: string;
  label: string;
  glyph: string;
}

function entryFor(projectPluginId: ProjectPluginId): BuiltinPluginEntry | undefined {
  return BUILTIN_PLUGIN_CATALOG.find((entry) => entry.project_plugin_id === projectPluginId);
}

/** Navigator entries for the enabled set, in the order the Manifests declare. */
export function railEntries(enabled: readonly ProjectPluginId[]): RailEntry[] {
  const registry = new UiViewRegistry(BUILTIN_PLUGIN_CATALOG.map((entry) => ({
    manifest: entry.manifest,
    enabled: enabled.includes(entry.project_plugin_id),
  })));
  return registry.slot("navigator").map((view: UiPlacedView) => {
    const entry = BUILTIN_PLUGIN_CATALOG.find((item) => item.manifest.plugin_id === view.plugin_id);
    return {
      id: entry?.project_plugin_id ?? view.plugin_id,
      surface: entry?.project_plugin_id ?? view.plugin_id,
      label: view.title,
      glyph: view.icon ?? "package",
    };
  });
}

/** Settings pages for the enabled set, in Manifest order. */
export function settingsEntries(enabled: readonly ProjectPluginId[]): UiPlacedView[] {
  const registry = new UiViewRegistry(BUILTIN_PLUGIN_CATALOG.map((entry) => ({
    manifest: entry.manifest,
    enabled: enabled.includes(entry.project_plugin_id),
  })));
  return registry.slot("settings");
}

export function manifestFor(projectPluginId: ProjectPluginId): PluginManifest | undefined {
  return entryFor(projectPluginId)?.manifest;
}

export function pluginMarketCards(): readonly PluginMarketCard[] {
  return BUILTIN_PLUGIN_CATALOG.flatMap((entry) => {
    if (!entry.summary) return [];
    const nav = entry.manifest.ui?.views?.find((view) => view.slot === "navigator");
    return [{
      id: entry.project_plugin_id,
      label: nav?.title ?? entry.manifest.name,
      glyph: nav?.icon ?? "package",
      copy: entry.summary,
      personal: entry.personal === true,
    }];
  });
}

export function pluginTabGlyphs(): Record<string, string> {
  return Object.fromEntries([
    ["home", "home"],
    ["market", "grid"],
    ...railEntries([...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS]).map((entry) => [entry.id, entry.glyph]),
  ]);
}

export function pluginTabTitles(): Record<string, string> {
  return Object.fromEntries(
    railEntries([...PROJECT_SCOPED_PLUGIN_IDS, ...PERSONAL_PLUGIN_IDS]).map((entry) => [entry.id, entry.label]),
  );
}

/**
 * Plugins that can run an Agent, with the prompt bodies their package ships.
 *
 * The Host freezes a role from these before any Run starts, so a Runtime never
 * resolves a role or invents a prompt. A Plugin without an `agent` block simply
 * is not here — absence is how "this Plugin does not run Agents" is stated.
 */
export const BUILTIN_PLUGIN_AGENTS: ReadonlyMap<string, {
  readonly manifest: AgentManifest;
  readonly prompts: readonly AgentPromptText[];
  readonly skills: readonly AgentSkillDefinition[];
}> = new Map(
  BUILTIN_PLUGIN_CATALOG.flatMap((entry) => {
    const agent = entry.manifest.agent;
    if (agent === undefined) return [];
    const prompts = entry.project_plugin_id === CODING_PROJECT_PLUGIN_ID
      ? codingPrompts
      : entry.project_plugin_id === SCHEDULE_PROJECT_PLUGIN_ID
        ? schedulePrompts
        : [];
    const skills = entry.project_plugin_id === CODING_PROJECT_PLUGIN_ID ? codingMethods : [];
    return [[entry.manifest.plugin_id, { manifest: agent, prompts, skills }] as const];
  }),
);
