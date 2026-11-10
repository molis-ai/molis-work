import { BLUEPRINT_LIMITS, type Blueprint } from "@molis-ai/molis-work-contracts/platform/blueprints";
import { pluginErrors, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SETTINGS_LAYERS } from "@molis-ai/molis-work-contracts/platform/settings";
import { isId, isText } from "./action-declarations.js";
import { quoted, validToken, validVersion } from "./declaration-problems.js";
import { inspectRoleTemplate, inspectText as textProblems, isPluginId, type RoleTemplateInspectionOptions } from "./role-template.js";
import { assertJson, isJsonObject } from "./sandbox-schema.js";
import { childPath } from "./ui/file-reader.js";

const purposeFields = ["audience", "work", "inputs", "outputs", "first_result"] as const;
const translatedRoleFields = ["title", "materials", "outputs", "instructions"] as const;

interface Inspection {
  readonly options: RoleTemplateInspectionOptions;
  readonly problems: PluginDeclarationProblem[];
  readonly translatable?: Set<string>;
}

/** Inspect a blueprint's content and internal references. A package's owner comes from its trusted Manifest. */
export function inspectBlueprint(value: unknown, options: RoleTemplateInspectionOptions): readonly PluginDeclarationProblem[] {
  return inspect(value, options);
}

export const blueprintFilePath = (locale?: string): string => locale === undefined ? "blueprint.json" : `blueprint.${locale}.json`;

/** Inspect each package file once. The caller supplies the locale names from the checked Manifest. */
export function inspectBlueprintLocales(
  defaultBlueprint: unknown,
  others: readonly { locale: string; blueprint: unknown }[],
  options: { owner: string },
): readonly PluginDeclarationProblem[] {
  const packageOptions = { source: "package", owner: options.owner } as const;
  const translatable = new Set<string>();
  const defaults = inspect(defaultBlueprint, packageOptions, translatable);
  const problems = inFile(blueprintFilePath(), defaults);
  for (const { locale, blueprint } of others) {
    const file = blueprintFilePath(locale);
    const translated = inspectBlueprint(blueprint, packageOptions);
    problems.push(...inFile(file, translated));
    if (defaults.length > 0 || translated.length > 0) continue;
    const path = firstDifference(defaultBlueprint, blueprint, "$", translatable);
    if (path !== undefined) problems.push({ path: `${file}:${path}`, reason: "译文的结构必须与默认场景包一致" });
  }
  return problems;
}

function inspect(value: unknown, options: RoleTemplateInspectionOptions, translatable?: Set<string>): PluginDeclarationProblem[] {
  if (options.source === "package" && !isPluginId(options.owner)) {
    return [{ path: "$", reason: "场景包校验需要调用方提供插件 ID" }];
  }
  const problems: PluginDeclarationProblem[] = [];
  const inspection = { options, problems, translatable };
  const blueprint = objectAt(value, "$", ["title", "parts", "purpose", "steps", "example_task"], problems);
  if (!blueprint) return problems;

  inspectText(blueprint.title, "$.title", inspection);
  const parts = listAt(blueprint.parts, "$.parts", BLUEPRINT_LIMITS.parts, problems);
  if (parts?.length === 0) problems.push({ path: "$.parts", reason: "场景包至少要有一个部分" });
  for (const [index, part] of parts?.entries() ?? []) inspectPart(part, `$.parts[${index}]`, inspection);
  const purpose = objectAt(blueprint.purpose, "$.purpose", purposeFields, problems);
  if (purpose) {
    for (const field of purposeFields) inspectText(purpose[field], `$.purpose.${field}`, inspection);
  }
  const steps = listAt(blueprint.steps, "$.steps", BLUEPRINT_LIMITS.steps, problems);
  for (const [index, value] of steps?.entries() ?? []) {
    const path = `$.steps[${index}]`;
    const step = objectAt(value, path, ["step_id", "title", "part_ids"], problems);
    if (!step) continue;
    if (!isText(step.step_id)) problems.push({ path: `${path}.step_id`, reason: "步骤标识必须是非空字符串" });
    inspectText(step.title, `${path}.title`, inspection);
    inspectIds(step.part_ids, `${path}.part_ids`, BLUEPRINT_LIMITS.parts, problems);
  }
  inspectExample(blueprint.example_task, inspection);
  if (problems.length === 0) inspectReferences(value as Blueprint, problems);
  return problems;
}

function inspectPart(value: unknown, path: string, inspection: Inspection): void {
  const { problems } = inspection;
  const part = objectAt(value, path, ["part_id", "required", "layer", "proposal"], problems);
  if (!part) return;
  if (!isText(part.part_id)) problems.push({ path: `${path}.part_id`, reason: "部分标识必须是非空字符串" });
  if (typeof part.required !== "boolean") problems.push({ path: `${path}.required`, reason: "required 必须是布尔值" });
  if (!SETTINGS_LAYERS.some(layer => layer === part.layer)) {
    problems.push({ path: `${path}.layer`, reason: "layer 必须是 project 或 personal" });
  }
  inspectProposal(part.proposal, part.required, `${path}.proposal`, inspection);
}

function inspectProposal(value: unknown, required: unknown, path: string, inspection: Inspection): void {
  const { problems } = inspection;
  if (!isJsonObject(value)) {
    problems.push({ path, reason: "建议必须是对象" });
    return;
  }
  switch (value.kind) {
    case "capability":
      inspectFields(value, path, ["kind", "requires"], problems);
      inspectRequirement(value.requires, required, `${path}.requires`, problems);
      break;
    case "skill": {
      inspectFields(value, path, ["kind", "skill", "state"], problems);
      const skill = objectAt(value.skill, `${path}.skill`, ["pack", "skill_id"], problems);
      if (skill && !isPluginId(skill.pack)) problems.push({ path: `${path}.skill.pack`, reason: "pack 必须是插件 ID" });
      if (skill && !validToken(skill.skill_id)) problems.push({ path: `${path}.skill.skill_id`, reason: "skill_id 必须是有效的 Skill 标识" });
      if (value.state !== "auto" && value.state !== "manual") problems.push({ path: `${path}.state`, reason: "state 必须是 auto 或 manual" });
      break;
    }
    case "role":
      inspectFields(value, path, ["kind", "template"], problems);
      inspectTemplate(value.template, `${path}.template`, inspection);
      break;
    case "setting":
      inspectFields(value, path, ["kind", "key", "value"], problems);
      if (!isText(value.key)) problems.push({ path: `${path}.key`, reason: "设置 key 必须是非空字符串" });
      inspectJson(value.value, `${path}.value`, problems);
      break;
    case "connection":
      inspectFields(value, path, ["kind", "category", "purpose"], problems);
      if (!isText(value.category)) problems.push({ path: `${path}.category`, reason: "连接类别必须是非空字符串" });
      inspectText(value.purpose, `${path}.purpose`, inspection);
      break;
    case "content":
      inspectFields(value, path, ["kind", "type", "body"], problems);
      if (!isBlueprintContentType(value.type)) problems.push({ path: `${path}.type`, reason: "内容类型必须是 <主人>.<名字>.v<正整数>" });
      inspectJson(value.body, `${path}.body`, problems);
      inspection.translatable?.add(`${path}.body`);
      break;
    default:
      problems.push({ path: `${path}.kind`, reason: "未知的建议种类" });
  }
}

/** The same content type can be named by a proposal and by its adopter declaration. */
export function isBlueprintContentType(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.v[1-9][0-9]*$/u.test(value);
}

function inspectRequirement(value: unknown, required: unknown, path: string, problems: PluginDeclarationProblem[]): void {
  const requirement = objectAt(value, path, ["capability_id", "version", "reason", "optional"], problems);
  if (!requirement) return;
  if (!isId(requirement.capability_id)) problems.push({ path: `${path}.capability_id`, reason: "能力标识无效" });
  if (!validVersion(requirement.version)) problems.push({ path: `${path}.version`, reason: "版本必须是正安全整数" });
  if (!isText(requirement.reason)) problems.push({ path: `${path}.reason`, reason: "用途必须是非空字符串" });
  if (requirement.optional !== undefined && typeof requirement.optional !== "boolean") {
    problems.push({ path: `${path}.optional`, reason: "optional 必须是布尔值" });
  } else if (typeof required === "boolean" && required === (requirement.optional === true)) {
    problems.push({ path: `${path}.optional`, reason: "optional 必须与部分的 required 相反，省略视为 false" });
  }
}

function inspectTemplate(value: unknown, path: string, inspection: Inspection): void {
  const { options, problems, translatable } = inspection;
  if (isJsonObject(value) && Array.isArray(value.works_with) && value.works_with.length >= BLUEPRINT_LIMITS.parts) {
    problems.push({ path: `${path}.works_with`, reason: `协作角色最多 ${BLUEPRINT_LIMITS.parts - 1} 个` });
    return;
  }
  for (const problem of inspectRoleTemplate(value, options)) {
    problems.push({ ...problem, path: path + (problem.path?.slice(1) ?? "") });
  }
  if (translatable) for (const field of translatedRoleFields) translatable.add(`${path}.${field}`);
}

function inspectExample(value: unknown, inspection: Inspection): void {
  const path = "$.example_task", { problems } = inspection;
  const example = objectAt(value, path, ["title", "input", "step_ids", "result"], problems);
  if (!example) return;
  inspectText(example.title, `${path}.title`, inspection);
  inspectText(example.input, `${path}.input`, inspection);
  inspectIds(example.step_ids, `${path}.step_ids`, BLUEPRINT_LIMITS.steps, problems);
  const result = objectAt(example.result, `${path}.result`, ["part_id", "location"], problems);
  if (!result) return;
  if (!isText(result.part_id)) problems.push({ path: `${path}.result.part_id`, reason: "结果部分标识必须是非空字符串" });
  inspectText(result.location, `${path}.result.location`, inspection);
}

function inspectText(value: unknown, path: string, inspection: Inspection): void {
  const { options, problems, translatable } = inspection;
  translatable?.add(path);
  problems.push(...textProblems(value, path, options));
}

function inspectJson(value: unknown, path: string, problems: PluginDeclarationProblem[]): void {
  try { assertJson(value, (_kind, reason) => { throw pluginErrors.declaration_invalid(reason); }); }
  catch (error) { problems.push({ path, reason: error instanceof Error ? error.message : "需要有界 JSON 值" }); }
}

function objectAt(value: unknown, path: string, fields: readonly string[], problems: PluginDeclarationProblem[]): Record<string, unknown> | undefined {
  if (!isJsonObject(value)) {
    problems.push({ path, reason: "必须是对象" });
    return;
  }
  inspectFields(value, path, fields, problems);
  return value;
}

function inspectFields(value: Record<string, unknown>, path: string, fields: readonly string[], problems: PluginDeclarationProblem[]): void {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) problems.push({ path: childPath(path, key), reason: `不认识字段 ${quoted(key)}` });
  }
}

function listAt(value: unknown, path: string, max: number, problems: PluginDeclarationProblem[]): readonly unknown[] | undefined {
  if (!Array.isArray(value)) problems.push({ path, reason: "必须是数组" });
  else if (value.length > max) problems.push({ path, reason: `最多 ${max} 项` });
  else return value;
}

function inspectIds(value: unknown, path: string, max: number, problems: PluginDeclarationProblem[]): void {
  const ids = listAt(value, path, max, problems);
  for (const [index, id] of ids?.entries() ?? []) {
    if (!isText(id)) problems.push({ path: `${path}[${index}]`, reason: "引用标识必须是非空字符串" });
  }
}

function inspectReferences(blueprint: Blueprint, problems: PluginDeclarationProblem[]): void {
  const parts = new Map<string, Blueprint["parts"][number]>();
  for (const [index, part] of blueprint.parts.entries()) {
    if (parts.has(part.part_id)) problems.push({ path: `$.parts[${index}].part_id`, reason: "部分标识重复" });
    else parts.set(part.part_id, part);
  }
  const steps = new Map<string, Blueprint["steps"][number]>();
  for (const [index, step] of blueprint.steps.entries()) {
    if (steps.has(step.step_id)) problems.push({ path: `$.steps[${index}].step_id`, reason: "步骤标识重复" });
    else steps.set(step.step_id, step);
    inspectIdReferences(step.part_ids, `$.steps[${index}].part_ids`, parts, problems);
  }
  const roleCount = [...parts.values()].filter(part => part.proposal.kind === "role").length;
  for (const [index, part] of blueprint.parts.entries()) {
    if (part.proposal.kind !== "role" || !part.proposal.template.works_with) continue;
    const path = `$.parts[${index}].proposal.template.works_with`;
    const collaborators = part.proposal.template.works_with;
    if (collaborators.length > roleCount - 1) problems.push({ path, reason: "协作引用不能多于其他角色" });
    for (const [position, id] of collaborators.entries()) {
      const at = `${path}[${position}]`;
      if (id === part.part_id) problems.push({ path: at, reason: "角色不能引用自己" });
      else if (parts.get(id)?.proposal.kind !== "role") problems.push({ path: at, reason: "协作引用必须指向另一个角色部分" });
    }
  }
  const { step_ids, result } = blueprint.example_task;
  inspectIdReferences(step_ids, "$.example_task.step_ids", steps, problems);
  const resultKind = parts.get(result.part_id)?.proposal.kind;
  if (resultKind !== "capability" && resultKind !== "content") {
    problems.push({ path: "$.example_task.result.part_id", reason: "结果必须指向存在的 capability 或 content 部分" });
  } else if (!step_ids.some(id => steps.get(id)?.part_ids.includes(result.part_id))) {
    problems.push({ path: "$.example_task.result.part_id", reason: "示范任务所选步骤必须引用结果部分" });
  }
}

function inspectIdReferences(ids: readonly string[], path: string, target: ReadonlyMap<string, unknown>, problems: PluginDeclarationProblem[]): void {
  if (ids.length > target.size) problems.push({ path, reason: "引用项不能多于可引用项" });
  const seen = new Set<string>();
  for (const [index, id] of ids.entries()) {
    const at = `${path}[${index}]`;
    if (seen.has(id)) problems.push({ path: at, reason: "引用标识重复" });
    else if (!target.has(id)) problems.push({ path: at, reason: "找不到所引用的标识" });
    seen.add(id);
  }
}

function inFile(file: string, problems: readonly PluginDeclarationProblem[]): PluginDeclarationProblem[] {
  return problems.map(problem => ({ ...problem, path: `${file}:${problem.path ?? "$"}` }));
}

function firstDifference(base: unknown, other: unknown, path: string, translatable: ReadonlySet<string>): string | undefined {
  if (Object.is(base, other) || translatable.has(path)) return;
  if (Array.isArray(base) && Array.isArray(other)) {
    const length = Math.min(base.length, other.length);
    for (let index = 0; index < length; index++) {
      const difference = firstDifference(base[index], other[index], `${path}[${index}]`, translatable);
      if (difference !== undefined) return difference;
    }
    return base.length === other.length ? undefined : `${path}[${length}]`;
  }
  if (!isJsonObject(base) || !isJsonObject(other)) return path;
  for (const [key, value] of Object.entries(base)) {
    const field = childPath(path, key);
    if (!Object.hasOwn(other, key)) return field;
    const difference = firstDifference(value, other[key], field, translatable);
    if (difference !== undefined) return difference;
  }
  const added = Object.keys(other).find(key => !Object.hasOwn(base, key));
  return added === undefined ? undefined : childPath(path, added);
}
