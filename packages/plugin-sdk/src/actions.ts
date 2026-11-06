import type { ActionExecutionContext, ActionDefinition, ActionHandlerBinding, ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "./action-declarations.js";

/** Build the public descriptor. The author supplies audiences, permissions and subject kinds explicitly. */
export function createActionDefinition<Input = unknown, Output = unknown>(
  capability_id: string,
  operation: ActionDefinition["operation"],
  metadata: Omit<ActionMetadata, "kind" | "scope"> & Partial<Pick<ActionMetadata, "kind" | "scope">>,
  version = 1,
): ActionDefinition<Input, Output> {
  return {
    capability_id, version, operation,
    action: { ...metadata, scope: metadata.scope ?? "project", kind: metadata.kind ?? (operation === "query" ? "query" : "operation") },
  };
}

/** One author definition generates both manifest data and the runtime binding. */
export function defineAction<Input, Output>(
  definition: ActionDefinition<Input, Output>,
  handle: (context: ActionExecutionContext, input: Input) => Output | Promise<Output>,
): { readonly definition: ActionDefinition<Input, Output>; readonly handler: ActionHandlerBinding } {
  const problems = inspectActionDeclarations([definition], undefined);
  if (problems.length) throw new Error(problems.join("；"));
  return {
    definition: structuredClone(definition),
    handler: { capability_id: definition.capability_id, version: definition.version,
      // The service validates JSON before entering this typed handler.
      handle: (context, input) => handle(context, input as Input) },
  };
}
