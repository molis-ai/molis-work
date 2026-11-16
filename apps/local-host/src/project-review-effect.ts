import { ActionError, requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectTrustedDecision, TrustedReviewCommand, TrustedReviewRow } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { markTrustedDecisionRolledBack, markTrustedDecisionSubmitted } from "@molis-ai/molis-work-kernel";
import { currentPluginAction, inPluginInstance, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";

/** Host-issued data for the exact transaction, including when its SQLite writer is in the statement process. */
export interface ProjectReviewCommit {
  readonly command: TrustedReviewCommand;
  readonly decisionId: string;
  readonly frozenChoice: unknown;
  readonly rulesRevision: string;
  readonly review: Pick<ProjectTrustedDecision, "publisher_signature" | "review" | "presentation">;
  readonly actor_id: string;
  readonly entry: ProjectTrustedDecision["source"]["entry"];
  readonly deadline?: number;
  readonly row?: TrustedReviewRow;
}

/** Only the consumed registered handler's actual execution context can retrieve the Host's reservation. */
const reservations = new WeakMap<ActionExecutionContext, ProjectReviewCommit>();

export function bindProjectReview(held: ProjectReviewCommit): (execution: ActionExecutionContext) => void {
  return execution => { reservations.set(execution, held); };
}

export function projectReviewCommitControl(instance: PluginInstance) {
  const original = currentPluginAction();
  if (!original || !inPluginInstance(original, instance)) throw new ActionError("actions.forbidden", "原本人决定已失效");
  return {
    submit: () => markTrustedDecisionSubmitted(original.caller),
    rolledBack: () => markTrustedDecisionRolledBack(original.caller),
  };
}

export function projectReviewForWrite(projectId: string | undefined, instance: PluginInstance): ProjectReviewCommit | undefined {
  const scope = currentPluginAction();
  if (scope?.definition.action.requires_trusted_decision !== true) return;
  if (!inPluginInstance(scope, instance)) throw new ActionError("actions.forbidden", "本次项目决定属于原动作和安装");
  const held = reservations.get(scope.caller);
  if (!projectId || !held || !("install_id" in held.command.reference.owner)
    || held.command.reference.owner.project_id !== projectId
    || held.command.reference.owner.installation_generation !== instance.installation_generation
    || held.command.reference.owner.install_id !== instance.install_id) throw new ActionError("actions.forbidden", "原本人决定已失效");
  requireSynchronous(scope.caller.assert_authority_current?.());
  return { ...held, row: scope.definition.action.trusted_decision_row };
}

export function projectReviewForSystemWrite(caller: ActionExecutionContext, projectId: string, providerId: string) {
  const held = reservations.get(caller);
  if (!held || "install_id" in held.command.reference.owner
    || held.command.reference.owner.project_id !== projectId
    || held.command.reference.owner.provider_id !== providerId) throw new ActionError("actions.forbidden", "原本人决定已失效");
  requireSynchronous(caller.assert_authority_current?.());
  return {
    held,
    submit: () => markTrustedDecisionSubmitted(caller),
    rolledBack: () => markTrustedDecisionRolledBack(caller),
  };
}
