import type { ContractDescriptor } from "./package.js";
import { mcpPluginSlug, mcpPublicToolName, type PluginMcpEffect, type PluginMcpExportDeclaration } from "./plugin-mcp.js";

export const platformPluginBehaviorContract = {
  contractId: "io.molis.work.platform.plugin-behavior.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/functions-system-capability/spec.md",
} as const satisfies ContractDescriptor;

const ID = /^[a-z0-9][a-z0-9-]*$/u;

export interface PluginBehaviorDeclaration {
  readonly behavior_id: string;
  readonly title: string;
  readonly effect: PluginMcpEffect;
  readonly subject_kinds: readonly string[];
}

export interface PluginFunctionSceneDeclaration {
  readonly scene_id: string;
  readonly title: string;
  readonly subject_kinds: readonly string[];
}

export interface PluginJudgmentSubjectDeclaration {
  readonly subject_kind: string;
  readonly title: string;
}

export interface RegisteredBehavior {
  readonly behavior_id: string;
  readonly plugin_id: string;
  readonly title: string;
  readonly effect: PluginMcpEffect;
  readonly subject_kinds: readonly string[];
  readonly source: "plugin" | "mcp" | "system";
}

export function publicBehaviorName(pluginSlug: string, behaviorId: string): string {
  return `${pluginSlug}.${behaviorId}`;
}

export function mcpExportBehaviorId(pluginSlug: string, toolId: string): string {
  return mcpPublicToolName(pluginSlug, toolId);
}

export function inspectBehaviors(_pluginId: string, behaviors: PluginBehaviorDeclaration[] | undefined): string[] {
  if (behaviors === undefined) return [];
  if (!Array.isArray(behaviors)) return ["behaviors 必须为数组"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of behaviors) {
    if (!entry || typeof entry !== "object") {
      problems.push("behaviors 条目不合法");
      continue;
    }
    if (typeof entry.behavior_id !== "string" || !ID.test(entry.behavior_id)) {
      problems.push("behaviors 的 behavior_id 不合法");
      continue;
    }
    if (seen.has(entry.behavior_id)) {
      problems.push(`behaviors 重复：${entry.behavior_id}`);
      continue;
    }
    seen.add(entry.behavior_id);
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      problems.push(`behaviors ${entry.behavior_id} 缺少标题`);
    }
    if (entry.effect !== "read" && entry.effect !== "write") {
      problems.push(`behaviors ${entry.behavior_id} 的 effect 必须是 read 或 write`);
    }
    if (!Array.isArray(entry.subject_kinds) || entry.subject_kinds.length === 0
      || entry.subject_kinds.some((kind) => typeof kind !== "string" || kind.trim() === "")) {
      problems.push(`behaviors ${entry.behavior_id} 必须声明 subject_kinds`);
    }
  }
  return problems;
}

export function inspectFunctionScenes(scenes: PluginFunctionSceneDeclaration[] | undefined): string[] {
  if (scenes === undefined) return [];
  if (!Array.isArray(scenes)) return ["function_scenes 必须为数组"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of scenes) {
    if (!entry || typeof entry !== "object") {
      problems.push("function_scenes 条目不合法");
      continue;
    }
    if (typeof entry.scene_id !== "string" || !/^[a-z0-9][a-z0-9.-]*$/u.test(entry.scene_id)) {
      problems.push("function_scenes 的 scene_id 不合法");
      continue;
    }
    if (seen.has(entry.scene_id)) {
      problems.push(`function_scenes 重复：${entry.scene_id}`);
      continue;
    }
    seen.add(entry.scene_id);
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      problems.push(`function_scenes ${entry.scene_id} 缺少标题`);
    }
    if (!Array.isArray(entry.subject_kinds) || entry.subject_kinds.length === 0) {
      problems.push(`function_scenes ${entry.scene_id} 必须声明 subject_kinds`);
    }
  }
  return problems;
}

export function inspectJudgmentSubjects(subjects: PluginJudgmentSubjectDeclaration[] | undefined): string[] {
  if (subjects === undefined) return [];
  if (!Array.isArray(subjects)) return ["judgment_subjects 必须为数组"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of subjects) {
    if (!entry || typeof entry !== "object") {
      problems.push("judgment_subjects 条目不合法");
      continue;
    }
    if (typeof entry.subject_kind !== "string" || entry.subject_kind.trim() === "") {
      problems.push("judgment_subjects 缺少 subject_kind");
      continue;
    }
    if (seen.has(entry.subject_kind)) {
      problems.push(`judgment_subjects 重复：${entry.subject_kind}`);
      continue;
    }
    seen.add(entry.subject_kind);
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      problems.push(`judgment_subjects ${entry.subject_kind} 缺少标题`);
    }
  }
  return problems;
}

export function behaviorsFromMcpExports(
  pluginId: string,
  exports: readonly PluginMcpExportDeclaration[] | undefined,
): RegisteredBehavior[] {
  const slug = mcpPluginSlug(pluginId);
  return (exports ?? []).map((entry) => ({
    behavior_id: mcpExportBehaviorId(slug, entry.tool_id),
    plugin_id: pluginId,
    title: entry.description,
    effect: entry.effect,
    subject_kinds: ["mcp_invoke"],
    source: "mcp" as const,
  }));
}

export function behaviorsFromPluginDeclarations(
  pluginId: string,
  behaviors: readonly PluginBehaviorDeclaration[] | undefined,
): RegisteredBehavior[] {
  const slug = mcpPluginSlug(pluginId);
  return (behaviors ?? []).map((entry) => ({
    behavior_id: publicBehaviorName(slug, entry.behavior_id),
    plugin_id: pluginId,
    title: entry.title,
    effect: entry.effect,
    subject_kinds: entry.subject_kinds,
    source: "plugin" as const,
  }));
}

export function assembleRegisteredBehaviors(
  manifests: readonly { plugin_id: string; mcp_exports?: readonly PluginMcpExportDeclaration[]; behaviors?: readonly PluginBehaviorDeclaration[] }[],
  system: readonly RegisteredBehavior[] = [],
): RegisteredBehavior[] {
  const byId = new Map<string, RegisteredBehavior>();
  for (const row of system) byId.set(row.behavior_id, row);
  for (const manifest of manifests) {
    for (const row of [
      ...behaviorsFromMcpExports(manifest.plugin_id, manifest.mcp_exports),
      ...behaviorsFromPluginDeclarations(manifest.plugin_id, manifest.behaviors),
    ]) {
      if (!byId.has(row.behavior_id)) byId.set(row.behavior_id, row);
    }
  }
  return [...byId.values()];
}
