import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { setImmediate } from "node:timers/promises";

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
    localHost: { projects: () => [], async inspectActions(_caller: unknown, reference: { project_id: string }) {
      opened.push(reference.project_id);
      if (reference.project_id === "a" && failA) throw Object.assign(new Error("file is not a database"), { code: "SQLITE_NOTADB" });
      // An open binds the project's clock to the timer, as the Host does (`bindProjectSchedulers`).
      schedulers.runtimes.set(paths[reference.project_id === "a" ? 0 : 1]!, { schedule: { tick: async () => { rounds += 1; return {}; } } } as never);
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
  await run!();
  assert.deepEqual(opened, ["a", "b"], "the broken first project does not stop the second from opening");
  assert.equal(rounds, 1, "the round runs although one project would not open");
  assert.deepEqual(errors.map(error => (error as Error).message), ["file is not a database"]);
  opened.length = 0;
  await run!();
  assert.deepEqual(opened, ["a"], "the project that failed to open is tried again; the open one is not opened again (B103-01)");
  assert.equal(errors.length, 1, "the same failure is not reported again while it keeps failing");
  failA = false;
  opened.length = 0;
  await run!();
  assert.deepEqual(opened, ["a"]);
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
    localHost: { projects: () => [], inspectActions: () => new Promise((_resolve, reject) => { rejectOpen = reject; markEntered(); }) } as never,
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

test("B103-01 a pending wakeup does not hold ready clocks or another due project", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-pending-wake-"));
  const pending = join(home, "pending.db");
  const due = join(home, "due.db");
  const ready = join(home, "ready.db");
  await Promise.all([writeFile(pending, ""), writeFile(due, "")]);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const opened: string[] = [];
  const ticks: string[] = [];
  let run: (() => Promise<void>) | undefined;
  const clock = (projectId: string) => ({ schedule: {
    async tick() {
      ticks.push(projectId);
      return { invoked: true };
    },
  } });
  const schedulers = startWebProjectSchedulers({
    localHost: {
      projects: () => [],
      async inspectActions(_caller: unknown, reference: { project_id: string; storage_key: string }) {
        const id = reference.project_id;
        opened.push(id);
        if (id === "pending") {
          entered.resolve();
          await release.promise;
        }
        schedulers.runtimes.set(reference.storage_key, clock(id) as never);
      },
    } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: () => [
      { database_path: pending, project_id: "pending" },
      { database_path: due, project_id: "due" },
    ] } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError(error) { throw error; },
  });
  t.after(async () => {
    release.resolve();
    await schedulers.stop();
    await rm(home, { recursive: true, force: true });
  });
  schedulers.runtimes.set(ready, clock("ready") as never);

  const first = run!();
  await entered.promise;
  await setImmediate();
  assert.deepEqual(ticks, ["ready", "due"], "the ready clock and first tick in another due project both run");
  await first;
  assert.equal(schedulers.activeCount(), 1, "a pending project wake remains active after the round returns");
  await run!();
  assert.deepEqual(ticks, ["ready", "due", "ready", "due"], "the next round still ticks both clocks");
  assert.deepEqual(opened, ["pending", "due"], "a pending project is only opened once");

  const stopping = schedulers.stop();
  release.resolve();
  await stopping;
  assert.equal(ticks.includes("pending"), false, "an open that finishes after stop does not tick");
  assert.equal(schedulers.activeCount(), 0);
});

test("101-2: stop() awaits in-flight schedule ticks before resolving and suppresses post-stop changed callbacks", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-inflight-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const dbPath = join(home, "a.db");
  await writeFile(dbPath, "");
  let run: (() => Promise<void>) | undefined;
  let tickStarted!: () => void;
  let releaseTick!: () => void;
  const entered = new Promise<void>(resolve => { tickStarted = resolve; });
  const gate = new Promise<void>(resolve => { releaseTick = resolve; });
  let stopResolved = false;
  const changedPaths: string[] = [];
  const schedulers = startWebProjectSchedulers({
    localHost: { projects: () => [], inspectActions: async () => undefined } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [{ database_path: dbPath, project_id: "a" }] } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed(path) { changedPaths.push(path); },
    onError(error) { throw error; },
  });
  schedulers.runtimes.set(dbPath, {
    schedule: {
      tick: async () => {
        tickStarted();
        await gate;
        return { invoked: true };
      },
    },
  } as never);
  const roundPromise = run!();
  await entered;
  const stopPromise = schedulers.stop().then(() => { stopResolved = true; });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(stopResolved, false, "stop() must wait while a tick() is still in flight");
  releaseTick();
  await stopPromise;
  await roundPromise;
  assert.equal(stopResolved, true);
  assert.deepEqual(changedPaths, [], "changed() must not fire after stop() has started");
});

// B103-01: a project is opened for its schedules only when its own clock has an enabled job due, read without opening it; one whose
// clock cannot be read that way is opened, as before; a project already open is ticked and not opened again.
test("B103-01 a closed project is opened only when its clock has something due", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-due-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const clock = (file: string, rows: Array<{ due: string; enabled: number }>) => {
    const db = new DatabaseSync(file);
    try {
      db.exec("CREATE TABLE schedule_jobs (job_id TEXT PRIMARY KEY, next_due_at TEXT, enabled INTEGER)");
      rows.forEach((row, index) => db.prepare("INSERT INTO schedule_jobs VALUES (?, ?, ?)").run(`j${index}`, row.due, row.enabled));
    } finally { db.close(); }
  };
  const past = new Date(Date.now() - 60_000).toISOString(), later = new Date(Date.now() + 3_600_000).toISOString();
  const paths = { due: join(home, "due.db"), later: join(home, "later.db"), off: join(home, "off.db"), none: join(home, "none.db"), broken: join(home, "broken.db") };
  clock(paths.due, [{ due: later, enabled: 1 }, { due: past, enabled: 1 }]);
  clock(paths.later, [{ due: later, enabled: 1 }]);
  clock(paths.off, [{ due: past, enabled: 0 }]);
  clock(paths.none, []);
  await writeFile(paths.broken, "");
  const opened: string[] = [];
  let run: (() => Promise<void>) | undefined;
  const schedulers = startWebProjectSchedulers({
    localHost: { projects: () => [], async inspectActions(_caller: unknown, reference: { project_id: string }) { opened.push(reference.project_id); } } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => Object.entries(paths).map(([project_id, database_path]) => ({ project_id, database_path })) } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError(error) { throw error; },
  });
  t.after(() => schedulers.stop());
  await run!();
  assert.deepEqual(opened, ["due", "broken"], "only the project with a job due, and the one whose clock could not be read, are opened");
  opened.length = 0;
  schedulers.runtimes.set(paths.due, { schedule: { tick: async () => ({}) } } as never);
  await run!();
  assert.deepEqual(opened, ["broken"], "an open project is ticked, not opened again");
});

// B103-01: after a round the open projects are offered to sleep, except one whose clock is due within the next two rounds.
test("B103-01 after a round an open project is offered to sleep unless its clock is due soon", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-sleep-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const soon = join(home, "soon.db"), quiet = join(home, "quiet.db");
  for (const [file, due] of [[soon, new Date(Date.now() + 20_000).toISOString()], [quiet, new Date(Date.now() + 3_600_000).toISOString()]] as const) {
    const db = new DatabaseSync(file);
    try { db.exec("CREATE TABLE schedule_jobs (job_id TEXT PRIMARY KEY, next_due_at TEXT, enabled INTEGER)"); db.prepare("INSERT INTO schedule_jobs VALUES ('j', ?, 1)").run(due); }
    finally { db.close(); }
  }
  const offered: Array<{ project_id: string; idleMs: number }> = [];
  let run: (() => Promise<void>) | undefined;
  const schedulers = startWebProjectSchedulers({
    localHost: {
      projects: () => [{ project_id: "soon", storage_key: soon, state: "ready" }, { project_id: "quiet", storage_key: quiet, state: "ready" }, { project_id: "opening", storage_key: join(home, "x.db"), state: "opening" }],
      async inspectActions() {},
      async sleepIfIdle(reference: { project_id: string }, idleMs: number) { offered.push({ project_id: reference.project_id, idleMs }); return true; },
    } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [] } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError(error) { throw error; },
  });
  t.after(() => schedulers.stop());
  await run!();
  assert.deepEqual(offered, [{ project_id: "quiet", idleMs: 10 * 60_000 }], "the project due within two rounds, and one still opening, are not offered");
});

// MR21-01: a round starts the ticks and returns; a long wakeup in one project does not hold the next round for the others, and the
// sleep after a round never puts to sleep a project whose tick is still running.
test("MR21-01: a long wakeup in one project does not hold the next round for the others, nor is that project put to sleep", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-long-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const slow = join(home, "slow.db"), quick = join(home, "quick.db");
  for (const file of [slow, quick]) {
    const db = new DatabaseSync(file);
    try { db.exec("CREATE TABLE schedule_jobs (job_id TEXT PRIMARY KEY, next_due_at TEXT, enabled INTEGER)"); db.prepare("INSERT INTO schedule_jobs VALUES ('j', ?, 1)").run(new Date(Date.now() + 3_600_000).toISOString()); }
    finally { db.close(); }
  }
  let run: (() => Promise<void>) | undefined;
  let releaseSlow!: () => void;
  const slowGate = new Promise<void>(resolve => { releaseSlow = resolve; });
  let quickTicks = 0;
  const offered: string[] = [];
  const schedulers = startWebProjectSchedulers({
    localHost: {
      projects: () => [{ project_id: "slow", storage_key: slow, state: "ready" }, { project_id: "quick", storage_key: quick, state: "ready" }],
      inspectActions: async () => undefined,
      async sleepIfIdle(reference: { project_id: string }) { offered.push(reference.project_id); return false; },
    } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [
      { database_path: slow, project_id: "slow" }, { database_path: quick, project_id: "quick" },
    ] } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError(error) { throw error; },
  });
  schedulers.runtimes.set(slow, { schedule: { tick: async () => { await slowGate; return { invoked: false }; } } } as never);
  schedulers.runtimes.set(quick, { schedule: { tick: async () => { quickTicks += 1; return { invoked: false }; } } } as never);
  // The periodic runner skips a round while the previous one is unfinished, so each round must settle with the slow tick still open.
  await run!();
  await run!();
  await run!();
  assert.equal(quickTicks, 3, "the quick project ticks once per round while the slow one is still running");
  assert.equal(offered.includes("slow"), false, "a project whose tick is still running is not offered to sleep");
  assert.ok(offered.includes("quick"), "a project whose tick has finished is offered to sleep as before");
  const stopped = schedulers.stop();
  releaseSlow();
  await stopped;
});

test("B103-01 stop() waits for an in-flight sleep pass and offerSleep skips active projects without reading their clock", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "schedulers-stop-sleep-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const active = join(home, "active.db");
  const idle = join(home, "idle.db");
  for (const file of [active, idle]) {
    const db = new DatabaseSync(file);
    try {
      db.exec("CREATE TABLE schedule_jobs (job_id TEXT PRIMARY KEY, next_due_at TEXT, enabled INTEGER)");
      db.prepare("INSERT INTO schedule_jobs VALUES ('j', ?, 1)").run(new Date(Date.now() + 3_600_000).toISOString());
    } finally {
      db.close();
    }
  }
  let run: (() => Promise<void>) | undefined;
  let releaseSleep!: () => void;
  let sleepEntered!: () => void;
  const sleepGate = new Promise<void>(resolve => { releaseSleep = resolve; });
  const entered = new Promise<void>(resolve => { sleepEntered = resolve; });
  const offered: string[] = [];
  const now = Date.now();
  const schedulers = startWebProjectSchedulers({
    localHost: {
      projects: () => [
        { project_id: "active", storage_key: active, state: "ready" },
        { project_id: "idle", storage_key: idle, state: "ready" },
      ],
      projectRest: (key: string) => ({ state: "open" as const, usedAt: key === active ? now : now - 20 * 60_000 }),
      inspectActions: async () => undefined,
      async sleepIfIdle(reference: { project_id: string }) {
        offered.push(reference.project_id);
        sleepEntered();
        await sleepGate;
        return false;
      },
    } as never,
    homeDirectory: home,
    withCatalog: async (_options, operation) => operation({ listProjects: async () => [] } as never),
    fixture: null,
    periodic: { every(task: { run(): Promise<void> }) { run = () => Promise.resolve(task.run()).then(() => undefined); return () => {}; }, list: () => [], stop: async () => {} } as never,
    changed() {},
    onError(error) { throw error; },
  });
  let stopResolved = false;
  const roundPromise = run!();
  await entered;
  assert.deepEqual(offered, ["idle"], "an active project below idleMs is not offered to sleep");
  const stopPromise = schedulers.stop().then(() => { stopResolved = true; });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(stopResolved, false, "stop() must wait while sleepIdle() is still in flight");
  releaseSleep();
  await stopPromise;
  await roundPromise;
  assert.equal(stopResolved, true);
});
