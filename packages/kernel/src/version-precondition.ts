import type { ErrorObject, ValidateFunction } from "ajv";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { compileActionSchema, validateActionValue } from "./action-schema.js";
import { isActiveNestedAction } from "./action-settlement.js";

const VERSION_FIELDS = ["expected_version", "expected_revision", "expected_revisions", "expected_updated_at"] as const;
function properties(schema: ActionSchema): Record<string, unknown> {
  const value = schema.properties;
  return object(value) ? value : {};
}
function fields(definition: Pick<ActionDefinition, "capability_id" | "operation" | "action">): string[] {
  if (definition.operation !== "command") return [];
  const declared = properties(definition.action.input_schema);
  return [...VERSION_FIELDS.filter(field => Object.hasOwn(declared, field)),
    ...(definition.capability_id.startsWith("functions.authoring.") && Object.hasOwn(declared, "updated_at") ? ["updated_at"] : [])];
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function required(context: ActionCallContext): boolean {
  return (context.audience === "agent" || context.audience === "mcp") && !isActiveNestedAction(context);
}
function refuse(field: string): never {
  throw new ActionError("actions.version_required", `修改已有对象时要带上读取时的版本（${field}）：先读取当前版本再提交，避免覆盖之后的修改。`);
}
function missingVersionErrors(errors: readonly ErrorObject[], names: readonly string[]): boolean {
  return errors.length > 0 && errors.every(error => error.keyword === "required" && error.instancePath === ""
    && typeof error.params.missingProperty === "string" && names.includes(error.params.missingProperty));
}
function check(definition: Pick<ActionDefinition, "capability_id" | "operation" | "action">, names: readonly string[], input: unknown): void {
  if (!object(input)) return;
  const declared = properties(definition.action.input_schema);
  for (const field of names) {
    if (!Object.hasOwn(input, field)) refuse(field);
    const value = input[field], shape = declared[field];
    if (object(shape) && shape.type === "object" && object(value)) {
      const ids = input.ids;
      if (!Object.keys(value).length || (Array.isArray(ids) && ids.some(id => typeof id === "string" && !Object.hasOwn(value, id)))) refuse(field);
    }
    if (field === "updated_at" && value === null) refuse(field);
  }
}

/** One schema validation, then the additional version prerequisite for top-level AI commands. */
export function validateActionInput(validate: ValidateFunction, definition: Pick<ActionDefinition, "capability_id" | "operation" | "action">, context: ActionCallContext, input: unknown): void {
  const names = required(context) ? fields(definition) : [];
  validateActionValue(validate, input, "input", errors => {
    if (missingVersionErrors(errors, names)) refuse(names.join(", "));
  });
  if (names.length) check(definition, names, input);
}

/** The assistant's preflight uses the same validation and prerequisite as actual dispatch. */
export function assertActionCommandInput(definition: Pick<ActionDefinition, "capability_id" | "operation" | "action">, context: ActionCallContext, input: unknown): void {
  validateActionInput(compileActionSchema(definition.action.input_schema), definition, context, input);
}
