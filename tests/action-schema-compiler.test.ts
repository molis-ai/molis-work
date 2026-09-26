import assert from "node:assert/strict";
import test from "node:test";
import type { ActionCallContext, ActionDefinition, ActionExecutionContext, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { compileActionSchema, createActionSchemaCompiler } from "../packages/kernel/src/action-schema.js";
import { ActionService } from "../packages/kernel/src/action-service.js";

const dialects = ["http://json-schema.org/draft-07/schema#", "https://json-schema.org/draft/2020-12/schema"];
const rootId = "https://schema.test/record";
const valueId = "https://schema.test/value";
const invalidSchema = { code: "actions.schema_invalid" };

test("the built-in default meta alias survives registration cleanup and cannot be claimed by business schemas", () => {
  const compile = createActionSchemaCompiler(), alias = "http://json-schema.org/schema";
  compile({ type: "string" });
  for (const dialect of dialects) {
    const validate = compile({ $schema: dialect, $ref: alias });
    assert.equal(validate({ type: "string" }), true);
    assert.equal(validate({ type: "invalid-type" }), false);
    assert.throws(() => compile({ $schema: dialect, $id: alias, type: "string" }), invalidSchema);
    const again = compile({ $schema: dialect, $ref: alias });
    assert.equal(again({ type: "integer" }), true);
    assert.equal(again({ type: "invalid-type" }), false);
  }
  for (let i = 0; i < 2; i++) {
    const validate = compile({ $schema: alias, type: "string" });
    assert.equal(validate("valid"), true);
    assert.equal(validate(1), false);
  }
});

function recordSchema($schema: string, minimum: number): ActionSchema {
  return { $schema, $id: rootId,
    $defs: { value: { $id: valueId, type: "integer", minimum } },
    type: "object", properties: { value: { $ref: valueId } }, required: ["value"], additionalProperties: false };
}

for (const dialect of dialects) {
  test(`${dialect}: independent schemas may reuse ids without lending references or changing old validators`, () => {
    const compile = createActionSchemaCompiler();
    const first = compile(recordSchema(dialect, 1));
    const second = compile(recordSchema(dialect, 5));
    assert.equal(first({ value: 2 }), true);
    assert.equal(second({ value: 2 }), false);
    assert.equal(second({ value: 5 }), true);
    for (const $ref of [rootId, valueId]) {
      assert.throws(() => compile({ $schema: dialect, $ref }), invalidSchema);
    }
    assert.equal(first({ value: 2 }), true, "a later compile or cleanup cannot invalidate a retained validator");
    assert.equal(first({ value: "2" }), false);
  });

  test(`${dialect}: failed compilation removes root and nested references before the next schema`, () => {
    const compile = createActionSchemaCompiler();
    const failed: ActionSchema = { ...recordSchema(dialect, 1),
      properties: { value: { $ref: valueId }, missing: { $ref: "https://schema.test/missing" } } };
    assert.throws(() => compile(failed), invalidSchema);
    for (const $ref of [rootId, valueId]) {
      assert.throws(() => compile({ $schema: dialect, $ref }), invalidSchema);
    }
    assert.throws(() => compile({ ...recordSchema(dialect, 1), type: "invalid-type" }), invalidSchema);
    const recovered = compile(recordSchema(dialect, 5));
    assert.equal(recovered({ value: 2 }), false);
    assert.equal(recovered({ value: 5 }), true);
  });

  test(`${dialect}: reused compilation preserves formats, all errors, strict schemas and unchanged input data`, () => {
    const compile = createActionSchemaCompiler();
    const schema: ActionSchema = { $schema: dialect, type: "object", properties: {
      count: { type: "integer", minimum: 1, default: 3 }, address: { type: "string", format: "email" },
      note: { type: "string", default: "Do not inject" },
    }, required: ["count", "address"], additionalProperties: false };
    const originalSchema = structuredClone(schema);
    const validate = compile(schema);
    const valid = { count: 2, address: "reader@example.com" };
    assert.equal(validate(valid), true);
    assert.deepEqual(valid, { count: 2, address: "reader@example.com" });
    const invalid = { count: "2", address: "not an email", extra: true };
    const before = structuredClone(invalid);
    assert.equal(validate(invalid), false);
    assert.deepEqual(validate.errors!.map(error => error.keyword).sort(), ["additionalProperties", "format", "type"]);
    assert.deepEqual(invalid, before);
    const missing = { address: "reader@example.com" };
    assert.equal(validate(missing), false);
    assert.deepEqual(missing, { address: "reader@example.com" });
    assert.deepEqual(schema, originalSchema);
    assert.throws(() => compile({ $schema: dialect, type: "string", unknownConstraint: true }), invalidSchema);
    const next = compile(schema);
    assert.equal(next(valid), true, "strict-schema failure does not poison subsequent compilations");
  });
}

test("one compiler keeps draft-07 and draft-2020 tuple validation separate", () => {
  const compile = createActionSchemaCompiler();
  const items = [{ type: "integer" }, { type: "string" }];
  const draft7 = compile({ $schema: dialects[0], type: "array", items, additionalItems: false });
  const draft2020 = compile({ $schema: dialects[1], type: "array", prefixItems: items, items: false });
  assert.throws(() => compile({ $schema: dialects[0], type: "array", prefixItems: items }), invalidSchema);
  compile({ $schema: dialects[1], type: "boolean" });
  for (const validate of [draft7, draft2020]) {
    assert.equal(validate([1, "one"]), true);
    assert.equal(validate(["1", "one"]), false);
    assert.equal(validate([1, "one", "extra"]), false);
  }
});

test("single-use compilation does not retain another call's root or nested schema ids", () => {
  const first = compileActionSchema(recordSchema(dialects[0]!, 1));
  const second = compileActionSchema(recordSchema(dialects[0]!, 5));
  assert.equal(first({ value: 2 }), true);
  assert.equal(second({ value: 2 }), false);
  assert.throws(() => compileActionSchema({ $ref: valueId }), invalidSchema);
});

test("provider compilation isolates same-id input and output contracts and retains frozen registration snapshots", async () => {
  const service = new ActionService();
  const input = recordSchema(dialects[0]!, 1);
  const output = recordSchema(dialects[0]!, 10);
  const definitions: ActionDefinition[] = ["schema.first", "schema.second"].map(capability_id => ({
    capability_id, version: 1, operation: "query", action: {
      title: "Schema isolation", description: "Validate independent input and output contracts", kind: "query", scope: "project",
      audiences: ["user"], permissions: [], subject_kinds: [], input_schema: input, output_schema: output,
    },
  }));
  const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: "project", permissions: [] };
  let validOutput = true;
  const register = () => service.registerProvider({
    provider: { provider_id: "schema-test", title: "Schema test", kind: "system" }, definitions,
    handlers: definitions.map(definition => ({ ...definition, handle: (_caller: ActionExecutionContext, value: unknown) =>
      ({ value: (value as { value: number }).value + (validOutput ? 10 : 0) }) })),
  });
  let dispose = register();
  try {
    (input.$defs as { value: { minimum: number } }).value.minimum = 5;
    for (const definition of definitions) {
      assert.deepEqual(await service.invoke(caller, definition, { value: 2 }), { value: 12 });
      await assert.rejects(service.invoke(caller, definition, { value: "2" }), { code: "actions.input_invalid" });
    }
    validOutput = false;
    await assert.rejects(service.invoke(caller, definitions[0]!, { value: 2 }), { code: "actions.output_invalid" });
    validOutput = true;
    dispose(); dispose = register();
    for (const definition of definitions) {
      await assert.rejects(service.invoke(caller, definition, { value: 2 }), { code: "actions.input_invalid" });
      assert.deepEqual(await service.invoke(caller, definition, { value: 5 }), { value: 15 });
    }
  } finally { dispose(); }
});
