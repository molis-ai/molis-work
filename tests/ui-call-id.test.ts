import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as kernel from "@molis-ai/molis-work-kernel";
import { shortCallId } from "@molis-ai/molis-work-ui-host";

// W3-01 F: how a diagnostic id looks to a person is a question for the pages that show it, so the one definition lives with the UI
// package (the workbench cannot import the kernel). The kernel keeps the number and nothing about how it is shown.
test("a diagnostic id is shown as its first eight characters, which is also what a person pastes back to find it", () => {
  const id = randomUUID();
  assert.equal(shortCallId(id), id.slice(0, 8));
  assert.equal(shortCallId(id).length, 8);
  assert.equal(shortCallId("abcd"), "abcd", "a shorter text is shown whole");
  assert.equal(shortCallId(""), "");
});

test("the kernel does not also export how an id is shown", () => {
  assert.equal("shortCallId" in kernel, false);
  assert.equal(typeof kernel.newCallId, "function", "it still hands out the numbers");
});
