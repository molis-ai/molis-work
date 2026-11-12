import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { characterActionClient } from "../apps/workbench/src/browser/characters/action-client.ts";
import { installTextForTest, parseLocalePack, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

// The page's markup can come from an older Characters release (installed app) while the script is current: the release of
// 2026-09-23 has the editor but no action fields. The script used to stop there, and every handler set up after it was dead.
test("Characters action fields missing from older markup do not stop the page, and a saved draft keeps its action choice", async () => {
  const view = characterActionClient({ q: () => null, request: async () => { throw new Error("not called"); }, changed: () => {} });
  const chosen = [{ capability_id: "generated.82933d7e.notes.add", version: 1, provider_id: "plugin:x" }];
  view.render(chosen);
  assert.deepEqual(view.value(), chosen, "what the draft already had is saved back unchanged");
  view.render(null);
  assert.equal(view.value(), null);
  await view.refresh();
  view.controls(true);
  const file = new URL("../apps/workbench/resources/locales/zh.json", import.meta.url);
  const pack = parseLocalePack(readFileSync(file, "utf8"), { file: file.pathname });
  assert.ok(pack.ok);
  const restore = installTextForTest({ locale: "zh", packs: [pack.value] });
  Object.assign(globalThis, { t: uiText });
  try { assert.equal(view.describe(null), "沿用任务选择"); }
  finally { restore(); Reflect.deleteProperty(globalThis, "t"); }
  assert.equal(view.describe(chosen), "generated.82933d7e.notes.add · v1");
});
