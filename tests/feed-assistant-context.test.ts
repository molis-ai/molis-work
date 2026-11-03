import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { registration as feedRegistration } from "@molis-ai/molis-work-plugin-feed/registration";

// The Assistant and the placement bar read the open object from `data-assistant-context`; Feed opens many kinds of
// entries in one surface, so the workbench cannot declare it on Feed's behalf (contextual-interaction plugin-read audit).
test("Feed names the open message as a feed_item on its surface and drops it when the reader closes", () => {
  const script = readFileSync(new URL("../plugins/native/feed/src/browser/stage.ts", import.meta.url), "utf8");
  const factory = feedRegistration.workbench!.clientFactory!;
  assert.equal(feedRegistration.workbench!.clientMounts, "surfaces");
  assert.match(factory, /data-assistant-context/);
  assert.match(factory, /feed_item/);
  assert.match(script, /plugin_id: "io\.molis\.work\.feed"/);
  // The same id search and feed.subject.read use: the item id, not the list entry id.
  assert.match(script, /const itemId = row\.dataset\.feedItemId \|\| id, persisted = row\.dataset\.feedEntryPersisted === "true"/);
  assert.match(script, /persisted \? \{ object: \{ kind: "feed_item", id: itemId, title: row\.dataset\.feedEntryTitle \|\| ""/);
  // Opening names it, the loaded detail adds its revision, collapsing clears it.
  assert.match(script, /expanded\(true\);[\s\S]*?publish\(\);[\s\S]*?await host\.view\.readDocument[\s\S]*?if \(selected !== id \|\| detailRequest !== controller\) return;[\s\S]*?publish\(\);/);
  assert.match(script, /revision > 0 \? \{ version: revision \} : \{\}/);
  const collapse = script.slice(script.indexOf("const collapse ="), script.indexOf("const placeholder ="));
  assert.match(collapse, /host\.root\.setAttribute\("data-assistant-context", JSON\.stringify\(\{ plugin_id: "io\.molis\.work\.feed", surface_title: "Feed" \}\)\)/);
  assert.doesNotMatch(collapse, /object:|kind: "feed_item"/);
  assert.match(script, /host\.root\.setAttribute\("data-assistant-context"/);
});
