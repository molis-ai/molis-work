import { ROLE_TEMPLATE_SCHEMA, parseCharacterTools, type CharacterTemplateAdoptionInput } from "@molis-ai/molis-work-contracts/modules/characters";
import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { TEXT_REF_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";
import { quoted, validToken } from "./declaration-problems.js";
import { PLUGIN_ID } from "./plugin-id.js";
import { assertJson, isJsonObject } from "./sandbox-schema.js";
import { textRefProblems, tryOwnedTextRef } from "./ui/text-ref.js";

export type RoleTemplateInspectionOptions =
  | { readonly source: "draft" }
  | { readonly source: "package"; readonly owner: string };

const fields = ROLE_TEMPLATE_SCHEMA.properties;

/** Inspect declared content. For a package, pass the owner from its trusted Manifest. */
export function inspectRoleTemplate(value: unknown, options: RoleTemplateInspectionOptions): readonly PluginDeclarationProblem[] {
  if (!isJsonObject(value)) return [{ path: "$", reason: "角色模板必须是对象" }];
  if (options.source === "package" && !isPluginId(options.owner)) {
    return [{ path: "$", reason: "场景包校验需要调用方提供插件 ID" }];
  }
  const problems = unexpectedFields(value, fields, "$");
  const { title, instructions, host_tools, action_tools, skills, materials, outputs, works_with } = value;
  const limit = fields.instructions.maxLength;
  if (typeof instructions !== "string" || instructions.length > limit) {
    problems.push({ path: "$.instructions", reason: `角色正文必须是字符串，最长 ${limit} 个 UTF-16 单位` });
  }
  problems.push(...inspectText(title, "$.title", options));
  if (materials !== undefined) problems.push(...inspectText(materials, "$.materials", options));
  if (outputs !== undefined) problems.push(...inspectText(outputs, "$.outputs", options));
  problems.push(...inspectTools(host_tools, "$.host_tools", parseCharacterTools));
  problems.push(...inspectActionTools(action_tools));
  return [...problems, ...inspectSkills(skills), ...inspectCollaborators(works_with)];
}

/** Check a creation after action input validation and localization. The owner still verifies the confirmed choice and scope. */
export function inspectCharacterTemplateAdoption(input: CharacterTemplateAdoptionInput): readonly PluginDeclarationProblem[] {
  if (!("template" in input)) return [];
  const problems = inspectRoleTemplate(input.template, { source: "draft" });
  if (problems.length > 0) return problems.map(problem => ({ ...problem, path: `$.template${problem.path?.slice(1) ?? ""}` }));
  const title = input.template.title;
  if ("literal" in title && title.literal.trim().length > 0 && title.literal.length <= 120) return [];
  return [{ path: "$.template.title", reason: "角色标题不能为空，最长 120 个 UTF-16 单位" }];
}

export function isPluginId(value: unknown): value is string {
  return typeof value === "string" && value.length <= TEXT_REF_LIMITS.owner && PLUGIN_ID.test(value);
}

function unexpectedFields(value: Record<string, unknown>, allowed: Readonly<Record<string, unknown>>, path: string): PluginDeclarationProblem[] {
  return Object.keys(value).filter(key => !Object.hasOwn(allowed, key))
    .map(key => ({ path: `${path}.${key}`, reason: `不认识字段 ${quoted(key)}` }));
}

export function inspectText(value: unknown, path: string, options: RoleTemplateInspectionOptions): PluginDeclarationProblem[] {
  if (options.source === "package") {
    const bound = tryOwnedTextRef(value, options.owner);
    if (bound && "key" in bound) return [];
  }
  const problems = textRefProblems(value, options.source === "package" ? { literal: false } : { key: false });
  if (problems.length > 0 || options.source === "draft") return problems.map(reason => ({ path, reason }));
  return [{ path, reason: "键必须使用本包的文字前缀或平台共有的 common." }];
}

function inspectTools(value: unknown, path: string, parse: (value: unknown) => unknown): PluginDeclarationProblem[] {
  if (value === undefined || value === null) return [];
  try {
    parse(value);
    // The parsers bound the lists. JSON validation also refuses sparse arrays and objects with a custom prototype.
    assertJson(value, (_kind, reason) => { throw pluginErrors.declaration_invalid(reason); });
  } catch (error) {
    return [{ path, reason: error instanceof Error ? error.message : "工具列表无效" }];
  }
  return [];
}

function inspectActionTools(value: unknown): PluginDeclarationProblem[] {
  const path = "$.action_tools";
  const problems = inspectTools(value, path, parseExactActionReferences);
  if (problems.length > 0 || !Array.isArray(value)) return problems;
  return value.flatMap((reference: unknown, index) => isJsonObject(reference)
    ? unexpectedFields(reference, fields.action_tools.items.properties, `${path}[${index}]`) : []);
}

function inspectSkills(value: unknown): PluginDeclarationProblem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [{ path: "$.skills", reason: "Skill 引用必须是数组" }];
  const skills: readonly unknown[] = value;
  const problems: PluginDeclarationProblem[] = [];
  for (const [index, skill] of skills.entries()) {
    const path = `$.skills[${index}]`;
    if (!isJsonObject(skill)) { problems.push({ path, reason: "Skill 引用必须是对象" }); continue; }
    problems.push(...unexpectedFields(skill, fields.skills.items.properties, path));
    if (!isPluginId(skill.pack)) problems.push({ path: `${path}.pack`, reason: "pack 必须是插件 ID" });
    if (!validToken(skill.skill_id)) problems.push({ path: `${path}.skill_id`, reason: "skill_id 必须是以小写字母或数字开头的 Skill 标识" });
  }
  return problems;
}

function inspectCollaborators(value: unknown): PluginDeclarationProblem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [{ path: "$.works_with", reason: "协作角色引用必须是数组" }];
  const ids: readonly unknown[] = value;
  const problems: PluginDeclarationProblem[] = [];
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    const path = `$.works_with[${index}]`;
    if (typeof id !== "string" || id.trim().length === 0) problems.push({ path, reason: "协作角色标识必须是非空字符串" });
    else if (seen.has(id)) problems.push({ path, reason: "协作角色标识重复" });
    else seen.add(id);
  }
  return problems;
}
