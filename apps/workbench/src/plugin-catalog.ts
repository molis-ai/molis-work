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
import { SHELF_PROJECT_PLUGIN_ID, shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
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
  description: string;
  /** Always available rather than per-project. Shelf is personal, not project scoped. */
  personal?: boolean;
}

export const BUILTIN_PLUGIN_CATALOG: readonly BuiltinPluginEntry[] = [
  { description: "确定目标，推进工作，留下结果。", project_plugin_id: GOALS_PROJECT_PLUGIN_ID, manifest: goalsManifest },
  { description: "回到你的会话，继续正在做的事。", project_plugin_id: WORK_PROJECT_PLUGIN_ID, manifest: workManifest },
  { description: "只看需要你介入的事项。", project_plugin_id: INBOX_PROJECT_PLUGIN_ID, manifest: inboxManifest },
  { description: "查看来源消息和完整流水。", project_plugin_id: FEED_PROJECT_PLUGIN_ID, manifest: feedManifest },
  { description: "把文件放到置物架，处理副本，原件不动。", project_plugin_id: SHELF_PROJECT_PLUGIN_ID, manifest: shelfManifest, personal: true },
  { description: "打开项目成果，查看保留下来的版本。", project_plugin_id: ARTIFACTS_PROJECT_PLUGIN_ID, manifest: artifactsManifest },
  { description: "围绕代码讨论、执行和审查，保留连续的任务记录。", project_plugin_id: CODING_PROJECT_PLUGIN_ID, manifest: codingManifest },
  { description: "查看当前项目的工作区。", project_plugin_id: WORKSPACE_PROJECT_PLUGIN_ID, manifest: workspaceManifest },
  { description: "查看工作区文件与保留的内容。", project_plugin_id: FILES_PROJECT_PLUGIN_ID, manifest: filesManifest },
  { description: "查看工作区的版本与变更。", project_plugin_id: GIT_PROJECT_PLUGIN_ID, manifest: gitManifest },
  { description: "比较固定版本，逐项阅读差异。", project_plugin_id: DIFF_PROJECT_PLUGIN_ID, manifest: diffManifest },
  { description: "查看材料与成果的文本统计。", project_plugin_id: TEXT_STATS_PROJECT_PLUGIN_ID, manifest: textStatsManifest },
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
    const prompts = entry.project_plugin_id === CODING_PROJECT_PLUGIN_ID ? codingPrompts : [];
    const skills = entry.project_plugin_id === CODING_PROJECT_PLUGIN_ID ? codingMethods : [];
    return [[entry.manifest.plugin_id, { manifest: agent, prompts, skills }] as const];
  }),
);
