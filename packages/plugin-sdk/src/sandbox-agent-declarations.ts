import { createHash } from "node:crypto";
import { pluginErrors, type PluginDefinition, type PluginManifest, type PluginPackageManifest, type SandboxAgentBodyDeclaration, type SandboxPackageManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { parsePluginManifest } from "./manifest.js";

const invalid = (message: string): never => { throw pluginErrors.declaration_invalid(message); };

function declarations(value: unknown, kind: "agent" | "methods"): SandboxAgentBodyDeclaration[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 64) return invalid(`${kind} 必须是至多 64 项的正文声明列表`);
  const names = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return invalid(`${kind} 每项必须是 name、purpose、body 对象`);
    const row = item as Record<string, unknown>;
    if (Object.keys(row).some(key => !["name", "purpose", "body"].includes(key))) return invalid(`${kind} 只能声明 name、purpose、body，不能声明权限`);
    if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 80
      || typeof row.purpose !== "string" || !row.purpose.trim() || row.purpose.length > 300) return invalid(`${kind} 名称限 1～80 字，用途限 1～300 字`);
    if (names.has(row.name)) return invalid(`${kind} 名称重复`);
    names.add(row.name);
    const body = row.body;
    if (typeof body !== "string" || !body.startsWith("agent/") || body.includes("\\") || body.includes("\0")
      || body.split("/").some(part => !part || part === "." || part === ".." || /^[a-zA-Z]:/u.test(part))) return invalid(`${kind} 正文必须引用 agent/ 下的包内相对文件`);
    return { name: row.name, purpose: row.purpose, body };
  });
}

/** Validate the package's wire declaration without replacing any signed field with a runtime projection. */
export function parsePluginPackageManifest(input: unknown): PluginPackageManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) return parsePluginManifest(input);
  const raw = input as Record<string, unknown>;
  if (raw.kind !== "app") return parsePluginManifest(input);
  const { agent, methods, ...common } = raw;
  parsePluginManifest(common);
  const roles = declarations(agent, "agent"), skills = declarations(methods, "methods");
  if ((roles?.length ?? 0) + (skills?.length ?? 0) > 64) invalid("角色和方法正文合计至多 64 项");
  // Preserve the original validated wire object and every signed byte-level field; projection happens only after verification.
  return input as SandboxPackageManifest;
}

/** Stable protocol ids preserve the complete name; the display name is never used as a path or authorization. */
export function sandboxAgentBodyIdentity(pluginId: string, kind: "role" | "method", name: string): { entry_id: string; prompt_id: string } {
  const digest = createHash("sha256").update(JSON.stringify([pluginId, kind, name]), "utf8").digest("hex");
  return { entry_id: `${kind}-${digest}`, prompt_id: `prompt-${digest}` };
}

/** The sole text-only runtime projection. Numeric versions do not represent the signed package's SemVer. */
export function sandboxAgentDeclarations(manifest: SandboxPackageManifest): Pick<PluginManifest, "agent" | "methods"> {
  const seen = new Set<string>();
  const identity = (kind: "role" | "method", name: string) => {
    const ids = sandboxAgentBodyIdentity(manifest.plugin_id, kind, name);
    if (seen.has(ids.entry_id)) invalid("正文派生标识重复");
    seen.add(ids.entry_id);
    return ids;
  };
  const roles = (manifest.agent ?? []).map(row => ({ row, ...identity("role", row.name) }));
  const methods = (manifest.methods ?? []).map(row => ({ skill_id: identity("method", row.name).entry_id, version: 1,
    name: row.name, summary: row.purpose, tools: [] }));
  return {
    ...(roles.length ? { agent: {
      roles: roles.map(({ row, entry_id, prompt_id }) => ({ role_id: entry_id, version: 1, name: row.name, workspace: "none" as const, prompts: [prompt_id] })),
      prompts: roles.map(({ prompt_id }) => ({ prompt_id, version: 1, layer: "role" as const })),
    } } : {}),
    ...(methods.length ? { methods } : {}),
  };
}

/** Check the effective sandbox definition against the same permission-free projection used by the package reader. */
export function assertSandboxAgentDefinition(definition: Pick<PluginDefinition, "manifest" | "agent_prompts" | "agent_prompt_names" | "agent_skills" | "methods">): void {
  const { manifest } = definition, agent = manifest.agent;
  if (definition.agent_skills?.length) invalid("沙箱不能提供 Agent skills");
  const roles = agent?.roles ?? [], methods = manifest.methods ?? [], prompts = definition.agent_prompts ?? [], bodies = definition.methods ?? [];
  if (!roles.length && !methods.length && !prompts.length && !bodies.length && !agent) return;
  const wire: SandboxPackageManifest = { ...manifest, agent: roles.map(role => ({ name: role.name, purpose: definition.agent_prompt_names?.[role.prompts?.[0] ?? ""]?.purpose ?? "", body: "agent/text" })),
    methods: methods.map(method => ({ name: method.name, purpose: method.summary, body: "agent/text" })) };
  // Names, purpose, combined count and strict triples use the public package parser's one policy.
  parsePluginPackageManifest(wire);
  const expected = sandboxAgentDeclarations(wire);
  if (JSON.stringify(expected.agent) !== JSON.stringify(agent) || JSON.stringify(expected.methods) !== JSON.stringify(manifest.methods)
    || prompts.length !== roles.length || bodies.length !== methods.length) invalid("沙箱只接受包内派生的文字角色与空工具方法");
  for (const [index, role] of roles.entries()) {
    const prompt = prompts.find(item => item.prompt_id === role.prompts?.[0]);
    if (!prompt || prompt.version !== 1 || prompt.layer !== "role" || prompt.user_revision !== undefined
      || Object.keys(prompt).some(key => !["prompt_id", "version", "layer", "body"].includes(key))
      || definition.agent_prompt_names?.[prompt.prompt_id]?.title !== wire.agent?.[index]?.name) invalid("沙箱角色正文与派生声明不符");
  }
  for (const method of methods) {
    const body = bodies.find(item => item.skill_id === method.skill_id);
    if (!body || Object.keys(body).some(key => !["skill_id", "version", "name", "summary", "tools", "body"].includes(key))
      || body.version !== 1 || body.name !== method.name || body.summary !== method.summary || body.tools.length) invalid("沙箱方法正文与派生声明不符");
  }
  for (const row of [...prompts, ...bodies]) if (typeof row.body !== "string" || !row.body.trim() || row.body.length > 8000 || Buffer.byteLength(row.body, "utf8") > 32_000) invalid("沙箱正文为空或过长");
}
