import type { ActionCallContext, ActionDefinition, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

export function goalAction<Input, Output>(id: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema): ActionDefinition<Input, Output> {
  return { capability_id: id, version: 1, operation, action: { title, description,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "agent", "workflow", "mcp"],
    permissions: [operation === "query" ? "goals:read" : "goals:write"], subject_kinds: ["goal"], input_schema: input, output_schema: output } };
}

/** Trusted transport identity; business inputs cannot replace it. Null preserves unknown legacy classification. */
export function goalActor(caller: ActionCallContext) {
  return { actor_id: caller.audit_actor_id ?? caller.actor_id,
    actor_kind: caller.actor_kind === undefined ? (caller.audience === "user" ? "user" as const : "runtime" as const) : caller.actor_kind ?? undefined };
}
