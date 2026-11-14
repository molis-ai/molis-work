import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectTrustedDecision, TrustedReviewCommand, TrustedReviewRow } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { actionTrustedDecision, markTrustedDecisionRolledBack, markTrustedDecisionSubmitted } from "@molis-ai/molis-work-kernel";
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
  const held = actionTrustedDecision(scope.caller);
  if (!projectId || !held || held.command.reference.owner.project_id !== projectId
    || held.command.reference.owner.installation_generation !== instance.installation_generation
    || held.command.reference.owner.install_id !== instance.install_id) throw new ActionError("actions.forbidden", "原本人决定已失效");
  return { ...held, row: scope.definition.action.trusted_decision_row };
}
