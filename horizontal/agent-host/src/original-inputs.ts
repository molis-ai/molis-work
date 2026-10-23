import type { HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentInputSendRequest, AgentInputSend } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AgentOriginalInputDraft, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "./errors.js";

/** Provenance is checked independently of permissions; a plugin cannot manufacture personal authorship in its start DTO. */
export function trustedOriginalInput(request: AgentStartRequest, offered: Omit<HostOfferedOriginalInput, "action"> | undefined): AgentOriginalInputDraft | undefined {
  const original = request.original_input;
  if (!original) return undefined;
  if (original.written_by === "person" && (!offered || offered.use !== undefined || offered.install_id !== request.install_id
    || offered.written_by !== "person" || offered.input_id !== original.input_id || offered.text !== original.text
    || offered.occurred_at !== original.occurred_at)) throw agentErrors.capability_unavailable("缺少这次输入的本人原件证明");
  return structuredClone(original);
}

/** A supplement's author comes from its protected operation, never the plugin's source field. */
export function trustedSupplementInput(input: Omit<AgentInputSendRequest, "runtime_id" | "session_id" | "run_id">,
  offered: HostOfferedOriginalInput | undefined, installId: string): AgentInputSend {
  const { source: _source, ...send } = input;
  if (offered?.use !== "supplement") return { ...send, source: "host" };
  if (offered.install_id !== installId || offered.written_by !== "person" || input.key !== `send.${offered.input_id}`) {
    throw agentErrors.capability_unavailable("缺少这次补充的本人原件证明");
  }
  return input.text === offered.text ? { ...send, source: "person" } : { ...send, source: "host", original: { text: offered.text, source: "person" } };
}
