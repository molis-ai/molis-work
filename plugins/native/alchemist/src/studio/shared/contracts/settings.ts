import { z } from "zod";
import type { RuntimeModel } from "../../domain/kernel/ports.js";
import type { RuntimeSettings } from "../../domain/settings/runtime-settings.js";

// The Host exposes call counts, not a hard currency/token spending gate.
const budgetSchema = z.object({ kind: z.literal("calls"), limit: z.number().int().min(1).max(40) }).strict();
export const updateRuntimeSettingsSchema = z.object({
  modelId: z.string().trim().max(2_048),
  modelPolicy: z.enum(["auto", "fixed"]),
  defaultBudgets: z.object({ marketSpace: budgetSchema, buildCost: budgetSchema }).strict(),
}).strict().refine(value => value.modelPolicy !== "fixed" || value.modelId.length > 0);

export interface RuntimeSettingsDto extends Omit<RuntimeSettings, "workspaceId"> {
  configured: boolean;
  runtimeLabel: string;
  models: readonly RuntimeModel[];
}
