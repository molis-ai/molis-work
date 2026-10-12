import assert from "node:assert/strict";
import test from "node:test";
import type { ContextualCandidate, ContextualLayoutPlan } from "@molis-ai/molis-work-contracts/services/contextual";
import { choicesFor, freezePlacement, placementProblem, sampleDraft, visibleChoices, type Hand, type Landing } from "../scripts/contextual-slice/w0-model.js";
import { PreviewStore } from "../scripts/contextual-slice/w0-store.js";
import { readCreate, readPlacement } from "../scripts/contextual-slice/w0-request.js";

const hand: Hand = { id: "quote", title: "访谈", text: "先完成第一个项目。", place: "side" };
const landing: Landing = { documentId: "doc", version: 3, revision: 1, from: 4, to: 4, label: "Pages · 第 1 段光标处" };
const doc = { id: "doc", title: "计划", version: 3, body: { type: "doc", content: [] } };

test("W0-02 AC-P01 AC-S07 (partial): clicking and dropping use the same candidates; drop only changes the frozen position", () => {
  const dropped = { ...landing, from: 20, to: 20 };
  assert.deepEqual(choicesFor(hand, landing), choicesFor(hand, dropped));
  assert.equal(freezePlacement(hand, dropped).landing.from, 20);
  assert.deepEqual(choicesFor(hand, landing).primary.map(item => item.title), ["插入到光标处", "记成待办", "新建文稿"]);
});

test("W0-02 AC-S06 AC-P04 (partial): no landing means no placement; narrow overflow never puts creation into More", () => {
  const absent = choicesFor(hand, null);
  assert.deepEqual(absent.primary.map(item => item.key), ["sample:create:todo", "sample:create:pages"]);
  const narrow = visibleChoices(choicesFor(hand, landing), true);
  assert.equal(narrow.primary.length, 2);
  assert.equal(narrow.more.some(item => item.kind === "create"), false);
});

test("W0-02 AC-P04 (partial): a policy lead is retained; narrow overflow excludes creation", () => {
  const candidate: ContextualCandidate = { key: "rewrite", title: "改得更简洁", intent: "rewrite", apply: "replace", hint: "", offer_id: "concise", provider_title: "Pages", available: true,
    action: { capability_id: "pages.ai", provider_id: "io.molis.work.pages", version: 1 }, source: { capability_id: "pages.offers", provider_id: "io.molis.work.pages", version: 1 } };
  const plan: ContextualLayoutPlan = { context_id: "test", basis: "rules", primary: ["rewrite"], candidates: [candidate], more: [], emphasis: null, assistant: null };
  const choices = choicesFor({ ...hand, place: "main" }, landing, plan);
  assert.deepEqual(choices.primary.map(item => item.key), ["rewrite", "sample:create:todo", "sample:create:pages"]);
  assert.equal(visibleChoices(choices, true).more.length, 0);
});

test("W0-03 AC-P03 AC-S05 (partial): preparation is a snapshot and cannot mutate the document or follow a moved caret", () => {
  const source = { ...hand }, at = { ...landing };
  const frozen = freezePlacement(source, at);
  source.text = "changed"; at.from = 9;
  assert.equal(frozen.text, "先完成第一个项目。"); assert.equal(frozen.landing.from, 4);
  assert.equal(placementProblem(frozen, landing), null);
  assert.match(placementProblem(frozen, { ...landing, revision: 2 })!, /文档已经改变/u);
  assert.match(placementProblem(frozen, { ...landing, version: 4 })!, /文档已经改变/u);
  assert.match(placementProblem(frozen, { ...landing, documentId: "another" })!, /切换文档/u);
});

test("W0-03 AC-P03 AC-S05 (partial): stale placement is rejected before transform or storage effects", () => {
  let transforms = 0;
  const store = new PreviewStore([doc], body => { transforms += 1; return body; });
  const frozen = freezePlacement(hand, landing);
  assert.deepEqual(store.document("doc"), doc);
  store.save("doc", 3, { type: "doc", content: [{ type: "paragraph" }] });
  const before = store.document("doc");
  assert.throws(() => store.place("place-1", frozen), /文档已经改变/u);
  assert.equal(transforms, 0); assert.deepEqual(store.document("doc"), before);
});

test("W0-03 AC-P03 (partial): confirming twice commits one document version; reused id with different text is refused", () => {
  let transforms = 0;
  const store = new PreviewStore([doc], (_body, from, to, text) => {
    transforms += 1; assert.equal(from, 4); assert.equal(to, 4);
    return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
  });
  const frozen = freezePlacement(hand, landing), first = store.place("same", frozen);
  assert.equal(first.version, 4); assert.deepEqual(store.place("same", frozen), first); assert.equal(transforms, 1);
  assert.throws(() => store.place("same", { ...frozen, text: "different" }), /不同的预览/u);
  assert.equal(store.document("doc").version, 4);
});

test("W0-04 Q02 Q04 (partial): a draft does not create; confirmation is idempotent and the page can be reopened", () => {
  const store = new PreviewStore([doc], body => body);
  const draft = sampleDraft("pages", "写一份验证计划", hand.text);
  assert.equal(store.documents.size, 1); assert.equal(store.created.size, 0);
  const item = store.create("create-page", "pages", draft);
  assert.ok(item.documentId); assert.equal(store.document(item.documentId).title, "写一份验证计划");
  assert.match(JSON.stringify(store.document(item.documentId).body), /先完成第一个项目/u);
  assert.deepEqual(store.create("create-page", "pages", draft), item); assert.equal(store.documents.size, 2);
  assert.throws(() => store.create("create-page", "pages", { ...draft, title: "changed" }), /草稿已更改/u);
});

test("W0-04 Q04 Q08 (partial): direct creation can undo; retrying the original request does not recreate an undone item", () => {
  const store = new PreviewStore([doc], body => body), draft = sampleDraft("todo", "", hand.text);
  const item = store.create("todo", "todo", draft);
  assert.equal(store.created.size, 1); store.undo(item.id); store.undo(item.id);
  assert.equal(store.created.size, 0); store.create("todo", "todo", draft); assert.equal(store.created.size, 0);
});

test("W0-04 Q08 (partial): relocation retains the original until a valid confirmation, then replaces it exactly once", () => {
  const store = new PreviewStore([doc], body => body), draft = sampleDraft("todo", "访谈待办", hand.text);
  const source = store.create("todo", "todo", draft), materialCount = store.materials.size;
  const movedDraft = { ...draft, title: "访谈材料" };
  assert.equal(store.created.get(source.id)?.title, "访谈待办");
  assert.throws(() => store.create("move", "shelf", { ...movedDraft, text: "" }, source.id), /补上标题和内容/u);
  assert.ok(store.created.has(source.id)); assert.equal(store.materials.size, materialCount);
  const moved = store.create("move", "shelf", movedDraft, source.id);
  assert.equal(store.created.has(source.id), false); assert.equal(store.materials.get(moved.materialId!)?.text, hand.text);
  store.create("move", "shelf", movedDraft, source.id); assert.equal(store.materials.size, materialCount + 1);
});

test("W0-05: malformed landing and creation inputs cannot reach the store", () => {
  assert.throws(() => readCreate({ requestId: "x", target: "external", draft: { title: "x", text: "x", instruction: "" } }), /格式无效/u);
  assert.throws(() => readPlacement({ requestId: "x", placement: { ...freezePlacement(hand, landing), landing: { ...landing, from: -1 } } }), /格式无效/u);
  assert.throws(() => readPlacement({ requestId: "", placement: freezePlacement(hand, landing) }), /格式无效/u);
  assert.equal(readCreate({ requestId: "x", target: "shelf", draft: sampleDraft("shelf", "原话") }).draft.text, "原话");
});
