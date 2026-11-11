import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderInboxWorkbench } from "@molis-ai/molis-work-plugin-inbox";
import { registration as inboxRegistration } from "@molis-ai/molis-work-plugin-inbox/registration";

import { DETAIL_READING_STYLES } from "../apps/workbench/src/styles/detail-reading.ts";
import { GLOBAL_SEARCH_FACTORY_SCRIPT, takeSearchHits } from "../apps/workbench/src/scripts/client/global-search.ts";
import { TAB_WORKSPACE_FACTORY_SCRIPT, placeLayoutMenu } from "../apps/workbench/src/scripts/client/tab-workspace.ts";
import { pluginSearchRows } from "../apps/workbench/src/plugin-workbench.ts";
import { MICRO_INTERACTION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { chinesePagePacks, pageTextForPacks, pageTextScriptForPacks, withPagePacks } from "./fixtures/page-text-packs.js";

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
  assert.equal(pluginSearchRows().find((row) => row[0] === "pages")?.[1], "button[data-page-id]");
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
  const packs = chinesePagePacks("inbox");
  const html = withPagePacks("zh", packs, () => renderInboxWorkbench({ route_prefix: "/projects/ui-audit", filter: "active",
    primitives: { escape: value => String(value ?? ""), icon: () => "", text: pageTextForPacks("zh", packs), formatDate: value => value },
    entries: ["first", "second"].map(id => ({ entry_id: id, revision: 1, subject_type: "feed_item", subject_id: id, reason: "manual", status: "open",
      kind_label: "Inbox", source_label: "Feed", title: id, reason_label: "Manual", relation_label: "Feed", next_action: "Read", status_label: "Open",
      updated_at: "2026-09-22T00:00:00.000Z", available: true, open: null, attention_rank: 2, suggested_behavior_ids: [] })) }));
  const rows = [...html.matchAll(/<button\b[^>]*data-inbox-row[^>]*>/g)].map(([tag]) => ({
    dataset: { inboxEntryId: tag.match(/data-inbox-entry-id="([^"]+)"/)![1]! },
    tabIndex: Number(tag.match(/tabindex="([^"]+)"/)?.[1] ?? 0),
    attributes: new Map<string, string>(), classList: { toggle() {} },
    setAttribute(name: string, value: string) { this.attributes.set(name, value); },
  }));
  assert.deepEqual(rows.map(row => row.tabIndex), [0, 0], "both visible rows render as native tab stops");
  // T403 moved selection into this registered owner. Execute that factory, rather than matching the retired helper name.
  const root = Object.assign(new EventTarget(), { dataset: {}, isConnected: true,
    querySelector: () => null, querySelectorAll: (selector: string) => selector === "[data-inbox-row]" ? rows : [] });
  const factory = runInNewContext(pageTextScriptForPacks("zh", packs) + "\n(" + inboxRegistration.workbench!.clientFactory! + ")", {
    AbortController, DOMException, document: { documentElement: {} }, CSS: { escape: (value: string) => value },
    sessionStorage: { getItem: () => null, setItem() {} }, molisWorkRequest: async () => ({ results: [] }),
  });
  factory({ root, scope: { alive: true, visible: true, assertCurrent() {}, own() {}, frame() {}, whenVisible(start: () => void) { start(); } },
    route: (path: string) => path, pluginRoute: (path: string) => path, showToast() {} });
  root.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: "first" } }));
  assert.deepEqual(rows.map(row => row.attributes.get("aria-selected")), ["true", "false"], "the real owner selected the first row");
  assert.deepEqual(rows.map(row => row.tabIndex), [0, 0], "selection must not remove the other visible row from Tab navigation");
  assert.match(DETAIL_READING_STYLES, /\[data-inbox-workbench\] \.inbox-reference-detail > \.feed-detail-header h1 \{ width: 100%; max-width: none; \}/);
  assert.doesNotMatch(DETAIL_READING_STYLES, /\[data-inbox-workbench\][^{]*font-size/);
});

test("modifier enter submits the focused enabled button and leaves other dialogs on the plain request", () => {
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /form\.requestSubmit\(focused\)/);
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /else form\.requestSubmit\(\)/);
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /!button\.disabled && button\.form === form/);
});
