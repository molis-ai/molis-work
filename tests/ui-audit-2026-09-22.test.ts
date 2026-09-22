import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DETAIL_READING_STYLES } from "../apps/workbench/src/styles/detail-reading.ts";
import { CLIENT_NAVIGATION_INBOX_SCRIPT } from "../apps/workbench/src/scripts/client/navigation-inbox.ts";
import { GLOBAL_SEARCH_FACTORY_SCRIPT, takeSearchHits } from "../apps/workbench/src/scripts/client/global-search.ts";
import { TAB_WORKSPACE_FACTORY_SCRIPT, placeLayoutMenu } from "../apps/workbench/src/scripts/client/tab-workspace.ts";
import { pluginSearchRows } from "../apps/workbench/src/plugin-workbench.ts";
import { MICRO_INTERACTION_CLIENT_SCRIPT } from "../packages/design-system/src/styles/micro-interactions.ts";

test("plugin list split keeps the embedded pane on its restored plugin", () => {
  const source = readFileSync(new URL("../apps/workbench/src/scripts/client/initialization.ts", import.meta.url), "utf8");
  assert.match(source, /!tabWorkspace\.isEmbedded\?\.\(\)/);
  assert.match(source, /tabWorkspace\.landAtProjectRoot\(\)/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /isEmbedded: \(\) => embedded/);
});

test("search hits dedupe by plugin and id before the cap", () => {
  const duplicate = { plugin: "Pages", id: "page-a", search: "jev 的三个待验证问题" };
  const sameTitle = { plugin: "Pages", id: "page-b", search: "jev 的三个待验证问题" };
  const otherPlugin = { plugin: "Feed", id: "page-a", search: "jev 的三个待验证问题" };
  const hits = takeSearchHits([duplicate, duplicate, sameTitle, otherPlugin], "jev", 12);
  assert.deepEqual(hits.map((item) => [item.plugin, item.id]), [
    ["Pages", "page-a"],
    ["Pages", "page-b"],
    ["Feed", "page-a"],
  ]);

  const crowded = [
    { plugin: "Pages", id: "page-a", search: "doc" },
    { plugin: "Pages", id: "page-a", search: "doc" },
    ...Array.from({ length: 12 }, (_, index) => ({ plugin: "Pages", id: "page-" + index, search: "doc" })),
  ];
  const capped = takeSearchHits(crowded, "doc", 12);
  assert.equal(capped.length, 12);
  assert.equal(capped.at(-1)?.id, "page-10");
  assert.equal(takeSearchHits([{ plugin: "Pages", id: "", search: "x" }, { plugin: "Pages", id: "", search: "x" }], "", 8).length, 2);
  assert.match(GLOBAL_SEARCH_FACTORY_SCRIPT, /takeSearchHits\(items, q, limit\)/);
  assert.equal(pluginSearchRows().find((row) => row[0] === "pages")?.[1], "button.feed-stage-entry[data-page-id]");
});

test("layout menu stays inside a short viewport and scrolls when it is taller", () => {
  const short = placeLayoutMenu(
    { top: 4, bottom: 28, right: 240 },
    { width: 260, height: 267 },
    { width: 1024, height: 340 },
  );
  assert.ok(short.top >= 8, "top " + short.top);
  assert.ok(short.top + 267 <= 340 - 8, "bottom " + (short.top + 267));
  assert.equal(short.maxHeight, null);
  assert.ok(short.left >= 8 && short.left + 260 <= 1024 - 8);

  const tall = placeLayoutMenu(
    { top: 4, bottom: 28, right: 240 },
    { width: 260, height: 500 },
    { width: 1024, height: 340 },
  );
  assert.equal(tall.maxHeight, 340 - 16);
  assert.equal(tall.top, 8);
  assert.ok(tall.top + tall.maxHeight <= 340 - 8);

  const desktop = placeLayoutMenu(
    { top: 40, bottom: 80, right: 400 },
    { width: 260, height: 267 },
    { width: 1440, height: 900 },
  );
  assert.equal(desktop.top, 86);
  assert.equal(desktop.left, 140);
  assert.equal(desktop.maxHeight, null);
  assert.doesNotMatch(TAB_WORKSPACE_FACTORY_SCRIPT, /innerHeight - 360/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /scrollIntoView\(\{ block: "nearest" \}\)/);
});

test("inbox rows stay in tab order and the detail title can use the detail width", () => {
  assert.match(CLIENT_NAVIGATION_INBOX_SCRIPT, /const syncInboxRowTab = \(\) =>/);
  assert.match(CLIENT_NAVIGATION_INBOX_SCRIPT, /syncInboxRowTab\(\);/);
  assert.doesNotMatch(CLIENT_NAVIGATION_INBOX_SCRIPT, /row\.tabIndex = selected \? 0 : -1/);
  assert.match(DETAIL_READING_STYLES, /\[data-inbox-workbench\] \.inbox-reference-detail > \.feed-detail-header h1 \{ width: 100%; max-width: none; \}/);
  assert.doesNotMatch(DETAIL_READING_STYLES, /\[data-inbox-workbench\][^{]*font-size/);
});

test("modifier enter submits the focused enabled button and leaves other dialogs on the plain request", () => {
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /form\.requestSubmit\(focused\)/);
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /else form\.requestSubmit\(\)/);
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /!button\.disabled && button\.form === form/);
});
