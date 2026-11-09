import { isDeepStrictEqual } from "node:util";
import type { SandboxJson, SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";

/** Let the consumer report the same refusal through its own error model. */
export type SandboxSchemaFailure = (kind: "invalid_json" | "invalid_schema" | "schema_mismatch", reason: string) => never;

export function assertJson(value: unknown, fail: SandboxSchemaFailure): asserts value is SandboxJson {
  assertJsonValue(value, fail, 0, { remaining: 50_000 });
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertJsonValue(value: unknown, fail: SandboxSchemaFailure, depth: number, budget: { remaining: number }): void {
  if (--budget.remaining < 0 || depth > 32) fail("invalid_json", "JSON structure exceeds limits");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, fail, depth + 1, budget);
    return;
  }
  if (isJsonObject(value)) {
    for (const item of Object.values(value)) assertJsonValue(item, fail, depth + 1, budget);
    return;
  }
  fail("invalid_json", "Only bounded JSON values are allowed");
}

const common = ["type", "description", "enum", "const"];
const typed: Record<string, string[]> = {
  null: [], boolean: [], number: ["minimum", "maximum"], integer: ["minimum", "maximum"],
  string: ["minLength", "maxLength", "format"], array: ["items", "minItems", "maxItems"],
  object: ["properties", "required", "additionalProperties"],
};

export function assertSchema(schema: unknown, fail: SandboxSchemaFailure): asserts schema is SandboxSchema {
  assertJson(schema, fail);
  assertSchemaAtDepth(schema, fail, 0);
}

function assertSchemaAtDepth(schema: unknown, fail: SandboxSchemaFailure, depth: number): asserts schema is SandboxSchema {
  assertSchemaShape(schema, fail, depth);
  const base = { ...schema };
  delete base.enum;
  delete base.const;
  if (Array.isArray(schema.enum)) for (const item of schema.enum) assertMatches(base, item, fail, "schema.enum");
  if (Object.hasOwn(schema, "const")) assertMatches(base, schema.const, fail, "schema.const");
}

function assertSchemaShape(schema: unknown, fail: SandboxSchemaFailure, depth: number): asserts schema is SandboxSchema {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) || depth > 24) fail("invalid_schema", "Expected a bounded schema object");
  const shape = schema as Record<string, unknown>;
  if (typeof shape.type !== "string" || !Object.hasOwn(typed, shape.type)) fail("invalid_schema", "Schema requires a supported type");
  const allowed = [...common, ...typed[shape.type]!];
  for (const key of Object.keys(shape)) if (!allowed.includes(key)) fail("invalid_schema", `Unsupported schema keyword: ${key}`);
  if (shape.description !== undefined && typeof shape.description !== "string") fail("invalid_schema", "description must be a string");
  const format = shape.format;
  if (format !== undefined && format !== "date" && format !== "date-time" && format !== "uri") fail("invalid_schema", "Unsupported string format");
  if (shape.enum !== undefined && (!Array.isArray(shape.enum) || shape.enum.length === 0)) fail("invalid_schema", "enum must be nonempty");
  for (const key of ["minLength", "maxLength", "minItems", "maxItems"]) {
    const limit = shape[key];
    if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0)) {
      fail("invalid_schema", `${key} must be a nonnegative integer`);
    }
  }
  for (const key of ["minimum", "maximum"]) {
    const limit = shape[key];
    if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit))) fail("invalid_schema", `${key} must be finite`);
  }
  for (const [min, max] of [["minimum", "maximum"], ["minLength", "maxLength"], ["minItems", "maxItems"]] as const) {
    const minimum = shape[min], maximum = shape[max];
    if (typeof minimum === "number" && typeof maximum === "number" && minimum > maximum) fail("invalid_schema", `${min} exceeds ${max}`);
  }
  if (shape.type === "array") assertSchemaAtDepth(shape.items, fail, depth + 1);
  if (shape.type === "object") {
    const properties = shape.properties, required = shape.required;
    if (!properties || typeof properties !== "object" || Array.isArray(properties) || shape.additionalProperties !== false) {
      fail("invalid_schema", "Objects require properties and additionalProperties:false");
    }
    if (!Array.isArray(required) || required.some(key => typeof key !== "string" || !Object.hasOwn(properties, key)) || new Set(required).size !== required.length) {
      fail("invalid_schema", "Object required must name unique declared properties");
    }
    for (const child of Object.values(properties)) assertSchemaAtDepth(child, fail, depth + 1);
  }
}

export function assertMatches(schema: SandboxSchema, value: unknown, fail: SandboxSchemaFailure, path = "$"): asserts value is SandboxJson {
  assertJson(value, fail);
  matchValue(schema, value, fail, path);
}

function matchValue(schema: SandboxSchema, value: unknown, fail: SandboxSchemaFailure, path: string): void {
  const mismatch: (message: string) => never = message => fail("schema_mismatch", `${path}: ${message}`);
  if (schema.enum && !schema.enum.some(item => isDeepStrictEqual(item, value))) mismatch("value is outside enum");
  if (Object.hasOwn(schema, "const") && !isDeepStrictEqual(schema.const, value)) mismatch("value differs from const");
  switch (schema.type) {
    case "null":
      if (value !== null) mismatch("expected null");
      break;
    case "boolean":
      if (typeof value !== "boolean") mismatch("expected boolean");
      break;
    case "integer":
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isSafeInteger(value))) mismatch(`expected ${schema.type}`);
      if (schema.minimum !== undefined && value < schema.minimum) mismatch("below minimum");
      if (schema.maximum !== undefined && value > schema.maximum) mismatch("above maximum");
      break;
    case "string":
      if (typeof value !== "string") mismatch("expected string");
      if (schema.minLength !== undefined && [...value].length < schema.minLength) mismatch("string too short");
      if (schema.maxLength !== undefined && [...value].length > schema.maxLength) mismatch("string too long");
      if (schema.format === "date" || schema.format === "date-time") {
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
        if (!match) mismatch("expected ISO date");
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
        const date = new Date(`${match[0]}T00:00:00Z`);
        if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) mismatch("invalid calendar date");
        if (schema.format === "date" && value.length !== 10) mismatch("expected date only");
        if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value)))) {
          mismatch("expected ISO timestamp with timezone");
        }
      }
      if (schema.format === "uri") {
        try { new URL(value); } catch { mismatch("expected absolute URI"); }
      }
      break;
    case "array":
      if (!Array.isArray(value)) mismatch("expected array");
      if (schema.minItems !== undefined && value.length < schema.minItems) mismatch("too few items");
      if (schema.maxItems !== undefined && value.length > schema.maxItems) mismatch("too many items");
      value.forEach((item, index) => matchValue(schema.items!, item, fail, `${path}[${index}]`));
      break;
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) mismatch("expected object");
      const record = value as Record<string, unknown>;
      for (const key of schema.required!) if (!Object.hasOwn(record, key)) mismatch(`missing ${key}`);
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(schema.properties!, key)) mismatch(`unexpected property ${key}`);
        matchValue(schema.properties![key]!, record[key], fail, `${path}.${key}`);
      }
      break;
    }
  }
}
