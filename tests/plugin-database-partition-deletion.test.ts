import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import test from "node:test";
import type { ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { PROBE, later, partitionDirectory, partitionFile, partitionHome, probe, probeEntry, read, write } from "./fixtures/partition-probe.js";
import { deferred } from "./fixtures/home-runtime.js";

// specs/plugin-project-partition §2.5: deleting a project removes its library of a Home plugin partitioned by project, whether or
// not the plugin runs, and no call begun before the deletion reaches that project's library again.

/** SQLite removes the write-ahead log when the last connection to a library closes, so it shows whether the Host holds one open. */
const open = (home: string, projectId: string) => existsSync(`${partitionFile(home, projectId)}-wal`);
const code = (error: unknown) => (error as { code?: string }).code;

test("PART-10 PG-038 deleting a project: the background work accepted in it stops, its library closes and its purge begins in one turn; the directory goes once the purge settles; calls begun before it are refused and rebuild nothing; the same id begun again starts empty", async t => {
  const f = partitionHome(t);
  await f.ready();
  await f.invoke(write, { text: "kept" }, "p2");
  await f.invoke(write, { text: "gone" }, "p1");

  // A background job accepted in each project, both still waiting. The deletion of one project stops only the job accepted there,
  // before anything of its data goes; the plugin is told nothing and runs no code of its own for it.
  const jobsGo = deferred();
  probe.later = jobsGo.promise;
  await f.invoke(later, { id: "p1-job" }, "p1"); await f.invoke(later, { id: "p2-job" }, "p2");
  while (probe.controls.length < 2) await new Promise(resolve => setImmediate(resolve));
  const jobIn = (projectId: string) => probe.controls.find(control => control.project_id === projectId)!;
  jobIn("p1").signal!.addEventListener("abort", () => probe.trace.push("stopped:p1"));

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
  assert.deepEqual(probe.trace, ["stopped:p1", "purge:p1"], "an await between them would let calls run against a library being removed");
  assert.equal(jobIn("p2").signal!.aborted, false, "another project's job runs on");
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

  jobsGo.resolve();
  await assert.rejects(probe.jobs[0]!.result, { code: "actions.cancelled" }, "the job accepted in the deleted project");
  await probe.jobs[1]!.result;
  assert.deepEqual(await f.invoke(read, {}, "p2"), ["kept", "later:p2-job"]);

  assert.equal(await f.invoke(write, { text: "rebuilt" }, "p1"), "stored", "the demo's rebuild keeps its id");
  assert.deepEqual(await f.invoke(read, {}, "p1"), ["rebuilt"], "the stopped job wrote nothing");
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
  assert.deepEqual(probe.trace, []);
  assert.equal(existsSync(partitionDirectory(f.home, "p1")), false);
});

for (const reason of ["revoked", "path"] as const) test(`MEM-40 running partition owner closes the library but refuses ${reason} after purge before directory removal`, async t => {
  const home = realpathSync(mkdtempSync("/private/tmp/molis-partition-current-")), purged = deferred();
  let received: ProjectDeletionControl | undefined, revoked = false;
  const entry = probeEntry({ project_data: { owner_id: PROBE, declaration: { label: "original partition",
    purge(_home, _project, control) { received = control; return purged.promise; } } } });
  const f = partitionHome(t, [entry], home); await f.ready();
  await f.invoke(write, { text: "original" }, "p1"); await f.invoke(write, { text: "neighbor" }, "p2");
  const denied = new Error("partition authority revoked"), control = { assertCurrent() { if (revoked) throw denied; } };
  const directory = partitionDirectory(home, "p1"), saved = directory + "-held";
  const clearing = f.hooks.clear(PROBE, "p1", undefined, control);
  assert.equal(received, control); assert.equal(open(home, "p1"), false); assert.equal(existsSync(directory), true);
  if (reason === "revoked") revoked = true;
  else { renameSync(directory, saved); symlinkSync(partitionDirectory(home, "p2"), directory); }
  purged.resolve();
  try { await assert.rejects(clearing, error => reason === "revoked" ? error === denied : code(error) === "storage.maintenance_path"); }
  finally { if (reason === "path") { rmSync(directory); renameSync(saved, directory); } revoked = false; }
  assert.deepEqual(await f.invoke(read, {}, "p1"), ["original"]);
  assert.deepEqual(await f.invoke(read, {}, "p2"), ["neighbor"]);
  assert.equal(await f.hooks.clear(PROBE, "p1", undefined, control), true);
  assert.equal(existsSync(directory), false); assert.deepEqual(await f.invoke(read, {}, "p2"), ["neighbor"]);
});
