import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderInboxWorkbench } from "@molis-ai/molis-work-plugin-inbox";
import { registration as inboxRegistration } from "@molis-ai/molis-work-plugin-inbox/registration";

import { MICRO_INTERACTION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { chinesePagePacks, pageTextForPacks, pageTextScriptForPacks, withPagePacks } from "./fixtures/page-text-packs.js";

test("inbox rows stay in tab order when one is selected", () => {
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
  const document = Object.assign(new EventTarget(), { documentElement: {} });
  const root = Object.assign(new EventTarget(), { dataset: {}, isConnected: true, ownerDocument: document,
    querySelector: () => null, querySelectorAll: (selector: string) => selector === "[data-inbox-row]" ? rows : [] });
  const factory = runInNewContext(pageTextScriptForPacks("zh", packs) + "\n(" + inboxRegistration.workbench!.clientFactory! + ")", {
    AbortController, DOMException, document, CSS: { escape: (value: string) => value },
    sessionStorage: { getItem: () => null, setItem() {} }, molisWorkRequest: async () => ({ results: [] }),
  });
  factory({ root, scope: { alive: true, visible: true, assertCurrent() {}, own() {}, frame() {}, whenVisible(start: () => void) { start(); } },
    route: (path: string) => path, pluginRoute: (path: string) => path, showToast() {} });
  root.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: "first" } }));
  assert.deepEqual(rows.map(row => row.attributes.get("aria-selected")), ["true", "false"], "the real owner selected the first row");
  assert.deepEqual(rows.map(row => row.tabIndex), [0, 0], "selection must not remove the other visible row from Tab navigation");
});

test("modifier enter submits the focused enabled button and leaves other dialogs on the plain request", () => {
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /form\.requestSubmit\(focused\)/);
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /else form\.requestSubmit\(\)/);
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /!button\.disabled && button\.form === form/);
});
