import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_NAVIGATION_FEED_SCRIPT } from "../apps/workbench/src/scripts/client/navigation-feed.ts";

// The Assistant and the placement bar read the open object from `data-assistant-context`; Feed opens many kinds of
// entries in one surface, so the workbench cannot declare it on Feed's behalf (contextual-interaction plugin-read audit).
test("Feed names the open message as a feed_item on its surface and drops it when the reader closes", () => {
  const script = CLIENT_NAVIGATION_FEED_SCRIPT;
  assert.match(script, /plugin_id: "io\.molis\.work\.feed"/);
  // The same id search and feed.subject.read use: the item id, not the list entry id.
  assert.match(script, /context\.object = \{ kind: "feed_item", id: itemId, title: row\.dataset\.feedEntryTitle \|\| "" \}/);
  assert.match(script, /row\.dataset\.feedEntryPersisted === "true" \? \(row\.dataset\.feedItemId \|\| row\.dataset\.feedEntryId\)/);
  // Opening names it, the loaded detail adds its revision, collapsing clears it.
  assert.match(script, /expandFeedStage\(true\);\s*publishFeedContext\(selectedRow\);/);
  assert.match(script, /if \(selectedFeedItem === entryId\) publishFeedContext\(row\);/);
  assert.match(script, /if \(feedDetailEmpty\) feedDetailEmpty\.hidden = true;\s*publishFeedContext\(null\);/);
  assert.match(script, /querySelector\("\[data-feed-stage-shell\]"\)/);
});
