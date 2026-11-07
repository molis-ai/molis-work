import {
  SKILL_APPLIES_TO, SKILL_LIMITS, SKILL_RESOURCE_FOLDERS, SKILL_TOOLS,
  type AgentSkillDeclaration, type PluginMethodDeclaration, type SkillResourceDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { CONTENT_PACKAGE_FILES, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { quoted, validToken, validVersion } from "./declaration-problems.js";

// The checks a Skill declaration gets (specs/skill-packs/contract-design.md §4.2), in Manifest `methods` and in `agent.skills`.
// `parsePluginManifest` is the caller; every problem names the Skill and, when there is one, the package file, so an author and
// the install preview see the whole list at once.

const SHA256 = /^[0-9a-f]{64}$/u;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu;
const RESOURCE_ROLES = Object.keys(SKILL_RESOURCE_FOLDERS) as Array<keyof typeof SKILL_RESOURCE_FOLDERS>;
/** Only a method offered to other Agents says who may pick it and how a person names it; the Plugin's own Agent picks its own. */
const METHODS_ONLY = ["applies_to", "user_invocable", "argument_hint"] as const;
/** Every key a method in Manifest `methods` may write; any other is refused by name, so a signed package carries nothing unread. */
const METHOD_KEYS: ReadonlySet<string> = new Set<keyof PluginMethodDeclaration>([
  "skill_id", "version", "name", "summary", "tools", "description", "when_to_use", "when_not_to_use", "applies_to", "user_invocable",
  "argument_hint", "body", "resources", "connector_categories",
]);

type Where = "methods" | "agent";

function validSkillId(value: unknown): value is string {
  return validToken(value) && value.length <= SKILL_LIMITS.skillIdChars;
}

/** Non-empty once trimmed and at most `limit` characters (code points, as a person counts them). */
function boundedText(value: unknown, limit: number): boolean {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= limit;
}

/** Where a Skill's body is in its package: `skills/<skill_id>/SKILL.md`, the only place it may be. */
export function skillBodyPath(skillId: string): string {
  return `${CONTENT_PACKAGE_FILES.skills}/${skillId}/${CONTENT_PACKAGE_FILES.body}`;
}

/** Why a package path is not a plain path inside the package: absolute, `..`, `.`, an empty segment, a drive, a backslash or NUL. */
export function packagePathProblem(path: unknown): string | null {
  if (typeof path !== "string" || !path) return "路径不能为空";
  if (path.includes("\\") || path.includes("\0")) return "路径不能含反斜杠或空字符";
  if (path.startsWith("/") || /^[a-zA-Z]:/u.test(path)) return "路径必须相对包根，不能是绝对路径";
  if (path.split("/").some(part => !part || part === "." || part === "..")) return "路径不能含 ..、. 或空段，不能逃出包根";
  return null;
}

/**
 * A Plugin's methods for other Agents (Manifest `methods`): each a declared, versioned Skill for business work, saying when to pick it
 * (`description`) and which built-in Agent may (`applies_to`). Both are required here and in no other place (SKP-08, SKC-03).
 */
export function inspectSkillDeclarations(methods: unknown): PluginDeclarationProblem[] {
  if (methods === undefined) return [];
  if (!Array.isArray(methods)) return [{ reason: "方法声明必须是列表" }];
  const problems: PluginDeclarationProblem[] = [], seen = new Set<string>();
  if (methods.length > SKILL_LIMITS.skillsPerPackage) problems.push({ reason: `一个插件至多声明 ${SKILL_LIMITS.skillsPerPackage} 个方法` });
  for (const method of methods as PluginMethodDeclaration[]) {
    if (!method || typeof method !== "object" || !validSkillId(method.skill_id) || !validVersion(method.version)) { problems.push({ reason: "方法声明不合法" }); continue; }
    const skill_id = method.skill_id;
    if (seen.has(skill_id)) problems.push({ skill_id, reason: `方法重复：${skill_id}` });
    seen.add(skill_id);
    if (typeof method.name !== "string" || !method.name.trim() || method.name.length > 80) problems.push({ skill_id, reason: `方法 ${skill_id} 需要名称（80 字以内）` });
    if (typeof method.summary !== "string" || !method.summary.trim() || method.summary.length > 300) problems.push({ skill_id, reason: `方法 ${skill_id} 需要适用说明（300 字以内）` });
    if (!Array.isArray(method.tools) || method.tools.some(tool => !(SKILL_TOOLS as readonly string[]).includes(tool))) {
      problems.push({ skill_id, reason: `方法 ${skill_id} 只能使用业务工具：${SKILL_TOOLS.join("、")}` });
    }
    for (const key of Object.keys(method)) if (!METHOD_KEYS.has(key)) problems.push({ skill_id, reason: `方法 ${skill_id} 不能写 ${quoted(key)}` });
    if (method.description === undefined) problems.push({ skill_id, reason: `方法 ${skill_id} 要写 description：什么时候用它` });
    if (method.applies_to === undefined) problems.push({ skill_id, reason: `方法 ${skill_id} 要写 applies_to：${SKILL_APPLIES_TO.join("、")}` });
    problems.push(...skillFieldProblems(method, "methods"));
  }
  return problems;
}

/**
 * The fields a Skill declaration added for Skill packs, wherever it is declared; the caller has checked `skill_id`. `applies_to`,
 * `user_invocable` and `argument_hint` are refused in `agent.skills`.
 */
export function skillFieldProblems(skill: AgentSkillDeclaration, where: Where): PluginDeclarationProblem[] {
  const skill_id = skill.skill_id, label = where === "methods" ? `方法 ${skill_id}` : `Agent 方法 ${skill_id}`;
  const problems: PluginDeclarationProblem[] = [];
  const say = (reason: string, path?: string) => problems.push({ skill_id, ...(path === undefined ? {} : { path }), reason: `${label} ${reason}` });
  if (where === "agent") {
    for (const key of METHODS_ONLY) if (skill[key] !== undefined) say(`不能写 ${key}：只有给别的 Agent 的方法（methods）才写`);
  } else {
    if (skill.applies_to !== undefined && !(SKILL_APPLIES_TO as readonly unknown[]).includes(skill.applies_to)) say(`的 applies_to 只能是 ${SKILL_APPLIES_TO.join("、")}`);
    if (skill.user_invocable !== undefined && typeof skill.user_invocable !== "boolean") say("的 user_invocable 只能是布尔值");
    if (skill.argument_hint !== undefined && !boundedText(skill.argument_hint, SKILL_LIMITS.argumentHintChars)) say(`的 argument_hint 限 1～${SKILL_LIMITS.argumentHintChars} 字`);
  }
  if (skill.description !== undefined && !boundedText(skill.description, SKILL_LIMITS.descriptionChars)) say(`的 description 限 1～${SKILL_LIMITS.descriptionChars} 字`);
  for (const key of ["when_to_use", "when_not_to_use"] as const) {
    if (skill[key] !== undefined && !boundedText(skill[key], SKILL_LIMITS.whenChars)) say(`的 ${key} 限 1～${SKILL_LIMITS.whenChars} 字`);
  }
  if (skill.body !== undefined && skill.body !== skillBodyPath(skill_id)) say(`的正文必须在 ${skillBodyPath(skill_id)}`, typeof skill.body === "string" ? skill.body : undefined);
  for (const reason of connectorCategoryProblems(skill.connector_categories)) say(reason);
  for (const problem of resourceProblems(skill_id, skill.resources)) say(problem.reason, problem.path);
  return problems;
}

function connectorCategoryProblems(categories: unknown): string[] {
  if (categories === undefined) return [];
  if (!Array.isArray(categories) || categories.some(category => !validToken(category)) || new Set(categories).size !== categories.length) {
    return ["的 connector_categories 必须是不重复的小写类别（如 project-tracker）"];
  }
  return [];
}

function resourceProblems(skillId: string, resources: unknown): Array<{ path?: string; reason: string }> {
  if (resources === undefined) return [];
  if (!Array.isArray(resources)) return [{ reason: "的 resources 必须是列表" }];
  const problems: Array<{ path?: string; reason: string }> = [], seen = new Set<string>();
  if (resources.length > SKILL_LIMITS.resourcesPerSkill) problems.push({ reason: `至多带 ${SKILL_LIMITS.resourcesPerSkill} 个资源` });
  for (const value of resources as unknown[]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { problems.push({ reason: "的资源声明必须是对象" }); continue; }
    const resource = value as Partial<SkillResourceDeclaration>;
    const path = typeof resource.path === "string" ? resource.path : undefined;
    const escape = packagePathProblem(resource.path);
    if (escape) { problems.push({ ...(path === undefined ? {} : { path }), reason: `的资源${escape}` }); continue; }
    if (seen.has(path!)) problems.push({ path, reason: "的资源路径重复" });
    seen.add(path!);
    const role = resource.role;
    if (!role || !RESOURCE_ROLES.includes(role)) problems.push({ path, reason: `的资源 role 只能是 ${RESOURCE_ROLES.join("、")}` });
    else if (!path!.startsWith(`${CONTENT_PACKAGE_FILES.skills}/${skillId}/${SKILL_RESOURCE_FOLDERS[role]}/`)) {
      problems.push({ path, reason: `的 ${role} 资源必须在 ${CONTENT_PACKAGE_FILES.skills}/${skillId}/${SKILL_RESOURCE_FOLDERS[role]}/ 下` });
    }
    if (typeof resource.media_type !== "string" || !MEDIA_TYPE.test(resource.media_type)) problems.push({ path, reason: "的资源要写媒体类型（如 text/markdown）" });
    if (typeof resource.bytes !== "number" || !Number.isSafeInteger(resource.bytes) || resource.bytes < 0 || resource.bytes > SKILL_LIMITS.fileBytes) {
      problems.push({ path, reason: `的资源大小必须是 0～${SKILL_LIMITS.fileBytes} 字节的整数` });
    }
    if (typeof resource.sha256 !== "string" || !SHA256.test(resource.sha256)) problems.push({ path, reason: "的资源摘要必须是小写十六进制的 SHA-256" });
  }
  return problems;
}
