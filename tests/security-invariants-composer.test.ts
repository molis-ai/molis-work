import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, defineSubjectContextAction, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import * as composer from "@molis-ai/molis-work-contracts/platform/composer";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { inspectActionCrossReferences, inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

// S-composer-source-call (docs/system/security-invariants/S-composer-source-call.md; specs/unified-input-voice/implementation-plan.md
// §4 items 1 and 2, slice K0): a source in the unified input's `+` menu gets only this call's query, and a declaration that is not one
// cannot be installed. UIC-01 the contract subpath holds only the K0 items; UIC-02 the declaration checks refuse what is not a source.
// Items 3 to 5 (revoked sources, picks checked again at send, the sandbox frame) are K2's, in its browser cases.

const { COMPOSER_PICK_INPUT_SCHEMA, COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_SCHEMA, COMPOSER_PICK_OUTPUT_TYPE } = composer;
type Part = Record<string, unknown>;

const reader = defineSubjectContextAction("notes.read", 1, "note", "笔记", []);
/** A source that passes every rule; `over` replaces fields of its action, `top` of its definition. */
const source = (over: Part = {}, top: Part = {}): ActionDefinition => ({
  capability_id: "notes.pick", version: 1, operation: "query",
  action: { title: "选笔记", description: "按名字找本项目的笔记", kind: "query", scope: "project", audiences: ["user", "agent"], permissions: [],
    subject_kinds: ["note"], input_type: COMPOSER_PICK_INPUT_TYPE, output_type: COMPOSER_PICK_OUTPUT_TYPE,
    input_schema: COMPOSER_PICK_INPUT_SCHEMA, output_schema: COMPOSER_PICK_OUTPUT_SCHEMA,
    composer_source: { title: "笔记", subject_kinds: ["note"], layers: ["ai", "plain"] }, ...over },
  ...top,
} as ActionDefinition);
const NOT_A_SOURCE = "能力 notes.pick@1 没有兑现输入框来源协议 v1：需要平台给的输入输出、对本机用户开放的只读查询，以及名称、与动作相同的对象种类和所在的层（ai、plain）";
const parsed = (...actions: ActionDefinition[]) => manifestProblems(declarationManifest({ actions }));
/** Registers a source (and a reader) with a Kernel as a provider does; `pick` handles the source, the reader is not called here. */
const registered = (pickDefinition: ActionDefinition, readerDefinition?: ActionDefinition, pick: ActionHandlerBinding["handle"] = () => ({ items: [] })) => {
  const kernel = new ActionService();
  const definitions = readerDefinition ? [pickDefinition, readerDefinition] : [pickDefinition];
  kernel.registerProvider({ provider: { provider_id: "notes", title: "Notes", kind: "plugin" }, definitions, handlers: definitions.map(definition => ({
    capability_id: definition.capability_id, version: definition.version, handle: definition === pickDefinition ? pick : () => { throw new Error("not read here"); } })) });
  return kernel;
};
const widened = (schema: unknown, change: (copy: { properties: Record<string, Record<string, unknown>> }) => void) => {
  const copy = structuredClone(schema) as { properties: Record<string, Record<string, unknown>> };
  change(copy);
  return copy;
};

test("S-composer-source-call UIC-01 the pick input holds only query, limit and near, and the subpath exports only the K0 contract", () => {
  assert.deepEqual(Object.keys(composer).sort(), ["COMPOSER_PICK_INPUT_SCHEMA", "COMPOSER_PICK_INPUT_TYPE", "COMPOSER_PICK_OUTPUT_SCHEMA", "COMPOSER_PICK_OUTPUT_TYPE", "composerErrors"]);
  const input = COMPOSER_PICK_INPUT_SCHEMA as { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean };
  assert.deepEqual([Object.keys(input.properties), input.required, input.additionalProperties], [["query", "limit", "near"], ["query", "limit"], false]);
  assert.deepEqual(Object.entries(composer.composerErrors).map(([reason, raise]) => [raise("x").code, raise("x").kind, reason]), [
    ["composer.source_unavailable", "unavailable", "source_unavailable"], ["composer.subject_unreadable", "not_found", "subject_unreadable"], ["composer.required_missing", "invalid", "required_missing"],
  ]);
});

test("S-composer-source-call UIC-02 a source declared as the platform fixes it, with a reader of its kind, installs", () => {
  assert.deepEqual(inspectActionDeclarations([source(), reader], undefined), []);
  assert.deepEqual(inspectActionCrossReferences([source(), reader]), []);
  assert.equal(parsed(source(), reader), "");
  assert.equal(parsed(source({ scope: "home", audiences: ["user"], effect: "read", composer_source: { title: "笔记", subject_kinds: ["note"], layers: ["ai"] } }), reader), "", "a Home source for the AI layer only");
});

test("S-composer-source-call UIC-02 item 1 a pick schema one character away from the platform's is refused", () => {
  const refusals: Array<[string, ActionDefinition]> = [
    ["a query of 201 characters", source({ input_schema: widened(COMPOSER_PICK_INPUT_SCHEMA, copy => { copy.properties.query!.maxLength = 201; }) })],
    ["a draft field beside the query", source({ input_schema: widened(COMPOSER_PICK_INPUT_SCHEMA, copy => { copy.properties.draft = { type: "string" }; }) })],
    ["a limit past 50", source({ input_schema: widened(COMPOSER_PICK_INPUT_SCHEMA, copy => { copy.properties.limit!.maximum = 51; }) })],
    ["more than 50 items back", source({ output_schema: widened(COMPOSER_PICK_OUTPUT_SCHEMA, copy => { copy.properties.items!.maxItems = 51; }) })],
    ["the pick input type under another output", source({ output_type: "molis.composer.pick.items.v2" })],
    ["a declaration without the pick types", source({ input_type: undefined, output_type: undefined })],
    ["the pick types without a declaration", source({ composer_source: undefined })],
  ];
  for (const [what, definition] of refusals) {
    assert.deepEqual(inspectActionDeclarations([definition, reader], undefined), [NOT_A_SOURCE], what);
    assert.equal(parsed(definition, reader), NOT_A_SOURCE, `${what}: the Manifest is refused`);
    assert.throws(() => registered(definition, reader), (error: unknown) => error instanceof ActionError && error.code === "actions.definition_invalid" && error.message === NOT_A_SOURCE,
      `${what}: the Kernel refuses the registration`);
  }
});

test("S-composer-source-call UIC-02 item 2 a source on an action that is not a read-only query open to the person is refused", () => {
  const refusals: Array<[string, ActionDefinition]> = [
    ["a command", source({ kind: "operation" }, { operation: "command" })],
    ["a query that writes", source({ effect: "write" })],
    ["closed to the person", source({ audiences: ["agent", "mcp"] })],
    ["kinds other than the action's", source({ subject_kinds: ["note", "page"] })],
    ["no layer", source({ composer_source: { title: "笔记", subject_kinds: ["note"], layers: [] } })],
    ["a layer that is not one", source({ composer_source: { title: "笔记", subject_kinds: ["note"], layers: ["voice"] } })],
    ["no name", source({ composer_source: { title: " ", subject_kinds: ["note"], layers: ["ai"] } })],
    ["a field the declaration does not have", source({ composer_source: { title: "笔记", subject_kinds: ["note"], layers: ["ai"], draft: true } })],
  ];
  for (const [what, definition] of refusals) {
    assert.ok(inspectActionDeclarations([definition, reader], undefined).includes(NOT_A_SOURCE), what);
    assert.ok(parsed(definition, reader).includes(NOT_A_SOURCE), `${what}: the Manifest is refused`);
  }
});

test("S-composer-source-call UIC-02 item 2 a source of a kind its provider has no reader for is refused", () => {
  const foreign = "能力 notes.pick@1 的输入框来源种类 note 不是同一提供方有对象读取器的种类";
  assert.deepEqual(inspectActionCrossReferences([source()]), [foreign], "no reader at all");
  assert.deepEqual(inspectActionCrossReferences([source(), defineSubjectContextAction("pages.read", 1, "page", "页面", [])]), [foreign], "a reader of another kind");
  assert.equal(parsed(source()), foreign);
  assert.throws(() => registered(source()), (error: unknown) => error instanceof ActionError && error.code === "actions.definition_invalid" && error.message === foreign);
});

test("S-composer-source-call item 1 a call carries only query, limit and the near the page handed over; anything else is refused before the handler", async () => {
  const seen: unknown[] = [];
  const kernel = registered(source(), reader, (_context, input) => { seen.push(input); return { items: [] }; });
  const person: ActionCallContext = { actor_id: "local-user", project_id: "p1", audience: "user", permissions: [] };
  const pick = { capability_id: "notes.pick", version: 1 };
  for (const input of [{ query: "q", limit: 5, draft: "没发出的字" }, { query: "q", limit: 5, receiver: "assistant" }, { query: "x".repeat(201), limit: 5 }, { query: "q", limit: 51 }]) {
    await assert.rejects(kernel.invoke(person, pick, input), (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid", JSON.stringify(input).slice(0, 60));
  }
  assert.deepEqual(seen, [], "the handler never ran");
  assert.deepEqual(await kernel.invoke(person, pick, { query: "q", limit: 5 }), { items: [] });
  assert.deepEqual(seen, [{ query: "q", limit: 5 }], "no current object unless the page handed one over");
});
