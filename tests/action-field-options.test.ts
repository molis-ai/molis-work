import assert from "node:assert/strict";
import test from "node:test";
import { actionFieldOptions, actionFieldValue } from "@molis-ai/molis-work-contracts/platform/actions";

test("a field's declared choices read by their labels: oneOf titles, or value=label pairs in the description", () => {
  const titled = { oneOf: [{ const: "personal", title: "个人空间" }, { const: "project", title: "当前项目" }] };
  assert.deepEqual(actionFieldOptions(titled), [{ value: "personal", label: "个人空间" }, { value: "project", label: "当前项目" }]);
  assert.equal(actionFieldValue("placement", "project", titled), "当前项目");
  // The style the Assistant's own rule actions use.
  const described = { enum: ["pages", "coding", "home"], description: "pages=Pages，coding=Coding，home=项目首页" };
  assert.equal(actionFieldValue("surface", "home", described), "项目首页");
  // An enum without labels keeps its values; a value outside the choices and a field without them read as they are.
  assert.deepEqual(actionFieldOptions({ enum: ["a", "b"] }), [{ value: "a", label: "a" }, { value: "b", label: "b" }]);
  assert.equal(actionFieldValue("placement", "elsewhere", titled), "elsewhere");
  assert.equal(actionFieldOptions({ type: "string" }), null);
  assert.equal(actionFieldValue("title", "周报", undefined), "周报");
});
