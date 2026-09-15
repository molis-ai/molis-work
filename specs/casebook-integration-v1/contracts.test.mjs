import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const contractDir = join(here, "contracts");
const fixture = JSON.parse(readFileSync(join(here, "fixtures", "contract-cases.json"), "utf8"));
const schemas = new Map(
  ["planning-export.schema.json", "showcase-artifact.schema.json"].map((name) => [
    name,
    JSON.parse(readFileSync(join(contractDir, name), "utf8")),
  ]),
);

const jsonEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function pointer(root, fragment) {
  if (!fragment || fragment === "#") return root;
  assert.ok(fragment.startsWith("#/"), `unsupported JSON pointer: ${fragment}`);
  return fragment.slice(2).split("/").reduce(
    (value, token) => value[token.replaceAll("~1", "/").replaceAll("~0", "~")],
    root,
  );
}

function matchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validateSchema(schema, value, context, path = "$") {
  if (schema.$ref) {
    const [file, fragment = ""] = schema.$ref.split("#");
    const rootKey = file ? file.replace(/^\.\//, "") : context.rootKey;
    const root = schemas.get(rootKey);
    assert.ok(root, `unknown schema ref: ${schema.$ref}`);
    return validateSchema(pointer(root, fragment ? `#${fragment}` : "#"), value, { rootKey }, path);
  }

  if (schema.allOf) {
    return schema.allOf.flatMap((entry) => validateSchema(entry, value, context, path));
  }

  if (schema.oneOf) {
    const outcomes = schema.oneOf.map((entry) => validateSchema(entry, value, context, path));
    const matches = outcomes.filter((errors) => errors.length === 0).length;
    return matches === 1 ? [] : [`${path}: expected exactly one schema match, got ${matches}`];
  }

  const errors = [];
  const types = schema.type == null ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
    return [`${path}: expected ${types.join("|")}`];
  }
  if (schema.const !== undefined && !jsonEqual(value, schema.const)) errors.push(`${path}: const mismatch`);
  if (schema.enum && !schema.enum.some((entry) => jsonEqual(value, entry))) errors.push(`${path}: enum mismatch`);

  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern mismatch`);
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) errors.push(`${path}: invalid date-time`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.items) value.forEach((entry, index) => errors.push(...validateSchema(schema.items, entry, context, `${path}[${index}]`)));
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required ?? []) {
      if (!(required in value)) errors.push(`${path}: missing ${required}`);
    }
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}: unknown field ${key}`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) errors.push(...validateSchema(childSchema, value[key], context, `${path}.${key}`));
    }
  }
  return errors;
}

function mutate(value, mutations) {
  const copy = structuredClone(value);
  for (const mutation of mutations) {
    const parent = mutation.path.slice(0, -1).reduce((current, token) => current[token], copy);
    const key = mutation.path.at(-1);
    if (mutation.op === "delete") {
      if (Array.isArray(parent)) parent.splice(key, 1);
      else delete parent[key];
    } else {
      parent[key] = mutation.value;
    }
  }
  return copy;
}

function rejected(code, ackCursor) {
  return { status: "rejected", code, ...(ackCursor == null ? {} : { ack_cursor: ackCursor }) };
}

function processExport(value, state) {
  if (value.schema_version !== "1.0.0") return rejected("unsupported_schema_version", state.cursor);
  const schemaErrors = validateSchema(schemas.get("planning-export.schema.json"), value, {
    rootKey: "planning-export.schema.json",
  });
  if (schemaErrors.length > 0) return rejected("unknown_field", state.cursor);
  if (value.cursor.after_exclusive !== state.cursor) return rejected("cursor_gap", state.cursor);

  const nextSeen = new Map(Object.entries(state.seenEvents));
  let expectedSeq = state.cursor + 1;
  let duplicates = 0;
  for (const event of value.events) {
    if (event.seq !== expectedSeq) return rejected("cursor_gap", state.cursor);
    const existingDigest = nextSeen.get(event.event_id);
    if (existingDigest != null && existingDigest !== event.source_digest) {
      return rejected("idempotency_conflict", state.cursor);
    }
    if (existingDigest === event.source_digest) duplicates += 1;
    else nextSeen.set(event.event_id, event.source_digest);
    expectedSeq += 1;
  }

  const expectedTo = value.events.length === 0 ? state.cursor : expectedSeq - 1;
  if (value.cursor.to_inclusive !== expectedTo) return rejected("cursor_gap", state.cursor);
  return { status: "accepted", ack_cursor: expectedTo, duplicates };
}

function processShowcase(value) {
  if (value.schema_version !== "1.0.0") return rejected("unsupported_schema_version");
  const schemaErrors = validateSchema(schemas.get("showcase-artifact.schema.json"), value, {
    rootKey: "showcase-artifact.schema.json",
  });
  if (schemaErrors.length > 0) return rejected("unknown_field");
  if (value.approval.author_public_name === value.approval.approver_public_name) {
    return rejected("independent_approval_required");
  }
  return { status: "accepted" };
}

test("Molis Work-owned Casebook integration schemas are strict JSON Schema 2020-12 documents", () => {
  const ids = new Set();
  for (const [name, schema] of schemas) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", name);
    assert.ok(schema.$id, name);
    assert.equal(ids.has(schema.$id), false, `${name} has a duplicate $id`);
    ids.add(schema.$id);
  }
  assert.equal(schemas.get("planning-export.schema.json").additionalProperties, false);
  assert.equal(schemas.get("showcase-artifact.schema.json").additionalProperties, false);
});

test("base export and public Showcase validate against Molis Work-owned contracts", () => {
  assert.deepEqual(
    validateSchema(schemas.get("planning-export.schema.json"), fixture.base_export, { rootKey: "planning-export.schema.json" }),
    [],
  );
  assert.deepEqual(
    validateSchema(schemas.get("showcase-artifact.schema.json"), fixture.base_showcase, { rootKey: "showcase-artifact.schema.json" }),
    [],
  );
});

for (const contractCase of fixture.cases) {
  test(`contract fixture: ${contractCase.name}`, () => {
    const base = contractCase.subject === "export" ? fixture.base_export : fixture.base_showcase;
    const value = mutate(base, contractCase.mutations);
    const actual = contractCase.subject === "export"
      ? processExport(value, {
          cursor: contractCase.consumer_cursor,
          seenEvents: contractCase.seen_events,
        })
      : processShowcase(value);
    assert.deepEqual(actual, contractCase.expected);
  });
}
