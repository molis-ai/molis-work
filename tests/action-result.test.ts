import assert from "node:assert/strict";
import test from "node:test";
import { inspectActionDeclarations, presentActionResult, type ActionDefinition, type ActionResultView } from "@molis-ai/molis-work-contracts/platform/actions";

const view: ActionResultView = { summary: "已保存材料", title_pointer: "/item/name", text_pointer: "/item/body",
  link: { label: "打开材料", href_template: "/projects/{project_id}/?openItem={/item/id}&openTitle={/item/name}" } };
const definition = (resultView: unknown): ActionDefinition => ({ capability_id: "sample.create", version: 1, operation: "command",
  action: { title: "新建", description: "新建一份材料", kind: "operation", scope: "project", audiences: ["workflow"], permissions: [], subject_kinds: [],
    input_schema: { type: "object" }, result_view: resultView as ActionResultView } });

test("provider result presentation selects original values, safely encodes the original object link and bounds visible text", () => {
  assert.deepEqual(inspectActionDeclarations([definition(view)], undefined), []);
  const result = presentActionResult(view, { item: { id: "a/b?x=1", name: "研究 & 复盘", body: "真实正文", internal_path: "/private/secret" } }, "project-one");
  assert.deepEqual(result, { summary: "已保存材料", title: "研究 & 复盘", text: "真实正文",
    link: { label: "打开材料", href: "/projects/project-one/?openItem=a%2Fb%3Fx%3D1&openTitle=%E7%A0%94%E7%A9%B6%20%26%20%E5%A4%8D%E7%9B%98" } });
  const long = presentActionResult(view, { item: { body: "正文".repeat(3000) } }, "p");
  assert.equal(long?.text?.length, 4000); assert.equal(long?.text_truncated, true);
  assert.equal(long?.link, undefined); assert.equal(long?.title, undefined);
  assert.equal(presentActionResult(undefined, { ok: true }), undefined);
  assert.equal(presentActionResult(view, { item: { id: "i", name: "t" } })?.link, undefined, "no project means no invented destination");
});

test("result declarations reject unsafe destinations and invalid pointers before registration", () => {
  for (const href_template of ["https://elsewhere.test/", "//elsewhere.test/", "javascript:alert(1)", "/\\elsewhere.test/", "/\nelsewhere.test/", "/{unknown}", "/{unfinished"]) {
    assert.ok(inspectActionDeclarations([definition({ ...view, link: { label: "打开", href_template } })], undefined).length, href_template);
  }
  assert.ok(inspectActionDeclarations([definition({ summary: "", title_pointer: "item.name" })], undefined).length);
  assert.ok(inspectActionDeclarations([definition({ summary: "结果", text_pointer: "/bad~escape" })], undefined).length);
  assert.equal(presentActionResult(view, { item: { id: "i", name: "\ud800" } }, "p")?.link, undefined, "bad provider text cannot fail a completed write");
  assert.equal(presentActionResult(view, { item: { id: "..", name: "t" } }, "p")?.link, undefined);
  assert.deepEqual(presentActionResult({ summary: "结果", title_pointer: "/a~1b/~0name", text_pointer: "/constructor/name" }, { "a/b": { "~name": false } }),
    { summary: "结果", title: "false" }, "JSON Pointer escapes work; prototype fields are never read");
});
