import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { SKILL_LIMITS, type AgentSkillDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { CONTENT_PACKAGE_FILES, type PluginDeclarationProblem, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { refuseDeclarations } from "./declaration-problems.js";
import { isRecord } from "./json-value.js";
import { parsePluginManifest } from "./manifest.js";
import { packagePathProblem } from "./skill-declarations.js";

// The package a plugin with only declarations is installed from (`CONTENT_PACKAGE_FILES`, specs/skill-packs/contract-design.md §3).
// The Host picks this reading or the sandbox package's by the Manifest's `kind`, after the same signature check.

/** One Skill's body as the package ships it, read and checked against its declaration. */
export interface ContentPackageSkill {
  skill_id: string;
  version: number;
  body: string;
}

/** A content package that passed every check: the Manifest, and each declared Skill's body. Resources stay in the package files. */
export interface ContentPackage {
  manifest: PluginManifest;
  skills: ContentPackageSkill[];
}

/** What one declared file is: the Manifest, a Skill's body, or one of its resources. */
type Expected =
  | { kind: "manifest" }
  | { kind: "body"; skill: AgentSkillDeclaration }
  | { kind: "resource"; skill: AgentSkillDeclaration; bytes: number; sha256: string };

/**
 * Read a content package's payload (`CONTENT_PACKAGE_FILES`), after its signature is verified and before anything is written. The files
 * are exactly `manifest.json` and the declared bodies and resources (SKC-03): each declared file is there, nothing else is, every path
 * stays inside the package, each resource has its declared size and digest, and each body is UTF-8 text within the limits. A bad
 * package is refused whole with `plugin.declaration_invalid`, its `details.problems` naming each Skill and file. The wire has no links;
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
  const expected = expectedFiles(manifest);
  for (const [path, entry] of expected) if (!files.has(path)) problems.push({ ...skillOf(entry), path, reason: "包里找不到" });
  for (const path of files.keys()) if (!expected.has(path)) problems.push({ path, reason: "声明里没有这个文件" });
  const skills: ContentPackageSkill[] = [];
  for (const [path, entry] of expected) {
    const bytes = files.get(path);
    if (!bytes) continue;
    if (entry.kind === "manifest") {
      if (!isDeepStrictEqual(jsonOf(bytes), JSON.parse(JSON.stringify(written)))) problems.push({ path, reason: "与包的 Manifest 不一致" });
    } else if (entry.kind === "resource") {
      if (bytes.length !== entry.bytes) problems.push({ ...skillOf(entry), path, reason: "大小与声明不符" });
      else if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) problems.push({ ...skillOf(entry), path, reason: "摘要与声明不符" });
    } else {
      const body = bodyText(bytes);
      if (typeof body === "string") skills.push({ skill_id: entry.skill.skill_id, version: entry.skill.version, body });
      else problems.push({ ...skillOf(entry), path, reason: body.reason });
    }
  }
  if (problems.length) refuseDeclarations(problems);
  return { manifest, skills };
}

function skillOf(entry: Expected): { skill_id?: string } {
  return entry.kind === "manifest" ? {} : { skill_id: entry.skill.skill_id };
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

/** The files the Manifest declares, by path. `parsePluginManifest` already refused a path outside the package or a duplicate. */
function expectedFiles(manifest: PluginManifest): Map<string, Expected> {
  const expected = new Map<string, Expected>([[CONTENT_PACKAGE_FILES.manifest, { kind: "manifest" }]]);
  for (const skill of manifest.methods ?? []) {
    if (skill.body) expected.set(skill.body, { kind: "body", skill });
    for (const resource of skill.resources ?? []) expected.set(resource.path, { kind: "resource", skill, bytes: resource.bytes, sha256: resource.sha256 });
  }
  return expected;
}

function jsonOf(bytes: Buffer): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return undefined; }
}

/** A body is non-empty UTF-8 within the line limit and Prologue's character limit (UTF-16 units, as Prologue counts them). */
function bodyText(bytes: Buffer): string | { reason: string } {
  let body: string;
  try { body = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return { reason: "正文不是 UTF-8 文字" }; }
  if (!body.trim()) return { reason: "正文是空的" };
  const lines = body.split(/\r?\n/u).length - (/\r?\n$/u.test(body) ? 1 : 0);
  if (lines > SKILL_LIMITS.bodyLines) return { reason: `正文超过 ${SKILL_LIMITS.bodyLines} 行` };
  if (body.length > SKILL_LIMITS.bodyChars) return { reason: `正文超过 ${SKILL_LIMITS.bodyChars} 字` };
  return body;
}
