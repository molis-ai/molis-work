export type ResearchBudget =
  | { kind: "calls"; limit: number }
  | { kind: "tokens"; limit: number }
  | { kind: "money"; limit: number; currency: string };

export function assertValidBudget(budget: ResearchBudget): ResearchBudget {
  if (budget.kind !== "calls" || !Number.isInteger(budget.limit) || budget.limit < 1 || budget.limit > 40) throw new Error("RESEARCH_BUDGET_INVALID");
  return budget;
}
