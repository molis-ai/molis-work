import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startWebProjectSchedulers } from "@molis-ai/molis-work-app-local-host";

// LOGIC-01: one failed project open must not keep the rest of the projects unscheduled for the life of the process.

test("LOGIC-01 a failed open is recorded and the next tick tries the projects again", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const paths = [join(home, "a.db"), join(home, "b.db")];
  await Promise.all(paths.map(path => writeFile(path, "")));
  const opened: string[] = [];
  let failB = true;
  const errors: unknown[] = [];
  let run: (() => Promise<void>) | undefined;
  const schedulers = startWebProjectSchedulers({
    localHost: { async withProject(reference: { project_id: string }) {
      opened.push(reference.project_id);
      if (reference.project_id === "b" && failB) throw Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });
    } } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [
      { database_path: paths[0], project_id: "a" },
      { database_path: paths[1], project_id: "b" },
    ] } as never),
    fixture: null,
    agents: { agentHost: {} as never, ready: Promise.resolve() },
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError(error) { errors.push(error); },
  });
  t.after(() => schedulers.stop());
  await assert.rejects(run!());
  assert.deepEqual(opened, ["a", "b"]);
  assert.equal((errors[0] as Error).message, "database is locked");
  failB = false;
  opened.length = 0;
  await run!();
  assert.deepEqual(opened, ["a", "b"], "the project that failed to open is tried again");
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
    localHost: { withProject: () => new Promise((_resolve, reject) => { rejectOpen = reject; markEntered(); }) } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [{ database_path: path, project_id: "a" }] } as never),
    fixture: null,
    agents: { agentHost: {} as never, ready: Promise.resolve() },
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError() { throw new Error("a stopped host does not report the open"); },
  });
  const started = run!();
  await entered;
  const stopping = schedulers.stop();
  rejectOpen(new Error("database is locked"));
  await stopping;
  await assert.rejects(started, /database is locked/);
});
