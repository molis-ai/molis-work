import { createHash } from "node:crypto";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;

/**
 * An action's contract as a round froze it, in one string: its declaration and operation, keys in a fixed order. A suggestion
 * records it, and running the suggestion later compares it with the action as the directory offers it then.
 */
export function actionDigest(view: Pick<ActionView, "action" | "operation">): string {
  return createHash("sha256").update(JSON.stringify(canonical({ operation: view.operation, action: view.action }))).digest("hex");
}
