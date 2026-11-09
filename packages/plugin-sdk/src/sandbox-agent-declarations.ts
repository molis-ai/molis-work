import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { pluginErrors, type PluginDeclarationProblem, type PluginDefinition, type PluginManifest, type PluginPackageManifest, type SandboxAgentBodyDeclaration, type SandboxPackageManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { refuseDeclarations } from "./declaration-problems.js";
import { parsePluginManifest } from "./manifest.js";
import { skillBodyPath } from "./skill-declarations.js";

const invalid = (message: string): never => { throw pluginErrors.declaration_invalid(message); };

/** Role materials (`agent`): text resources under `agent/`, each only a name, a purpose and its body's path. */
function roleDeclarations(value: unknown): SandboxAgentBodyDeclaration[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 64) return invalid("agent 必须是至多 64 项的正文声明列表");
  const names = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return invalid("agent 每项必须是 name、purpose、body 对象");
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some(key => !["name", "purpose", "body"].includes(key))) return invalid("agent 只能声明 name、purpose、body，不能声明权限");
    if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 80
      || typeof row.purpose !== "string" || !row.purpose.trim() || row.purpose.length > 300) return invalid("agent 名称限 1～80 字，用途限 1～300 字");
    if (names.has(row.name)) return invalid("agent 名称重复");
    names.add(row.name);
    const body = row.body;
    if (typeof body !== "string" || !body.startsWith("agent/") || body.includes("\\") || body.includes("\0")
      || body.split("/").some(part => !part || part === "." || part === ".." || /^[a-zA-Z]:/u.test(part))) return invalid("agent 正文必须引用 agent/ 下的包内相对文件");
    return { name: row.name, purpose: row.purpose, body };
  });
}

/**
 * What a signed app package's methods must be besides Manifest `methods` (which `parsePluginManifest` checks as every plugin's, with
 * `description` and `applies_to` required): each ships its body in the package, and none names a tool, so a method the sandbox
 * carries grants nothing (S-105).
 */
function sandboxMethodProblems(manifest: PluginManifest): PluginDeclarationProblem[] {
  return (manifest.methods ?? []).flatMap(({ skill_id, body, tools }) => [
    ...(body === undefined ? [{ skill_id, reason: `方法 ${skill_id} 要写 body：签名包的正文随包发布，在 ${skillBodyPath(skill_id)}` }] : []),
    ...(tools.length ? [{ skill_id, reason: `方法 ${skill_id} 只能声明空的 tools：沙箱包的方法不带工具` }] : []),
  ]);
}

/**
 * Validate the package's wire declaration without replacing any signed field with a runtime projection. Its `methods` are complete
 * Skill declarations, as written; a `{ name, purpose, body }` method is not one and is refused (SKP-08, SKC-03).
 */
export function parsePluginPackageManifest(input: unknown): PluginPackageManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) return parsePluginManifest(input);
  const raw = input as Record<string, unknown>;
  if (raw.settings_entries !== undefined) refuseDeclarations([{ path: "settings_entries", reason: "签名沙箱包尚未接入设置读写处理器" }]);
  if (raw.kind !== "app") return parsePluginManifest(input);
  const { agent, ...common } = raw;
  const parsed = parsePluginManifest(common);
  const roles = roleDeclarations(agent);
  const problems = sandboxMethodProblems(parsed);
  if (problems.length) refuseDeclarations(problems);
  if ((roles?.length ?? 0) + (parsed.methods?.length ?? 0) > 64) invalid("角色和方法正文合计至多 64 项");
  // Preserve the original validated wire object and every signed byte-level field; projection happens only after verification.
  return input as SandboxPackageManifest;
}

/** A role material's stable protocol ids keep its complete name; the display name is never used as a path or authorization. */
export function sandboxRoleIdentity(pluginId: string, name: string): { entry_id: string; prompt_id: string } {
  const digest = createHash("sha256").update(JSON.stringify([pluginId, "role", name]), "utf8").digest("hex");
  return { entry_id: `role-${digest}`, prompt_id: `prompt-${digest}` };
}

/**
 * The sole text-only runtime projection of the role materials; numeric versions do not represent the signed package's SemVer. The
 * methods are the package's own declarations, carried as written.
 */
export function sandboxAgentDeclarations(manifest: SandboxPackageManifest): Pick<PluginManifest, "agent" | "methods"> {
  const seen = new Set<string>();
  const roles = (manifest.agent ?? []).map(row => {
    const ids = sandboxRoleIdentity(manifest.plugin_id, row.name);
    if (seen.has(ids.entry_id)) invalid("正文派生标识重复");
    seen.add(ids.entry_id);
    return { row, ...ids };
  });
  return {
    ...(roles.length ? { agent: {
      roles: roles.map(({ row, entry_id, prompt_id }) => ({ role_id: entry_id, version: /* @version format.sandbox.agent-role */ 1, name: row.name, workspace: "none" as const, prompts: [prompt_id] })),
      prompts: roles.map(({ prompt_id }) => ({ prompt_id, version: /* @version format.sandbox.agent-prompt */ 1, layer: "role" as const })),
    } } : {}),
    ...(manifest.methods?.length ? { methods: structuredClone(manifest.methods) } : {}),
  };
}

/** Check the effective sandbox definition against the package reader's rules: derived text roles, and methods exactly as declared. */
export function assertSandboxAgentDefinition(definition: Pick<PluginDefinition, "manifest" | "agent_prompts" | "agent_prompt_names" | "agent_skills" | "methods">): void {
  const { manifest } = definition, agent = manifest.agent;
  if (definition.agent_skills?.length) invalid("沙箱不能提供 Agent skills");
  const roles = agent?.roles ?? [], methods = manifest.methods ?? [], prompts = definition.agent_prompts ?? [], bodies = definition.methods ?? [];
  if (!roles.length && !methods.length && !prompts.length && !bodies.length && !agent) return;
  const wire: SandboxPackageManifest = { ...manifest, agent: roles.map(role => ({ name: role.name, purpose: definition.agent_prompt_names?.[role.prompts?.[0] ?? ""]?.purpose ?? "", body: "agent/text" })) };
  // Role names and purposes, the methods, the combined count and strict role triples use the public package parser's one policy.
  parsePluginPackageManifest(wire);
  const expected = sandboxAgentDeclarations(wire);
  if (JSON.stringify(expected.agent) !== JSON.stringify(agent) || prompts.length !== roles.length || bodies.length !== methods.length) invalid("沙箱只接受包内派生的文字角色与包里声明的方法");
  for (const [index, role] of roles.entries()) {
    const prompt = prompts.find(item => item.prompt_id === role.prompts?.[0]);
    if (!prompt || prompt.version !== /* @version format.sandbox.agent-prompt */ 1 || prompt.layer !== "role" || prompt.user_revision !== undefined
      || Object.keys(prompt).some(key => !["prompt_id", "version", "layer", "body"].includes(key))
      || definition.agent_prompt_names?.[prompt.prompt_id]?.title !== wire.agent?.[index]?.name) invalid("沙箱角色正文与派生声明不符");
  }
  for (const { body: _path, ...declared } of methods) {
    const shipped = bodies.find(item => item.skill_id === declared.skill_id);
    const { body: _text, ...given } = shipped ?? { body: "" };
    if (!shipped || !isDeepStrictEqual(given, declared)) invalid("沙箱方法正文与声明不符");
  }
  for (const row of prompts) if (typeof row.body !== "string" || !row.body.trim() || row.body.length > 8000 || Buffer.byteLength(row.body, "utf8") > 32_000) invalid("沙箱正文为空或过长");
  for (const row of bodies) if (typeof row.body !== "string" || !row.body.trim() || row.body.length > SKILL_LIMITS.bodyChars) invalid("沙箱方法正文为空或过长");
}
