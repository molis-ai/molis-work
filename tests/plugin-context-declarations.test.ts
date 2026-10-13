import assert from "node:assert/strict";
import test from "node:test";
import { defineFragmentOffersAction, defineSubjectContextAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations, parsePluginManifest, PluginManifestError } from "@molis-ai/molis-work-plugin-sdk";
import { DECLARATION_PLUGIN_ID, declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

// What a plugin may declare about being put things into (W1-4, context-program §18): creation entries (`intake`), appends
// (`attach`), the places an offer applies in and the kinds a right-panel cell shows. Every expected message is written out
// in full on purpose, as in plugin-declaration-rules: a check dropped or reworded fails here, not in a plugin's face.

type Part = Record<string, unknown>;
const KEY = "example.create@1";
const intake = (over: Part = {}): Part => ({
  intake_id: "item", item_kind: "example_item", title: "待办", verb: "记成待办", describe: "要做的一件事，有人负责、可以完成。",
  examples: ["周五前把方案发给 Lee"], material_field: "text", ...over,
});
const attach = (over: Part = {}): Part => ({
  attach_id: "into-doc", item_kind: "example_doc", title: "文档", verb: "插入到文档", describe: "放进一篇已有的文档。",
  positions: ["cursor", "selection", "end"], material_field: "text", ...over,
});
const writing = (over: Part = {}, top: Part = {}): Part => ({
  capability_id: "example.create", version: 1, operation: "command",
  action: { title: "Create", description: "Creates one thing", kind: "operation", scope: "project", permissions: [], subject_kinds: ["example_item"],
    audiences: ["user"], input_schema: { type: "object", properties: { text: { type: "string" }, expected_version: { type: "integer" } } }, ...over },
  ...top,
});
const problems = (definition: Part) => inspectActionDeclarations([definition], []);

test("W1-04: a command may declare a creation entry and an append, and a plain action says nothing about either", () => {
  assert.deepEqual(problems(writing({ intake: intake() })), []);
  assert.deepEqual(problems(writing({ attach: attach() })), []);
  assert.deepEqual(problems(writing({ intake: intake({ effect: "proposes", multiple: true, prepare: { capability_id: "example.prepare", version: 1 }, places: ["main", "side"] }) })), []);
  assert.deepEqual(problems(writing()), []);
  const object = writing({ attach: attach({ positions: undefined, material_field: undefined }) });
  assert.deepEqual(problems(object), [], "an append with no positions lands on the object itself");
});

test("W1-04: a creation entry is a stable id, a kind, words with limits and one to three examples", () => {
  const wrong = `能力 ${KEY} 的创建入口声明无效：需要稳定的 id、对象种类、名称、动词、说明与一到三条示例，字段都有长度上限`;
  for (const over of [
    { intake_id: "Item" }, { intake_id: "1item" }, { intake_id: "" }, { intake_id: "i".repeat(41) }, { item_kind: "" },
    { title: " " }, { title: "t".repeat(41) }, { verb: "" }, { describe: "d".repeat(241) },
    { examples: [] }, { examples: ["a", "b", "c", "d"] }, { examples: ["x".repeat(121)] }, { examples: [""] },
    { effect: "removes" }, { multiple: "yes" }, { prepare: { capability_id: "example.prepare" } }, { prepare: { capability_id: "example.prepare", version: 1, provider_id: "other" } },
    { places: [] }, { places: ["main", "main"] }, { places: ["floating"] },
  ]) assert.deepEqual(problems(writing({ intake: intake(over) })), [wrong], JSON.stringify(over));
  assert.deepEqual(problems(writing({ intake: "todo" })), [wrong]);
  assert.deepEqual(problems(writing({ intake: null })), [wrong]);
});

test("W1-04: an entry is declared on a command that can be taken back or confirmed; its material goes to a field the input has", () => {
  const needsWrite = `能力 ${KEY} 的创建入口必须声明在写入动作（command）上，且不能是不可撤回的`;
  assert.deepEqual(problems(writing({ intake: intake(), effect: "irreversible" })), [needsWrite]);
  assert.deepEqual(problems(writing({ intake: intake(), kind: "query" }, { operation: "query" })), [needsWrite], "a query reads; it cannot create");
  assert.deepEqual(problems({ ...writing({ intake: intake() }), capability_id: "example.delete", operation: "command" }), [`能力 example.delete@1 的创建入口必须声明在写入动作（command）上，且不能是不可撤回的`], "a deleting-looking id is irreversible unless it says otherwise");
  assert.deepEqual(problems(writing({ intake: intake({ material_field: "body" }) })), [`能力 ${KEY} 的创建入口的 material_field 必须是输入里的顶层字段`]);
});

test("W1-04: an append names its positions, needs a version for the ones that sit inside a document, and writes", () => {
  const wrong = `能力 ${KEY} 的追加声明无效：需要稳定的 id、对象种类、名称、动词与说明，位置只能是光标、选区、文末`;
  for (const over of [{ attach_id: "Into" }, { item_kind: "" }, { verb: "" }, { positions: [] }, { positions: ["cursor", "cursor"] }, { positions: ["anywhere"] }, { places: ["lobby"] }]) {
    assert.deepEqual(problems(writing({ attach: attach(over) })), [wrong], JSON.stringify(over));
  }
  const noVersion = { type: "object", properties: { text: { type: "string" } } };
  assert.deepEqual(problems(writing({ attach: attach(), input_schema: noVersion })), [`能力 ${KEY} 的追加到光标或选区必须在输入里带 expected_version，文档变了就拒绝写入`]);
  assert.deepEqual(problems(writing({ attach: attach({ positions: ["end"] }), input_schema: noVersion })), [], "the end of a document needs no cursor");
  assert.deepEqual(problems(writing({ attach: attach({ positions: undefined }), input_schema: noVersion })), []);
  assert.deepEqual(problems(writing({ attach: attach(), effect: "irreversible" })), [`能力 ${KEY} 的追加必须声明在写入动作（command）上，且不能是不可撤回的`]);
  assert.deepEqual(problems(writing({ attach: attach({ material_field: "body" }) })), [`能力 ${KEY} 的追加的 material_field 必须是输入里的顶层字段`]);
});

test("W1-04: the places an offer applies in are the places that exist, without repeats", () => {
  const wrong = `能力 example.offers@1 的选项范围 places 无效：只能是左边、右栏、助理面板，不重复`;
  const offers = (choice: Part, field: string) => ({ capability_id: "example.offers", version: 1, operation: "query", action: {
    title: "Offers", description: "Offers", kind: "query", scope: "project", permissions: [], subject_kinds: ["example_item"], audiences: ["user"], input_schema: { type: "object" }, [field]: [choice] } });
  const subject = { offer_id: "a", title: "A", action: { capability_id: "example.act", version: 1 } };
  const fragment = { ...subject, intent: "question", apply: "result", hint: "h" };
  const placed = (places: unknown) => inspectActionDeclarations([offers({ ...subject, places }, "subject_offer_choices")], []).filter(message => message.includes("places"));
  assert.deepEqual(placed(["side"]), []);
  assert.deepEqual(placed(["side", "assistant", "main"]), []);
  for (const bad of [[], ["side", "side"], ["desk"], "side"]) assert.deepEqual(placed(bad), [wrong], JSON.stringify(bad));
  const fragments = inspectActionDeclarations([offers({ ...fragment, places: ["drawer"] }, "fragment_offer_choices")], []).filter(message => message.includes("places"));
  assert.deepEqual(fragments, [wrong]);
});

const reader = defineSubjectContextAction("example.doc.read", "example_doc", "读文档", []);
const itemReader = defineSubjectContextAction("example.item.read", "example_item", "读事项", []);
const prepare = defineFragmentOffersAction("example.prepare", ["example_item"], "Prepare", [], [{ offer_id: "item", title: "记成待办", intent: "capture", apply: "record", hint: "h", action: { capability_id: "example.create", version: 1 } }]);
const view = (over: Part = {}) => ({ view_id: "cell", slot: "side", title: "Cell", ...over });
const manifest = (actions: Part[], views: Part[] = []) => declarationManifest({
  actions, ui: { contributions: views.map(entry => `${DECLARATION_PLUGIN_ID}.${String(entry.view_id)}`), views },
});

test("W1-04: a Manifest's declarations that refer to each other are checked together: ids once, a prepare that exists, kinds it owns", () => {
  const clean = manifest([writing({ intake: intake({ prepare: { capability_id: "example.prepare", version: 1 } }), attach: attach() }), prepare, reader, itemReader]);
  assert.equal(manifestProblems(clean), "");
  const twice = manifest([writing({ intake: intake() }), { ...writing({ intake: intake() }), capability_id: "example.create-more" }, writing({ attach: attach() }, { capability_id: "example.append" }),
    writing({ attach: attach() }, { capability_id: "example.append-more" }), reader, itemReader]);
  assert.equal(manifestProblems(twice), "创建入口重复：item；追加声明重复：into-doc");
  const missing = manifest([writing({ intake: intake({ prepare: { capability_id: "example.nothing", version: 1 } }) }), reader, itemReader]);
  assert.equal(manifestProblems(missing), `能力 ${KEY} 的创建入口的 prepare example.nothing@1 不是本插件的选区动作查询（defineFragmentOffersAction）`);
  const notQuery = manifest([writing({ attach: attach({ prepare: { capability_id: "example.create", version: 1 } }) }), reader, itemReader]);
  assert.equal(manifestProblems(notQuery), `能力 ${KEY} 的追加声明的 prepare example.create@1 不是本插件的选区动作查询（defineFragmentOffersAction）`);
  const plainQuery = manifest([writing({ intake: intake({ prepare: { capability_id: "example.plain", version: 1 } }) }), { ...prepare, capability_id: "example.plain", action: { ...(prepare.action as Part), input_type: undefined, output_type: undefined } }, reader, itemReader]);
  assert.match(manifestProblems(plainQuery), /example\.plain@1 不是本插件的选区动作查询/u, "a query that is not a fragment-offers query cannot prepare");
  const foreign = manifest([writing({ attach: attach({ item_kind: "other_doc" }) }), reader, itemReader]);
  assert.equal(manifestProblems(foreign), `能力 ${KEY} 的追加对象种类 other_doc 不是本插件拥有的种类：没有它的对象读取器，插件不能写进别的插件的对象`);
  const noReader = manifest([writing({ attach: attach() })]);
  assert.match(manifestProblems(noReader), /example_doc 不是本插件拥有的种类/u);
  assert.equal(manifestProblems(manifest([writing({ intake: intake({ item_kind: "anything_new" }) }), itemReader])), "", "a created kind need not have a reader here; only appends are bound to the provider's own kinds");
});

test("W1-04: a right-panel cell lists the kinds it shows, each with a reader in the same Manifest; no other slot may", () => {
  const actions = [reader, itemReader];
  assert.equal(manifestProblems(manifest(actions, [view({ objects: ["example_doc", "example_item"] })])), "");
  assert.equal(manifestProblems(manifest(actions, [view({ objects: ["example_doc", "ghost"] })])), "视图 cell 的对象种类 ghost 没有对象读取器");
  assert.equal(manifestProblems(manifest(actions, [view({ slot: "stage", objects: ["example_doc"] })])), "视图 cell 的 objects 只能用在 side 视图上");
  const wrong = "视图 cell 的 objects 无效：一到八个不重复的对象种类";
  for (const objects of [[], ["example_doc", "example_doc"], [""], Array.from({ length: 9 }, (_, index) => `kind_${index}`)]) {
    assert.equal(manifestProblems(manifest(actions, [view({ objects })])), wrong, JSON.stringify(objects));
  }
  assert.equal(manifestProblems(manifest(actions, [view()])), "", "a view that lists nothing is as before");
});

test("W1-04: entries that are not shaped like actions or views are reported by the shape rules, never thrown at by the cross-declaration checks", () => {
  const withPrepare = writing({ intake: intake({ prepare: { capability_id: "example.prepare", version: 1 } }), attach: attach() });
  const refused = (input: unknown) => {
    try { parsePluginManifest(input); return null; } catch (error) {
      if (error instanceof PluginManifestError) return error.code;
      throw error;
    }
  };
  // A null or a number among the actions, ahead of and after the ones the declarations point at.
  for (const stray of [null, 5, "action", [], {}]) {
    const actions = [stray, withPrepare, prepare, reader, stray, itemReader] as Part[];
    assert.equal(refused(manifest(actions)), "plugin_declaration_invalid", JSON.stringify(stray));
  }
  // A reader that lists its kinds in the wrong shape owns no kind, so the append to its object is told so.
  for (const kinds of ["example_doc", null, 7, { 0: "example_doc" }, [7]]) {
    const odd = { ...reader, action: { ...(reader.action as Part), subject_kinds: kinds } };
    assert.match(manifestProblems(manifest([writing({ attach: attach() }), odd as Part, itemReader])), /example_doc 不是本插件拥有的种类/u, JSON.stringify(kinds));
  }
  // A view that is not an object says what it lacks, as before, and does not stop the other views being read.
  assert.match(manifestProblems(manifest([reader, itemReader], [5 as unknown as Part, view({ objects: ["ghost"] })])), /视图 cell 的对象种类 ghost 没有对象读取器/u);
});

test("W1-04: the new checks come after every older one, so what an author read before does not move", () => {
  const message = manifestProblems(manifest([writing({ intake: intake({ title: "" }) }), reader], [view({ slot: "floating", objects: ["ghost"] })]));
  const order = ["视图 cell 的 slot 不合法", "能力 example.create@1 的创建入口声明无效", "视图 cell 的 objects 只能用在 side 视图上"].map(part => message.indexOf(part));
  assert.ok(order.every(at => at >= 0), message);
  assert.ok(order[1]! < order[0]!, "the action's own problem comes before the view's, as the older checks always did");
  assert.ok(order[0]! < order[2]!, "and the cross-declaration check closes the list");
});
