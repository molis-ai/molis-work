import assert from "node:assert/strict";
import test from "node:test";
import { isItemPartAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineItemCreateAction, defineItemNextAction, defineItemRelatedAction, definePresentationValuesAction } from "@molis-ai/molis-work-plugin-sdk";
import { isItemPart, validatePresentationDeclaration } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";

/*
 * An item source (specs/work-mainline/contract-design.md §4, MLC-09 declaration part): any plugin makes a kind of its own a work item
 * source by writing `item` on that kind in its presentation declaration, naming its own actions made with `platform/work-items`. The SDK
 * refuses a declaration that names another Manifest's action, a hand-made shape, or another kind; the mainline service runs the same
 * check on the directory (`isItemPartAction`), so no source is called differently from another.
 */

const PLUGIN_ID = "com.example.notes";
const values = definePresentationValuesAction("notes.presentation.values", 1, ["note"], "笔记显示字段", ["notes:read"]);
const create = defineItemCreateAction("notes.items.create", 1, { kind: "note", title: "建成笔记", description: "新建一条笔记。", permissions: ["notes:write"] });
const related = defineItemRelatedAction("notes.items.related", 1, { kind: "note", title: "笔记的相关", description: "读取和笔记相关的对象。", permissions: ["notes:read"] });
const next = defineItemNextAction("notes.items.next", 1, { kind: "note", title: "笔记的下一步", description: "读取笔记的下一步。", permissions: ["notes:read"] });
const memoCreate = defineItemCreateAction("notes.memos.create", 1, { kind: "memo", title: "建成便签", description: "新建一条便签。", permissions: ["notes:write"] });
const declaration = (item: unknown, actions: unknown[] = [values, create, related, next, memoCreate]) => ({ plugin_id: PLUGIN_ID, actions,
  presentation: { objects: [{ kind: "note", fields: [{ key: "title", role: "title" }], forms: {}, item }] } });

test("MLC-09 a plugin's own item parts pass; any one of them may be left out", () => {
  assert.deepEqual(validatePresentationDeclaration(declaration({ create: "notes.items.create@1", related: "notes.items.related@1", next: "notes.items.next@1" })), []);
  assert.deepEqual(validatePresentationDeclaration(declaration({})), [], "a kind that can only be set as an item, from an object that exists");
  assert.deepEqual(validatePresentationDeclaration(declaration({ next: "notes.items.next@1" })), []);
});

test("MLC-09 a declaration naming another's action, a hand-made shape, another kind or an unknown part is refused", () => {
  const loose = { ...create, action: { ...create.action, input_schema: { type: "object" } } };
  const asQuery = { ...related, operation: "command" };
  const problems = (item: unknown, actions?: unknown[]) => validatePresentationDeclaration(declaration(item, actions));
  assert.deepEqual(problems({ create: "goals.items.create@1" }), ["presentation.objects[0].item.create 要是本插件自己声明的动作"]);
  assert.deepEqual(problems({ create: "notes.items.create" }), ["presentation.objects[0].item.create 要写成 capability_id@version"]);
  assert.deepEqual(problems({ create: "notes.items.create@1" }, [values, loose]), ["presentation.objects[0].item.create 要用 platform/work-items 的定义器定义（create），并以 note 为对象种类"]);
  assert.deepEqual(problems({ related: "notes.items.related@1" }, [values, asQuery]), ["presentation.objects[0].item.related 要用 platform/work-items 的定义器定义（related），并以 note 为对象种类"]);
  assert.deepEqual(problems({ create: "notes.memos.create@1" }), ["presentation.objects[0].item.create 要用 platform/work-items 的定义器定义（create），并以 note 为对象种类"], "a memo's create is not a note's");
  assert.deepEqual(problems({ next: "notes.items.related@1" }), ["presentation.objects[0].item.next 要用 platform/work-items 的定义器定义（next），并以 note 为对象种类"], "a part used as another");
  assert.equal(problems({ start: "notes.items.next@1" }).length, 1, "only create, related and next");
  assert.equal(problems("notes.items.create@1").length, 1);
});

test("MLC-09 the service's check is the SDK's: the same parts pass and fail", () => {
  for (const [action, part, kind] of [[create, "create", "note"], [create, "create", "memo"], [next, "related", "note"], [related, "related", "note"]] as const) {
    assert.equal(isItemPart(action, part, kind), isItemPartAction(action, part, kind));
  }
  assert.equal(isItemPartAction(create, "create", "note"), true);
  assert.equal(isItemPartAction(create, "create", "memo"), false);
  assert.equal(isItemPartAction(next, "related", "note"), false);
  assert.equal(isItemPartAction({ ...next, action: { ...next.action, output_schema: { type: "object" } } }, "next", "note"), false);
});

test("MLC-09 Goals is one source among others: its Manifest declares create and next for goal through the same rule", () => {
  assert.deepEqual(validatePresentationDeclaration(goalsManifest), []);
  const goal = goalsManifest.presentation!.objects.find(object => object.kind === "goal")!;
  assert.deepEqual(goal.item, { create: "goals.items.create@1", next: "goals.items.next@1" });
});
