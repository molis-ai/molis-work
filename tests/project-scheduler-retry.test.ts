import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startWebProjectSchedulers } from "@molis-ai/molis-work-app-local-host";

// LOGIC-01: one failed project open must not keep the rest of the projects unscheduled for the life of the process.

test("LOGIC-01 a project that will not open is skipped: the ones after it open, the round runs, and it is tried again, reported once", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const paths = [join(home, "a.db"), join(home, "b.db")];
  await Promise.all(paths.map(path => writeFile(path, "")));
  const opened: string[] = [];
  let failA = true, rounds = 0;
  const errors: unknown[] = [];
  let run: (() => Promise<void>) | undefined;
  const schedulers = startWebProjectSchedulers({
    localHost: { async inspectActions(_caller: unknown, reference: { project_id: string }) {
      opened.push(reference.project_id);
      if (reference.project_id === "a" && failA) throw Object.assign(new Error("file is not a database"), { code: "SQLITE_NOTADB" });
    } } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [
      { database_path: paths[0], project_id: "a" },
      { database_path: paths[1], project_id: "b" },
    ] } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError(error) { errors.push(error); },
  });
  t.after(() => schedulers.stop());
  // The project that did open runs its schedules on this round. Its Feed sources are not on this timer: the Runtime Feed pulls them as its
  // own background job (FI-6), so the round is the project's tasks.
  schedulers.runtimes.set(paths[1]!, { schedule: { tick: async () => { rounds += 1; return {}; } } } as never);
  await run!();
  assert.deepEqual(opened, ["a", "b"], "the broken first project does not stop the second from opening");
  assert.equal(rounds, 1, "the round runs although one project would not open");
  assert.deepEqual(errors.map(error => (error as Error).message), ["file is not a database"]);
  opened.length = 0;
  await run!();
  assert.deepEqual(opened, ["a", "b"], "the project that failed to open is tried again");
  assert.equal(errors.length, 1, "the same failure is not reported again while it keeps failing");
  failA = false;
  opened.length = 0;
  await run!();
  assert.deepEqual(opened, ["a", "b"]);
  opened.length = 0;
  await run!();
  assert.deepEqual(opened, [], "once every project opened, the next round does not open them again");
  assert.equal(errors.length, 1);
});

test("LOGIC-01 stopping the host finishes while an open is still failing", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-stop-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const path = join(home, "a.db");
  await writeFile(path, "");
  let rejectOpen: (error: Error) => void = () => {};
  let markEntered: () => void = () => {};
  const entered = new Promise<void>(resolve => { markEntered = resolve; });
  let run: (() => Promise<void>) | undefined;
  const schedulers = startWebProjectSchedulers({
    localHost: { inspectActions: () => new Promise((_resolve, reject) => { rejectOpen = reject; markEntered(); }) } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [{ database_path: path, project_id: "a" }] } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError() { throw new Error("a stopped host does not report the open"); },
  });
  const started = run!();
  await entered;
  const stopping = schedulers.stop();
  rejectOpen(new Error("database is locked"));
  await stopping;
  // The failed open is skipped, not reported (onError throws above), and the stopped round ends without running.
  await started;
});
