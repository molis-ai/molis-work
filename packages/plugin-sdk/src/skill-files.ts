import { createHash } from "node:crypto";
import { SKILL_LIMITS, type AgentSkillDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";

// The files Manifest `methods` declare, read from a signed package's files: each Skill's body at `skills/<skill_id>/SKILL.md` and each
// of its resources. A content package and a sandbox app package ship them the same way and are read by this one function
// (specs/skill-packs/contract-design.md §4); which other files each package may hold is the caller's.

/** One Skill's body as the package ships it, read and checked against its declaration. */
export interface PackagedSkillBody {
  skill_id: string;
  version: number;
  body: string;
}

/** What `readPackagedSkills` found: every declared path, each body that passed, and what did not. */
export interface PackagedSkills {
  /** Every body and resource path the declarations name: a package file outside these and the package's own files is not declared. */
  paths: ReadonlySet<string>;
  bodies: PackagedSkillBody[];
  problems: PluginDeclarationProblem[];
}

/**
 * Read each declared body and resource from `files` (SKC-03): a declared file must be there; a resource has its declared size and
 * digest; a body is non-empty UTF-8 within `SKILL_LIMITS.bodyLines` lines and Prologue's character limit. The declarations have passed
 * `parsePluginManifest`, so their paths stay inside the package. Every problem names the Skill and the file.
 */
export function readPackagedSkills(methods: readonly AgentSkillDeclaration[], files: ReadonlyMap<string, Uint8Array>): PackagedSkills {
  const paths = new Set<string>(), bodies: PackagedSkillBody[] = [], problems: PluginDeclarationProblem[] = [];
  for (const skill of methods) {
    const say = (path: string, reason: string) => problems.push({ skill_id: skill.skill_id, path, reason });
    if (skill.body) {
      paths.add(skill.body);
      const bytes = files.get(skill.body);
      const body = bytes ? bodyText(bytes) : { reason: "包里找不到" };
      if (typeof body === "string") bodies.push({ skill_id: skill.skill_id, version: skill.version, body });
      else say(skill.body, body.reason);
    }
    for (const resource of skill.resources ?? []) {
      paths.add(resource.path);
      const bytes = files.get(resource.path);
      if (!bytes) say(resource.path, "包里找不到");
      else if (bytes.length !== resource.bytes) say(resource.path, "大小与声明不符");
      else if (createHash("sha256").update(bytes).digest("hex") !== resource.sha256) say(resource.path, "摘要与声明不符");
    }
  }
  return { paths, bodies, problems };
}

/** A body is non-empty UTF-8 within the line limit and Prologue's character limit (UTF-16 units, as Prologue counts them). */
function bodyText(bytes: Uint8Array): string | { reason: string } {
  let body: string;
  try { body = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return { reason: "正文不是 UTF-8 文字" }; }
  if (!body.trim()) return { reason: "正文是空的" };
  const lines = body.split(/\r?\n/u).length - (/\r?\n$/u.test(body) ? 1 : 0);
  if (lines > SKILL_LIMITS.bodyLines) return { reason: `正文超过 ${SKILL_LIMITS.bodyLines} 行` };
  if (body.length > SKILL_LIMITS.bodyChars) return { reason: `正文超过 ${SKILL_LIMITS.bodyChars} 字` };
  return body;
}
