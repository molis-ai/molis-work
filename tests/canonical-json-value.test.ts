import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJsonValue } from "@molis-ai/molis-work-plugin-sdk";

test("CLN-06 canonical JSON keeps existing request comparison and fingerprint inputs", () => {
  const input = Object.freeze({ z: Object.freeze([{ b: 2, a: 1 }, undefined, null]), a: { z: undefined, c: false, b: "" } });
  assert.equal(JSON.stringify(canonicalJsonValue(input)), '{"a":{"b":"","c":false},"z":[{"a":1,"b":2},null,null]}');
  assert.equal(JSON.stringify(input), '{"z":[{"b":2,"a":1},null,null],"a":{"c":false,"b":""}}');
  assert.equal(JSON.stringify(canonicalJsonValue({ z: 1, a: { x: 2, b: 3 } })), JSON.stringify(canonicalJsonValue({ a: { b: 3, x: 2 }, z: 1 })));
  assert.notEqual(JSON.stringify(canonicalJsonValue([1, 2])), JSON.stringify(canonicalJsonValue([2, 1])));
  assert.deepEqual(canonicalJsonValue({ b: undefined, a: [undefined, null] }), { a: [undefined, null], b: undefined });
});
