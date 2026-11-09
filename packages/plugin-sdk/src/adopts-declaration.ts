import { actionEffect, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  CONTENT_ADOPTION_RESULT_SCHEMA, CONTENT_ADOPTION_REVERT_INPUT_SCHEMA, CONTENT_ADOPTION_REVERT_RESULT_SCHEMA,
  contentAdoptionInputSchema, contentAdoptionReadInputSchema, contentAdoptionReadOutputSchema,
} from "@molis-ai/molis-work-contracts/platform/blueprints";
import { pluginErrors, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { isId } from "./action-declarations.js";
import { isBlueprintContentType } from "./blueprints.js";
import { validVersion } from "./declaration-problems.js";
import { canonicalJsonText } from "./json-value.js";
import { assertJson, assertSchema, isJsonObject, type SandboxSchemaFailure } from "./sandbox-schema.js";
import { textRefProblems, tryOwnedTextRef } from "./ui/text-ref.js";

const schemaFailure: SandboxSchemaFailure = (_kind, reason) => { throw pluginErrors.declaration_invalid(reason); };
const entryFields = ["type", "title", "schema", "adopt", "read", "revert"];
const refFields = ["capability_id", "version"];

/** The caller supplies the declaring owner's actions only, never the merged directory. */
export function validateAdoptsDeclaration(manifest: {
  readonly adopts?: unknown;
  readonly actions?: unknown;
  readonly plugin_id?: unknown;
}): readonly PluginDeclarationProblem[] {
  if (manifest.adopts === undefined) return [];
  if (!Array.isArray(manifest.adopts)) return [{ path: "adopts", reason: "内容采用声明必须是列表" }];
  const entries: readonly unknown[] = manifest.adopts;
  const actions = Array.isArray(manifest.actions) ? manifest.actions.filter(isJsonObject) : [];
  const seen = new Set<string>();
  return entries.flatMap((entry, index) => inspectEntry(entry, `adopts[${index}]`, manifest.plugin_id, actions, seen));
}

function inspectEntry(entry: unknown, path: string, owner: unknown, actions: readonly Record<string, unknown>[], seen: Set<string>): PluginDeclarationProblem[] {
  if (!isJsonObject(entry)) return [{ path, reason: "内容采用条目必须是对象" }];
  const problems = extraFields(entry, entryFields, path);
  if (!isBlueprintContentType(entry.type)) problems.push({ path: `${path}.type`, reason: "内容类型必须是 <主人>.<名字>.v<正整数>" });
  else if (seen.has(entry.type)) problems.push({ path: `${path}.type`, reason: "同一主人不能重复声明同一内容类型" });
  else seen.add(entry.type);
  problems.push(...titleProblems(entry.title, owner, `${path}.title`));
  const body = entry.schema;
  try { assertSchema(body, schemaFailure); }
  catch (error) {
    return [...problems, { path: `${path}.schema`, reason: error instanceof Error ? error.message : "内容正文 schema 无效" }];
  }
  return [...problems, ...endpointProblems(entry, path, body, actions)];
}

function titleProblems(title: unknown, owner: unknown, path: string): PluginDeclarationProblem[] {
  const problems = textRefProblems(title, { literal: false });
  if (problems.length > 0) return problems.map(reason => ({ path, reason }));
  return typeof owner === "string" && tryOwnedTextRef(title, owner) !== null
    ? [] : [{ path, reason: "内容标题的键必须使用本主人的前缀或平台共有的 common." }];
}

function extraFields(value: Record<string, unknown>, allowed: readonly string[], path: string): PluginDeclarationProblem[] {
  return Object.keys(value).filter(key => !allowed.includes(key)).map(key => ({ path: `${path}.${key}`, reason: "未声明的字段" }));
}

type Endpoint = "adopt" | "read" | "revert";

function endpointProblems(entry: Record<string, unknown>, path: string, body: SandboxSchema, actions: readonly Record<string, unknown>[]): PluginDeclarationProblem[] {
  const problems: PluginDeclarationProblem[] = [];
  const writeScope = inspectEndpoint(entry.adopt, actions, "adopt", `${path}.adopt`, contentAdoptionInputSchema(body), CONTENT_ADOPTION_RESULT_SCHEMA, problems);
  const readScope = inspectEndpoint(entry.read, actions, "read", `${path}.read`, contentAdoptionReadInputSchema(body), contentAdoptionReadOutputSchema(), problems);
  const revertScope = entry.revert === undefined ? undefined : inspectEndpoint(entry.revert, actions, "revert", `${path}.revert`,
    CONTENT_ADOPTION_REVERT_INPUT_SCHEMA, CONTENT_ADOPTION_REVERT_RESULT_SCHEMA, problems);
  if (new Set([writeScope, readScope, revertScope].filter(scope => scope !== undefined)).size > 1) {
    problems.push({ path, reason: "采用、批读和撤销动作必须使用同一 scope" });
  }
  return problems;
}

function inspectEndpoint(ref: unknown, definitions: readonly Record<string, unknown>[], endpoint: Endpoint, path: string,
  input: ActionSchema, output: ActionSchema, problems: PluginDeclarationProblem[]): "home" | "project" | undefined {
  if (!isJsonObject(ref) || !isId(ref.capability_id) || !validVersion(ref.version)) {
    problems.push({ path, reason: "动作引用需要有效的 capability_id 与 version" });
    return;
  }
  problems.push(...extraFields(ref, refFields, path));
  const matches = definitions.filter(action => action.capability_id === ref.capability_id && action.version === ref.version);
  const action = matches[0]?.action;
  if (matches.length !== 1 || !isJsonObject(action)) {
    problems.push({ path, reason: "必须引用本主人唯一声明的动作及版本" });
    return;
  }
  problems.push(...metadataProblems(matches[0]?.operation, ref.capability_id, action, endpoint, path));
  if (!matchesFixedBranch(action.input_schema, input) || !matchesFixedBranch(action.output_schema, output)) {
    problems.push({ path, reason: "动作必须使用固定的闭合采用合同，正文须匹配声明的 schema" });
  }
  if (action.scope === "home" || action.scope === "project") return action.scope;
  problems.push({ path, reason: "动作 scope 必须是 home 或 project" });
}

function metadataProblems(operation: unknown, id: string, action: Record<string, unknown>, endpoint: Endpoint, path: string): PluginDeclarationProblem[] {
  const read = endpoint === "read";
  const kind = read ? "query" : "operation";
  const effect = action.effect === undefined ? actionEffect({ kind }, id) : action.effect;
  return operation === (read ? "query" : "command") && action.kind === kind && effect === (read ? "read" : "write")
    && Array.isArray(action.audiences) && action.audiences.includes("user")
    ? [] : [{ path, reason: read ? "采用批读必须是本人可调用的查询" : "采用和撤销必须是本人可调用的可写命令" }];
}

function matchesFixedBranch(actual: unknown, expected: ActionSchema): boolean {
  try { assertJson(actual, schemaFailure); } catch { return false; }
  const expectedText = canonicalJsonText(expected);
  if (canonicalJsonText(actual) === expectedText) return true;
  if (!isJsonObject(actual) || Object.keys(actual).length !== 1 || !Array.isArray(actual.oneOf)) return false;
  const branches: readonly unknown[] = actual.oneOf;
  const matching = branches.filter(branch => canonicalJsonText(branch) === expectedText);
  return matching.length === 1 && branches.every(branch => branch === matching[0] || disjointObjects(branch, expected));
}

/** A direct edit branch cannot swallow a malformed adoption request or an adoption receipt. */
function disjointObjects(branch: unknown, expected: ActionSchema): boolean {
  if (!isJsonObject(branch) || Object.keys(branch).some(key => !["type", "properties", "required", "additionalProperties"].includes(key))) return false;
  if (branch.type !== "object" || branch.additionalProperties !== false || !isJsonObject(branch.properties) || !Array.isArray(branch.required)) return false;
  const properties = branch.properties;
  const required: readonly unknown[] = branch.required;
  return required.every(key => typeof key === "string" && Object.hasOwn(properties, key))
    && Array.isArray(expected.required) && expected.required.some(key => !Object.hasOwn(properties, key));
}
