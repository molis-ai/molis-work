import { agentDefinitionsFor, type AgentDefinitions } from "./agent-definitions.js";
import { builtinRegistrations } from "./builtin-agents.js";

export { builtinRegistrations };

/** The Home's one register of Agent definitions, with the system's and the catalog's registered, and what running plugins add. */
export function homeAgentDefinitions(homeDirectory: string): AgentDefinitions {
  return agentDefinitionsFor(homeDirectory, builtinRegistrations);
}
