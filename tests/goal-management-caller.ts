import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The caller the management entries (the CLI and the management MCP) act as: the person on this machine, through the protected
 * `management` source. A test that used to call a typed management door calls the Goals action as this caller instead; the action
 * records the person, takes the project from the context and refuses an identity carried in its input.
 */
export function managementCaller(projectId: string, key = "management"): ActionCallContext {
  return {
    actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
    permissions: ["goals:read", "goals:write"],
    user_action: { source: "management", conversation_ref: `management:${projectId}`, message_ref: `management:${key}` },
  };
}

/** A client whose every call is made as the management caller; the message reference follows the call's idempotency key. */
export function managementGoals(client: ActionClient, projectId: string): BoundActionClient {
  const keyOf = (input: unknown) => {
    const key = (input as { idempotency_key?: unknown } | null | undefined)?.idempotency_key;
    return typeof key === "string" && key ? key : undefined;
  };
  return {
    discover: async () => client.discover(managementCaller(projectId)),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) =>
      await client.invoke(managementCaller(projectId, keyOf(input)), definition, input) as Output,
  };
}

/**
 * A Runtime reaching Goals through an MCP client: the Runtime's Session is the audit author, and every write is made under it.
 */
export function mcpRuntimeCaller(projectId: string, actorId = "runtime:client", session = "session"): ActionCallContext {
  return {
    actor_id: actorId, audit_actor_id: `${actorId}:${session}`, runtime_session_id: session, actor_kind: "runtime",
    audience: "mcp", project_id: projectId, permissions: ["goals:read", "goals:write"],
  };
}

/** A client whose every call is made as `mcpRuntimeCaller`. */
export function mcpRuntimeGoals(client: ActionClient, projectId: string, actorId?: string, session?: string): BoundActionClient {
  return {
    discover: async () => client.discover(mcpRuntimeCaller(projectId, actorId, session)),
    invoke: async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) =>
      await client.invoke(mcpRuntimeCaller(projectId, actorId, session), definition, input) as Output,
  };
}
