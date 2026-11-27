import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  OVERVIEW_KINDS, OVERVIEW_TABLE_SQL, PERSON_SETTING_KEY_PATTERN, PERSON_SETTING_KINDS, PERSON_SETTING_LIMITS, PLUGIN_DEPENDENCY_LIMIT, PLUGIN_MARKET_CATEGORIES, PLUGIN_PUSH_LIMITS,
  PUSH_POINTER_PATTERN,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { isRecord } from "./json-value.js";
import { PLUGIN_ID } from "./plugin-id.js";
import { DIRECTORY_WORD_LIMITS, staticDirectoryTextRefProblem } from "./ui/directory-words.js";

/**
 * The Manifest fields of the unified partitions (specs/unified-partition-plugins §4–§7, batch 106): `overview_projection`, `market`,
 * `dependencies`, `person_settings` and `push`. Each is checked whole here, so a plugin learns at install, not at its first use, that a
 * declaration cannot work. A person setting of a kind that must stay on this machine marked `portable` is refused here
 * (S-person-settings-private): a secret, a connection or a path never follows the person through sync.
 */
/** The Manifest fields these checks read; a caller hands the whole Manifest or just these. */
export type PartitionDeclarationFields = Pick<PluginManifest, "plugin_id">
  & Partial<Pick<PluginManifest, "databases" | "overview_projection" | "market" | "dependencies" | "person_settings" | "actions" | "push">>
  & { readonly ui?: Pick<PluginManifest["ui"], "locales"> };

export function partitionDeclarationProblems(manifest: PartitionDeclarationFields): string[] {
  return [
    ...overviewProblems(manifest.overview_projection, manifest.databases?.partition?.schema, manifest.databases?.project !== undefined, manifest.plugin_id, Boolean(manifest.ui?.locales)),
    ...marketProblems(manifest.market),
    ...dependencyProblems(manifest.dependencies, manifest.plugin_id),
    ...personSettingProblems(manifest.person_settings),
    ...pushProblems(manifest.push, manifest.actions),
  ];
}

const only = (value: Record<string, unknown>, fields: readonly string[]) => Object.keys(value).filter(field => !fields.includes(field));

function overviewProblems(value: unknown, partitionSchema: unknown, mainDatabase: boolean, pluginId: string, hasLocales: boolean): string[] {
  if (value === undefined) return [];
  // The table lives in the plugin's own partition library, written exactly as the platform gives it, so the platform can read it; a plugin
  // that keeps its data in the partition's main database (`databases.project`) writes the platform's table there through `services.overview` (V17).
  if (partitionSchema === undefined && mainDatabase) { /* the platform's table in the main database */ }
  else if (typeof partitionSchema !== "string" || !partitionSchema.includes(OVERVIEW_TABLE_SQL)) {
    return ["overview_projection 要求 databases.partition（schema 原样写入平台的 OVERVIEW_TABLE_SQL），或 databases.project（经 services.overview 写平台在主库的表）"];
  }
  if (!isRecord(value)) return ["overview_projection 必须为对象"];
  const extra = only(value, ["kinds", "title_text"]);
  if (extra.length) return [`overview_projection 不认这些字段：${extra.join(", ")}（只声明种类，不写列名与 SQL）`];
  if (!Array.isArray(value.kinds) || value.kinds.length === 0) return [`overview_projection.kinds 至少要声明一种：${OVERVIEW_KINDS.join(", ")}`];
  const problems: string[] = [], seen = new Set<string>();
  for (const kind of value.kinds) {
    if (!(OVERVIEW_KINDS as readonly unknown[]).includes(kind)) problems.push(`overview_projection.kinds 里的 ${String(kind)} 不是平台的总览种类（${OVERVIEW_KINDS.join(", ")}）`);
    else if (seen.has(kind)) problems.push(`overview_projection.kinds 重复：${kind}`);
    seen.add(String(kind));
  }
  if (value.title_text !== undefined) {
    const problem = staticDirectoryTextRefProblem("overview_projection.title_text", value.title_text, pluginId, DIRECTORY_WORD_LIMITS.actionTitle, hasLocales);
    if (problem !== null) problems.push(problem);
  }
  return problems;
}

function marketProblems(value: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value) || only(value, ["category"]).length || !(PLUGIN_MARKET_CATEGORIES as readonly unknown[]).includes(value.category)) {
    return [`market 只写 category，取 ${PLUGIN_MARKET_CATEGORIES.join(", ")} 之一`];
  }
  return [];
}

function dependencyProblems(value: unknown, pluginId: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return ["dependencies 必须为数组"];
  if (value.length > PLUGIN_DEPENDENCY_LIMIT) return [`dependencies 至多 ${PLUGIN_DEPENDENCY_LIMIT} 项`];
  const problems: string[] = [], seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || only(entry, ["plugin_id", "enable_with", "optional", "reason"]).length || typeof entry.plugin_id !== "string" || !PLUGIN_ID.test(entry.plugin_id)) {
      problems.push("dependencies 的每一项要有合法的 plugin_id 与 reason，可选 enable_with、optional");
      continue;
    }
    if (entry.plugin_id === pluginId) problems.push("dependencies 不能写插件自己");
    if (seen.has(entry.plugin_id)) problems.push(`dependencies 重复：${entry.plugin_id}`);
    seen.add(entry.plugin_id);
    if (entry.enable_with !== undefined && entry.enable_with !== true) problems.push(`dependencies 里 ${entry.plugin_id} 的 enable_with 只能写 true`);
    if (entry.optional !== undefined && entry.optional !== true) problems.push(`dependencies 里 ${entry.plugin_id} 的 optional 只能写 true`);
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0 || entry.reason.length > 200) problems.push(`dependencies 里 ${entry.plugin_id} 要写一句给本人看的 reason（至多 200 字）`);
  }
  return problems;
}

function personSettingProblems(value: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value) || only(value, ["keys"]).length || !Array.isArray(value.keys)) return ["person_settings 只写 keys（数组）"];
  if (value.keys.length === 0 || value.keys.length > PERSON_SETTING_LIMITS.keys) return [`person_settings.keys 要有 1 到 ${PERSON_SETTING_LIMITS.keys} 项`];
  const problems: string[] = [], seen = new Set<string>();
  for (const entry of value.keys) {
    if (!isRecord(entry) || only(entry, ["key", "kind", "portable"]).length || typeof entry.key !== "string" || !PERSON_SETTING_KEY_PATTERN.test(entry.key)
      || !(PERSON_SETTING_KINDS as readonly unknown[]).includes(entry.kind)) {
      problems.push(`person_settings.keys 的每一项要有 key（小写字母开头，至多 ${PERSON_SETTING_LIMITS.key} 字）与 kind（${PERSON_SETTING_KINDS.join(", ")}），可选 portable`);
      continue;
    }
    if (seen.has(entry.key)) problems.push(`person_settings.keys 重复：${entry.key}`);
    seen.add(entry.key);
    if (entry.portable !== undefined && entry.portable !== true) problems.push(`person_settings 的 ${entry.key}：portable 只能写 true`);
    else if (entry.portable === true && entry.kind !== "preference") {
      problems.push(`person_settings 的 ${entry.key} 是 ${String(entry.kind)}，只能留在这台电脑上，不能标 portable（密钥、连接与本机路径不同步）`);
    }
  }
  return problems;
}

function pushProblems(value: unknown, actions: PluginManifest["actions"]): string[] {
  if (value === undefined) return [];
  if (!isRecord(value) || only(value, ["kinds"]).length || !Array.isArray(value.kinds) || value.kinds.length === 0) return ["push 只写 kinds（至少一种）"];
  if (value.kinds.length > PLUGIN_PUSH_LIMITS.kinds) return [`push.kinds 至多 ${PLUGIN_PUSH_LIMITS.kinds} 种`];
  const own = new Set((actions ?? []).map(action => action.capability_id));
  const problems: string[] = [], seen = new Set<string>();
  for (const entry of value.kinds) {
    if (!isRecord(entry) || only(entry, ["kind", "export_action", "put_action", "revision", "local_refs", "children"]).length || typeof entry.kind !== "string"
      || !/^[a-z][a-z0-9_]{0,63}$/u.test(entry.kind)) {
      problems.push("push.kinds 的每一项要有 kind、export_action、put_action 与 revision，可选 local_refs、children");
      continue;
    }
    const at = `push 的 ${entry.kind}`;
    if (seen.has(entry.kind)) problems.push(`push.kinds 重复：${entry.kind}`);
    seen.add(entry.kind);
    for (const field of ["export_action", "put_action"] as const) {
      if (typeof entry[field] !== "string" || !own.has(entry[field] as string)) problems.push(`${at}：${field} 要写这个插件自己声明的动作`);
    }
    if (typeof entry.revision !== "string" || !PUSH_POINTER_PATTERN.test(entry.revision)) problems.push(`${at}：revision 必填，写版本号所在字段（如 /revision）`);
    if (entry.local_refs !== undefined) {
      if (!Array.isArray(entry.local_refs) || entry.local_refs.length > PLUGIN_PUSH_LIMITS.local_refs
        || entry.local_refs.some(ref => !isRecord(ref) || only(ref, ["path", "on_push"]).length || typeof ref.path !== "string" || !PUSH_POINTER_PATTERN.test(ref.path)
          || (ref.on_push !== "strip" && ref.on_push !== "remap"))) {
        problems.push(`${at}：local_refs 每项写 path（如 /folder_id）与 on_push（strip 或 remap）`);
      }
    }
    if (entry.children !== undefined && (!Array.isArray(entry.children) || entry.children.length > PLUGIN_PUSH_LIMITS.children
      || entry.children.some(child => typeof child !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(child)) || new Set(entry.children).size !== entry.children.length)) {
      problems.push(`${at}：children 写不重复的子记录种类名`);
    }
  }
  return problems;
}
