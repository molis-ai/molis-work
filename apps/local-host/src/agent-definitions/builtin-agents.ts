import { BUILTIN_PLUGIN_AGENTS, BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { AgentDefinitionRegistration, AgentDefinitionSource } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "../assistant/assistant-agent.js";
import { agentRegistration, withInstructions, type BuiltinAgent } from "./agent-definitions.js";
import { BUILTIN_INLINE_AGENT_PROMPTS, BUILTIN_INLINE_AGENT_ROLES, BUILTIN_INSTRUCTIONS, SYSTEM_INSTRUCTION_SOURCES, UNUSED_MANIFEST_AGENTS } from "./builtin-instructions.js";

/** The system's own Agents and every built-in Plugin that declares one, as the Host starts them. */
export function builtinAgents(): BuiltinAgent[] {
  const agents: BuiltinAgent[] = [{ owner_id: ASSISTANT_PLUGIN_ID, source: { kind: "system", module: "assistant", title: "个人工作助理" },
    manifest: ASSISTANT_AGENT, prompts: ASSISTANT_PROMPTS }];
  for (const [pluginId, agent] of BUILTIN_PLUGIN_AGENTS) {
    if (UNUSED_MANIFEST_AGENTS.has(pluginId)) continue;
    const manifest = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === pluginId)?.manifest;
    agents.push({ owner_id: pluginId, source: { kind: "plugin", plugin_id: pluginId, plugin_version: manifest?.version ?? "", title: manifest?.name ?? pluginId },
      manifest: agent.manifest, prompts: agent.prompts, skills: agent.skills });
  }
  return agents;
}

/** Where an owner of instruction prompts comes from: a built-in Plugin, or one of the Host's own modules. */
function sourceOf(ownerId: string): AgentDefinitionSource {
  const system = SYSTEM_INSTRUCTION_SOURCES[ownerId];
  if (system) return { kind: "system", module: ownerId.slice("system:".length), title: system };
  const manifest = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === ownerId)?.manifest;
  return { kind: "plugin", plugin_id: ownerId, plugin_version: manifest?.version ?? "", title: manifest?.name ?? ownerId };
}

/** Everything the Host registers when it starts: every built-in Agent, and every instruction a built-in model call uses. */
export function builtinRegistrations(): AgentDefinitionRegistration[] {
  const registrations = withInstructions(builtinAgents().map(agent => agentRegistration(agent.owner_id, agent.source, agent.manifest, agent.prompts)), BUILTIN_INSTRUCTIONS, sourceOf);
  for (const inline of BUILTIN_INLINE_AGENT_PROMPTS) {
    const owner = registrations.find(row => row.owner_id === inline.owner_id);
    if (owner) owner.prompts.push(structuredClone(inline.prompt));
    else registrations.push({ owner_id: inline.owner_id, source: sourceOf(inline.owner_id), prompts: [structuredClone(inline.prompt)], roles: [] });
  }
  for (const inline of BUILTIN_INLINE_AGENT_ROLES) registrations.find(row => row.owner_id === inline.owner_id)?.roles.push(structuredClone(inline.role));
  // Methods a built-in Plugin offers to other Agents: registered with it, bodies from its package, exactly as declared.
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    const declared = entry.manifest.methods ?? [];
    if (!declared.length) continue;
    const methods = declared.flatMap(method => {
      const body = entry.methods?.find(item => item.skill_id === method.skill_id && item.version === method.version)?.body;
      return body ? [{ skill_id: method.skill_id, version: method.version, name: method.name, summary: method.summary, tools: [...method.tools], body }] : [];
    });
    const owner = registrations.find(row => row.owner_id === entry.manifest.plugin_id);
    const missing = declared.filter(method => !methods.some(item => item.skill_id === method.skill_id)).map(method => `方法 ${method.skill_id} 声明了但包里没有正文，未登记`);
    if (owner) { owner.methods = methods; if (missing.length) owner.notes = [...owner.notes ?? [], ...missing]; }
    else registrations.push({ owner_id: entry.manifest.plugin_id, source: sourceOf(entry.manifest.plugin_id), prompts: [], roles: [], methods, ...(missing.length ? { notes: missing } : {}) });
  }
  return registrations;
}
