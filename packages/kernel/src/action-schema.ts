import { Ajv, type AnySchemaObject, type ErrorObject, type ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ActionError, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

/** A contract's validator. Its schema is known to compile; the validating code is built the first time it validates. */
export interface ActionValidator {
  (value: unknown): boolean;
  errors?: ErrorObject[] | null;
}

/** No coercion/default injection: callers must send the data the handler receives. */
export function compileActionSchema(schema: ActionSchema): ValidateFunction {
  return schemaCompiler().compile(schema);
}

/**
 * Schemas known to compile, by dialect and exact schema text, with their validator once one is built. Every project registers the
 * same built-in contracts again (Goals alone is about 350 KB of schema), so each is checked once per process. A schema compiles alone
 * (its references are removed after it), so whether it compiles, and its validator, depend on nothing but this text: a changed
 * contract is another key, and a failed compile is not kept.
 */
const known = new Map<string, { validate?: ValidateFunction }>();
const KNOWN_LIMIT = 4096;
/** What a checked schema's generated code is replaced with: the check needs the generation (where a schema is refused), not the function. */
const CHECKED = "return function validate() { return true; }";

/**
 * Reuse dialect metadata within one registration, never another business schema's references. A schema is checked here, by
 * generating its validating code, which is where Ajv refuses a schema that does not compile; the validator itself is built the first
 * time it validates, since most of a Host's contracts are never called in a session.
 */
export function createActionSchemaCompiler(): (schema: ActionSchema) => ActionValidator {
  return schemaCompiler().check;
}

function schemaCompiler(): { check(schema: ActionSchema): ActionValidator; compile(schema: ActionSchema): ValidateFunction } {
  let checking: ActionSchema | undefined;
  // Ajv's optimiser only rewrites the generated code, for the same results; it costs about half of a compile. Only the schema being
  // checked gets the placeholder: a meta schema or another root it refers to is compiled in full and kept by this instance.
  const options = { allErrors: true, strict: false, strictSchema: true, validateFormats: true,
    code: { optimize: false, process: (source: string, env?: { root: { schema: unknown } }) => env && env.root.schema === checking ? CHECKED : source } };
  const instances: Partial<Record<"draft7" | "2020", Ajv | Ajv2020>> = {};
  const dialectOf = (schema: ActionSchema) => schema.$schema === "https://json-schema.org/draft/2020-12/schema" ? "2020" as const : "draft7" as const;
  const remember = (key: string, entry: { validate?: ValidateFunction }) => {
    known.set(key, entry);
    if (known.size > KNOWN_LIMIT) known.delete(known.keys().next().value!);
    return entry;
  };
  return {
    check(schema) {
      const dialect = dialectOf(schema), key = dialect + JSON.stringify(schema);
      let entry = known.get(key);
      if (!entry) {
        checking = schema;
        try { compileFresh(schema, dialect); } finally { checking = undefined; }
        entry = remember(key, {});
      }
      const found = entry;
      const validator: ActionValidator = value => {
        const validate = found.validate ??= compileFresh(schema, dialect);
        const valid = validate(value);
        validator.errors = validate.errors;
        return valid;
      };
      return validator;
    },
    compile(schema) {
      const dialect = dialectOf(schema), key = dialect + JSON.stringify(schema), entry = known.get(key);
      if (entry?.validate) return entry.validate;
      const validate = compileFresh(schema, dialect);
      if (entry) entry.validate = validate; else remember(key, { validate });
      return validate;
    },
  };
  function compileFresh(schema: ActionSchema, dialect: "draft7" | "2020"): ValidateFunction {
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
  }
}

/**
 * Check a set of definitions' contracts ahead of their registration, yielding to the event loop after each, so that registering
 * them (which checks synchronously, and refuses an invalid schema there) finds them checked. A schema that does not compile is
 * left for that registration to refuse.
 */
export async function precompileActionSchemas(definitions: readonly { action: { input_schema: ActionSchema; output_schema?: ActionSchema } }[]): Promise<void> {
  const compile = createActionSchemaCompiler();
  for (const schema of definitions.flatMap(definition => [definition.action.input_schema, definition.action.output_schema])) {
    if (!schema) continue;
    try { compile(schema); } catch { /* The registration that uses it refuses it. */ }
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

export function validateActionValue(validate: ActionValidator, value: unknown, side: "input" | "output", classify?: (errors: readonly ErrorObject[]) => void): void {
  if (validate(value)) return;
  classify?.(validate.errors ?? []);
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
