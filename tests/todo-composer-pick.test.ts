import assert from "node:assert/strict";
import test from "node:test";
import { todoPicks } from "@molis-ai/molis-work-plugin-todo";

type Item = Parameters<typeof todoPicks>[0][number];

const item = (id: string, title: string, more: Partial<Item> = {}): Item => ({
  id, title, notes: "", status: "open", placement: "project", project_id: "p1", due_date: null, due_time: null, planned_date: null,
  remind_at: null, reminder_acknowledged_at: null, important: false, waiting: null, sources: [], links: [], edited_fields: [],
  archived_at: null, completed_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", revision: 1, ...more,
});

// specs/unified-input-voice K5 (UIV-13): what Todo's composer source (`todo.composer.pick@1`) offers for what was typed.
test("UIV-13 K5: ＋ offers only todos still to do, by title in any case, the ones due first, each pinned to the revision read", () => {
  const items = [
    item("later", "Review the release notes", { updated_at: "2026-11-05T00:00:00Z" }),
    item("soon", "review budget", { due_date: "2026-11-12", due_time: "09:30", revision: 4 }),
    item("sooner", "Reviewing plan", { due_date: "2026-11-11", status: "doing" }),
    item("done", "Review done", { status: "done" }),
    item("cancelled", "Review cancelled", { status: "cancelled" }),
    item("archived", "Review archived", { archived_at: "2026-11-02T00:00:00Z" }),
    item("other", "Book the room"),
  ];
  const found = todoPicks(items, { query: "  REVIEW ", limit: 10 }).items;
  assert.deepEqual(found.map(one => one.ref.subject.id), ["sooner", "soon", "later"], "finished, cancelled and archived ones are not offered; due first");
  assert.deepEqual(found[1], {
    ref: { subject: { kind: found[1]!.ref.subject.kind, id: "soon" }, pin: { mode: "current", read_revision: "4" } },
    title: "review budget", hint: "2026-11-12 09:30",
  });
  assert.equal("hint" in found[2]!, false, "no due date, no hint");
  assert.equal(todoPicks(items, { query: "", limit: 2 }).items.length, 2, "nothing typed: all still to do, up to the limit");
  assert.deepEqual(todoPicks(items, { query: "nothing like it", limit: 10 }).items, []);
});
