import type { ResearchBudget } from "../research/budget.js";
import { assertValidBudget } from "../research/budget.js";

export interface RuntimeSettings {
  workspaceId: string;
  provider: "none" | "prologue";
  modelId: string;
  modelPolicy: "auto" | "fixed";
  defaultBudgets: { marketSpace: ResearchBudget; buildCost: ResearchBudget };
  updatedAt: string;
}

export function assertValidRuntimeSettings(settings: RuntimeSettings): RuntimeSettings {
  if (settings.modelPolicy === "fixed" && !settings.modelId.trim()) throw new Error("RUNTIME_MODEL_REQUIRED");
  assertValidBudget(settings.defaultBudgets.marketSpace);
  assertValidBudget(settings.defaultBudgets.buildCost);
  return settings;
}
