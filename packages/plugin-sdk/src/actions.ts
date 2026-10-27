import { SUBJECT_RETENTION_REQUEST_TYPE, SUBJECT_RETENTION_TYPE, SUBJECT_RETENTION_INPUT_SCHEMA, SUBJECT_RETENTION_OUTPUT_SCHEMA,
  type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type SubjectRetentionRequest, type ActionSubjectRetention } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "./action-declarations.js";

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

/** A source owner's cheap lifecycle query; it neither reads the body nor grants access to retained content. */
export function defineSubjectRetentionAction(capabilityId: string, kind: string, title: string, permissions: string[],
  scope: "project" | "home" = "project"): ActionDefinition<SubjectRetentionRequest, ActionSubjectRetention> {
  return { capability_id: capabilityId, version: 2, operation: "query", action: {
    title: `读取${title}的保留状态`, description: `读取${title}的当前生命周期与原恢复事实，不读取正文或授予权限。`,
    kind: "query", scope, scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions,
    subject_kinds: [kind], input_type: SUBJECT_RETENTION_REQUEST_TYPE, output_type: SUBJECT_RETENTION_TYPE,
    input_schema: SUBJECT_RETENTION_INPUT_SCHEMA, output_schema: SUBJECT_RETENTION_OUTPUT_SCHEMA,
  } };
}
