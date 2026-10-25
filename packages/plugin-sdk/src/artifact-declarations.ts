import { isArtifactCompareAction, isArtifactContinueAction, isArtifactPinAction, isArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

// 「成果库只收人要留存、引用的固定版本」(AGENTS.md; specs/artifact-positioning A1, A4b, A7): a type a plugin pins is named, can be
// previewed by its owner, and says how it is fixed, compared and continued from. Only the built-in plugins were held to this, by a
// test; a Manifest read anywhere else could produce a version nobody can read. The rule is part of Manifest parsing, so the
// author-time check, the CLI, Runtime install and the development loader all apply the same one.

type Part = Record<string, unknown>;
type Role = "preview" | "pin" | "compare" | "continue";

/** What each action a type names must be: the plugin's own, of the contract's shape, with the operation that kind of action has. */
const ROLES: Readonly<Record<Role, { label: string; operation: "query" | "command"; matches(action: object): boolean }>> = {
  preview: { label: "预览", operation: "query", matches: isArtifactPreviewAction },
  pin: { label: "固定", operation: "command", matches: isArtifactPinAction },
  compare: { label: "比较", operation: "query", matches: isArtifactCompareAction },
  continue: { label: "继续", operation: "command", matches: isArtifactContinueAction },
};

/**
 * What stops the 成果 types of a Manifest from being kept in the 成果库, in the order a reader goes through them: each produced
 * type (name, preview, pin, compare, continue), then each type only read (continue). A version-1 Manifest cannot declare
 * actions, so it cannot give a produced type the preview it needs. `manifest` has passed the shape rules; what it does not
 * promise (a title that is not text, a reference that is not a pair, actions that are not a list) is answered, not thrown.
 */
export function artifactDeclarationProblems(manifest: Pick<PluginManifest, "schema_version" | "artifacts" | "actions">): string[] {
  const produced = records(manifest.artifacts?.produces), consumed = records(manifest.artifacts?.consumes);
  if (manifest.schema_version === 1) return versionOneProblems(produced, consumed);
  const actions = declaredActions(manifest.actions);
  return [...produced.flatMap(type => producedTypeProblems(type, actions)), ...consumed.flatMap(type => [...roleProblems(type, "continue", actions), ...fileProblems(type)]),
    ...produced.filter(type => type.file !== undefined).map(type => `成果类型 ${keyOf(type)} 是产出的类型，file 只能写在读取的类型（artifacts.consumes）上`)];
}

/** `file` names the extensions a plugin reads from an imported file; a type that is not continued from has nothing to filter. */
function fileProblems(type: Part): string[] {
  if (type.file === undefined) return [];
  const key = keyOf(type), file = type.file as Part | null;
  if (typeof file !== "object" || file === null || Array.isArray(file)) return [`成果类型 ${key} 的 file 必须是对象`];
  const problems: string[] = [];
  const extensions = file.extensions;
  if (!Array.isArray(extensions) || extensions.length === 0 || !extensions.every(item => typeof item === "string" && /^\.[a-z0-9]+$/u.test(item))) {
    problems.push(`成果类型 ${key} 的 file.extensions 必须是非空数组，每项为带点的小写扩展名（如 ".md"）`);
  } else if (new Set(extensions).size !== extensions.length) problems.push(`成果类型 ${key} 的 file.extensions 有重复`);
  if (file.stored_text !== undefined && typeof file.stored_text !== "boolean") problems.push(`成果类型 ${key} 的 file.stored_text 必须是布尔值`);
  for (const name of Object.keys(file)) if (name !== "extensions" && name !== "stored_text") problems.push(`成果类型 ${key} 的 file 没有 ${name} 这一项`);
  if (type.continue === undefined) problems.push(`成果类型 ${key} 声明了 file，必须同时声明继续动作（continue）`);
  return problems;
}

function versionOneProblems(produced: Part[], consumed: Part[]): string[] {
  return [
    ...produced.map(type => `成果类型 ${keyOf(type)} 需要 schema_version 2：产出成果类型要有显示名和本插件的预览动作，v1 Manifest 不能声明动作`),
    ...consumed.filter(type => type.continue !== undefined || type.file !== undefined).map(type => `成果类型 ${keyOf(type)} 的继续动作需要 schema_version 2`),
  ];
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
  problems.push(...roleProblems(type, "continue", actions));
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

function isRecord(value: unknown): value is Part {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
