import type { ActionAudience, ActionDefinition, ActionSchema, PlacementRelationRole } from "@molis-ai/molis-work-contracts/platform/actions";

/** `plugins` opens one action to installed plugins too (still under the plugin's own granted permissions).
 * Every Goals write is authored by a Session when a Runtime makes it. */
export function goalAction<Input, Output>(id: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, plugins = false): ActionDefinition<Input, Output> {
  const audiences: ActionAudience[] = ["user", "agent", "workflow", "mcp", ...(plugins ? ["plugin" as const] : [])];
  return { capability_id: id, version: 1, operation, action: { title, description,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences, ...(operation === "command" ? { authorship: "session" as const } : {}),
    permissions: [operation === "query" ? "goals:read" : "goals:write"], subject_kinds: ["goal"], input_schema: input, output_schema: output } };
}

/**
 * The part an action plays in the Goal relation placement keeps for the person (PG-032): what a document hangs on, hanging it and
 * releasing it, the Goals it can hang on, and making a Goal from content. Placement finds these by the declaration, not by capability id.
 */
export function inGoalRelation<Input, Output>(definition: ActionDefinition<Input, Output>, role: PlacementRelationRole): ActionDefinition<Input, Output> {
  return { ...definition, action: { ...definition.action, placement_relation: { relation: "goal", role, ...(role === "list" ? { target: { kind: "goal", noun: "Goal" } } : {}) } } };
}
