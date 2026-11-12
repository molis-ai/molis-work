import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";
import type { Blueprint } from "@molis-ai/molis-work-contracts/platform/blueprints";
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { CONTENT_PACKAGE_FILES, type PluginDeclarationProblem, type PluginManifest, type PluginPackagePayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { LocalPackageSignInput } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { blueprintFilePath, inspectBlueprintLocales } from "./blueprints.js";
import { refuseDeclarations } from "./declaration-problems.js";
import { isRecord } from "./json-value.js";
import { parsePluginManifest } from "./manifest.js";
import { packagePathProblem } from "./skill-declarations.js";
import { readPackagedSkills, type PackagedSkillBody } from "./skill-files.js";
import { inspectPluginLocales, pluginLocaleFilePaths } from "./ui/plugin-locales.js";

// The package a plugin with only declarations is installed from (`CONTENT_PACKAGE_FILES`, specs/skill-packs/contract-design.md §3).
// The Host picks this reading or the sandbox package's by the Manifest's `kind`, after the same signature check.

/** The checked Manifest and declared content. Skill resources stay in the package files. */
export interface ContentPackage {
  manifest: PluginManifest;
  skills: PackagedSkillBody[];
  /** Exact checked package bytes decoded as UTF-8, keyed by their declared paths. */
  locale_files?: Readonly<Record<string, string>>;
  blueprint?: {
    default: Blueprint;
    others: readonly { locale: string; blueprint: Blueprint }[];
  };
}

/** Complete a content declaration with the publishing identity and its single manifest mirror, then check the result. */
export function completeContentPackagePayload(input: LocalPackageSignInput, publisher: PluginManifest["publisher"]): PluginPackagePayload {
  if (Object.hasOwn(input.manifest, "publisher")) refuseDeclarations([{ path: "publisher", reason: "待签声明的发布者由签名方填写" }]);
  if (input.files.some(file => file.path === CONTENT_PACKAGE_FILES.manifest)) {
    refuseDeclarations([{ path: CONTENT_PACKAGE_FILES.manifest, reason: "待签包的 Manifest 文件由签名方生成" }]);
  }
  const manifest = { ...input.manifest, publisher };
  const files = [{ path: CONTENT_PACKAGE_FILES.manifest, content_base64: Buffer.from(JSON.stringify(manifest)).toString("base64") }, ...input.files];
  const payload = { schema_version: /* @version format.plugin.package */ 1, manifest, files } as const;
  return { ...payload, manifest: parseContentPackage(payload).manifest };
}

/**
 * Read a content package's payload (`CONTENT_PACKAGE_FILES`), after its signature is verified and before anything is written. The files
 * are exactly `manifest.json` plus the declared Skills, Blueprint and language files. Every path stays inside the package, each resource
 * has its declared size and digest, and each text file is UTF-8 within the limits. An invalid package is refused with
 * `plugin.declaration_invalid`, its `details.problems` naming the affected files. The wire has no links;
 * whoever packs a folder from disk refuses a symbolic link there.
 */
export function parseContentPackage(payload: unknown): ContentPackage {
  if (!isRecord(payload) || payload.schema_version !== /* @version format.plugin.package */ 1 || !Array.isArray(payload.files)) refuseDeclarations([{ reason: "内容包的 payload 要有现行的 schema_version 和 files 列表" }]);
  // manifest.json is compared with the Manifest as the payload carries it, not with what parsing returns, so a default the parser
  // fills in later cannot turn a well-formed package into one that differs.
  const written = payload.manifest;
  const manifest = parsePluginManifest(written);
  if (manifest.kind !== "content") refuseDeclarations([{ reason: "内容包只装只有声明的插件（kind: \"content\"）" }]);
  const { files, problems } = decodedFiles(payload.files as unknown[]);
  const manifestBytes = files.get(CONTENT_PACKAGE_FILES.manifest);
  if (!manifestBytes) problems.push({ path: CONTENT_PACKAGE_FILES.manifest, reason: "包里找不到" });
  const skills = readPackagedSkills(manifest.methods ?? [], files);
  problems.push(...skills.problems);
  const expected = new Set([CONTENT_PACKAGE_FILES.manifest, ...skills.paths, ...pluginLocaleFilePaths(manifest)]);
  const blueprint = readBlueprintPack(manifest, files, expected, problems);
  const localeFiles = inspectLocaleFiles(manifest, files, problems);
  for (const path of files.keys()) if (!expected.has(path)) problems.push({ path, reason: "声明里没有这个文件" });
  if (manifestBytes && !isDeepStrictEqual(jsonOf(manifestBytes), JSON.parse(JSON.stringify(written)))) problems.push({ path: CONTENT_PACKAGE_FILES.manifest, reason: "与包的 Manifest 不一致" });
  if (problems.length) refuseDeclarations(problems);
  return { manifest, skills: skills.bodies, ...(blueprint ? { blueprint } : {}), ...(localeFiles.size ? { locale_files: Object.fromEntries(localeFiles) } : {}) };
}

function readBlueprintPack(manifest: PluginManifest, files: ReadonlyMap<string, Buffer>, expected: Set<string>,
  problems: PluginDeclarationProblem[]): ContentPackage["blueprint"] {
  if (!manifest.blueprint) return undefined;
  const read = (path: string): unknown => {
    expected.add(path);
    const bytes = files.get(path);
    const parsed = bytes ? jsonOf(bytes) : undefined;
    if (parsed === undefined) problems.push({ path, reason: bytes ? "场景文件必须是有效的 UTF-8 JSON" : "包里找不到" });
    return parsed;
  };
  const original = read(blueprintFilePath());
  const others = manifest.blueprint.locales.map(locale => ({ locale, blueprint: read(blueprintFilePath(locale)) }));
  if (original === undefined || others.some(item => item.blueprint === undefined)) return undefined;
  const blueprintProblems = inspectBlueprintLocales(original, others, { owner: manifest.plugin_id });
  problems.push(...blueprintProblems);
  return blueprintProblems.length === 0 ? { default: original as Blueprint, others: others as readonly { locale: string; blueprint: Blueprint }[] } : undefined;
}

function inspectLocaleFiles(manifest: PluginManifest, files: ReadonlyMap<string, Buffer>, problems: PluginDeclarationProblem[]): ReadonlyMap<string, string> {
  const undecodable = new Set<string>(), texts = new Map<string, string>();
  const localeProblems = inspectPluginLocales(manifest, path => {
    const bytes = files.get(path);
    if (!bytes) return null;
    const decoded = utf8Of(bytes);
    if (decoded === null) undecodable.add(path);
    else texts.set(path, decoded);
    return decoded;
  });
  for (const problem of localeProblems) {
    if (!problem.blocking) continue;
    problems.push({
      path: problem.key === null ? problem.file : `${problem.file}:${problem.key}`,
      reason: undecodable.has(problem.file) ? "语言文件必须是有效的 UTF-8 文字" : `${problem.reason}。 ${problem.fix}`,
    });
  }
  return texts;
}

/** The package's files by path, within the package limits; a file that cannot be one is a problem, not a stop. */
function decodedFiles(rows: readonly unknown[]): { files: Map<string, Buffer>; problems: PluginDeclarationProblem[] } {
  const files = new Map<string, Buffer>(), seen = new Set<string>(), problems: PluginDeclarationProblem[] = [];
  if (rows.length > SKILL_LIMITS.filesPerPackage) refuseDeclarations([{ reason: `内容包至多 ${SKILL_LIMITS.filesPerPackage} 个文件` }]);
  let total = 0;
  for (const row of rows) {
    const path = isRecord(row) && typeof row.path === "string" ? row.path : undefined;
    const escape = packagePathProblem(path);
    if (escape) { problems.push({ ...(path === undefined ? {} : { path }), reason: escape }); continue; }
    if (seen.has(path!)) { problems.push({ path, reason: "文件重复" }); continue; }
    seen.add(path!);
    const encoded = (row as Record<string, unknown>).content_base64;
    if (typeof encoded !== "string" || encoded.length % 4 !== 0) { problems.push({ path, reason: "内容不是有效的 base64" }); continue; }
    // The size is read off the encoding, so an oversized file, or a package past its total, is refused before any of it is decoded.
    const size = encoded.length / 4 * 3 - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
    if (size > SKILL_LIMITS.fileBytes) { problems.push({ path, reason: `超过 ${SKILL_LIMITS.fileBytes} 字节` }); continue; }
    if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) { problems.push({ path, reason: "内容不是有效的 base64" }); continue; }
    total += size;
    if (total > SKILL_LIMITS.packageBytes) refuseDeclarations([...problems, { reason: `内容包合计超过 ${SKILL_LIMITS.packageBytes} 字节` }]);
    files.set(path!, Buffer.from(encoded, "base64"));
  }
  return { files, problems };
}

function utf8Of(bytes: Buffer): string | null {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return null; }
}

function jsonOf(bytes: Buffer): unknown {
  const text = utf8Of(bytes);
  if (text === null) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}
