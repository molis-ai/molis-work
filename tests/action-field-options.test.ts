import assert from "node:assert/strict";
import test from "node:test";
import { actionFieldInput, actionFieldOptions, actionFieldValue } from "@molis-ai/molis-work-contracts/platform/actions";

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
  // A nullable field: choices wrapped with a null branch (as Todo declares its optional relation).
  const nullable = { anyOf: [{ oneOf: [{ const: "blocks", title: "要等它先完成" }, { const: "related", title: "相关" }] }, { type: "null" }] };
  assert.equal(actionFieldValue("relation", "related", nullable), "相关");
  assert.deepEqual(actionFieldOptions({ anyOf: [{ const: "a", title: "甲" }, { type: "null" }] }), [{ value: "a", label: "甲" }]);
});

test("a day or a moment is picked: the standard formats, through a nullable wrapper; a moment reads in local time", () => {
  const moment = { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] };
  assert.equal(actionFieldInput(moment), "datetime");
  assert.equal(actionFieldInput({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", format: "date" }), "date");
  assert.equal(actionFieldInput({ type: "string", minLength: 10 }), null);
  assert.equal(actionFieldInput({ oneOf: [{ const: "a" }, { const: "b" }] }), null);
  const at = new Date(2026, 9, 1, 9, 5);
  assert.equal(actionFieldValue("remind_at", at.toISOString(), moment), "2026-10-01 09:05");
  assert.equal(actionFieldValue("remind_at", "不是时间", moment), "不是时间");
});
