import { refreshedOverview } from "./fixtures/overview-read.js";
// The platform services batch 106 adds for the unified partitions (specs/unified-partition-plugins §4.1, §5, §6.1): the due registry with
// 95-3's seven-day expiry, the evidence ledger, and how both follow a partition's and an installation's lifecycle.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, RUN_MISSED_KEPT_MS, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { OVERVIEW_EVENT_WINDOW_DAYS, OVERVIEW_TABLE, OVERVIEW_TABLE_SQL, type PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  createHostObservation, forgetInstallationPlatformRecords, forgetPartitionPlatformRecords, openPartitionPluginLibrary, PartitionPlatformServices, partitionOverviewLibraries, partitionPluginScope,
} from "@molis-ai/molis-work-app-local-host";
import { DUE_ENTRY_LIMIT, DueTimer, openDueRegistry } from "@molis-ai/molis-work-service-scheduler";
import { EVIDENCE_COLLECT_PERMISSION, openEvidenceLedger } from "@molis-ai/molis-work-service-evidence";
import { openPersonSettings } from "@molis-ai/molis-work-service-person-settings";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { overviewReaderKind } from "@molis-ai/molis-work-service-search";
import { createEvidenceContentStore, homeSqlitePath, openOverviewIndex, type SecretStore } from "@molis-ai/molis-work-storage";
import {
  checkOverviewRow, overviewColumns, overviewEventWindowEnd, overviewRows, parsePluginManifest, partitionDeclarationProblems, type PartitionDeclarationFields,
} from "@molis-ai/molis-work-plugin-sdk";
import { directoryPackProblems } from "@molis-ai/molis-work-plugin-sdk/ui";

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
    assert.deepEqual(due.dueNow(), { due: [], expired: [] }, "nothing yet");
    now = new Date("2026-11-24T10:06:00.000Z");
    const taken = due.dueNow();
    assert.deepEqual(taken.due.map(entry => [entry.partition_id, entry.entry_key, entry.due_at]),
      [["project-b", "remind:2", "2026-11-24T10:01:00.000Z"], ["personal", "remind:1", "2026-11-24T10:05:00.000Z"]]);
    // Batch 108: looking is not taking. Until its wake succeeds and it is settled, a due entry stays and is offered again.
    assert.equal(due.dueNow().due.length, 2, "a due entry not yet settled is still due");
    for (const entry of taken.due) assert.equal(due.settle(entry), true);
    assert.equal(due.settle(taken.due[0]!), false, "settling twice settles nothing");
    assert.deepEqual(due.dueNow().due, [], "a settled entry is given back no more");
    assert.equal(due.entries().length, 1);
    due.register(A, { entry_key: "later", due_at: "2026-11-24T11:00:00.000Z" });
    assert.equal(due.entries()[0]!.due_at, "2026-11-24T11:00:00.000Z", "registering the same key moves it");
    assert.throws(() => due.register(A, { entry_key: "bad", due_at: "tomorrow" }), { code: "actions.input_invalid" });
    assert.throws(() => due.register({ ...A, partition_id: "" }, { entry_key: "x", due_at: now.toISOString() }), { code: "actions.input_invalid" });
  } finally { due.close(); }
}));

test("UPP-31 batch 108: a wake that fails keeps its entry and is tried again later, a minute then doubling; only a wake that succeeds settles it", async () => withHome(async home => {
  let now = new Date("2026-11-24T10:00:00.000Z");
  const due = openDueRegistry(home, { now: () => now });
  const woken: string[] = [], failures: string[] = [];
  let failing = true;
  const timer = new DueTimer(due, { now: () => now, failed: entry => { failures.push(entry.entry_key); },
    wake: async entry => { woken.push(entry.entry_key); if (failing) throw new Error("the instance did not start"); } });
  try {
    due.register(A, { entry_key: "remind:1", due_at: "2026-11-24T09:59:00.000Z" });
    await timer.fire();
    assert.deepEqual([woken, failures], [["remind:1"], ["remind:1"]]);
    assert.equal(due.entries().length, 1, "a failed wake leaves the entry in the registry, so a Host that stops now still has it");
    await timer.fire();
    assert.deepEqual(woken, ["remind:1"], "put off for a minute: not tried again at once");
    now = new Date("2026-11-24T10:01:01.000Z");
    await timer.fire();
    assert.deepEqual(failures, ["remind:1", "remind:1"], "tried again after a minute");
    now = new Date("2026-11-24T10:02:30.000Z");
    await timer.fire();
    assert.equal(woken.length, 2, "the second wait is two minutes");
    failing = false;
    now = new Date("2026-11-24T10:03:02.000Z");
    await timer.fire();
    assert.deepEqual([woken.length, due.entries().length], [3, 0], "the wake that succeeds settles it");
  } finally { timer.close(); due.close(); }
}));

test("UPP-31 95-3's rule belongs to the due registry: an entry reached seven days after its time is kept as expired and not run", async () => withHome(home => {
  const start = Date.parse("2026-11-01T08:00:00.000Z");
  let now = new Date(start);
  const due = openDueRegistry(home, { now: () => now });
  try {
    due.register(A, { entry_key: "missed", due_at: new Date(start).toISOString() });
    due.register(A, { entry_key: "late", due_at: new Date(start + 60_000).toISOString() });
    now = new Date(start + RUN_MISSED_KEPT_MS);
    const taken = due.dueNow();
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
    const rung = due.dueNow().due;
    assert.deepEqual(rung.map(entry => [entry.source, entry.entry_key]), [["overview", "task:1"]]);
    for (const entry of rung) due.settle(entry);
    due.replaceOverview(A, reminders);
    assert.deepEqual(due.entries().map(entry => [entry.source, entry.entry_key]), [["overview", "task:2"], ["plugin", "own"]], "task:1 was rung: read again, it is not due again");
    due.replaceOverview(A, [{ entry_key: "task:1", due_at: "2026-11-24T10:45:00.000Z" }]);
    assert.deepEqual(due.entries().map(entry => [entry.source, entry.entry_key, entry.due_at]),
      [["overview", "task:1", "2026-11-24T10:45:00.000Z"], ["plugin", "own", "2026-11-24T12:00:00.000Z"]], "a new time is a new reminder; task:2 left the table");
    assert.throws(() => due.replaceOverview(A, Array.from({ length: DUE_ENTRY_LIMIT + 1 }, (_, i) => ({ entry_key: `k${i}`, due_at: now.toISOString() }))), { code: "actions.input_invalid" });
    assert.throws(() => due.replaceOverview(A, [{ entry_key: "", due_at: now.toISOString() }]), { code: "actions.input_invalid" }, "empty entry_key refused cleanly");
    assert.throws(() => due.replaceOverview(A, [{ entry_key: "x".repeat(201), due_at: now.toISOString() }]), { code: "actions.input_invalid" }, "oversized entry_key refused cleanly");
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
    ["event", { ...base, starts_at: at, time_zone: "Mars/Phobos" }, "an unknown IANA time zone"],
    ["notification", { ...base, level: "loud", occurred_at: at }, "a level the platform does not know"],
    ["brief", { ...base, summary: "x".repeat(2_001) }, "a summary past its limit"],
    ["brief", { row_id: "r1", updated_at: at }, "no title"],
    ["memo", base, "a kind the platform does not have"],
  ] as const) {
    assert.ok("problem" in checkOverviewRow(kind, row), why);
    assert.throws(() => overviewColumns(kind as "task", row as never), { code: "actions.input_invalid" }, why);
  }
  assert.ok("columns" in checkOverviewRow("event", { ...base, starts_at: at, time_zone: "Asia/Shanghai" }), "valid IANA time zone");
  const windowBase = new Date("2026-11-24T00:00:00.000Z");
  assert.equal(overviewEventWindowEnd(windowBase).getTime() - windowBase.getTime(), OVERVIEW_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000, "90-day recurring event window");
});

const TODO_PLUGIN = "io.molis.work.sample-todo";
const todoDb: PluginDatabaseDeclaration = {
  store_name: "todo",
  version: 1,
  schema: `CREATE TABLE todos (id TEXT PRIMARY KEY);\n${OVERVIEW_TABLE_SQL}`,
  read_permission: "todo:read",
  write_permission: "todo:write",
};
const todoManifest = { plugin_id: TODO_PLUGIN, databases: { partition: todoDb }, overview_projection: { kinds: ["task"] } } satisfies PartitionDeclarationFields;
const localPerson = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", actor_kind: "user", permissions: [], project_id: null } as ActionCallContext;
const personalAssistant = { ...localPerson, audience: "agent", actor_kind: "runtime", audit_actor_id: "assistant:work-1" } as ActionCallContext;

function ensurePartition(home: string, partitionId: string): void {
  mkdirSync(partitionId === "personal" ? join(home, "personal-space") : join(home, "projects", partitionId), { recursive: true });
}

function writeOverviewTasks(home: string, partitionId: string, rows: readonly { id: string; title: string; due_at?: string | null; remind_at?: string | null }[]): void {
  ensurePartition(home, partitionId);
  const library = openPartitionPluginLibrary(partitionPluginScope(home, partitionId, TODO_PLUGIN, A.install_id), home, todoDb);
  try {
    const db = library.writer;
    const tx = {
      get: (sql: string, values: readonly unknown[] = []) => (db.prepare(sql).get(...(values as never[])) ?? null) as never,
      all: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).all(...(values as never[])) as never,
      run: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).run(...(values as never[])),
      savepoint: () => { throw new Error("unused"); },
    };
    db.exec("BEGIN");
    for (const row of rows) {
      overviewRows(tx as never).upsert("task", {
        row_id: row.id,
        title: row.title,
        status: "open",
        due_at: row.due_at === undefined ? null : row.due_at,
        remind_at: row.remind_at === undefined ? null : row.remind_at,
        updated_at: "2026-11-24T09:00:00.000Z",
      });
    }
    db.exec("COMMIT");
  } finally { library.close(); }
}

test("UPP-34 V11 partitionChanged immediately refreshes synced reminders read-only into due-registry without opening overview or waking plugins", async () => withHome(async home => {
  ensurePartition(home, "project-a");
  ensurePartition(home, "project-b");
  writeOverviewTasks(home, "project-a", [{ id: "synced-1", title: "同步提醒", remind_at: "2026-11-24T10:05:00.000Z" }]);
  const libraries = partitionOverviewLibraries(home, ["project-a", "project-b"].map(partition_id => ({
    partition_id, plugins: [{ install_id: A.install_id, manifest: todoManifest }],
  })));
  let now = new Date("2026-11-24T10:00:00.000Z");
  const woken: string[] = [];
  const services = new PartitionPlatformServices({
    home,
    now: () => now,
    libraries: partitionId => libraries.filter(lib => lib.partition_id === partitionId),
    assembly: {
      acquire: async (pluginId, partitionId) => {
        woken.push(`${pluginId}@${partitionId}`);
        return { release() {} } as never;
      },
    },
  });
  try {
    // Without ever calling readOverview, partitionChanged reads project-a read-only (zero wakes) and registers its reminder in due-registry.
    services.partitionChanged("project-a");
    assert.deepEqual(woken, [], "partitionChanged never wakes any plugin instance");
    assert.deepEqual(services.due.entries().map(entry => [entry.partition_id, entry.entry_key, entry.due_at]),
      [["project-a", "task:synced-1", "2026-11-24T10:05:00.000Z"]], "synced reminder is immediately registered and armed");
    now = new Date("2026-11-24T10:06:00.000Z");
    await services.timer.fire();
    assert.deepEqual(woken, [`${TODO_PLUGIN}@project-a`], "due timer wakes only the changed partition's plugin instance");
  } finally { services.close(); }
}));

test("UPP-31 Home-level uninstall (partitionId = null) clears due entries, overview rows and evidence holds across every partition", async () => withHome(async home => {
  writeOverviewTasks(home, "personal", [{ id: "p1", title: "个人待办", remind_at: "2026-12-01T08:00:00.000Z" }]);
  writeOverviewTasks(home, "project-a", [{ id: "a1", title: "项目 A 待办", remind_at: "2026-12-01T09:00:00.000Z" }]);
  writeOverviewTasks(home, "project-b", [{ id: "b1", title: "项目 B 待办", remind_at: "2026-12-01T10:00:00.000Z" }]);
  const libraries = partitionOverviewLibraries(home, ["personal", "project-a", "project-b"].map(partition_id => ({
    partition_id, plugins: [{ install_id: A.install_id, manifest: todoManifest }],
  })));
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("unused"); } } });
  try {
    const read = () => services.readOverview(localPerson, libraries, () => ({ readable: ["personal", "project-a", "project-b"], grants: [] }));
    assert.deepEqual(read(), { rows: [], updating: true, refreshing: ["personal", "project-a", "project-b"] });
    assert.equal((await refreshedOverview(read)).rows.length, 3);
    assert.equal(services.due.entries().length, 3);
  } finally { services.close(); }
  const ledger = openEvidenceLedger(home), settings = openPersonSettings(home);
  try {
    ledger.hold({ partition_id: "personal", owner_install: A.install_id, holder_key: "k" }, [ref(10)]);
    ledger.hold({ partition_id: "project-a", owner_install: A.install_id, holder_key: "k" }, [ref(11)]);
    ledger.hold({ partition_id: "project-b", owner_install: A.install_id, holder_key: "k" }, [ref(12)]);
    settings.set(localPerson, { install_id: A.install_id, plugin_id: TODO_PLUGIN }, { keys: [{ key: "pref", kind: "preference" }] }, "pref", "v");
  } finally { ledger.close(); settings.close(); }

  forgetInstallationPlatformRecords(home, A.install_id, null, { dataGoes: true, installedElsewhere: false });

  const dueAfter = openDueRegistry(home), ledgerAfter = openEvidenceLedger(home), indexAfter = openOverviewIndex({ homeDirectory: home }), settingsAfter = openPersonSettings(home);
  try {
    assert.deepEqual(dueAfter.entries(), [], "all partitions' due entries cleared");
    assert.deepEqual(indexAfter.rows({ partitions: ["personal", "project-a", "project-b"], kinds: ["task"], limit: 10 }), [], "all partitions' overview rows cleared");
    assert.equal(ledgerAfter.isHeld(ref(10)), false);
    assert.equal(ledgerAfter.isHeld(ref(11)), false);
    assert.equal(ledgerAfter.isHeld(ref(12)), false);
    assert.deepEqual(settingsAfter.list(localPerson, A.install_id), [], "person settings cleared when last installation goes");
  } finally { dueAfter.close(); ledgerAfter.close(); indexAfter.close(); settingsAfter.close(); }
}));

test("UPP-06 overview-readers enforces assistant audit_actor_id, calling_plugin_id, authorized-only dirty refresh, empty-field row suppression and UTC sort_at order", async () => withHome(home => {
  assert.equal(overviewReaderKind(localPerson), "person");
  assert.equal(overviewReaderKind(personalAssistant), "assistant");
  for (const [label, forged] of [
    ["assistant missing audit_actor_id", { ...localPerson, audience: "agent", actor_kind: "runtime" }],
    ["assistant empty work id", { ...localPerson, audience: "agent", actor_kind: "runtime", audit_actor_id: "assistant:" }],
    ["project agent runtime audit_actor_id", { ...localPerson, audience: "agent", actor_kind: "runtime", audit_actor_id: "agent:rt:s1" }],
    ["person with calling_plugin_id", { ...localPerson, calling_plugin_id: TODO_PLUGIN }],
    ["assistant with calling_plugin_id", { ...personalAssistant, calling_plugin_id: TODO_PLUGIN }],
  ] as const) {
    assert.equal(overviewReaderKind(forged as ActionCallContext), null, label);
  }

  // Write two tasks in project-a with different timezones (+08:00 is 02:00Z, earlier than 05:00Z), and one task without due_at; plus a task with a reminder in project-b.
  writeOverviewTasks(home, "project-a", [
    { id: "later-z", title: "UTC 05:00", due_at: "2026-12-01T05:00:00.000Z" },
    { id: "earlier-plus8", title: "+08:00 10:00 (02:00Z)", due_at: "2026-12-01T10:00:00+08:00" },
    { id: "no-due", title: "无截止时间", due_at: null },
  ]);
  writeOverviewTasks(home, "project-b", [{ id: "b1", title: "B 机密", remind_at: "2026-12-02T09:00:00.000Z" }]);
  const libraries = partitionOverviewLibraries(home, ["project-a", "project-b"].map(partition_id => ({
    partition_id, plugins: [{ install_id: A.install_id, manifest: todoManifest }],
  })));
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("never woken"); } } });
  try {
    // Assistant only granted project-a's due_at: project-b must NOT be refreshed or opened, and row `no-due` (empty allowed fields) must be dropped without leaking row_id!
    const { rows } = services.readOverview(personalAssistant, libraries, () => ({ readable: ["project-a", "project-b"], grants: [{ partition_id: "project-a", fields: ["due_at"] }] }));
    assert.deepEqual(rows.map(row => row.row_id), ["earlier-plus8", "later-z"], "UTC chronological order across timezones, and empty-fields row `no-due` suppressed");
    assert.deepEqual(services.due.entries(), [], "unauthorized partition project-b was never refreshed by assistant read");
    // Now person reads both partitions: project-b is finally refreshed.
    const all = services.readOverview(localPerson, libraries, () => ({ readable: ["project-a", "project-b"], grants: [] }));
    assert.equal(all.rows.length, 4);
    assert.deepEqual(services.due.entries().map(entry => entry.partition_id), ["project-b"]);
  } finally { services.close(); }
}));

test("B2R-07 rebuilding A and C leaves B visible under its current fields; disabled sources stay removed", async () => withHome(async home => {
  const observation = createHostObservation(realpathSync(home));
  const ids = ["a", "b", "c"];
  for (const id of ids) writeOverviewTasks(home, id, [{ id, title: id, due_at: "2027-01-01T09:00:00Z" }]);
  const libraries = partitionOverviewLibraries(home, ids.map(partition_id => ({ partition_id, plugins: [{ install_id: A.install_id, manifest: todoManifest }] })));
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("unexpected wake"); } } });
  try {
    let granted = ids;
    const read = () => services.readOverview(personalAssistant, libraries, () => ({
      readable: ids, grants: granted.map(id => ({ partition_id: id, fields: id === "b" ? ["due_at"] : ["title"] })),
    }));
    assert.equal((await refreshedOverview(read)).rows.length, 3);
    for (const id of ["a", "c"]) services.overview.markDirty(id);
    const partial = read();
    assert.equal(partial.updating, true);
    assert.deepEqual(partial.rows.map(row => [row.partition_id, row.fields]), [["b", { due_at: "2027-01-01T09:00:00Z" }]]);
    granted = ["b"];
    services.pluginDisabled(A.install_id, "c");
    assert.deepEqual(read(), { rows: partial.rows }, "the caller learns nothing about a revoked project's pending rebuild");
    await new Promise<void>(resolve => setImmediate(() => setImmediate(resolve)));
    const cached = openOverviewIndex({ homeDirectory: home });
    try { assert.equal(cached.state("c", A.install_id), null, "a queued refresh cannot revive a disabled installation"); }
    finally { cached.close(); }
    assert.deepEqual(read(), { rows: partial.rows });
    observation.layer.flush();
    const records = readRecords(observation.layer.writer.database()!.db, { fact: "home.overview_rebuild" });
    assert.deepEqual(records.map(record => record.detail.refreshed).sort(), [1, 3]);
    assert.ok(records.every(record => record.detail.failed === 0 && record.outcome === "succeeded"));
  } finally { services.close(); observation.close(); }
}));

test("UPP-34 overview index preserves rows on non-ENOENT read errors, clears only on ENOENT, and self-heals a corrupt search.db", async () => withHome(home => {
  writeOverviewTasks(home, "project-a", [{ id: "keep-me", title: "保留", remind_at: "2026-12-01T08:00:00.000Z" }]);
  const libraries = partitionOverviewLibraries(home, [{ partition_id: "project-a", plugins: [{ install_id: A.install_id, manifest: todoManifest }] }]);
  const services = new PartitionPlatformServices({ home, assembly: { acquire: async () => { throw new Error("unused"); } } });
  try {
    assert.equal(services.readOverview(localPerson, libraries, () => ({ readable: ["project-a"], grants: [] })).rows.length, 1);
    assert.equal(services.due.entries().length, 1);
    // Corrupt the partition library file (non-ENOENT failure): refresh must return null, keep existing rows & reminders, and stay dirty.
    const original = readFileSync(libraries[0]!.path);
    writeFileSync(libraries[0]!.path, "not-a-valid-sqlite-file");
    services.partitionChanged("project-a");
    assert.equal(services.overview.refresh(libraries[0]!), null, "corrupt library returns null instead of wiping rows");
    assert.deepEqual(services.readOverview(localPerson, libraries, () => ({ readable: ["project-a"], grants: [] })),
      { rows: [], unavailable: ["project-a"] }, "a failed source stays out of the answer and stops the progress poll");
    assert.throws(() => services.overview.row(libraries[0]!, "task", "keep-me"), { code: "actions.plugin_unavailable" });
    assert.equal(services.due.entries().length, 1, "existing reminder preserved");
    writeFileSync(libraries[0]!.path, original);
    assert.equal(services.overview.row(libraries[0]!, "task", "keep-me")?.fields.title, "保留", "due delivery recovers without a UI read");
    // Remove the library file (genuine ENOENT): refresh clears rows and reminders.
    rmSync(libraries[0]!.path, { force: true });
    assert.equal(services.overview.refresh(libraries[0]!), 0, "missing library (ENOENT) treated as empty");
    assert.equal(services.due.entries().length, 0);
  } finally { services.close(); }

  // Corrupt search/search.db: openOverviewIndex recovers cleanly instead of failing.
  const searchPath = homeSqlitePath(home, "search");
  mkdirSync(dirname(searchPath), { recursive: true });
  writeFileSync(searchPath, "corrupted-search-db-bytes");
  const healed = openOverviewIndex({ homeDirectory: home });
  try {
    assert.deepEqual(healed.rows({ partitions: ["project-a"], kinds: ["task"], limit: 10 }), []);
  } finally { healed.close(); }
}));

test("UPP-34 overviewRows remove/removePrefix and real EvidenceContentStore disk collection", async () => withHome(home => {
  ensurePartition(home, "project-a");
  const library = openPartitionPluginLibrary(partitionPluginScope(home, "project-a", TODO_PLUGIN, A.install_id), home, todoDb);
  try {
    const db = library.writer;
    const tx = {
      get: (sql: string, values: readonly unknown[] = []) => (db.prepare(sql).get(...(values as never[])) ?? null) as never,
      all: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).all(...(values as never[])) as never,
      run: (sql: string, values: readonly unknown[] = []) => db.prepare(sql).run(...(values as never[])),
      savepoint: () => { throw new Error("unused"); },
    };
    const helper = overviewRows(tx as never);
    const at = "2026-11-24T09:00:00.000Z";
    helper.upsert("event", { row_id: "series-1/2026-12-01", title: "周会", starts_at: at, time_zone: "UTC", updated_at: at });
    helper.upsert("event", { row_id: "series-1/2026-12-08", title: "周会", starts_at: at, time_zone: "UTC", updated_at: at });
    helper.upsert("event", { row_id: "single-1", title: "单次", starts_at: at, time_zone: "UTC", updated_at: at });
    helper.removePrefix("event", "series-1/");
    assert.deepEqual(db.prepare(`SELECT row_id FROM ${OVERVIEW_TABLE} ORDER BY row_id`).all().map(r => r.row_id), ["single-1"]);
    helper.remove("event", "single-1");
    assert.deepEqual(db.prepare(`SELECT row_id FROM ${OVERVIEW_TABLE}`).all(), []);
    assert.throws(() => helper.removePrefix("event", ""), { code: "actions.input_invalid" });
  } finally { library.close(); }

  // Real disk blob pool via createEvidenceContentStore + EvidenceLedger.
  const secrets = new Map<string, string>();
  const secretStore: SecretStore = {
    put: (k, v) => { secrets.set(k, v); },
    get: k => secrets.get(k) ?? null,
    delete: k => { secrets.delete(k); },
    createIfAbsent: (k, v) => { if (secrets.has(k)) return false; secrets.set(k, v); return true; },
    deleteIfPresent: k => secrets.delete(k),
    backend: () => ({ kind: "env-key+aes-gcm", label: "memory", masterKeyExternal: true, formatVersion: 1 }),
  };
  const contentStore = createEvidenceContentStore({ rootDirectory: join(home, "evidence-blobs"), secretStore });
  const bodyA = contentStore.write("第一段证据正文").contentRef;
  const bodyB = contentStore.write("第二段跨分区证据正文").contentRef;
  const ledger = openEvidenceLedger(home);
  try {
    ledger.hold({ partition_id: "project-a", owner_install: A.install_id, holder_key: "doc:1" }, [bodyA, bodyB]);
    ledger.hold({ partition_id: "project-b", owner_install: A.install_id, holder_key: "doc:2" }, [bodyB]);
    const freed = ledger.releasePartition("project-a");
    const result = ledger.collect({ permissions: [EVIDENCE_COLLECT_PERMISSION] }, contentStore, freed);
    assert.deepEqual(result, { deleted: [bodyA], kept: [bodyB] });
    assert.equal(contentStore.has(bodyA), false, "unreferenced blob removed from disk");
    assert.equal(contentStore.has(bodyB), true, "blob still held in project-b kept on disk");
    assert.equal(contentStore.read(bodyB), "第二段跨分区证据正文");
  } finally { ledger.close(); }
}));

test("UPP-34 parsePluginManifest validates databases.partition SQL safety, overview_projection.title_text, market, dependencies and push", () => {
  const base = (extra: Record<string, unknown> = {}) => ({
    schema_version: 1,
    host_api_version: 1,
    plugin_id: TODO_PLUGIN,
    version: "1.0.0",
    name: "Sample Todo",
    kind: "app",
    publisher: { publisher_id: "pub-1", signature: "sig-1" },
    entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [
      { permission: "todo:read", required: true, reason: "read todos" },
      { permission: "todo:write", required: true, reason: "write todos" },
    ],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [], locales: { default: "zh", available: ["zh", "en"] } },
    databases: { partition: todoDb },
    ...extra,
  });

  // Valid unified partition manifest with literal/own-key title_text, market, and dependencies (enable_with).
  const parsed = parsePluginManifest(base({
    overview_projection: { kinds: ["task", "event"], title_text: { key: "sample-todo.overview.title" } },
    market: { category: "plan" },
    dependencies: [{ plugin_id: "io.molis.work.helper", enable_with: true, reason: "提供日程同步" }],
  }));
  assert.equal(parsed.market?.category, "plan");
  assert.deepEqual(parsed.overview_projection?.title_text, { key: "sample-todo.overview.title" });
  assert.doesNotThrow(() => parsePluginManifest(base({ overview_projection: { kinds: ["task"], title_text: { literal: "待办" } } })), "literal TextRef accepted consistently");
  assert.doesNotThrow(() => parsePluginManifest(base({ overview_projection: { kinds: ["task"], title_text: { key: "common.control.confirm" } } })), "common key accepted");

  // directoryPackProblems enforces default-locale presence for overview_projection.title_text.
  const missingKey = directoryPackProblems(parsed, { format_version: 1, owner: TODO_PLUGIN, locale: "zh", messages: {} }, "locales/zh.json");
  assert.equal(missingKey.length, 1);
  assert.equal(missingKey[0]!.key, "sample-todo.overview.title");
  assert.deepEqual(directoryPackProblems(parsed, { format_version: 1, owner: TODO_PLUGIN, locale: "zh", messages: { "sample-todo.overview.title": "待办" } }, "locales/zh.json"), []);

  // Invalid overview_projection.title_text rejected uniformly.
  assert.throws(() => parsePluginManifest(base({ ui: { contributions: [] }, overview_projection: { kinds: ["task"], title_text: { key: "sample-todo.overview.title" } } })), /ui\.locales/u);
  assert.throws(() => parsePluginManifest(base({ overview_projection: { kinds: ["task"], title_text: { key: "other.overview.title" } } })), /本插件的键/u);
  assert.throws(() => parsePluginManifest(base({ overview_projection: { kinds: ["task"], title_text: { key: "sample-todo.overview.title", args: [{ name: "n", kind: "number", number: 1 }] } } })), /不接收参数/u);
  assert.throws(() => parsePluginManifest(base({ overview_projection: { kinds: ["task"], title_text: { key: "sample-todo.overview.title", fallback: "备选" } } })), /不接收参数或另一份后备文字/u);
  assert.throws(() => parsePluginManifest(base({ overview_projection: { kinds: ["task"], title_text: { literal: "多行\n标题" } } })), /必须为一行/u);

  // databases.partition mutual exclusion with databases.home and SQL safety validation.
  assert.throws(() => parsePluginManifest(base({ databases: { partition: todoDb, home: todoDb } })), /不能同时声明/u);
  for (const [why, badSql] of [
    ["DROP TABLE", "CREATE TABLE todos (id TEXT PRIMARY KEY); DROP TABLE other;"],
    ["ATTACH DATABASE", "ATTACH DATABASE ':memory:' AS x; CREATE TABLE todos (id TEXT PRIMARY KEY);"],
    ["PRAGMA", "PRAGMA foreign_keys = OFF; CREATE TABLE todos (id TEXT PRIMARY KEY);"],
    ["CREATE TRIGGER", "CREATE TABLE todos (id TEXT PRIMARY KEY); CREATE TRIGGER t AFTER INSERT ON todos BEGIN SELECT 1; END;"],
    ["db-qualified table", "CREATE TABLE main.todos (id TEXT PRIMARY KEY);"],
    ["CREATE TABLE AS SELECT", "CREATE TABLE todos AS SELECT 1 AS id;"],
    ["unclosed comment", "/* unclosed CREATE TABLE todos (id TEXT PRIMARY KEY);"],
  ] as const) {
    assert.throws(() => parsePluginManifest(base({ databases: { partition: { ...todoDb, schema: badSql } } })), /databases\.partition\.schema/u, why);
  }

  // market, dependencies, and push checks.
  assert.throws(() => parsePluginManifest(base({ market: { category: "unknown" } })), /market/u);
  assert.throws(() => parsePluginManifest(base({ dependencies: [{ plugin_id: TODO_PLUGIN, reason: "self" }] })), /不能写插件自己/u);
  assert.throws(() => parsePluginManifest(base({ dependencies: [{ plugin_id: "io.molis.work.helper", reason: "   " }] })), /reason/u);
  const pushBase = { plugin_id: TODO_PLUGIN, actions: [{ capability_id: "todo.push.export" }, { capability_id: "todo.push.put" }] as never };
  assert.deepEqual(partitionDeclarationProblems({
    ...pushBase,
    push: { kinds: [{ kind: "todo", export_action: "todo.push.export", put_action: "todo.push.put", revision: "/revision", local_refs: [{ path: "/folder_id", on_push: "strip" }], children: ["subtask"] }] },
  }), []);
  assert.ok(partitionDeclarationProblems({
    ...pushBase,
    push: { kinds: [{ kind: "todo", export_action: "todo.missing", put_action: "todo.push.put", revision: "bad-pointer" }] },
  }).length >= 2);
});

test("UPP-31 AP-08 DueTimer.close stops remaining wakes, drain settles in-flight wake before db.close, and synchronous db.close during wake never records a false failure", async () => withHome(async home => {
  const now = new Date("2026-11-24T10:00:00.000Z");

  // Case 1: close() + drain() lets in-flight wake settle before due.close(), and skips queued entry 2.
  {
    const due = openDueRegistry(home, { now: () => now });
    due.register(A, { entry_key: "r1", due_at: "2026-11-24T09:58:00.000Z" });
    due.register(A, { entry_key: "r2", due_at: "2026-11-24T09:59:00.000Z" });
    const woken: string[] = [], failures: string[] = [];
    const wakeEntered = Promise.withResolvers<void>(), releaseWake = Promise.withResolvers<void>();
    const timer = new DueTimer(due, {
      now: () => now,
      failed: entry => { failures.push(entry.entry_key); },
      wake: async entry => {
        woken.push(entry.entry_key);
        if (entry.entry_key === "r1") { wakeEntered.resolve(); await releaseWake.promise; }
      },
    });
    const firing = timer.fire();
    await wakeEntered.promise;
    timer.close();
    releaseWake.resolve();
    await timer.drain();
    await firing;
    assert.deepEqual(woken, ["r1"], "entry r2 is never woken after close()");
    assert.deepEqual(failures, [], "in-flight r1 settles cleanly with zero false failures");
    assert.deepEqual(due.entries().map(entry => entry.entry_key), ["r2"], "r1 settled before db.close so it will not ring twice on restart");
    due.close();
  }

  // Case 2: synchronous close() + due.close() while wake is in flight suppresses closed-DB settle crash and false failure callback.
  {
    const due = openDueRegistry(home, { now: () => now });
    const failures: string[] = [];
    const wakeEntered = Promise.withResolvers<void>(), releaseWake = Promise.withResolvers<void>();
    const timer = new DueTimer(due, {
      now: () => now,
      failed: entry => { failures.push(entry.entry_key); },
      wake: async () => { wakeEntered.resolve(); await releaseWake.promise; },
    });
    const firing = timer.fire();
    await wakeEntered.promise;
    timer.close();
    due.close();
    releaseWake.resolve();
    await firing;
    assert.deepEqual(failures, [], "post-close closed-DB settle does not trigger failed callback");
  }
}));
