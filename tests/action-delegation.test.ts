import assert from "node:assert/strict";
import test from "node:test";
import type { ActionDelegationDeclaration, ActionMetadata } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineAction, extractActionDelegation, inspectActionDeclarations, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest } from "./fixtures/declaration-manifest.js";

const declaration: ActionDelegationDeclaration = {
  targets: [
    { key: "document", title: "文稿", kind: "document", field: "id" },
    { key: "folder", title: "文件夹", kind: "folder", field: "folder_id" },
    { key: "goal", title: "不关联目标", kind: "goal", field: "goal_id", allowed_values: [""] },
  ],
  operations: [
    { key: "edit", title: "修改内容", fields: ["title", "body", "starred"], targets: ["document"], when: ["title", "body", "starred"] },
    { key: "move", title: "移动", fields: ["folder_id"], targets: ["document", "folder"], when: ["folder_id"] },
    { key: "associate", title: "修改关联", fields: ["goal_id"], targets: ["document", "goal"], when: ["goal_id"] },
  ],
  control_fields: ["expected_version"],
};
const inputSchema = { type: "object", additionalProperties: false, properties: {
    id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, starred: { type: "boolean" },
    folder_id: { type: "string" }, goal_id: { type: "string" }, expected_version: { type: "integer" },
  }, required: ["id", "expected_version"] };
const action: ActionMetadata = {
  title: "修改文稿", description: "修改指定文稿", kind: "operation", scope: "project", effect: "write",
  audiences: ["user", "agent"], permissions: [], subject_kinds: ["document"], delegation: declaration,
  input_schema: inputSchema,
};
const definition = (metadata: unknown = action) => ({ capability_id: "notes.update", version: 1, operation: "command", action: metadata });

test("APR-07/08: actual field presence extracts every effect, including empty strings and false, without authorizing it", () => {
  assert.deepEqual(inspectActionDeclarations([definition()], undefined), []);
  const input = Object.freeze({ id: "d1", title: "", starred: false, folder_id: "", goal_id: "", expected_version: 3 });
  assert.deepEqual(extractActionDelegation(action, input), { state: "resolved", operations: [
    { key: "edit", targets: { document: "d1" } },
    { key: "move", targets: { document: "d1", folder: "" } },
    { key: "associate", targets: { document: "d1", goal: "" } },
  ] });
  assert.equal(input.title, "", "extraction does not normalize or mutate the actual input");
  assert.deepEqual(extractActionDelegation(action, { id: "d1", body: "new content", expected_version: 4 }), {
    state: "resolved", operations: [{ key: "edit", targets: { document: "d1" } }],
  });
});

test("APR-07/08: missing, noncanonical, unsupported and extra targets never become an automatic scope", () => {
  for (const [input, reason] of [
    [{ body: "text", expected_version: 1 }, "target-missing"],
    [{ id: "d1", body: "text", goal_id: "g1", expected_version: 1 }, "target-unsupported"],
    [{ id: "d1", folder_id: null, expected_version: 1 }, "target-unsupported"],
    [{ id: "d1", folder_id: " f1", expected_version: 1 }, "target-unsupported"],
    [{ id: "d1 ", body: "text", expected_version: 1 }, "target-unsupported"],
    [{ id: "d1", body: "text", destination: "elsewhere", expected_version: 1 }, "invalid-input"],
    [{ id: "d1", expected_version: 1 }, "no-operation"],
    [null, "invalid-input"],
    [[], "invalid-input"],
  ] as const) assert.deepEqual(extractActionDelegation(action, input), { state: "confirmation-required", reason });
  assert.deepEqual(extractActionDelegation({ input_schema: action.input_schema }, { id: "d1" }), {
    state: "confirmation-required", reason: "undeclared",
  });
});

test("APR-08/11: only an explicit owner constant supplies a missing target, never an inferred publication goal", () => {
  const create: Pick<ActionMetadata, "input_schema" | "delegation"> = {
    input_schema: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, folder_id: { type: "string" }, goal_id: { type: "string" },
    } },
    delegation: {
      targets: [
        { key: "folder", title: "文件夹", kind: "folder", field: "folder_id", default_value: "" },
        { key: "goal", title: "不关联目标", kind: "goal", field: "goal_id", default_value: "", allowed_values: [""] },
      ],
      operations: [{ key: "create", title: "新建", fields: ["title", "folder_id", "goal_id"], targets: ["folder", "goal"], when: "always" }],
      control_fields: [],
    },
  };
  assert.deepEqual(extractActionDelegation(create, { title: "New" }), {
    state: "resolved", operations: [{ key: "create", targets: { folder: "", goal: "" } }],
  });
  assert.deepEqual(extractActionDelegation(create, { title: "New", goal_id: "g1" }), { state: "confirmation-required", reason: "target-unsupported" });
  const publish: Pick<ActionMetadata, "input_schema" | "delegation"> = {
    input_schema: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, goal_id: { type: "string" } } },
    delegation: { targets: [declaration.targets[0]!, declaration.targets[2]!], control_fields: [], operations: [
      { key: "publish", title: "保存成果", fields: [], targets: ["document", "goal"], when: "always" },
      { key: "associate", title: "修改关联", fields: ["goal_id"], targets: ["document", "goal"], when: "always" },
    ] },
  };
  assert.deepEqual(extractActionDelegation(publish, { id: "d1" }), { state: "confirmation-required", reason: "target-missing" });
  assert.deepEqual(extractActionDelegation(publish, { id: "d1", goal_id: "" }), { state: "resolved", operations: [
    { key: "publish", targets: { document: "d1", goal: "" } }, { key: "associate", targets: { document: "d1", goal: "" } },
  ] });
});

test("APR-07: declaration checks reject hidden effects and ambiguous input shapes at authoring and Manifest parsing", () => {
  const [edit, move, associate] = declaration.operations;
  const invalid: unknown[] = [
    { ...declaration, targets: [...declaration.targets, declaration.targets[0]] },
    { ...declaration, operations: [...declaration.operations, edit] },
    { ...declaration, operations: [{ ...edit, when: ["title"] }, move, associate] },
    { ...declaration, operations: [{ ...edit, targets: [] }, move, associate] },
    { ...declaration, operations: [{ ...edit, targets: ["unknown"] }, move, associate] },
    { ...declaration, operations: [edit, { ...move, fields: ["folder_id", "body"], when: ["folder_id", "body"] }, associate] },
    { ...declaration, operations: [edit], control_fields: ["folder_id", "goal_id", "expected_version"] },
    { ...declaration, control_fields: [] },
    { ...declaration, targets: [{ ...declaration.targets[0], field: "starred" }, ...declaration.targets.slice(1)] },
    { ...declaration, targets: [{ ...declaration.targets[0], default_value: " d1" }, ...declaration.targets.slice(1)] },
    { ...declaration, targets: [...declaration.targets.slice(0, 2), { ...declaration.targets[2], default_value: "g1" }] },
    { ...declaration, resolver: "custom-code" },
  ];
  for (const delegation of invalid) {
    const candidate = definition({ ...action, delegation });
    assert.ok(inspectActionDeclarations([candidate], undefined).some(problem => problem.includes("delegation")), JSON.stringify(delegation));
    assert.throws(() => parsePluginManifest(declarationManifest({ actions: [candidate] })), /delegation/);
  }
  for (const input_schema of [
    { ...action.input_schema, additionalProperties: true },
    { ...action.input_schema, anyOf: [{ required: ["body"] }, { required: ["folder_id"] }] },
    { ...inputSchema, properties: { ...inputSchema.properties, extra: { type: "string" } } },
    { ...inputSchema, properties: { ...inputSchema.properties, id: { type: ["string", "null"] } } },
  ]) {
    const metadata = { ...action, input_schema };
    assert.throws(() => defineAction({ capability_id: "notes.update", version: 1, operation: "command", action: metadata }, () => null), /delegation/);
    assert.deepEqual(extractActionDelegation(metadata, { id: "d1", body: "text" }), { state: "confirmation-required", reason: "invalid-declaration" });
  }
  assert.doesNotThrow(() => parsePluginManifest(declarationManifest({ actions: [definition()] })));
});
