import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionAudience, ActionDefinition, ActionIntake, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

/** `plugins` opens one action to installed plugins too (still under the plugin's own granted permissions).
 * Every Goals write is authored by a Session when a Runtime makes it. */
export function goalAction<Input, Output>(id: string, version: number, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, plugins = false, intake?: ActionIntake): ActionDefinition<Input, Output> {
  const audiences: ActionAudience[] = ["user", "agent", "workflow", "mcp", ...(plugins ? ["plugin" as const] : [])];
  return createActionDefinition<Input, Output>(id, operation, { title, description,
    audiences, ...(operation === "command" ? { authorship: "session" as const } : {}),
    permissions: [operation === "query" ? "goals:read" : "goals:write"], subject_kinds: ["goal"], input_schema: input, output_schema: output, ...(intake ? { intake } : {}) }, version);
}

