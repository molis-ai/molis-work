import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { PROBE, partitionDirectory, partitionFile, partitionHome, probe, probeEntry, read, write } from "./fixtures/partition-probe.js";
import { deferred } from "./fixtures/home-runtime.js";

// specs/plugin-project-partition §2.5: deleting a project removes its library of a Home plugin partitioned by project, whether or
// not the plugin runs, and no call begun before the deletion reaches that project's library again.

/** SQLite removes the write-ahead log when the last connection to a library closes, so it shows whether the Host holds one open. */
const open = (home: string, projectId: string) => existsSync(`${partitionFile(home, projectId)}-wal`);
const code = (error: unknown) => (error as { code?: string }).code;

test("PART-10 deleting a project: the Plugin hears of it, its library closes and its purge begins in one turn; the directory goes once the purge settles; calls begun before it are refused and rebuild nothing; the same id begun again starts empty", async t => {
  const f = partitionHome(t);
  await f.ready();
  await f.invoke(write, { text: "kept" }, "p2");
  await f.invoke(write, { text: "gone" }, "p1");

  // A write and a read begun before the deletion and still waiting; once let go, the write makes a call of its own.
  const writing = deferred(), writeGo = deferred(), reading = deferred(), readGo = deferred(), purged = deferred();
  let heldReads = 0, nested: string | undefined;
  probe.beforeRead = async () => { if (heldReads++ === 0) { reading.resolve(); await readGo.promise; } };
  probe.hold = async text => {
    if (text !== "straggler") return;
    writing.resolve(); await writeGo.promise;
    nested = await f.invoke(read, {}, "p1").then(() => "allowed", code);
  };
  probe.purge = (_home, projectId) => { probe.trace.push(`purge:${projectId}`); return purged.promise; };
  const straggler = f.invoke(write, { text: "straggler" }, "p1"), reader = f.invoke(read, {}, "p1");
  await writing.promise; await reading.promise;
  assert.equal(open(f.home, "p1"), true);

  const clearing = f.hooks.clear(PROBE, "p1");
  assert.deepEqual(probe.trace, ["deleted:p1", "purge:p1"], "an await between them would let calls run against a library being removed");
  assert.equal(open(f.home, "p1"), false, "closed in the same turn, with a write waiting on it");
  await assert.rejects(f.invoke(read, {}, "p1"), { code: "actions.unavailable" }, "a call begun while the library is cleared waits for nothing");
  assert.deepEqual(await f.invoke(read, {}, "p2"), ["kept"], "another project's library is untouched");
  assert.equal(existsSync(partitionDirectory(f.home, "p1")), true, "the files stay until the purge settles");

  purged.resolve();
  assert.equal(await clearing, true);
  assert.equal(existsSync(partitionDirectory(f.home, "p1")), false);
  assert.ok(existsSync(partitionFile(f.home, "p2")));

  writeGo.resolve(); readGo.resolve();
  await assert.rejects(reader, { code: "actions.missing" }, "a read begun before the deletion");
  await assert.rejects(straggler, { code: "actions.missing" }, "a write begun before the deletion");
  assert.equal(nested, "actions.missing", "a call made inside one begun before the deletion is as old as that one");
  assert.equal(existsSync(partitionDirectory(f.home, "p1")), false, "none of them made the library again");

  assert.equal(await f.invoke(write, { text: "rebuilt" }, "p1"), "stored", "the demo's rebuild keeps its id");
  assert.deepEqual(await f.invoke(read, {}, "p1"), ["rebuilt"]);
});

test("PART-10 an instance started while the purge runs, after a restart or with the plugin stopped when the deletion began, still finds the project being cleared", async t => {
  const f = partitionHome(t), { platform, record } = await f.ready();
  for (const projectId of ["p1", "p2"]) await f.invoke(write, { text: "gone" }, projectId);
  const purges = new Map([["p1", deferred()], ["p2", deferred()]]);
  probe.purge = (_home, projectId) => { probe.trace.push(`purge:${projectId}`); return purges.get(projectId)!.promise; };

  const first = f.hooks.clear(PROBE, "p1");
  await platform.runtime.stop(record.install_id);
  const second = f.hooks.clear(PROBE, "p2");
  await platform.runtime.start(record.install_id);
  for (const projectId of ["p1", "p2"]) {
    await assert.rejects(f.invoke(write, { text: "lost" }, projectId), { code: "actions.unavailable" },
      "a write here would open a library the purge's removal then swallows");
    await assert.rejects(f.invoke(read, {}, projectId), { code: "actions.unavailable" });
  }

  for (const purged of purges.values()) purged.resolve();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  for (const projectId of ["p1", "p2"]) {
    assert.equal(existsSync(partitionDirectory(f.home, projectId)), false);
    assert.equal(await f.invoke(write, { text: "rebuilt" }, projectId), "stored", "once the files are gone the id is free again");
    assert.deepEqual(await f.invoke(read, {}, projectId), ["rebuilt"]);
  }
});

test("PART-11 deleting a project with the plugin not running, or with no Host at all, removes its library of the project", async t => {
  const f = partitionHome(t), { platform, record } = await f.ready();
  for (const projectId of ["p1", "p2", "p3"]) await f.invoke(write, { text: projectId }, projectId);
  await platform.runtime.stop(record.install_id);
  assert.equal(await f.hooks.clear(PROBE, "p1"), true);
  assert.deepEqual(probe.trace, ["purge:p1"], "no instance runs to hear of it");
  assert.equal(existsSync(partitionDirectory(f.home, "p1")), false);

  await f.host.close();
  assert.equal(await f.hooks.clear(PROBE, "p2"), true, "the owner the build's catalog declares");
  assert.deepEqual(probe.trace, ["purge:p1", "purge:p2"]);
  assert.equal(existsSync(partitionDirectory(f.home, "p2")), false);
  assert.ok(existsSync(partitionFile(f.home, "p3")));
});

test("PART-03 a partitioned library's owner with no purge of its own: the deletion removes the project's library alone", async t => {
  const f = partitionHome(t, [probeEntry({ project_data: { owner_id: PROBE, declaration: { label: "分区探针的笔记" } } })]);
  await f.ready();
  await f.invoke(write, { text: "a" }, "p1");
  assert.equal(await f.hooks.clear(PROBE, "p1"), true);
  assert.deepEqual(probe.trace, ["deleted:p1"]);
  assert.equal(existsSync(partitionDirectory(f.home, "p1")), false);
});
