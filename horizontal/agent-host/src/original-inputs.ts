import type { HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentOriginalInputDraft, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "./errors.js";

/** Provenance is checked independently of permissions; a plugin cannot manufacture personal authorship in its start DTO. */
export function trustedOriginalInput(request: AgentStartRequest, offered: Omit<HostOfferedOriginalInput, "action"> | undefined): AgentOriginalInputDraft | undefined {
  const original = request.original_input;
  if (!original) return undefined;
  if (original.written_by === "person" && (!offered || offered.install_id !== request.install_id
    || offered.written_by !== "person" || offered.input_id !== original.input_id || offered.text !== original.text
    || offered.occurred_at !== original.occurred_at)) throw agentErrors.capability_unavailable("缺少这次输入的本人原件证明");
  return structuredClone(original);
}
