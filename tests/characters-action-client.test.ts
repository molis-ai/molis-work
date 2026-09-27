import assert from "node:assert/strict";
import test from "node:test";
import { CHARACTER_ACTION_CLIENT } from "../plugins/native/characters/src/action-client.ts";

// The page's markup can come from an older Characters release (installed app) while the script is current: the release of
// 2026-09-23 has the editor but no action fields. The script used to stop there, and every handler set up after it was dead.
test("Characters action fields missing from older markup do not stop the page, and a saved draft keeps its action choice", async () => {
  const view = (new Function("return " + CHARACTER_ACTION_CLIENT)())({ q: () => null, request: async () => { throw new Error("not called"); }, changed: () => {} });
  const chosen = [{ capability_id: "generated.82933d7e.notes.add", version: 1, provider_id: "plugin:x" }];
  view.render(chosen);
  assert.deepEqual(view.value(), chosen, "what the draft already had is saved back unchanged");
  view.render(null);
  assert.equal(view.value(), null);
  await view.refresh();
  view.controls(true);
  assert.equal(view.describe(null), "沿用任务选择");
  assert.equal(view.describe(chosen), "generated.82933d7e.notes.add · v1");
});
