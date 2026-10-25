import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { captureHostLog, type HostLogEntry, PLATFORM_PLUGIN_REGISTRATIONS, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import {
  PROBE, PROBE_DATABASE, homeRead, later, noteTexts, partitionDirectory, partitionFile, partitionHome, probe, probeEntry, probeWithLibrary, read, storeNote, write,
} from "./fixtures/partition-probe.js";
import { withLibrary } from "./fixtures/home-library.js";
import { deferred } from "./fixtures/home-runtime.js";

// specs/plugin-project-partition: a Home plugin's library partitioned by project. Each call reaches the library of the project it
// runs in, which the Host takes from the call; the plugin's API (`services.database`) is the one an unpartitioned library has.

/** How often the Host looks for idle libraries (`PARTITION_IDLE_MS` in apps/local-host/src/plugin-database-partitions.ts). */
const IDLE_LOOK_MS = 10 * 60_000;
/** SQLite removes the write-ahead log when the last connection to a library closes, so it shows whether the Host holds one open. */
const open = (home: string, projectId: string) => existsSync(`${partitionFile(home, projectId)}-wal`);

test("PART-01 the entry and the Home's store registry agree on the partition, either way round, or the Home plugins do not start", async t => {
  const todo = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "todo")!;
  const partitionedTodo = partitionHome(t, [{ ...todo.runtime!, manifest: todo.manifest, create: () => withLibrary(todo.runtime!.create(), { ...todo.manifest.databases!.home!, partition: "project" }) }]);
  await assert.rejects(partitionedTodo.host.ready(), /分区方式不同/u, "a library the registry keeps whole cannot be opened per project");
  const whole = partitionHome(t, [probeEntry({ create: probeWithLibrary({ ...PROBE_DATABASE, partition: undefined }) })]);
  await assert.rejects(whole.host.ready(), /分区方式不同/u, "a library the registry keeps per project cannot be opened whole");
  assert.equal(existsSync(join(whole.home, PROBE)), false);

  const baseline = { version: PROBE_DATABASE.version, schema: PROBE_DATABASE.schema };
  const stores = homeStoreRegistry([{ path: "kept", owner: "a", library: { baseline } }, { path: "split", owner: "b", library: { baseline, partition: "project" } }]);
  assert.throws(() => stores.libraryPath("/home", stores.get("split")!), /要给出项目/u);
  assert.throws(() => stores.libraryPath("/home", stores.get("kept")!, "p1"), /不按项目分开/u);
  assert.equal(stores.libraryPath("/home", stores.get("split")!, "p1"), "/home/split/projects/p1/split.db");
});

test("PART-03 a partitioned library needs a project data owner and may leave purge to the Host; any other owner needs purge", async t => {
  const unowned = partitionHome(t, [probeEntry({ project_data: undefined })]);
  await assert.rejects(unowned.host.ready(), /project_data/u);
  // Todo's library kept whole, its rows not declared (`project_rows` left out): an owner the start list names must clear it itself.
  const todo = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "todo")!;
  const { project_rows: rows, ...undeclared } = todo.manifest.databases!.home!;
  assert.ok(rows, "Todo declares its project's rows, which the next case relies on");
  const purgeless = partitionHome(t, [{ ...todo.runtime!, manifest: todo.manifest, create: () => withLibrary(todo.runtime!.create(), undeclared), project_data: { owner_id: "todo", declaration: { label: "待办" } } }]);
  await assert.rejects(purgeless.host.ready(), /purge/u);
  // Rows the Manifest declares and a way to clear them on the start list: one or the other, never both, even with a purge.
  const both = partitionHome(t, [{ ...todo.runtime!, manifest: todo.manifest, project_data: { owner_id: "todo", declaration: { label: "待办", purge: () => undefined } } }]);
  await assert.rejects(both.host.ready(), /不能两样都有/u);
  await partitionHome(t, [probeEntry({ project_data: { owner_id: PROBE, declaration: { label: "分区探针的笔记" } } })]).ready();

  // The deletion's owners come from the platform's registration list as well (project-deleted-owners.ts; W5-02 PR-B): there, too, only a partitioned one may leave out purge.
  const catalog = PLATFORM_PLUGIN_REGISTRATIONS as PluginRegistration[], shipped = catalog.find(entry => entry.project_plugin_id === PROBE)!;
  const elsewhere = mkdtempSync(join(tmpdir(), "plugin-partition-owners-"));
  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));
  catalog.push({ ...shipped, project_plugin_id: "purgeless", project_data: { label: "没有清理办法的数据" }, runtime: undefined });
  try { assert.throws(() => projectDeletedHooksFor(elsewhere), /purge/u); } finally { catalog.pop(); }
  catalog.push({ ...shipped, project_plugin_id: "unpurged", project_data: { label: "分区探针的笔记" } });
  try { projectDeletedHooksFor(join(elsewhere, "partitioned")); } finally { catalog.pop(); }
});

test("PART-04 a call in no project is refused before any file is made: start, a Home action", async t => {
  const f = partitionHome(t);
  await f.ready();
  assert.equal((probe.startRefusal as { code?: string } | undefined)?.code, "actions.project_required", "start runs in no call");
  await assert.rejects(f.invoke(homeRead, {}, null), { code: "actions.project_required" });
  assert.equal(existsSync(join(f.home, PROBE)), false, "nothing of the library was made");
});

test("PART-05 each project has its own library, chosen by the call, never by the input", async t => {
  const f = partitionHome(t);
  await f.ready();
  assert.equal(await f.invoke(write, { text: "in a", project_id: "b" }, "a"), "stored");
  assert.equal(await f.invoke(write, { text: "in b" }, "b"), "stored");
  assert.deepEqual(await f.invoke(read, {}, "a"), ["in a"]);
  assert.deepEqual(await f.invoke(read, {}, "b"), ["in b"]);
  assert.deepEqual(await f.invoke(homeRead, {}, "b"), ["in b"], "a Home action called in a project reaches that project's library");
  assert.ok(existsSync(partitionFile(f.home, "a")) && existsSync(partitionFile(f.home, "b")));
});

test("PART-06 a project's library is one directory under projects/, owner-only, whatever the project id holds", async t => {
  const f = partitionHome(t);
  await f.ready();
  const ids = ["..", ".", "a.b/../c", "%2E%2E", "p/q"];
  for (const id of ids) await f.invoke(write, { text: id }, id);
  const projects = join(f.home, PROBE, "projects");
  assert.deepEqual(readdirSync(projects).sort(), ids.map(id => encodeURIComponent(id).replaceAll(".", "%2E")).sort());
  for (const id of ids) {
    assert.deepEqual(await f.invoke(read, {}, id), [id]);
    assert.equal(statSync(partitionDirectory(f.home, id)).mode & 0o777, 0o700, id);
    assert.equal(statSync(partitionFile(f.home, id)).mode & 0o777, 0o600, id);
  }
  assert.equal(statSync(projects).mode & 0o777, 0o700);
});

test("PART-07 a background job writes into the library of the project whose call accepted it", async t => {
  const f = partitionHome(t), wait = deferred();
  probe.later = wait.promise;
  await f.ready();
  assert.deepEqual(await f.invoke(later, { id: "job" }, "b"), { id: "job", state: "running" });
  await f.invoke(write, { text: "meanwhile" }, "a");
  wait.resolve();
  await probe.jobs.at(-1)!.result;
  assert.deepEqual(await f.invoke(read, {}, "b"), ["later:job"]);
  assert.deepEqual(await f.invoke(read, {}, "a"), ["meanwhile"]);
});

test("PART-08 a library not used since the last look is closed and opens again when used; one with a write under way stays open", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const f = partitionHome(t);
  await f.ready();
  await f.invoke(write, { text: "first" }, "a");
  assert.equal(open(f.home, "a"), true);
  t.mock.timers.tick(IDLE_LOOK_MS);
  assert.equal(open(f.home, "a"), true, "used since the last look");
  t.mock.timers.tick(IDLE_LOOK_MS);
  assert.equal(open(f.home, "a"), false, "idle for a whole look");
  assert.deepEqual(await f.invoke(read, {}, "a"), ["first"], "opened again with its rows");

  const entered = deferred(), release = deferred();
  probe.hold = async () => { entered.resolve(); await release.promise; };
  const waiting = f.invoke(write, { text: "second" }, "a");
  await entered.promise;
  for (let look = 0; look < 3; look += 1) t.mock.timers.tick(IDLE_LOOK_MS);
  assert.equal(open(f.home, "a"), true, "a transaction waiting for its beforeEffect keeps the library open");
  release.resolve();
  assert.equal(await waiting, "stored");
  assert.deepEqual(await f.invoke(read, {}, "a"), ["first", "second"]);
});

test("PART-09 stopping the plugin closes every project's library, and a handle kept from before is refused", async t => {
  const f = partitionHome(t), { platform, record } = await f.ready();
  await f.invoke(write, { text: "a" }, "a");
  await f.invoke(write, { text: "b" }, "b");
  const kept = probe.database();
  await platform.runtime.stop(record.install_id);
  assert.equal(open(f.home, "a"), false); assert.equal(open(f.home, "b"), false);
  assert.equal(kept.get("SELECT 1"), undefined, "BL-411: outside every call the kept handle is refused and answers nothing");
  await platform.runtime.start(record.install_id);
  assert.deepEqual(await f.invoke(read, {}, "b"), ["b"], "a new start opens the library again");
});

test("PART-12 a project's library has the checks of any plugin library: SELECT-only reads, INSERT/UPDATE/DELETE-only and synchronous writes, a call whose authority goes while it waits writes nothing", async t => {
  const f = partitionHome(t);
  await f.ready();
  await f.invoke(write, { text: "row" }, "a");
  const refusal = (run: () => unknown) => { try { run(); return "allowed"; } catch (error) { return error instanceof Error ? error.message : String(error); } };
  probe.read = (database: PluginDatabase) => [refusal(() => database.all("PRAGMA table_info(notes)")), refusal(() => database.get("ATTACH DATABASE ':memory:' AS other"))];
  const [pragma, attach] = await f.invoke(read, {}, "a") as string[];
  assert.match(pragma!, /SELECT/u); assert.match(attach!, /SELECT/u);

  probe.write = async (database, _text, caller) => {
    await assert.rejects(database.transaction(caller.beforeEffect, tx => tx.run("CREATE TABLE more (id INTEGER)")), /INSERT、UPDATE 或 DELETE/u);
    await assert.rejects(database.transaction(caller.beforeEffect, async tx => tx.run("INSERT INTO notes (text) VALUES ('async')")), /同步/u);
  };
  assert.equal(await f.invoke(write, { text: "unused" }, "a"), "stored");
  probe.write = storeNote;
  let revoked = false;
  probe.hold = async () => { revoked = true; };
  const authority = { assert_authority_current: () => { if (revoked) throw new ActionError("actions.forbidden", "授权已撤销"); } };
  await assert.rejects(f.invoke(write, { text: "revoked" }, "a", authority), { code: "actions.forbidden" });
  probe.read = noteTexts;
  assert.deepEqual(await f.invoke(read, {}, "a"), ["row"], "nothing refused was written");
});

for (const method of ["get", "all"] as const) {
  test(`SYS-06 a Home transaction's ${method} refuses CTE writes and still reads its own writes`, async t => {
    const f = partitionHome(t);
    await f.ready();
    await f.invoke(write, { text: "original" }, "a");
    probe.write = async (database, _text, caller) => {
      for (const statement of ["DELETE FROM notes RETURNING text", "UPDATE notes SET text='changed' RETURNING text", "INSERT INTO notes(text) VALUES('extra') RETURNING text"]) {
        await assert.rejects(database.transaction(caller.beforeEffect, tx => {
          tx.run("INSERT INTO notes(text) VALUES (?)", ["rolled-back"]);
          tx[method]("WITH unused AS (SELECT 1) " + statement);
        }), /readonly/u);
      }
      await database.transaction(caller.beforeEffect, tx => {
        tx.run("INSERT INTO notes(text) VALUES (?)", ["kept"]);
        assert.equal(tx.get("WITH current AS (SELECT text FROM notes) SELECT count(*) AS n FROM current")!.n, 2);
        assert.deepEqual(tx.all("SELECT text FROM notes ORDER BY id").map(row => row.text), ["original", "kept"]);
        tx.run("UPDATE notes SET text=? WHERE text=?", ["updated", "kept"]);
      });
    };
    await f.invoke(write, { text: "unused" }, "a");
    assert.deepEqual(await f.invoke(read, {}, "a"), ["original", "updated"], "rejected statements and their earlier transaction writes left no changes");
  });
}


test("SYS-39 a rollback failure is logged without replacing the original operation error", async t => {
  const f = partitionHome(t); await f.ready();
  const entries: HostLogEntry[] = [], restore = captureHostLog(entries); t.after(restore);
  const failure = new Error("original write failed"), rollbackFailure = new Error("rollback acknowledgement failed");
  const exec = DatabaseSync.prototype.exec;
  t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    exec.call(this, sql);
    if (sql === "ROLLBACK") throw rollbackFailure;
  });
  probe.write = async (database, text, caller) => database.transaction(caller.beforeEffect, tx => {
    tx.run("INSERT INTO notes (text) VALUES (?)", [text]); throw failure;
  });
  await assert.rejects(f.invoke(write, { text: "not stored" }, "p1"), error => error === failure);
  assert.deepEqual(await f.invoke(read, {}, "p1"), []);
  assert.deepEqual(entries.filter(entry => entry.event === "rollback_failed").map(entry => entry.error), [{ name: "Error" }]);
  assert.equal(JSON.stringify(entries).includes(rollbackFailure.message), false);
});
