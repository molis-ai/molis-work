import { createHash } from "node:crypto";
import {
  FUNCTIONS_DEFAULT_MODEL,
  type ChoiceCriterion,
  type FunctionCriteria,
  type FunctionsPrimitive,
  type NoulCriteria,
} from "@molis-ai/molis-work-contracts/modules/functions";

export function hashFunctionConfig(input: {
  readonly primitive: FunctionsPrimitive;
  readonly instructions: string;
  readonly criteria: FunctionCriteria;
  readonly model?: string;
}): string {
  const payload = JSON.stringify({
    primitive: input.primitive,
    instructions: input.instructions,
    criteria: canonicalizeCriteria(input.primitive, input.criteria),
    model: input.model ?? FUNCTIONS_DEFAULT_MODEL,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function hashChoiceConfig(input: {
  readonly instructions: string;
  readonly criteria: readonly ChoiceCriterion[];
  readonly model?: string;
}): string {
  return hashFunctionConfig({
    primitive: "choice",
    instructions: input.instructions,
    criteria: input.criteria,
    model: input.model,
  });
}

function canonicalizeCriteria(primitive: FunctionsPrimitive, criteria: FunctionCriteria): unknown {
  if (primitive === "choice") {
    const items = criteria as readonly ChoiceCriterion[];
    return [...items]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((item) => ({ key: item.key, description: item.description }));
  }
  if (primitive === "noul") {
    const noul = criteria as NoulCriteria;
    return { true_description: noul.true_description, false_description: noul.false_description };
  }
  return [...(criteria as readonly string[])];
}
