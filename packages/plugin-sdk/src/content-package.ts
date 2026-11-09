import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { CONTENT_PACKAGE_FILES, type PluginDeclarationProblem, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { refuseDeclarations } from "./declaration-problems.js";
import { isRecord } from "./json-value.js";
import { parsePluginManifest } from "./manifest.js";
import { packagePathProblem } from "./skill-declarations.js";
import { readPackagedSkills, type PackagedSkillBody } from "./skill-files.js";

// The package a plugin with only declarations is installed from (`CONTENT_PACKAGE_FILES`, specs/skill-packs/contract-design.md §3).
// The Host picks this reading or the sandbox package's by the Manifest's `kind`, after the same signature check.

/** A content package that passed every check: the Manifest, and each declared Skill's body. Resources stay in the package files. */
export interface ContentPackage {
  manifest: PluginManifest;
  skills: PackagedSkillBody[];
}

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
  const manifestBytes = files.get(CONTENT_PACKAGE_FILES.manifest);
  if (!manifestBytes) problems.push({ path: CONTENT_PACKAGE_FILES.manifest, reason: "包里找不到" });
  const skills = readPackagedSkills(manifest.methods ?? [], files);
  problems.push(...skills.problems);
  for (const path of files.keys()) if (path !== CONTENT_PACKAGE_FILES.manifest && !skills.paths.has(path)) problems.push({ path, reason: "声明里没有这个文件" });
  if (manifestBytes && !isDeepStrictEqual(jsonOf(manifestBytes), JSON.parse(JSON.stringify(written)))) problems.push({ path: CONTENT_PACKAGE_FILES.manifest, reason: "与包的 Manifest 不一致" });
  if (problems.length) refuseDeclarations(problems);
  return { manifest, skills: skills.bodies };
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

function jsonOf(bytes: Buffer): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return undefined; }
}
