import { createHash, sign } from "node:crypto";
import { CONTENT_PACKAGE_FILES, type PluginManifest, type PluginPackageBundle, type PluginPackagePayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginMethodDeclaration, SkillResourceRole } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import type { newPublisher } from "./sandbox-package.js";

// A signed content package: the package of a plugin with only declarations (Manifest `kind: "content"`, specs/skill-packs/contract-design.md
// §3), with each Skill's body at `skills/<skill_id>/SKILL.md` and its resources beside it. Shared by the install (08-6) and import (08-8) tests.

export const CONTENT_PLUGIN_ID = "io.molis.work.example.meeting-skills";

export interface ContentSkill {
  id: string;
  body?: string;
  version?: number;
  name?: string;
  applies_to?: PluginMethodDeclaration["applies_to"];
  /** Resource path (relative to the Skill's folder, e.g. `references/template.md`) to its text. */
  resources?: Record<string, string>;
}

export interface ContentPackageOptions {
  pluginId?: string;
  version?: string;
  skills?: ContentSkill[];
  compatibleFrom?: string[];
  scope?: "home" | "project";
  requires?: PluginManifest["requires"];
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const roleOf = (path: string): SkillResourceRole => path.startsWith("scripts/") ? "script" : path.startsWith("assets/") ? "asset" : "reference";

/** The default Skill: a meeting-notes body with one reference. */
export const MEETING_NOTES: ContentSkill = { id: "meeting-notes", body: "# 会议纪要\n\n先读 references/template.md，再按它整理。\n", resources: { "references/template.md": "## 模板\n- 结论\n- 待办\n" } };

/** The Manifest and the files of a content package that is in the format. */
export function contentPackageParts(publisher: string, options: ContentPackageOptions = {}): { manifest: PluginManifest; files: Record<string, string> } {
  const files: Record<string, string> = {};
  const methods = (options.skills ?? [MEETING_NOTES]).map((skill): PluginMethodDeclaration => {
    const folder = `${CONTENT_PACKAGE_FILES.skills}/${skill.id}`, body = `${folder}/${CONTENT_PACKAGE_FILES.body}`;
    files[body] = skill.body ?? `按 ${skill.id} 的做法完成这件事。\n`;
    const resources = Object.entries(skill.resources ?? {}).map(([path, text]) => {
      files[`${folder}/${path}`] = text;
      return { path: `${folder}/${path}`, role: roleOf(path), media_type: "text/markdown", bytes: Buffer.byteLength(text), sha256: sha256(text) };
    });
    return { skill_id: skill.id, version: skill.version ?? 1, name: skill.name ?? skill.id, summary: `${skill.name ?? skill.id}的做法`, tools: [],
      description: `用户要做${skill.name ?? skill.id}时使用。`, applies_to: skill.applies_to ?? "both", body, ...(resources.length ? { resources } : {}) };
  });
  const manifest = { schema_version: 1, host_api_version: 1, plugin_id: options.pluginId ?? CONTENT_PLUGIN_ID, version: options.version ?? "1.0.0", name: "会议技能", kind: "content",
    publisher: { publisher_id: "example", signature: publisher }, entrypoints: [], permissions: [], capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, methods,
    ...(options.scope === "home" ? { runtime: { scope: "home" } } : {}),
    ...(options.compatibleFrom ? { upgrade_compatibility: { compatible_from_versions: options.compatibleFrom } } : {}),
    ...(options.requires ? { requires: options.requires } : {}) } as PluginManifest;
  return { manifest, files };
}

export function contentPayload(manifest: PluginManifest, files: Record<string, string>): PluginPackagePayload {
  const all = { ...files, [CONTENT_PACKAGE_FILES.manifest]: JSON.stringify(manifest) };
  return { schema_version: 1, manifest, files: Object.entries(all).map(([path, text]) => ({ path, content_base64: Buffer.from(text).toString("base64") })) };
}

/** A signed content package in the format; `change` edits its files and Manifest before it is signed. */
export function signedContentPackage(publisher: ReturnType<typeof newPublisher>, options: ContentPackageOptions = {},
  change?: (files: Record<string, string>, manifest: PluginManifest) => void): PluginPackageBundle {
  const { manifest, files } = contentPackageParts(publisher.identity, options);
  change?.(files, manifest);
  return signPluginPackage({ payload: contentPayload(manifest, files), signature: null, publisher_key: null }, publisher.signer);
}

/**
 * A payload as it stands, signed with the publisher's real key: what a publisher who skips the tools can still hand the Host. A payload
 * signing takes is signed as signing does; one it refuses (a path out of the package, a declaration the Manifest rules refuse) is signed
 * over its bytes, and the Host's own reading refuses it before the signature is looked at.
 */
export function forgedBundle(publisher: ReturnType<typeof newPublisher>, payload: PluginPackagePayload): PluginPackageBundle {
  try { return signPluginPackage({ payload, signature: null, publisher_key: null }, publisher.signer); } catch { /* signing refuses it: sign the bytes below */ }
  const signature = sign(null, Buffer.from(canonicalJsonText(payload, "null"), "utf8"), publisher.keys.privateKey);
  return { payload: payload as PluginPackagePayload, signature: { algorithm: "ed25519", value_base64: signature.toString("base64") },
    publisher_key: { algorithm: "ed25519", spki_base64: publisher.signer.public_key_spki_base64 } };
}
