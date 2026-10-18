import assert from "node:assert/strict";
import test from "node:test";
import { toolField } from "./fixtures/connector-assistant-model.js";

test("ASC-26: model evaluation reads actual tool results, never schemas, requested values or prose", () => {
  const result = (value: unknown, is_error = false) => ({ role: "user", content: [{ type: "tool_result", is_error, content: [{ type: "text", text: JSON.stringify(value) }] }] });
  const schema = result({ capabilities: [{ input_schema: { properties: { authorization_id: { type: "string", format: "uuid" }, intent_revision: { type: "string" } } } }] });
  const messages = [result({ authorization_id: "original", intent_revision: "2" }), schema,
    { role: "assistant", content: [{ type: "tool_use", input: { authorization_id: "invented" } }] },
    { role: "user", content: JSON.stringify({ authorization_id: "user-material" }) }];
  assert.equal(toolField(messages, "authorization_id"), "original");
  assert.equal(toolField([schema], "authorization_id"), undefined);
  assert.equal(toolField(messages, "intent_revision"), "2");
  assert.equal(toolField([...messages, result({ authorization_id: "latest", intent_revision: "6" })], "authorization_id"), "latest");
  assert.equal(toolField([...messages, result({ authorization_id: "rejected" }, true)], "authorization_id"), "original");
  assert.ok(Array.isArray(toolField([schema], "capabilities")), "capability discovery remains readable as a result");
});
