import { actionEffect, type ActionDefinition, type ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  SETTINGS_CONSEQUENCES, SETTINGS_LAYERS, SETTINGS_READ_INPUT_SCHEMA, SETTINGS_READ_INPUT_TYPE, SETTINGS_READ_OUTPUT_SCHEMA,
  SETTINGS_READ_OUTPUT_TYPE, SETTINGS_WRITE_INPUT_SCHEMA, SETTINGS_WRITE_INPUT_TYPE,
  type SettingsReadInput, type SettingsValues, type SettingsWriteInput,
} from "@molis-ai/molis-work-contracts/platform/settings";
import { isId, isText } from "./action-declarations.js";
import { quoted, validVersion } from "./declaration-problems.js";
import { canonicalJsonText } from "./json-value.js";
import { assertJson, assertSchema, isJsonObject, type SandboxSchemaFailure } from "./sandbox-schema.js";
import { textRefProblems, tryOwnedTextRef } from "./ui/text-ref.js";

interface SettingsActionOptions {
  readonly capability_id: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly permissions: readonly string[];
}

export interface SettingsActionsOptions {
  readonly scope: ActionMetadata["scope"];
  readonly read: SettingsActionOptions;
  readonly write: SettingsActionOptions;
}

export interface SettingsActions {
  readonly read: ActionDefinition<SettingsReadInput, SettingsValues>;
  readonly write: ActionDefinition<SettingsWriteInput, SettingsValues>;
}

const endpoints = {
  read: { operation: "query", kind: "query", effect: "read", audiences: ["user", "plugin", "agent"], input_type: SETTINGS_READ_INPUT_TYPE, input_schema: SETTINGS_READ_INPUT_SCHEMA },
  write: { operation: "command", kind: "operation", effect: "write", audiences: ["user"], input_type: SETTINGS_WRITE_INPUT_TYPE, input_schema: SETTINGS_WRITE_INPUT_SCHEMA },
} as const;
type SettingsEndpoint = keyof typeof endpoints;

export function defineSettingsActions(options: SettingsActionsOptions): SettingsActions {
  return { read: settingsAction(options.read, options.scope, "read"), write: settingsAction(options.write, options.scope, "write") };
}

function settingsAction<Input>(options: SettingsActionOptions, scope: ActionMetadata["scope"], name: SettingsEndpoint): ActionDefinition<Input, SettingsValues> {
  const { operation, ...metadata } = endpoints[name];
  const { capability_id, version, title, description, permissions } = options;
  return { capability_id, version, operation, action: {
    ...metadata, scope, title, description, permissions: [...permissions], subject_kinds: [], audiences: [...metadata.audiences],
    output_type: SETTINGS_READ_OUTPUT_TYPE, output_schema: SETTINGS_READ_OUTPUT_SCHEMA,
  } };
}

const root = "settings_entries";
const schemaFailure: SandboxSchemaFailure = (_kind, reason) => { throw pluginErrors.declaration_invalid(reason); };

/** The actions must be the declarations of the same owner that declares these setting entries. */
export function validateSettingsDeclaration(manifest: {
  readonly settings_entries?: unknown;
  readonly actions?: unknown;
  readonly plugin_id?: unknown;
}): readonly PluginDeclarationProblem[] {
  const declaration = manifest.settings_entries;
  if (declaration === undefined) return [];
  if (!isJsonObject(declaration)) return [{ path: root, reason: "设置声明必须是对象" }];
  const definitions: readonly unknown[] = Array.isArray(manifest.actions) ? manifest.actions : [];
  return [
    ...extraFields(declaration, ["entries", "read", "write"], root),
    ...entryProblems(declaration.entries, manifest.plugin_id),
    ...settingsActionProblems(declaration, definitions),
  ];
}

export function settingsActionProblems(declaration: { readonly read?: unknown; readonly write?: unknown }, definitions: readonly unknown[]): PluginDeclarationProblem[] {
  const problems: PluginDeclarationProblem[] = [];
  const readScope = inspectEndpoint(declaration.read, definitions, "read", problems);
  const writeScope = inspectEndpoint(declaration.write, definitions, "write", problems);
  if (readScope && writeScope && readScope !== writeScope) problems.push({ path: `${root}.write`, reason: "设置读写动作必须使用同一个 scope" });
  return problems;
}

function inspectEndpoint(ref: unknown, definitions: readonly unknown[], name: SettingsEndpoint, problems: PluginDeclarationProblem[]): ActionMetadata["scope"] | undefined {
  const path = `${root}.${name}`;
  if (!isJsonObject(ref) || !isId(ref.capability_id) || !validVersion(ref.version)) {
    problems.push({ path, reason: "设置动作引用需要有效的 capability_id 和 version" });
    return;
  }
  problems.push(...extraFields(ref, ["capability_id", "version"], path));
  const candidates = definitions.filter(isJsonObject).filter(row => row.capability_id === ref.capability_id && row.version === ref.version);
  const definition = candidates[0];
  if (candidates.length !== 1 || !isJsonObject(definition?.action)) {
    problems.push({ path, reason: "设置动作必须引用本主人唯一声明的动作及版本" });
    return;
  }
  const action = definition.action, expected = endpoints[name];
  const effect = action.effect === undefined ? actionEffect({ kind: expected.kind }, ref.capability_id) : action.effect;
  if (definition.operation !== expected.operation || action.kind !== expected.kind || effect !== expected.effect) {
    problems.push({ path, reason: `设置动作必须是 ${expected.operation}，效果为 ${expected.effect}` });
  }
  const audiences: readonly unknown[] = Array.isArray(action.audiences) ? action.audiences : [];
  if (audiences.length !== expected.audiences.length || !expected.audiences.every(audience => audiences.includes(audience))) {
    problems.push({ path, reason: `设置动作受众必须是 ${expected.audiences.join("、")}` });
  }
  if (action.input_type !== expected.input_type || action.output_type !== SETTINGS_READ_OUTPUT_TYPE
    || !sameSchema(action.input_schema, expected.input_schema) || !sameSchema(action.output_schema, SETTINGS_READ_OUTPUT_SCHEMA)) {
    problems.push({ path, reason: "设置动作必须使用平台固定的输入输出类型及 schema" });
  }
  if (action.scope === "home" || action.scope === "project") return action.scope;
  problems.push({ path, reason: "设置动作 scope 必须是 home 或 project" });
}

function sameSchema(value: unknown, expected: unknown): boolean {
  try { assertJson(value, schemaFailure); return canonicalJsonText(value) === canonicalJsonText(expected); }
  catch { return false; }
}

function entryProblems(value: unknown, pluginId: unknown): PluginDeclarationProblem[] {
  const path = `${root}.entries`;
  if (!Array.isArray(value)) return [{ path, reason: "设置条目必须是数组" }];
  const entries: readonly unknown[] = value;
  const problems: PluginDeclarationProblem[] = [], seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const at = `${path}[${index}]`;
    if (!isJsonObject(entry)) { problems.push({ path: at, reason: "设置条目必须是对象" }); continue; }
    problems.push(...extraFields(entry, ["key", "title", "summary", "layers", "schema", "consequence"], at));
    if (!isText(entry.key)) problems.push({ path: `${at}.key`, reason: "设置 key 必须是非空字符串" });
    else if (seen.has(entry.key)) problems.push({ path: `${at}.key`, reason: "设置 key 重复" });
    else seen.add(entry.key);
    if (!choiceList(entry.layers, SETTINGS_LAYERS) || entry.layers.length === 0) {
      problems.push({ path: `${at}.layers`, reason: "设置必须声明不重复的 project 或 personal 写入层" });
    }
    if (entry.consequence !== undefined && !choiceList(entry.consequence, SETTINGS_CONSEQUENCES)) {
      problems.push({ path: `${at}.consequence`, reason: `设置后果必须是 ${SETTINGS_CONSEQUENCES.join("、")} 中不重复的值` });
    }
    problems.push(...wordProblems(entry.title, pluginId, `${at}.title`));
    if (entry.summary !== undefined) problems.push(...wordProblems(entry.summary, pluginId, `${at}.summary`));
    try { assertSchema(entry.schema, schemaFailure); }
    catch (error) { problems.push({ path: `${at}.schema`, reason: error instanceof Error ? error.message : "设置值 schema 无效" }); }
  }
  return problems;
}

function choiceList(value: unknown, choices: readonly string[]): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  const items = new Set<unknown>(value);
  return items.size === value.length && [...items].every(item => typeof item === "string" && choices.includes(item));
}

function wordProblems(value: unknown, pluginId: unknown, path: string): PluginDeclarationProblem[] {
  const problems = textRefProblems(value, { literal: false });
  if (problems.length) return problems.map(reason => ({ path, reason }));
  if (typeof pluginId === "string" && tryOwnedTextRef(value, pluginId) !== null) return [];
  return [{ path, reason: "设置文字的键必须使用本主人的前缀或平台共有的 common." }];
}

function extraFields(value: Record<string, unknown>, keys: readonly string[], path: string): PluginDeclarationProblem[] {
  return Object.keys(value).filter(key => !keys.includes(key)).map(key => ({ path: `${path}.${key}`, reason: `不认识字段 ${quoted(key)}` }));
}
