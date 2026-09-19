import type {
  AgentRuntimeCapability,
  AgentRuntimeCapabilityMatrix,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { AGENT_RUNTIME_CAPABILITIES } from "@molis-ai/molis-work-contracts/services/agent-host";

/** A matrix with everything unsupported, for an adapter to narrow honestly. */
export function emptyCapabilityMatrix(): AgentRuntimeCapabilityMatrix {
  const matrix = {} as Record<AgentRuntimeCapability, "unsupported">;
  for (const capability of AGENT_RUNTIME_CAPABILITIES) matrix[capability] = "unsupported";
  return matrix;
}
