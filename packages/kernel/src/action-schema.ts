import { Ajv, type AnySchemaObject, type ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ActionError, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

/** No coercion/default injection: callers must send the data the handler receives. */
export function compileActionSchema(schema: ActionSchema): ValidateFunction {
  return createActionSchemaCompiler()(schema);
}

/** Reuse dialect metadata within one registration, never another business schema's references. */
export function createActionSchemaCompiler(): (schema: ActionSchema) => ValidateFunction {
  const options = { allErrors: true, strict: false, strictSchema: true, validateFormats: true };
  const instances: Partial<Record<"draft7" | "2020", Ajv | Ajv2020>> = {};
  return schema => {
    const dialect = schema.$schema === "https://json-schema.org/draft/2020-12/schema" ? "2020" : "draft7";
    let ajv = instances[dialect];
    if (!ajv) {
      ajv = dialect === "2020" ? new Ajv2020(options) : new Ajv(options);
      addFormats.default(ajv);
      // AJV installs this built-in alias as a string reference, which removeSchema()
      // would discard. Register its original meta schema under the same public key
      // so cleanup retains it and business schemas still cannot claim that identity.
      const metaAlias = "http://json-schema.org/schema";
      const meta = ajv.getSchema(metaAlias)!;
      ajv.removeSchema(metaAlias);
      ajv.addMetaSchema(meta.schema as AnySchemaObject, metaAlias, false);
      instances[dialect] = ajv;
    }
    try { return ajv.compile(schema); }
    catch (error) { throw new ActionError("actions.schema_invalid", `能力 schema 无效：${error instanceof Error ? error.message : String(error)}`); }
    finally { ajv.removeSchema(); }
  };
}

export function validateActionValue(validate: ValidateFunction, value: unknown, side: "input" | "output"): void {
  if (validate(value)) return;
  // Report paths and constraints, never the user's values or credentials.
  const detail = (validate.errors ?? []).map(e => `${e.instancePath || "/"} ${e.keyword}`).join(", ");
  throw new ActionError(`actions.${side}_invalid`, `${side === "input" ? "输入" : "结果"}不符合能力合同：${detail}`);
}

/** Consumers preparing inputs use exactly the same validation as actual dispatch. */
export function assertActionInput(schema: ActionSchema, value: unknown): void {
  validateActionValue(compileActionSchema(schema), value, "input");
}

/** Conservative assignability. Unsupported relations require an explicit conversion. */
export function actionSchemaAccepts(target: ActionSchema, source: ActionSchema): boolean {
  if (same(target, source) || Object.keys(target).length === 0) return true;
  const supported = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "const", "$schema", "description", "title", "default", "examples"]);
  if ([...Object.keys(target), ...Object.keys(source)].some(k => !supported.has(k))) return false;
  const targetTypes = Array.isArray(target.type) ? target.type : [target.type];
  const sourceTypes = Array.isArray(source.type) ? source.type : [source.type];
  if (sourceTypes.some(t => !targetTypes.includes(t) && !(t === "integer" && targetTypes.includes("number")))) return false;
  const values = "const" in source ? [source.const] : Array.isArray(source.enum) ? source.enum : undefined;
  if ("const" in target && (!values || values.some(v => !same(v, target.const)))) return false;
  if (Array.isArray(target.enum) && (!values || values.some(v => !(target.enum as unknown[]).some(t => same(v, t))))) return false;
  if (target.type === "object" && source.type === "object") {
    const targetProps = record(target.properties), sourceProps = record(source.properties);
    const required = Array.isArray(target.required) ? target.required : [];
    const supplied = Array.isArray(source.required) ? source.required : [];
    if (required.some(k => !supplied.includes(k))) return false;
    if (target.additionalProperties === false && (source.additionalProperties !== false || Object.keys(sourceProps).some(k => !(k in targetProps)))) return false;
    for (const [key, shape] of Object.entries(targetProps)) {
      if (key in sourceProps) {
        if (!isRecord(shape) || !isRecord(sourceProps[key]) || !actionSchemaAccepts(shape, sourceProps[key])) return false;
      } else if (source.additionalProperties !== false) return false;
    }
    if (isRecord(target.additionalProperties)) return false;
  }
  if (target.type === "array" && source.type === "array" && target.items !== undefined) {
    if (!isRecord(target.items) || !isRecord(source.items) || !actionSchemaAccepts(target.items, source.items)) return false;
  }
  return true;
}

function record(v: unknown): Record<string, unknown> { return isRecord(v) ? v : {}; }
function isRecord(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
}
