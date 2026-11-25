// The platform services batch 106 adds for the unified partitions (specs/unified-partition-plugins §4.1, §5, §6.1): the due registry with
// 95-3's seven-day expiry, the evidence ledger, and how both follow a partition's and an installation's lifecycle.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RUN_MISSED_KEPT_MS } from "@molis-ai/molis-work-contracts/platform/actions";
import { forgetInstallationPlatformRecords, forgetPartitionPlatformRecords } from "@molis-ai/molis-work-app-local-host";
import { DUE_ENTRY_LIMIT, openDueRegistry } from "@molis-ai/molis-work-service-scheduler";
import { EVIDENCE_COLLECT_PERMISSION, openEvidenceLedger } from "@molis-ai/molis-work-service-evidence";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { checkOverviewRow, overviewColumns } from "@molis-ai/molis-work-plugin-sdk";

const A = { install_id: "todo-install", plugin_id: "io.molis.work.todo", partition_id: "personal" };
const B = { ...A, partition_id: "project-b" };
const ref = (n: number) => `molis-work-evidence/sha256/${n.toString(16).padStart(64, "0")}`;

async function withHome(run: (home: string) => void | Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-partition-services-"));
  try { await run(home); } finally { await rm(home, { recursive: true, force: true }); }
}

test("UPP-31 the due registry gives back what is due, once, in the order it falls due; a later entry waits", async () => withHome(home => {
  let now = new Date("2026-11-24T10:00:00.000Z");
  const due = openDueRegistry(home, { now: () => now });
  try {
    due.register(A, { entry_key: "remind:1", due_at: "2026-11-24T10:05:00+00:00" });
    due.register(B, { entry_key: "remind:2", due_at: "2026-11-24T10:01:00.000Z" });
    due.register(A, { entry_key: "later", due_at: "2026-11-25T10:00:00.000Z" });
    assert.equal(due.next(), "2026-11-24T10:01:00.000Z");
    assert.deepEqual(due.takeDue(), { due: [], expired: [] }, "nothing yet");
    now = new Date("2026-11-24T10:06:00.000Z");
    const taken = due.takeDue();
    assert.deepEqual(taken.due.map(entry => [entry.partition_id, entry.entry_key, entry.due_at]),
      [["project-b", "remind:2", "2026-11-24T10:01:00.000Z"], ["personal", "remind:1", "2026-11-24T10:05:00.000Z"]]);
    assert.deepEqual(due.takeDue().due, [], "an entry is given back once");
    assert.equal(due.entries().length, 1);
    due.register(A, { entry_key: "later", due_at: "2026-11-24T11:00:00.000Z" });
    assert.equal(due.entries()[0]!.due_at, "2026-11-24T11:00:00.000Z", "registering the same key moves it");
    assert.throws(() => due.register(A, { entry_key: "bad", due_at: "tomorrow" }), { code: "actions.input_invalid" });
    assert.throws(() => due.register({ ...A, partition_id: "" }, { entry_key: "x", due_at: now.toISOString() }), { code: "actions.input_invalid" });
  } finally { due.close(); }
}));

test("UPP-31 95-3's rule belongs to the due registry: an entry reached seven days after its time is kept as expired and not run", async () => withHome(home => {
  const start = Date.parse("2026-11-01T08:00:00.000Z");
  let now = new Date(start);
  const due = openDueRegistry(home, { now: () => now });
  try {
    due.register(A, { entry_key: "missed", due_at: new Date(start).toISOString() });
    due.register(A, { entry_key: "late", due_at: new Date(start + 60_000).toISOString() });
    now = new Date(start + RUN_MISSED_KEPT_MS);
    const taken = due.takeDue();
    assert.deepEqual(taken.expired.map(entry => entry.entry_key), ["missed"], "exactly seven days past its time");
    assert.deepEqual(taken.due.map(entry => entry.entry_key), ["late"], "a minute less is still run");
    assert.deepEqual(due.expired().map(entry => entry.entry_key), ["missed"]);
  } finally { due.close(); }
}));

test("UPP-34 a reminder read from the overview table rings once, also after the table is read again; the plugin's own entries are untouched", async () => withHome(home => {
  let now = new Date("2026-11-24T10:00:00.000Z");
  const due = openDueRegistry(home, { now: () => now });
  try {
    due.register(A, { entry_key: "own", due_at: "2026-11-24T12:00:00.000Z" });
    const reminders = [{ entry_key: "task:1", due_at: "2026-11-24T10:30:00.000Z" }, { entry_key: "task:2", due_at: "2026-11-24T11:00:00.000Z" }];
    due.replaceOverview(A, reminders);
    now = new Date("2026-11-24T10:31:00.000Z");
    assert.deepEqual(due.takeDue().due.map(entry => [entry.source, entry.entry_key]), [["overview", "task:1"]]);
    due.replaceOverview(A, reminders);
    assert.deepEqual(due.entries().map(entry => [entry.source, entry.entry_key]), [["overview", "task:2"], ["plugin", "own"]], "task:1 was rung: read again, it is not due again");
    due.replaceOverview(A, [{ entry_key: "task:1", due_at: "2026-11-24T10:45:00.000Z" }]);
    assert.deepEqual(due.entries().map(entry => [entry.source, entry.entry_key, entry.due_at]),
      [["overview", "task:1", "2026-11-24T10:45:00.000Z"], ["plugin", "own", "2026-11-24T12:00:00.000Z"]], "a new time is a new reminder; task:2 left the table");
    assert.throws(() => due.replaceOverview(A, Array.from({ length: DUE_ENTRY_LIMIT + 1 }, (_, i) => ({ entry_key: `k${i}`, due_at: now.toISOString() }))), { code: "actions.input_invalid" });
  } finally { due.close(); }
}));

test("the evidence ledger: a body held in any partition is kept; only the platform's collection path deletes bodies nobody holds", async () => withHome(home => {
  const ledger = openEvidenceLedger(home);
  try {
    const feedA = { partition_id: "project-a", owner_install: "feed-install", holder_key: "source:1" };
    const feedB = { ...feedA, partition_id: "project-b" };
    assert.equal(ledger.hold(feedA, [ref(1), ref(2), ref(1)]), 2, "holding one twice is one hold");
    assert.equal(ledger.hold(feedB, [ref(2)]), 1);
    assert.throws(() => ledger.hold(feedA, ["../../etc/passwd"]), { code: "actions.input_invalid" });
    const deleted: string[] = [];
    const content = { collect: ({ candidates, isReferenced }: { candidates: Iterable<string>; isReferenced(r: string): boolean }) => {
      const kept: string[] = [];
      for (const candidate of candidates) (isReferenced(candidate) ? kept : deleted).push(candidate);
      return { deleted: [...deleted], kept };
    } };
    assert.throws(() => ledger.collect({ permissions: ["storage:private"] }, content, [ref(3)]), { code: "actions.forbidden" }, "a caller without evidence:collect cannot collect");
    assert.deepEqual(ledger.releasePartition("project-a"), [ref(1), ref(2)]);
    assert.deepEqual(ledger.collect({ permissions: [EVIDENCE_COLLECT_PERMISSION] }, content, [ref(1), ref(2)]), { deleted: [ref(1)], kept: [ref(2)] },
      "the body project B still holds is kept");
    assert.deepEqual(ledger.releaseInstall("feed-install", "project-b"), [ref(2)]);
    assert.equal(ledger.isHeld(ref(2)), false);
  } finally { ledger.close(); }
}));

test("a partition's deletion takes its due entries and evidence holds; an uninstall takes them there, and never creates a library nobody wrote", async () => withHome(home => {
  forgetPartitionPlatformRecords(home, "project-a");
  forgetInstallationPlatformRecords(home, A.install_id, "project-a", { dataGoes: true, installedElsewhere: false });
  for (const store of ["due-registry", "evidence", "person-settings", "search"]) assert.equal(existsSync(homeSqlitePath(home, store)), false, `${store} is not made by a cleanup`);
  const due = openDueRegistry(home), ledger = openEvidenceLedger(home);
  try {
    due.register({ ...A, partition_id: "project-a" }, { entry_key: "r", due_at: "2026-12-01T00:00:00.000Z" });
    due.register(B, { entry_key: "r", due_at: "2026-12-01T00:00:00.000Z" });
    ledger.hold({ partition_id: "project-a", owner_install: A.install_id, holder_key: "k" }, [ref(1)]);
    ledger.hold({ partition_id: "project-b", owner_install: A.install_id, holder_key: "k" }, [ref(2)]);
  } finally { due.close(); ledger.close(); }
  forgetPartitionPlatformRecords(home, "project-a");
  forgetInstallationPlatformRecords(home, A.install_id, "project-b", { dataGoes: false, installedElsewhere: true });
  const after = openDueRegistry(home), held = openEvidenceLedger(home);
  try {
    assert.deepEqual(after.entries().map(entry => entry.partition_id), [], "the uninstall took its entries in B, the deletion those in A");
    assert.equal(held.isHeld(ref(1)), false, "A's holds went with A");
    assert.equal(held.isHeld(ref(2)), true, "an uninstall that keeps the data keeps its holds");
  } finally { after.close(); held.close(); }
}));

test("UPP-34 one overview row check: what the SDK refuses to write is what the platform leaves out when it reads", () => {
  const at = "2026-11-24T09:00:00.000Z", base = { row_id: "r1", title: "标题", updated_at: at };
  const valid = [["task", { ...base, status: "open", priority: 2, tags: ["家"], remind_at: "2026-11-25T09:00:00+08:00" }],
    ["event", { ...base, starts_at: at, ends_at: at, all_day: false }], ["notification", { ...base, level: "urgent", occurred_at: at }], ["brief", { ...base, summary: "摘要" }]] as const;
  for (const [kind, row] of valid) assert.ok("columns" in checkOverviewRow(kind, row), kind);
  assert.deepEqual(overviewColumns("task", { ...base, status: "done", tags: ["家"] }), { kind: "task", row_id: "r1", title: "标题", updated_at: at, status: "done",
    due_at: null, remind_at: null, priority: null, tags_json: "[\"家\"]" }, "only the kind's own columns");
  for (const [kind, row, why] of [
    ["task", { ...base, status: "open", remind_at: "2026-11-30 08:00" }, "a time without a time zone"],
    ["task", { ...base, status: "later" }, "a status the platform does not know"],
    ["task", { ...base, status: "open", priority: 4 }, "a priority past 3"],
    ["task", { ...base, status: "open", tags: Array.from({ length: 17 }, (_, i) => `t${i}`) }, "too many tags"],
    ["event", { ...base, starts_at: at, ends_at: "2026-11-23T09:00:00.000Z" }, "an end before the start"],
    ["notification", { ...base, level: "loud", occurred_at: at }, "a level the platform does not know"],
    ["brief", { ...base, summary: "x".repeat(2_001) }, "a summary past its limit"],
    ["brief", { row_id: "r1", updated_at: at }, "no title"],
    ["memo", base, "a kind the platform does not have"],
  ] as const) {
    assert.ok("problem" in checkOverviewRow(kind, row), why);
    assert.throws(() => overviewColumns(kind as "task", row as never), { code: "actions.input_invalid" }, why);
  }
});
