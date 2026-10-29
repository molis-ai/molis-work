import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Which fields of a creation entry's input a draft may fill (quick-create §5). A draft fills words and dates, nothing the
 * person has to decide: a field is fillable when it is text, text-or-nothing, or a list of such. Choices (enums), flags,
 * numbers, objects, references and identity or version fields are never guessed; if the action requires one, the draft
 * names it as missing and the person fills it.
 */

export interface Fillable {
  /** The fields a model may fill, as the destination's own schema describes them. */
  readonly shapes: Readonly<Record<string, Record<string, unknown>>>;
  readonly names: readonly string[];
  /** The same fields in the plain form a structured request takes: constraints that only the real schema checks are left out. */
  readonly request: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** `id`, `project_id`, `item_ids`: a reference is looked up, never invented. */
const REFERENCE = /(^|_)ids?$/u;
/** Set by the Host from the call, or by the one who creates; never by what a passage says. */
const CONTROL = new Set(["request_id", "idempotency_key", "expected_version", "expected_revision"]);

/** Text, or text-or-nothing (`anyOf` with `null`), without a fixed set of values. */
function textual(shape: unknown): shape is Record<string, unknown> {
  if (!isRecord(shape) || "enum" in shape || "const" in shape || "oneOf" in shape) return false;
  if (Array.isArray(shape.anyOf)) {
    const rest = shape.anyOf.filter(branch => !(isRecord(branch) && branch.type === "null"));
    return rest.length === 1 && shape.anyOf.length === 2 && textual(rest[0]);
  }
  return shape.type === "string";
}

const textList = (shape: unknown): shape is Record<string, unknown> => isRecord(shape) && shape.type === "array" && textual(shape.items);
const fillableShape = (shape: unknown) => textual(shape) || textList(shape);

/** The text a plain field takes: the inner branch when it is text-or-nothing. */
function innerText(shape: Record<string, unknown>): Record<string, unknown> {
  return Array.isArray(shape.anyOf) ? (shape.anyOf.find(branch => !(isRecord(branch) && branch.type === "null")) as Record<string, unknown>) : shape;
}

function requestShape(shape: Record<string, unknown>): Record<string, unknown> {
  const describe = (inner: Record<string, unknown>, own: Record<string, unknown>) => {
    const note = [own.title, own.description, inner.title, inner.description].filter((part): part is string => typeof part === "string" && part.trim().length > 0)[0];
    return note ? { description: note } : {};
  };
  if (textList(shape)) {
    const item = innerText(shape.items as Record<string, unknown>);
    return { type: "array", items: { type: "string", ...(typeof item.maxLength === "number" ? { maxLength: item.maxLength } : {}) },
      ...(typeof shape.maxItems === "number" ? { maxItems: shape.maxItems } : {}), ...describe(item, shape) };
  }
  const inner = innerText(shape);
  return { type: "string", ...(typeof inner.maxLength === "number" ? { maxLength: inner.maxLength } : {}), ...describe(inner, shape) };
}

/** What the destination's input lets a draft fill; `skip` names fields filled another way (the material field). */
export function fillableFields(schema: ActionSchema, skip: readonly string[] = []): Fillable {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const names = Object.keys(properties).filter(name => !CONTROL.has(name) && !REFERENCE.test(name) && !skip.includes(name) && fillableShape(properties[name]));
  const shapes = Object.fromEntries(names.map(name => [name, properties[name] as Record<string, unknown>]));
  return { shapes, names, request: { type: "object", properties: Object.fromEntries(names.map(name => [name, requestShape(shapes[name]!)])), additionalProperties: false } };
}

/** The required fields of the destination's input. */
export const requiredFields = (schema: ActionSchema): string[] => (Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : []);

/**
 * The material field holds the person's words when it is text or a list of text; anything shaped differently (a list of
 * source objects) is the provider's own `prepare` to build, not something to guess.
 */
export function materialValue(schema: ActionSchema, field: string | undefined, text: string): unknown {
  const shape = field && isRecord(schema.properties) ? schema.properties[field] : undefined;
  // The schema's maxLength is counted in characters (the kernel's Ajv counts code points), so cut in whole characters: a
  // two-unit character that fits stays whole, and the value is still within the limit.
  const limit = (inner: unknown) => (isRecord(inner) && typeof inner.maxLength === "number" ? [...text.slice(0, inner.maxLength * 2)].slice(0, inner.maxLength).join("") : text);
  if (textual(shape)) return limit(innerText(shape));
  if (textList(shape)) return [limit(innerText(shape.items as Record<string, unknown>))];
  return undefined;
}
