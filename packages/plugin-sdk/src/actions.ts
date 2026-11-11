import { bindActionHandler, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionMetadata, type ActionSchema, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "./action-declarations.js";

/** Build the public descriptor. The author supplies audiences, permissions and subject kinds explicitly. */
export function createActionDefinition<Input = unknown, Output = unknown>(
  capability_id: string,
  operation: ActionDefinition["operation"],
  metadata: Omit<ActionMetadata, "kind" | "scope"> & Partial<Pick<ActionMetadata, "kind" | "scope">>,
  version: number,
): ActionDefinition<Input, Output> {
  return {
    capability_id, version, operation,
    action: { ...metadata, scope: metadata.scope ?? "project", kind: metadata.kind ?? (operation === "query" ? "query" : "operation") },
  };
}

/** A definition whose schema is still a literal; one already typed `ActionSchema` has nothing to infer from and goes to the handwritten form. */
type LiteralSchemaDefinition<S extends ActionSchema, Output> = Omit<ActionDefinition<unknown, Output>, "action"> & {
  readonly action: Omit<ActionMetadata, "input_schema"> & { readonly input_schema: S & (string extends keyof S ? never : unknown) };
};

/** One author definition generates both manifest data and the runtime binding. The input type comes from the schema. */
export function defineAction<const S extends ActionSchema, Output>(
  definition: LiteralSchemaDefinition<S, Output>,
  handle: (context: ActionExecutionContext, input: InferActionInput<S>) => Output | Promise<Output>,
): { readonly definition: ActionDefinition<InferActionInput<S>, Output>; readonly handler: ActionHandlerBinding };
export function defineAction<Input, Output>(
  definition: ActionDefinition<Input, Output>,
  handle: (context: ActionExecutionContext, input: Input) => Output | Promise<Output>,
): { readonly definition: ActionDefinition<Input, Output>; readonly handler: ActionHandlerBinding };
export function defineAction<Input, Output>(
  definition: ActionDefinition<Input, Output>,
  handle: (context: ActionExecutionContext, input: Input) => Output | Promise<Output>,
): { readonly definition: ActionDefinition<Input, Output>; readonly handler: ActionHandlerBinding } {
  const problems = inspectActionDeclarations([definition], undefined);
  if (problems.length) throw new Error(problems.join("；"));
  return {
    definition: structuredClone(definition),
    handler: bindActionHandler(definition, (input, context) => handle(context, input)),
  };
}

/**
 * The session the Host itself bound a call to: an agent round's own, also when a plugin's running action hands the call on for it.
 * An external Runtime client names its own session over MCP or the gateway and the Host does not verify it, so that one is not a
 * bound session: nothing may be looked up or credited as that session's own (S-agent-evidence-own-session, S-goal-evidence-tier).
 */
export function hostBoundSession(caller: { readonly audience?: string; readonly delegated_audience?: string; readonly runtime_session_id?: string }): string | undefined {
  return (caller.delegated_audience ?? caller.audience) === "agent" ? caller.runtime_session_id : undefined;
}
