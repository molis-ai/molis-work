import { isRecord } from "./json-value.js";
import { intakeMaterial, isArtifactCompareAction, isArtifactPinAction, isArtifactPreviewAction, type ActionIntake } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

// 「成果库只收人要留存、引用的固定版本」(AGENTS.md; specs/artifact-positioning A1, A4b, A7): a type a plugin pins is named, can be
// previewed by its owner, and says how it is fixed, compared and continued from. Only the built-in plugins were held to this, by a
// test; a Manifest read anywhere else could produce a version nobody can read. The rule is part of Manifest parsing, so the
// author-time check, the CLI, Runtime install and the development loader all apply the same one.

type Part = Record<string, unknown>;
type Role = "preview" | "pin" | "compare";

/** What each action a type names must be: the plugin's own, of the contract's shape, with the operation that kind of action has. */
const ROLES: Readonly<Record<Role, { label: string; operation: "query" | "command"; matches(action: object): boolean }>> = {
  preview: { label: "预览", operation: "query", matches: isArtifactPreviewAction },
  pin: { label: "固定", operation: "command", matches: isArtifactPinAction },
  compare: { label: "比较", operation: "query", matches: isArtifactCompareAction },
};

/**
 * What stops the 成果 types of a Manifest from being kept in the 成果库, in the order a reader goes through them: each produced
 * type (name, preview, pin, compare), the fields a type no longer carries, then each 「从这一版继续」 intake's types. `manifest` has passed
 * the shape rules; what it does not promise (a title that is not text, a reference that is not a pair, actions that are not a list) is
 * answered, not thrown.
 */
export function artifactDeclarationProblems(manifest: Pick<PluginManifest, "artifacts" | "actions">): string[] {
  const produced = records(manifest.artifacts?.produces), consumed = records(manifest.artifacts?.consumes);
  const actions = declaredActions(manifest.actions);
  return [...produced.flatMap(type => producedTypeProblems(type, actions)), ...linkProblems(manifest.artifacts?.links),
    ...[...produced, ...consumed].flatMap(type => (["continue", "file"] as const).filter(field => type[field] !== undefined)
      .map(field => `成果类型 ${keyOf(type)} 不再声明 ${field}：「从这一版继续」写在继续动作的 intake 上（accepts: [{ kind: "artifact", artifact_types, file? }]，contract-design §2.3）`)),
    ...continueIntakeProblems([...produced, ...consumed], actions)];
}

/** A continue intake names only types this Manifest produces or reads, each once, and the files it reads are a list without repeats. */
function continueIntakeProblems(types: readonly Part[], actions: ReadonlyMap<string, Part>): string[] {
  const declared = new Set(types.map(keyOf)), problems: string[] = [];
  for (const [reference, definition] of actions) {
    const material = intakeMaterial((definition.action as { intake?: ActionIntake }).intake, "artifact");
    if (!material || !Array.isArray(material.artifact_types)) continue;
    const keys = material.artifact_types.map(type => keyOf({ ...type }));
    for (const key of keys) if (!declared.has(key)) problems.push(`能力 ${reference} 从成果 ${key} 继续，但本 Manifest 没有在 artifacts.produces 或 consumes 里声明这个类型`);
    if (new Set(keys).size !== keys.length) problems.push(`能力 ${reference} 的继续入口把同一个成果类型列了不止一次`);
    const extensions = material.file?.extensions;
    if (Array.isArray(extensions) && (extensions.length === 0 || new Set(extensions).size !== extensions.length)) problems.push(`能力 ${reference} 的继续入口 file.extensions 必须是不重复的非空数组`);
  }
  return problems;
}

/** `links` names the kinds of ledger edge a plugin writes to a 成果 version: each kind once, with a role. */
function linkProblems(links: unknown): string[] {
  if (links === undefined) return [];
  if (!Array.isArray(links)) return ["artifacts.links 必须是数组"];
  const problems: string[] = [], seen = new Set<string>();
  for (const value of links) {
    const link = value as Part | null;
    if (typeof link !== "object" || link === null || Array.isArray(link)) { problems.push("artifacts.links 的每一项必须是对象"); continue; }
    const kind = link.kind;
    if (typeof kind !== "string" || !/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/u.test(kind)) problems.push(`链接种类 ${String(kind)} 必须是小写字母开头、用点分段的名字（如 "goal.input"）`);
    else if (seen.has(kind)) problems.push(`链接种类 ${kind} 声明了不止一次`);
    else seen.add(kind);
    if (link.role !== "input" && link.role !== "output") problems.push(`链接种类 ${String(kind)} 的 role 必须是 "input" 或 "output"`);
    if (link.proposal !== undefined && typeof link.proposal !== "boolean") problems.push(`链接种类 ${String(kind)} 的 proposal 必须是布尔值`);
    for (const name of Object.keys(link)) if (name !== "kind" && name !== "role" && name !== "proposal") problems.push(`链接种类 ${String(kind)} 没有 ${name} 这一项`);
  }
  return problems;
}

function producedTypeProblems(type: Part, actions: ReadonlyMap<string, Part>): string[] {
  const key = keyOf(type), problems: string[] = [];
  if (typeof type.title !== "string" || !type.title.trim()) problems.push(`成果类型 ${key} 缺少显示名（title）`);
  if (referenceOf(type.preview) === null) problems.push(`成果类型 ${key} 缺少预览动作（preview）`);
  else problems.push(...roleProblems(type, "preview", actions));
  problems.push(...roleProblems(type, "pin", actions));
  // A version that can be pinned on the spot says whether it still matches its object (A4b), so the 成果库 can tell 「原文已改」.
  if (type.pin !== undefined && type.compare === undefined) problems.push(`成果类型 ${key} 可以当场固定，必须声明比较动作（compare）`);
  else problems.push(...roleProblems(type, "compare", actions));
  problems.push(...searchableFieldProblems(key, type.searchable_fields));
  return problems;
}

/** The payload keys a type asks system search to read (M12): a short list of distinct snake_case names. */
function searchableFieldProblems(key: string, fields: unknown): string[] {
  if (fields === undefined) return [];
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 32) return [`成果类型 ${key} 的 searchable_fields 必须是 1～32 项的数组`];
  const problems = fields.filter(field => typeof field !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(field)).map(field => `成果类型 ${key} 的可搜字段 ${String(field)} 必须是小写字母开头的字段名`);
  if (new Set(fields).size !== fields.length) problems.push(`成果类型 ${key} 的 searchable_fields 有重复`);
  return problems;
}

/** The problem with the action a type names for `role`; nothing when it names none or names a fit one. */
function roleProblems(type: Part, role: Role, actions: ReadonlyMap<string, Part>): string[] {
  const named = type[role];
  if (named === undefined) return [];
  const { label, operation, matches } = ROLES[role];
  const reference = referenceOf(named);
  const definition = reference === null ? undefined : actions.get(reference);
  const action = definition?.action as Part | undefined;
  const key = keyOf(type);
  if (!definition || definition.operation !== operation || !action || !matches(action)) {
    return [`成果类型 ${key} 的${label}动作 ${reference ?? "（无效引用）"} 不是本插件声明的${label}${operation === "query" ? "查询" : "命令"}`];
  }
  // The pin names the one kind of work object it fixes; a type pinned from two kinds would have two owners for one line of versions.
  if (role === "pin" && !(Array.isArray(action.subject_kinds) && action.subject_kinds.length === 1)) {
    return [`成果类型 ${key} 的固定动作 ${reference} 必须恰好对一种对象`];
  }
  return [];
}

/** This Manifest's own actions by `capability_id@version`; entries the shape rules already refuse are left out. */
function declaredActions(actions: unknown): ReadonlyMap<string, Part> {
  const declared = new Map<string, Part>();
  for (const definition of records(actions)) {
    const reference = referenceOf(definition);
    if (reference !== null && isRecord(definition.action)) declared.set(reference, definition);
  }
  return declared;
}

/** `capability_id@version` of a reference (or of a definition, which carries the same two fields); null when it is not one. */
function referenceOf(value: unknown): string | null {
  if (!isRecord(value) || typeof value.capability_id !== "string" || !value.capability_id.trim()) return null;
  return Number.isSafeInteger(value.version) ? `${value.capability_id}@${value.version}` : null;
}

function keyOf(type: Part): string {
  return `${String(type.artifact_type_id)}@${String(type.schema_version)}`;
}

function records(value: unknown): Part[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
