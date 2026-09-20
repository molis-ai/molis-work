import { createHash } from "node:crypto";
import { FUNCTIONS_DEFAULT_MODEL, type ChoiceCriterion } from "@molis-ai/molis-work-contracts/modules/functions";

export function hashChoiceConfig(input: {
  readonly instructions: string;
  readonly criteria: readonly ChoiceCriterion[];
  readonly model?: string;
}): string {
  const payload = JSON.stringify({
    primitive: "choice",
    instructions: input.instructions,
    criteria: [...input.criteria]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((item) => ({ key: item.key, description: item.description })),
    model: input.model ?? FUNCTIONS_DEFAULT_MODEL,
  });
  return createHash("sha256").update(payload).digest("hex");
}
