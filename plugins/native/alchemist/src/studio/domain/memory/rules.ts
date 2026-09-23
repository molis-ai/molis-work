import type { ProposalSource } from "../calibration/calibration.js";

export type PlaybookScope =
  | { kind: "report"; reportId: string }
  | { kind: "direction"; directionId: string }
  | { kind: "global_market_space" };

export interface PlaybookRule {
  id: string;
  workspaceId: string;
  actorId: string;
  version: number;
  originalFeedback: string;
  methodChange: string;
  positiveExamples: readonly string[];
  negativeExamples: readonly string[];
  scope: PlaybookScope;
  source: ProposalSource;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface TasteRule {
  id: string;
  workspaceId: string;
  actorId: string;
  version: number;
  title: string;
  statement: string;
  appliesTo: string;
  exceptions: readonly string[];
  source: ProposalSource;
  status: "active" | "disabled" | "deleted";
  createdAt: string;
  updatedAt: string;
}

export class MemoryRuleStateError extends Error {
  readonly name = "MemoryRuleStateError";
}

export function assertValidPlaybookScope(scope: PlaybookScope | undefined): PlaybookScope {
  if (!scope) throw new MemoryRuleStateError("PLAYBOOK_SCOPE_REQUIRED");
  if (scope.kind === "report" && !scope.reportId.trim()) {
    throw new MemoryRuleStateError("PLAYBOOK_SCOPE_TARGET_REQUIRED");
  }
  if (scope.kind === "direction" && !scope.directionId.trim()) {
    throw new MemoryRuleStateError("PLAYBOOK_SCOPE_TARGET_REQUIRED");
  }
  return scope;
}

export function disableMemoryRule<Rule extends PlaybookRule | TasteRule>(rule: Rule, now: string): Rule {
  if (rule.status !== "active") throw new MemoryRuleStateError("MEMORY_RULE_NOT_ACTIVE");
  return { ...rule, status: "disabled", updatedAt: now };
}
