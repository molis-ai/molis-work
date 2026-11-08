import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { CONTENT_PACKAGE_FILES, type PluginDeclarationProblem, type PluginManifest, type PluginPackagePayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SKILL_LIMITS, SKILL_RESOURCE_FOLDERS, type PluginMethodDeclaration, type SkillAppliesTo, type SkillResourceDeclaration, type SkillResourceRole } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { parseContentPackage } from "./content-package.js";
import { refuseDeclarations } from "./declaration-problems.js";
import { packagePathProblem } from "./skill-declarations.js";
import { frontmatterWritesAppliesTo, skillDeclarationFromFrontmatter } from "./skill-frontmatter.js";

// A Skills folder made into a content package (specs/skill-packs/contract-design.md §3, §4.1, §6): what CLI `pack-content` packs
// from the author's folder and what the Host's Skills import packs from a local Agent's Skills folder, so both make the same package.
// The caller reads the files (no link, nothing outside the folder); this module only turns bytes into a package and checks it.

/** One Skill made from its folder: the declaration its SKILL.md says, and its files at their package paths. */
export interface FolderSkill {
  declaration: PluginMethodDeclaration;
  files: Map<string, Uint8Array>;
  /** Whether SKILL.md writes `applies_to` itself; when it does not, the declaration's is the one the caller gave (`options.applies_to`). */
  applies_to_written: boolean;
}

const ROLES = Object.entries(SKILL_RESOURCE_FOLDERS) as Array<[SkillResourceRole, string]>;
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  md: "text/markdown", markdown: "text/markdown", txt: "text/plain", csv: "text/csv", tsv: "text/tab-separated-values", html: "text/html", css: "text/css",
  json: "application/json", jsonc: "application/json", yaml: "application/yaml", yml: "application/yaml", toml: "application/toml", xml: "application/xml",
  py: "text/x-python", sh: "text/x-shellscript", js: "text/javascript", mjs: "text/javascript", ts: "text/x-typescript",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf",
};

/** What the extension says the file is; any other file is bytes (`application/octet-stream`). */
function mediaTypeOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1), dot = name.lastIndexOf(".");
  return (dot > 0 && MEDIA_TYPES[name.slice(dot + 1).toLowerCase()]) || "application/octet-stream";
}

/**
 * One Skill from its folder's files (paths relative to the folder): `SKILL.md`, whose frontmatter `skillDeclarationFromFrontmatter`
 * turns into the declaration, and its resources, each under `references/`, `scripts/` or `assets/` with its size and digest. A file
 * anywhere else, a path that leaves the folder, or a SKILL.md the reading refuses refuses this Skill with `plugin.declaration_invalid`.
 * `version` is the caller's when it counts versions (an import, §4.3); otherwise the frontmatter's. `applies_to` is who the Skill is for
 * when SKILL.md writes none (the person's choice at an import); one SKILL.md writes is kept, never replaced.
 */
export function skillFromFolder(files: ReadonlyMap<string, Uint8Array>, options: { version?: number; applies_to?: SkillAppliesTo } = {}): FolderSkill {
  const body = files.get(CONTENT_PACKAGE_FILES.body);
  if (!body) refuseDeclarations([{ path: CONTENT_PACKAGE_FILES.body, reason: "技能目录里找不到" }]);
  let markdown: string;
  try { markdown = new TextDecoder("utf-8", { fatal: true }).decode(body); } catch { return refuseDeclarations([{ path: CONTENT_PACKAGE_FILES.body, reason: "不是 UTF-8 文字" }]); }
  const problems: PluginDeclarationProblem[] = [], resources: Array<{ path: string; role: SkillResourceRole; bytes: Uint8Array }> = [];
  for (const [path, bytes] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    if (path === CONTENT_PACKAGE_FILES.body) continue;
    const escape = packagePathProblem(path), role = ROLES.find(([, folder]) => path.startsWith(`${folder}/`))?.[0];
    if (escape) problems.push({ path, reason: escape });
    else if (!role) problems.push({ path, reason: `不在 ${ROLES.map(([, folder]) => `${folder}/`).join("、")} 下：只有这几处的文件能随技能带上` });
    else resources.push({ path, role, bytes });
  }
  if (problems.length) refuseDeclarations(problems);
  // The id names the package paths, so the declaration is read once for it and once with the resources under it.
  const { skill_id } = skillDeclarationFromFrontmatter(markdown, options), folder = `${CONTENT_PACKAGE_FILES.skills}/${skill_id}`;
  const declared: SkillResourceDeclaration[] = resources.map(({ path, role, bytes }) => ({ path: `${folder}/${path}`, role, media_type: mediaTypeOf(path),
    bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }));
  const declaration = skillDeclarationFromFrontmatter(markdown, { ...options, ...(declared.length ? { resources: declared } : {}) });
  return { declaration, applies_to_written: frontmatterWritesAppliesTo(markdown), files: new Map([[`${folder}/${CONTENT_PACKAGE_FILES.body}`, body], ...resources.map(({ path, bytes }): [string, Uint8Array] => [`${folder}/${path}`, bytes])]) };
}

/** Who and what the package is; its Skills come from `skillFromFolder`. */
export interface ContentPackageInput {
  plugin_id: string;
  version: string;
  name: string;
  publisher: PluginManifest["publisher"];
  /** `home`: installed for the person, not in a project (`runtime: { scope: "home" }`). */
  scope?: "home" | "project";
  /** The installed versions this one upgrades (`upgrade_compatibility`). */
  compatible_from?: readonly string[];
  skills: readonly FolderSkill[];
}

/**
 * The unsigned payload of a content package holding these Skills, read back through `parseContentPackage` (the Host's own reading)
 * before it is returned. More Skills than one package holds (`SKILL_LIMITS.skillsPerPackage`), or two with one id, is refused: the
 * caller splits them into packages or picks fewer, nothing is dropped here.
 */
export function contentPackagePayload(input: ContentPackageInput): PluginPackagePayload {
  if (input.skills.length > SKILL_LIMITS.skillsPerPackage) {
    refuseDeclarations([{ reason: `一个包至多 ${SKILL_LIMITS.skillsPerPackage} 个技能，这里有 ${input.skills.length} 个：请分成几个包，或少选几个` }]);
  }
  const manifest = { schema_version: /* @version manifest.schema */ 1, host_api_version: /* @version host.api */ 1, plugin_id: input.plugin_id,
    version: input.version, name: input.name, kind: "content", publisher: input.publisher, entrypoints: [], permissions: [],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    methods: input.skills.map(skill => skill.declaration),
    ...(input.scope === "home" ? { runtime: { scope: "home" } } : {}),
    ...(input.compatible_from?.length ? { upgrade_compatibility: { compatible_from_versions: [...input.compatible_from] } } : {}) } as PluginManifest;
  const files = [{ path: CONTENT_PACKAGE_FILES.manifest, content_base64: Buffer.from(JSON.stringify(manifest)).toString("base64") },
    ...input.skills.flatMap(skill => [...skill.files].map(([path, bytes]) => ({ path, content_base64: Buffer.from(bytes).toString("base64") })))];
  const payload: PluginPackagePayload = { schema_version: /* @version format.plugin.package */ 1, manifest, files };
  parseContentPackage(payload);
  return payload;
}
