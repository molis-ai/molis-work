import { createHash } from "node:crypto";
import type { GoalTreeProposalDecisionAuthority } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { MolisWorkRuntimeContextHost, RuntimeGoalTreeConfirmation } from "@molis-ai/molis-work-contracts/platform/app-host";

/** Audit provenance from trusted host metadata; this does not grant domain decision authority. */
export function runtimeGoalTreeDecisionAuthority(
  host: MolisWorkRuntimeContextHost | null,
  context: { runtimeSessionId: string | null; runtimeSessionIdSource: string | null },
  confirmation: RuntimeGoalTreeConfirmation,
): GoalTreeProposalDecisionAuthority {
  const runtimeId = host?.runtimeContext.runtime_id ?? "embedded-runtime";
  const workContextId = context.runtimeSessionId
    ?? host?.runtimeContext.stable_work_context_id
    ?? "session-unavailable";
  const attestationDigest = createHash("sha256")
    .update(JSON.stringify({
      runtime_id: runtimeId,
      runtime_actor_id: confirmation.runtimeActorId,
      work_context_id: workContextId,
      session_id_source: context.runtimeSessionIdSource,
      confirmation_summary: confirmation.confirmationSummary,
      proposal_id: confirmation.proposalId,
      whole_confirmation_prompted: confirmation.wholeConfirmationPrompted,
      idempotency_key: confirmation.idempotencyKey,
    }))
    .digest("hex")
    .slice(0, 20);
  return {
    actor_id: `user-confirmed-via:${runtimeId}`,
    actor_kind: "user",
    authority_source: "runtime_dialogue",
    conversation_ref: `runtime-dialogue:${runtimeId}:${workContextId}`,
    message_ref: `runtime-attestation:${attestationDigest}`,
    whole_confirmation_prompted: confirmation.wholeConfirmationPrompted,
    prompted_proposal_id: confirmation.wholeConfirmationPrompted ? confirmation.proposalId : undefined,
  };
}
