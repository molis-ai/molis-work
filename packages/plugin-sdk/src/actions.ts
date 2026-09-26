import { inspectActionDeclarations, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";

/** One author definition generates both manifest data and the runtime binding. */
export function defineAction<Input, Output>(
  definition: ActionDefinition<Input, Output>,
  handle: (context: ActionCallContext, input: Input) => Output | Promise<Output>,
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
