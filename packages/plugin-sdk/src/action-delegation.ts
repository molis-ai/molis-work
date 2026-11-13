import type { ActionDelegationEffect, ActionDelegationExtraction, ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionDelegationDeclarationProblems } from "./action-delegation-declarations.js";
import { isRecord } from "./json-value.js";

const requiresConfirmation = (reason: Extract<ActionDelegationExtraction, { state: "confirmation-required" }>["reason"]): ActionDelegationExtraction =>
  ({ state: "confirmation-required", reason });

/** Extract only finite targets/effects. The caller must first validate the input with the original action schema.
 * A resolved result is not authority: current project, target owner, installation, mode and every grant row still apply.
 * A declared-but-unsupported input must not fall back to complete-parameter authorization. */
export function extractActionDelegation(action: Pick<ActionMetadata, "input_schema" | "delegation">, input: unknown): ActionDelegationExtraction {
  const declaration = action.delegation;
  if (declaration === undefined) return requiresConfirmation("undeclared");
  if (declaration === "confirmation-only") return requiresConfirmation("confirmation-only");
  if (actionDelegationDeclarationProblems("selected", action).length) return requiresConfirmation("invalid-declaration");
  const properties = action.input_schema.properties;
  if (!isRecord(input) || !isRecord(properties)
    || Object.keys(input).some(field => !Object.hasOwn(properties, field))) return requiresConfirmation("invalid-input");
  const active = declaration.operations.filter(operation => operation.when === "always" || operation.when.some(field => Object.hasOwn(input, field)));
  if (!active.length) return requiresConfirmation("no-operation");
  const fields = new Set(active.flatMap(operation => operation.fields));
  if (declaration.operations.some(operation => operation.fields.some(field => Object.hasOwn(input, field) && !fields.has(field)))) return requiresConfirmation("invalid-input");
  const targets = new Map(declaration.targets.map(target => [target.key, target]));
  const operations: ActionDelegationEffect[] = [];
  for (const operation of active) {
    const resolved: Array<[string, string]> = [];
    for (const key of operation.targets) {
      const target = targets.get(key)!;
      const value = Object.hasOwn(input, target.field) ? input[target.field] : target.default_value;
      if (value === undefined) return requiresConfirmation("target-missing");
      if (typeof value !== "string" || value !== value.trim() || target.allowed_values && !target.allowed_values.includes(value)) return requiresConfirmation("target-unsupported");
      resolved.push([key, value]);
    }
    operations.push({ key: operation.key, targets: Object.fromEntries(resolved) });
  }
  return { state: "resolved", operations };
}
