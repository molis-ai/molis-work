import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import type { AgentDefinitionRegistration, AgentDefinitionSource } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "../assistant/assistant-agent.js";
import { agentRegistration, withInstructions, type BuiltinAgent } from "./agent-definitions.js";
import { BUILTIN_INLINE_AGENT_PROMPTS, BUILTIN_INLINE_AGENT_ROLES, BUILTIN_INSTRUCTIONS, SYSTEM_INSTRUCTION_SOURCES } from "./builtin-instructions.js";

/**
 * The system's own Agents, as the Host starts them. A plugin's Agent block is registered by its running definition, with the Home's
 * remembered declaration standing in while it does not run (PG-051).
 */
export function builtinAgents(): BuiltinAgent[] {
  return [{ owner_id: ASSISTANT_PLUGIN_ID, source: { kind: "system", module: "assistant", title: "个人工作助理" }, manifest: ASSISTANT_AGENT, prompts: ASSISTANT_PROMPTS }];
}

/** Where an owner the Host registers comes from: the platform itself, or Alchemist, which the Host serves (until it runs as a definition). */
function sourceOf(ownerId: string): AgentDefinitionSource {
  const system = SYSTEM_INSTRUCTION_SOURCES[ownerId];
  if (system) return { kind: "system", ...system };
  const manifest = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === ownerId)?.manifest;
  return { kind: "plugin", plugin_id: ownerId, plugin_version: manifest?.version ?? "", title: manifest?.name ?? ownerId };
}

/** Everything the Host registers when it starts: the system's Agents, and every instruction and Agent the Host itself calls. */
export function builtinRegistrations(): AgentDefinitionRegistration[] {
  const registrations = withInstructions(builtinAgents().map(agent => agentRegistration(agent.owner_id, agent.source, agent.manifest, agent.prompts)), BUILTIN_INSTRUCTIONS, sourceOf);
  for (const inline of BUILTIN_INLINE_AGENT_PROMPTS) {
    const owner = registrations.find(row => row.owner_id === inline.owner_id);
    if (owner) owner.prompts.push(structuredClone(inline.prompt));
    else registrations.push({ owner_id: inline.owner_id, source: sourceOf(inline.owner_id), prompts: [structuredClone(inline.prompt)], roles: [] });
  }
  for (const inline of BUILTIN_INLINE_AGENT_ROLES) registrations.find(row => row.owner_id === inline.owner_id)?.roles.push(structuredClone(inline.role));
  return registrations;
}
