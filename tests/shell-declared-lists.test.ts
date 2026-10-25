// W5-02 PR-D (PG-073, PG-076): the shell's lists of rows, tab titles, rail order and settings data are what the plugins declare.
// The page scripts keep no row of their own for a plugin: the platform's own and the one the Feed source directory still owns are named in
// `search-rows.ts`, and a record's tab title is read from the row its plugin declared.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CLIENT_SCRIPT, pluginWorkbenchPacks } from "@molis-ai/molis-work-app-workbench";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../apps/workbench/src/${path}`, import.meta.url)), "utf8");
const pack = (id: string) => pluginWorkbenchPacks().find(item => item.project_plugin_id === id);

test("RAC-690 Pages finds its rows by its own attribute, not by a class that belongs to Feed's list", () => {
  assert.deepEqual(pack("pages")?.searchRow, { selector: "button[data-page-id]", idDataset: "pageId" });
  for (const item of pluginWorkbenchPacks()) {
    assert.doesNotMatch(item.searchRow?.selector ?? "", /feed-stage/u, `${item.project_plugin_id} declares a row by Feed's class`);
  }
});

test("RAC-691 the page scripts list no search row by plugin; the two outside the declarations are named in one place and still reach the page", () => {
  for (const file of ["scripts/client/tab-workspace.ts", "scripts/client/global-search.ts"]) {
    const text = source(file);
    assert.doesNotMatch(text, /"characters"|data-character-id|data-feed-task-toggle/u, `${file} lists a row by plugin`);
  }
  const named = source("search-rows.ts");
  assert.match(named, /CHARACTERS_SEARCH_ROW[^\n]*\["characters", "\[data-character-id\]", "characterId"\]/u);
  assert.match(named, /FEED_SOURCE_SEARCH_ROW[^\n]*\["feed", "\[data-feed-task-toggle\]", "feedTaskToggle"\]/u);
  assert.ok(CLIENT_SCRIPT.includes("[data-character-id]") && CLIENT_SCRIPT.includes("[data-feed-task-toggle]"), "both rows are written into the page");
});

test("RAC-692 a record's tab title is read from the row its plugin declared, not from Feed's and Inbox's selectors", () => {
  const text = source("scripts/client/tab-workspace.ts");
  assert.doesNotMatch(text, /data-feed-entry-id|data-inbox-row|data-inbox-entry-id/u);
  assert.deepEqual(pack("feed")?.recordRow, { selector: "[data-feed-entry-id]", idDataset: "feedEntryId" });
  assert.deepEqual(pack("inbox")?.recordRow, { selector: "[data-inbox-row][data-inbox-entry-id]", idDataset: "inboxEntryId" });
  assert.match(text, /RECORD_ROWS\.find\(\(\[id\]\) => id === plugin\)/u);
});
