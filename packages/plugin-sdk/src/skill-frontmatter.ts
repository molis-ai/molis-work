import type { AgentSkillDeclaration, SkillResourceDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { pluginErrors, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inspectSkillDeclarations, skillBodyPath } from "./skill-declarations.js";
import { cutHead } from "./whole-units.js";

// A SKILL.md's frontmatter turned into its Skill declaration, for author tools (CLI `pack-content`) and Skills import
// (specs/skill-packs/contract-design.md §4.1). The Host reads only the Manifest, never frontmatter.

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u;
const FIELD = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/u;
/** The longest `summary`, as `inspectSkillDeclarations` counts it. */
const SUMMARY_UNITS = 300;

type Scalar = string | number | boolean;
type Value = Scalar | Scalar[];

export interface SkillFrontmatterOptions {
  /** The Skill's version when the caller decides it (an import counts it up, §4.3); otherwise the frontmatter's, else 1. */
  version?: number;
  /** The files under `references/`, `scripts/`, `assets/`, with their sizes and digests, as the packer measured them. */
  resources?: SkillResourceDeclaration[];
}

/**
 * The declaration a SKILL.md says it is. `name` is the Skill's id (as in a Skills folder) and its name; `summary` is the frontmatter's,
 * else the head of `description`; `description`, `when_to_use`, `when_not_to_use`, `applies_to`, `user_invocable`, `argument_hint`,
 * `tools` and `connector_categories` are taken as written; `body` is always `skills/<id>/SKILL.md`. Other keys are left to the tools
 * that wrote them. The frontmatter is the flat subset Skills folders use: per line `key: value`, where a value is plain text, a quoted
 * string, `true`/`false`, a whole number or a one-line `[a, b]` list; a nested or multi-line value is refused, not guessed. The result
 * passes the same check as Manifest `methods`, or the call is refused with `plugin.declaration_invalid` and its `details.problems`.
 */
export function skillDeclarationFromFrontmatter(markdown: string, options: SkillFrontmatterOptions = {}): AgentSkillDeclaration {
  const fields = frontmatterFields(markdown);
  const skill_id = fields.get("name");
  if (typeof skill_id !== "string") refuse([{ reason: "SKILL.md 的 frontmatter 要有 name（Skill 的标识）" }]);
  const text = (key: string) => { const value = fields.get(key); return value === undefined ? undefined : typeof value === "string" ? value : String(value); };
  const description = text("description"), summary = text("summary") ?? (description === undefined ? undefined : cutHead(description, SUMMARY_UNITS));
  const declaration: AgentSkillDeclaration = {
    skill_id, version: options.version ?? (fields.get("version") as number | undefined) ?? 1, name: skill_id, summary: summary ?? "",
    tools: listOf(fields.get("tools")) ?? [],
    ...optional("description", description), ...optional("when_to_use", text("when_to_use")), ...optional("when_not_to_use", text("when_not_to_use")),
    ...optional("applies_to", fields.get("applies_to") as AgentSkillDeclaration["applies_to"]),
    ...optional("user_invocable", fields.get("user_invocable") as boolean | undefined), ...optional("argument_hint", text("argument_hint")),
    body: skillBodyPath(skill_id),
    ...optional("resources", options.resources?.map(resource => ({ ...resource }))),
    ...optional("connector_categories", listOf(fields.get("connector_categories"))),
  };
  const problems = inspectSkillDeclarations([declaration]);
  if (problems.length) refuse(problems.map(problem => ({ ...problem, path: problem.path ?? skillBodyPath(skill_id) })));
  return declaration;
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}

function listOf(value: Value | undefined): string[] | undefined {
  return value === undefined ? undefined : (Array.isArray(value) ? value : [value]).map(String);
}

function refuse(problems: PluginDeclarationProblem[]): never {
  throw pluginErrors.declaration_invalid(problems.map(problem => problem.reason).join("；"), { problems });
}

/** The frontmatter's keys and values; a line that is not one `key: value` is refused with its line number. */
function frontmatterFields(markdown: string): Map<string, Value> {
  const block = FRONTMATTER.exec(markdown)?.[1];
  if (block === undefined) refuse([{ reason: "SKILL.md 要以 --- 包起的 frontmatter 开头" }]);
  const fields = new Map<string, Value>();
  for (const [index, line] of block.split(/\r?\n/u).entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = FIELD.exec(line), value = match?.[2] === undefined ? undefined : valueOf(match[2]);
    if (!match || value === undefined) refuse([{ reason: `SKILL.md 的 frontmatter 第 ${index + 2} 行要写成一行的 key: value（不支持嵌套和多行值）` }]);
    fields.set(match[1]!, value);
  }
  return fields;
}

/** One value: a quoted string, a one-line list of scalars, or a plain scalar with any ` #` comment dropped. Undefined when it is none. */
function valueOf(raw: string): Value | undefined {
  const text = raw.trim();
  if (text.startsWith("[")) {
    const end = text.indexOf("]");
    if (end < 0 || !afterIsComment(text.slice(end + 1))) return undefined;
    const inner = text.slice(1, end).trim();
    const items = inner ? inner.split(",").map(item => scalarOf(item.trim())) : [];
    return items.some(item => item === undefined) ? undefined : items as Scalar[];
  }
  return scalarOf(text);
}

function scalarOf(text: string): Scalar | undefined {
  if (!text || text.startsWith("|") || text.startsWith(">") || text.startsWith("{") || text.startsWith("&") || text.startsWith("*")) return undefined;
  if (text.startsWith("\"")) {
    const end = closingQuote(text);
    if (end < 0 || !afterIsComment(text.slice(end + 1))) return undefined;
    try { return JSON.parse(text.slice(0, end + 1)) as string; } catch { return undefined; }
  }
  if (text.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'(.*)$/u.exec(text);
    return match && afterIsComment(match[2]!) ? match[1]!.replaceAll("''", "'") : undefined;
  }
  const plain = text.replace(/\s+#.*$/u, "").trim();
  if (plain === "true" || plain === "false") return plain === "true";
  return /^\d+$/u.test(plain) ? Number(plain) : plain;
}

function closingQuote(text: string): number {
  for (let index = 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === "\"") return index;
  }
  return -1;
}

function afterIsComment(rest: string): boolean {
  return !rest.trim() || /^\s+#/u.test(rest);
}
