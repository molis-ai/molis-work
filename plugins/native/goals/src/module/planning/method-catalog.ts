import { readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  GoalEventTypeDefinitionInput,
  PlanningCoverageRule,
  PlanningDependencyRule,
  PlanningMethodDefaultRequirement,
  PlanningMethodKind,
} from "@molis-ai/molis-work-contracts/modules/goals";
import {
  goalEventFieldFormats,
  goalEventSemanticFamilies,
} from "@molis-ai/molis-work-contracts/modules/goals";

export interface ParsedPlanningMethodSource {
  method_id: string;
  version: number;
  kind: Exclude<PlanningMethodKind, "custom">;
  name: string;
  summary: string;
  applies_to: string[];
  domain_tags: string[];
  steps: string[];
  required_coverage: PlanningCoverageRule[];
  dependency_rules: PlanningDependencyRule[];
  evidence_requirements: string[];
  completion_checks: string[];
  failure_modes: string[];
  source_refs: string[];
  confidence: number;
  event_types: GoalEventTypeDefinitionInput[];
  default_requirements: PlanningMethodDefaultRequirement[];
}

const FRONTMATTER_FIELDS = [
  "method_id",
  "version",
  "kind",
  "name",
  "summary",
  "applies_to",
  "domain_tags",
  "source_refs",
  "confidence",
] as const;

const SECTION_NAMES = [
  "规划路径",
  "必须覆盖",
  "依赖规则",
  "完成证据",
  "收口检查",
  "常见误拆",
] as const;

const OPTIONAL_SECTION_NAMES = [
  "事件类型",
  "事件字段",
  "默认要求",
] as const;

const KIND_DIRECTORIES: Record<ParsedPlanningMethodSource["kind"], string> = {
  meta: "meta",
  work_type: "work-types",
  domain: "domains",
  industry: "industries",
  overlay: "overlays",
};

function catalogError(path: string, message: string): never {
  throw new Error(`规划方法文件 ${path}：${message}`);
}

function catalogPath(directory: string | URL): string {
  return directory instanceof URL ? fileURLToPath(directory) : directory;
}

function markdownFiles(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
    }
  };
  visit(directory);
  return files;
}

function parseFrontmatter(path: string, source: string): { fields: Map<string, string>; body: string } {
  const match = source.replaceAll("\r\n", "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) catalogError(path, "必须以完整的 --- frontmatter 开始");
  const fields = new Map<string, string>();
  for (const rawLine of match[1]!.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 1) catalogError(path, `无法解析 frontmatter 行：${rawLine}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (fields.has(key)) catalogError(path, `frontmatter 字段 ${key} 重复`);
    if (!(FRONTMATTER_FIELDS as readonly string[]).includes(key)) catalogError(path, `未知 frontmatter 字段 ${key}`);
    fields.set(key, value);
  }
  for (const field of FRONTMATTER_FIELDS) {
    if (!fields.get(field)?.trim()) catalogError(path, `缺少 frontmatter 字段 ${field}`);
  }
  return { fields, body: match[2]! };
}

function stringField(path: string, fields: Map<string, string>, name: string): string {
  const raw = fields.get(name)!;
  if (!raw.startsWith('"')) return raw;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "string" || !value.trim()) throw new Error();
    return value.trim();
  } catch {
    return catalogError(path, `${name} 必须是非空字符串`);
  }
}

function stringArrayField(path: string, fields: Map<string, string>, name: string): string[] {
  try {
    const value: unknown = JSON.parse(fields.get(name)!);
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error();
    return value.map((item) => (item as string).trim());
  } catch {
    return catalogError(path, `${name} 必须是 JSON 字符串数组`);
  }
}

function numberField(path: string, fields: Map<string, string>, name: string): number {
  const value = Number(fields.get(name));
  if (!Number.isFinite(value)) catalogError(path, `${name} 必须是数字`);
  return value;
}

function parseSections(path: string, body: string, expectedName: string): Map<string, string[]> {
  const lines = body.split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  if (lines.shift()?.trim() !== `# ${expectedName}`) catalogError(path, `一级标题必须是 # ${expectedName}`);
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const rawLine of lines) {
    const heading = rawLine.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const name = heading[1]!;
      if (
        !(SECTION_NAMES as readonly string[]).includes(name)
        && !(OPTIONAL_SECTION_NAMES as readonly string[]).includes(name)
      ) {
        catalogError(path, `未知章节 ${name}`);
      }
      if (sections.has(name)) catalogError(path, `章节 ${name} 重复`);
      sections.set(name, []);
      current = name;
      continue;
    }
    if (!current) {
      if (rawLine.trim()) catalogError(path, "一级标题后只能出现约定的二级章节");
      continue;
    }
    sections.get(current)!.push(rawLine);
  }
  for (const name of SECTION_NAMES) if (!sections.has(name)) catalogError(path, `缺少章节 ${name}`);
  return sections;
}

function nonEmptyLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function orderedList(path: string, section: string, lines: readonly string[]): string[] {
  const values = nonEmptyLines(lines).map((line, index) => {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match || Number(match[1]) !== index + 1) catalogError(path, `${section} 必须是从 1 连续编号的有序列表`);
    return match[2]!.trim();
  });
  if (!values.length) catalogError(path, `${section} 不能为空`);
  return values;
}

function bulletList(path: string, section: string, lines: readonly string[]): string[] {
  const values = nonEmptyLines(lines).map((line) => {
    const match = line.match(/^-\s+(.+)$/);
    if (!match) catalogError(path, `${section} 必须使用 - 无序列表`);
    return match[1]!.trim();
  });
  if (!values.length) catalogError(path, `${section} 不能为空`);
  return values;
}

function tableCells(path: string, section: string, line: string): string[] {
  if (!line.startsWith("|") || !line.endsWith("|")) catalogError(path, `${section} 表格行必须以 | 开始和结束`);
  const cells: string[] = [];
  let value = "";
  let escaped = false;
  for (const char of line.slice(1, -1)) {
    if (escaped) {
      value += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "|") {
      cells.push(value.trim());
      value = "";
    } else {
      value += char;
    }
  }
  if (escaped) value += "\\";
  cells.push(value.trim());
  return cells;
}

function table(path: string, section: string, lines: readonly string[], header: readonly string[]): string[][] {
  const rows = nonEmptyLines(lines).map((line) => tableCells(path, section, line));
  if (rows.length < 3) catalogError(path, `${section} 至少需要表头、分隔行和一条数据`);
  if (rows[0]!.length !== header.length || rows[0]!.some((value, index) => value !== header[index])) {
    catalogError(path, `${section} 表头必须是 ${header.join(" | ")}`);
  }
  if (rows[1]!.length !== header.length || rows[1]!.some((value) => !/^:?-{3,}:?$/.test(value))) {
    catalogError(path, `${section} 表格分隔行无效`);
  }
  const values = rows.slice(2);
  if (values.some((row) => row.length !== header.length || row.some((value) => !value))) {
    catalogError(path, `${section} 每一行都必须包含 ${header.length} 个非空字段`);
  }
  return values;
}

export function parsePlanningMethodMarkdown(path: string, source: string, rootDirectory?: string): ParsedPlanningMethodSource {
  const { fields, body } = parseFrontmatter(path, source);
  const methodId = stringField(path, fields, "method_id");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(methodId)) catalogError(path, "method_id 格式无效");
  if (basename(path) !== `${methodId}.md`) catalogError(path, `文件名必须是 ${methodId}.md`);
  const kind = stringField(path, fields, "kind") as ParsedPlanningMethodSource["kind"];
  if (!Object.hasOwn(KIND_DIRECTORIES, kind)) catalogError(path, `kind ${kind} 无效`);
  if (rootDirectory) {
    const firstSegment = relative(rootDirectory, path).split(sep)[0];
    if (firstSegment !== KIND_DIRECTORIES[kind]) catalogError(path, `kind ${kind} 必须放在 ${KIND_DIRECTORIES[kind]}/`);
  }
  const version = numberField(path, fields, "version");
  if (!Number.isInteger(version) || version < 1) catalogError(path, "version 必须是正整数");
  const confidence = numberField(path, fields, "confidence");
  if (confidence < 0 || confidence > 1) catalogError(path, "confidence 必须在 0 到 1 之间");
  const name = stringField(path, fields, "name");
  const sections = parseSections(path, body, name);
  const coverageRows = table(path, "必须覆盖", sections.get("必须覆盖")!, ["area", "label", "question"]);
  const dependencyRows = table(path, "依赖规则", sections.get("依赖规则")!, ["rule_id", "statement", "direction_hint"]);
  const eventTypes = parseEventTypes(path, methodId, version, sections);
  const defaultRequirements = parseDefaultRequirements(path, sections);
  const typeIds = new Set(eventTypes.map((type) => type.type_id));
  for (const requirement of defaultRequirements) {
    if (requirement.bound_type_id && !typeIds.has(requirement.bound_type_id)) {
      catalogError(path, `默认要求 ${requirement.requirement_id} 引用了未知类型 ${requirement.bound_type_id}`);
    }
  }
  return {
    method_id: methodId,
    version,
    kind,
    name,
    summary: stringField(path, fields, "summary"),
    applies_to: stringArrayField(path, fields, "applies_to"),
    domain_tags: stringArrayField(path, fields, "domain_tags"),
    steps: orderedList(path, "规划路径", sections.get("规划路径")!),
    required_coverage: coverageRows.map(([area, label, question]) => ({ area: area!, label: label!, question: question! })),
    dependency_rules: dependencyRows.map(([rule_id, statement, direction_hint]) => ({ rule_id: rule_id!, statement: statement!, direction_hint: direction_hint! })),
    evidence_requirements: bulletList(path, "完成证据", sections.get("完成证据")!),
    completion_checks: bulletList(path, "收口检查", sections.get("收口检查")!),
    failure_modes: bulletList(path, "常见误拆", sections.get("常见误拆")!),
    source_refs: stringArrayField(path, fields, "source_refs"),
    confidence,
    event_types: eventTypes,
    default_requirements: defaultRequirements,
  };
}

function parseBooleanCell(path: string, section: string, value: string, label: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return catalogError(path, `${section} 的 ${label} 必须是 true 或 false`);
}

function parseEventTypes(
  path: string,
  methodId: string,
  methodVersion: number,
  sections: Map<string, string[]>,
): GoalEventTypeDefinitionInput[] {
  const typeLines = sections.get("事件类型");
  const fieldLines = sections.get("事件字段");
  if (!typeLines && !fieldLines) return [];
  if (!typeLines) catalogError(path, "有事件字段时必须同时提供事件类型");
  const typeRows = table(path, "事件类型", typeLines, ["type_id", "version", "name", "purpose", "semantic_family"]);
  const types = new Map<string, GoalEventTypeDefinitionInput>();
  for (const [typeId, versionText, name, purpose, semanticFamily] of typeRows) {
    if (types.has(typeId!)) catalogError(path, `事件类型 ${typeId} 重复`);
    const version = Number(versionText);
    if (!Number.isInteger(version) || version < 1) catalogError(path, `事件类型 ${typeId} 的 version 必须是正整数`);
    if (!goalEventSemanticFamilies.includes(semanticFamily as (typeof goalEventSemanticFamilies)[number])) {
      catalogError(path, `事件类型 ${typeId} 的 semantic_family 无效`);
    }
    types.set(typeId!, {
      type_id: typeId!,
      version,
      name: name!,
      purpose: purpose!,
      semantic_family: semanticFamily as GoalEventTypeDefinitionInput["semantic_family"],
      source: { kind: "planning", method_id: methodId, method_version: methodVersion, label: name },
      fields: [],
    });
  }
  if (!fieldLines) catalogError(path, "事件类型至少需要一个字段");
  const fieldRows = table(path, "事件字段", fieldLines, ["type_id", "field_id", "name", "purpose", "format", "required"]);
  for (const [typeId, fieldId, name, purpose, format, requiredText] of fieldRows) {
    const type = types.get(typeId!);
    if (!type) catalogError(path, `事件字段 ${fieldId} 引用了未知类型 ${typeId}`);
    if (!goalEventFieldFormats.includes(format as (typeof goalEventFieldFormats)[number])) {
      catalogError(path, `事件字段 ${fieldId} 的 format 无效`);
    }
    if (type.fields.some((field) => field.field_id === fieldId)) {
      catalogError(path, `事件类型 ${typeId} 的字段 ${fieldId} 重复`);
    }
    type.fields.push({
      field_id: fieldId!,
      name: name!,
      purpose: purpose!,
      format: format as GoalEventTypeDefinitionInput["fields"][number]["format"],
      required: parseBooleanCell(path, "事件字段", requiredText!, "required"),
      source: { kind: "planning", method_id: methodId, label: name },
    });
  }
  for (const type of types.values()) {
    if (!type.fields.length) catalogError(path, `事件类型 ${type.type_id} 至少需要一个字段`);
  }
  return [...types.values()];
}

function parseDefaultRequirements(path: string, sections: Map<string, string[]>): PlanningMethodDefaultRequirement[] {
  const lines = sections.get("默认要求");
  if (!lines) return [];
  const rows = table(path, "默认要求", lines, ["requirement_id", "statement", "bound_type_id", "applies_when"]);
  const seen = new Set<string>();
  return rows.map(([requirementId, statement, boundTypeId, appliesWhen]) => {
    if (seen.has(requirementId!)) catalogError(path, `默认要求 ${requirementId} 重复`);
    seen.add(requirementId!);
    return {
      requirement_id: requirementId!,
      statement: statement!,
      bound_type_id: boundTypeId === "-" ? undefined : boundTypeId,
      applies_when: appliesWhen === "-" ? undefined : appliesWhen,
    };
  });
}

export function loadPlanningMethodSources(directory: string | URL): ParsedPlanningMethodSource[] {
  const root = catalogPath(directory);
  const methods = markdownFiles(root).map((path) => parsePlanningMethodMarkdown(path, readFileSync(path, "utf8"), root));
  const ids = new Map<string, number>();
  for (const method of methods) ids.set(method.method_id, (ids.get(method.method_id) ?? 0) + 1);
  const duplicate = [...ids].find(([, count]) => count > 1)?.[0];
  if (duplicate) catalogError(root, `method_id ${duplicate} 重复`);
  if (!methods.length) catalogError(root, "目录中没有方法文件");
  return methods;
}
