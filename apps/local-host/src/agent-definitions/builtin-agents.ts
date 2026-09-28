import { BUILTIN_PLUGIN_AGENTS, BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "../assistant/assistant-agent.js";
import type { BuiltinAgent } from "./agent-definitions.js";

/** The system's own Agents and every built-in Plugin that declares one, as the Host starts them. */
export function builtinAgents(): BuiltinAgent[] {
  const agents: BuiltinAgent[] = [{ owner_id: ASSISTANT_PLUGIN_ID, source: { kind: "system", module: "assistant", title: "个人工作助理" },
    manifest: ASSISTANT_AGENT, prompts: ASSISTANT_PROMPTS }];
  for (const [pluginId, agent] of BUILTIN_PLUGIN_AGENTS) {
    const manifest = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === pluginId)?.manifest;
    agents.push({ owner_id: pluginId, source: { kind: "plugin", plugin_id: pluginId, plugin_version: manifest?.version ?? "", title: manifest?.name ?? pluginId },
      manifest: agent.manifest, prompts: agent.prompts, skills: agent.skills });
  }
  return agents;
}
