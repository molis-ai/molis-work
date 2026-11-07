// scripts/machine-slot.mjs: three builds and three test batches, with real child processes controlling when each slot is released.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { slotState, slotWanted } from "../scripts/machine-slot.mjs";

const tool = fileURLToPath(new URL("../scripts/machine-slot.mjs", import.meta.url));
const scratch: string[] = [];
const directory = () => { const made = mkdtempSync(path.join(tmpdir(), "molis-machine-slot-")); scratch.push(made); return made; };
after(() => { for (const made of scratch) rmSync(made, { recursive: true, force: true }); });
const environment = (slots: string) => ({ ...process.env, MOLIS_WORK_SLOT: "on", MOLIS_WORK_SLOT_DIR: slots, MOLIS_WORK_SLOT_HELD: "" });

const waitFor = async (ready: () => boolean) => {
  const deadline = Date.now() + 15_000;
  while (!ready()) {
    assert.ok(Date.now() < deadline, "timed out waiting for child process state");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

// The command stays alive until its stdin closes, so assertions never race a fixed holding duration.
const hold = (slots: string, kind: string, name: string) => {
  const log = path.join(slots, "log");
  const script = `const fs=require("node:fs");const log=${JSON.stringify(log)};const name=${JSON.stringify(name)};
    fs.appendFileSync(log,name+" start\\n");process.stdin.resume();
    process.stdin.once("end",()=>fs.appendFileSync(log,name+" end\\n"));`;
  const child = spawn(process.execPath, [tool, "run", kind, "--label", name, "--", process.execPath, "-e", script], { env: environment(slots) });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const done = new Promise<number | null>((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  return {
    done,
    release: () => child.stdin.end(),
    stop: () => child.kill("SIGTERM"),
    output: () => output,
    started: () => existsSync(log) && readFileSync(log, "utf8").split("\n").includes(`${name} start`),
  };
};
const status = (slots: string) => spawnSync(process.execPath, [tool, "status"], { env: environment(slots), encoding: "utf8", timeout: 5000 });

for (const kind of ["build", "browser"]) {
  test(`SLOT-01/SLOT-03: ${kind} admits three, queues the fourth and fifth in order, and releases each slot`, async () => {
    const slots = directory(), runs: ReturnType<typeof hold>[] = [];
    try {
      for (const name of ["first", "second", "third"]) {
        const run = hold(slots, kind, name); runs.push(run); await waitFor(run.started);
      }
      assert.equal(slotState(kind, slots).holders.length, 3);
      const fourth = hold(slots, kind, "fourth"); runs.push(fourth);
      await waitFor(() => slotState(kind, slots).waiting.length === 1);
      const fifth = hold(slots, kind, "fifth"); runs.push(fifth);
      await waitFor(() => slotState(kind, slots).waiting.length === 2);
      assert.equal(fourth.started(), false); assert.equal(fifth.started(), false);
      const snapshot = status(slots);
      assert.equal(snapshot.status, 0);
      assert.match(snapshot.stdout, new RegExp(`${kind}: 3/3 occupied; first .*second .*third .*waiting: fourth .*fifth`));
      runs[0].release(); await waitFor(fourth.started);
      assert.equal(fifth.started(), false, "one release admits only the oldest waiter");
      runs[1].release(); await waitFor(fifth.started);
      assert.match(fourth.output(), new RegExp(`waiting for the ${kind} slot, held by first`));
      for (const run of runs) run.release();
      assert.deepEqual(await Promise.all(runs.map((run) => run.done)), [0, 0, 0, 0, 0]);
      let active = 0, maximum = 0;
      for (const event of readFileSync(path.join(slots, "log"), "utf8").trim().split("\n")) {
        active += event.endsWith(" start") ? 1 : -1;
        maximum = Math.max(maximum, active);
        assert.ok(active >= 0 && active <= 3, event);
      }
      assert.equal(maximum, 3); assert.equal(active, 0);
      assert.match(status(slots).stdout, new RegExp(`${kind}: 0/3 occupied; free`));
    } finally {
      for (const run of runs) run.stop();
      await Promise.allSettled(runs.map((run) => run.done));
    }
  });
}

test("SLOT-02: three builds and three browser batches can hold their independent pools together", async () => {
  const slots = directory(), runs: ReturnType<typeof hold>[] = [];
  try {
    for (const kind of ["build", "browser"]) {
      for (let index = 1; index <= 3; index++) {
        const run = hold(slots, kind, `${kind}-${index}`); runs.push(run); await waitFor(run.started);
      }
    }
    const snapshot = status(slots);
    assert.equal(snapshot.status, 0);
    for (const kind of ["build", "browser"]) {
      assert.equal(slotState(kind, slots).holders.length, 3);
      assert.match(snapshot.stdout, new RegExp(`${kind}: 3/3 occupied; ${kind}-1 .*${kind}-2 .*${kind}-3`));
    }
  } finally {
    for (const run of runs) run.release();
    await Promise.allSettled(runs.map((run) => run.done));
  }
});

test("SLOT-03: dead holders in every slot are reclaimed and command exit codes are preserved", () => {
  const slots = directory();
  const gone = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
  for (const name of ["build.held", "build.2.held", "build.3.held"]) {
    mkdirSync(path.join(slots, name));
    writeFileSync(path.join(slots, name, "info.json"), JSON.stringify({ kind: "build", label: "crashed", pid: Number(gone.stdout.trim()), cwd: "/", since: Date.now() }));
  }
  const run = spawnSync(process.execPath, [tool, "run", "build", "--", process.execPath, "-e", "process.exit(3)"], { env: environment(slots), encoding: "utf8", timeout: 20_000 });
  assert.equal(run.status, 3, "the command ran, and its exit code is the run's");
  assert.doesNotMatch(run.stdout, /waiting/);
  const status = spawnSync(process.execPath, [tool, "status"], { env: environment(slots), encoding: "utf8" });
  assert.match(status.stdout, /^build: 0\/3 occupied; free$/m, "released after the command");
});

test("SLOT-03: a live waiter's ticket that another reader cannot parse yet is kept; a dead one's is removed", () => {
  const slots = directory(), queue = path.join(slots, "build.queue");
  const gone = Number(spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim());
  mkdirSync(queue, { recursive: true });
  const live = path.join(queue, `000000000000001-${process.pid}.json`), dead = path.join(queue, `000000000000002-${gone}.json`);
  writeFileSync(live, ""); // the moment between creating the file and writing it
  writeFileSync(dead, JSON.stringify({ kind: "build", label: "crashed", pid: gone, cwd: "/", since: 2 }));
  mkdirSync(`${queue}.writing`);
  writeFileSync(path.join(`${queue}.writing`, path.basename(dead)), "");
  slotState("build", slots);
  assert.ok(existsSync(live), "a reader must not take a half-written ticket for a dead one and remove it");
  assert.deepEqual(readdirSync(queue), [path.basename(live)]);
  assert.deepEqual(readdirSync(`${queue}.writing`), [], "a dead writer's unfinished copy is removed");
});

test("SLOT-03: a waiter whose ticket is removed restores its place and acquires a released slot", async () => {
  const slots = directory(), queue = path.join(slots, "build.queue"), runs: ReturnType<typeof hold>[] = [];
  try {
    for (const name of ["first", "second", "third"]) {
      const run = hold(slots, "build", name); runs.push(run); await waitFor(run.started);
    }
    const waiter = hold(slots, "build", "waiter"); runs.push(waiter);
    await waitFor(() => slotState("build", slots).waiting.length === 1);
    for (const name of readdirSync(queue)) rmSync(path.join(queue, name), { force: true });
    await waitFor(() => slotState("build", slots).waiting.length === 1);
    assert.equal(waiter.started(), false);
    runs[0].release(); await waitFor(waiter.started);
  } finally {
    for (const run of runs) run.stop();
    await Promise.allSettled(runs.map((run) => run.done));
  }
});

test("SLOT-04 slotWanted: not in CI, not inside a test, not when a parent holds it; MOLIS_WORK_SLOT=off and =on decide first", () => {
  const saved = { ...process.env };
  const set = (values: Record<string, string | undefined>) => {
    for (const name of ["MOLIS_WORK_SLOT", "CI", "NODE_ENV", "MOLIS_WORK_SLOT_HELD"]) delete process.env[name];
    Object.assign(process.env, values);
  };
  try {
    set({}); assert.equal(slotWanted("build"), true);
    set({ CI: "true" }); assert.equal(slotWanted("build"), false);
    set({ NODE_ENV: "test" }); assert.equal(slotWanted("build"), false);
    set({ MOLIS_WORK_SLOT_HELD: "browser,build" }); assert.equal(slotWanted("build"), false);
    set({ MOLIS_WORK_SLOT: "off" }); assert.equal(slotWanted("browser"), false);
    set({ MOLIS_WORK_SLOT: "on", NODE_ENV: "test" }); assert.equal(slotWanted("browser"), true);
    set({ MOLIS_WORK_SLOT: "on", MOLIS_WORK_SLOT_HELD: "browser" }); assert.equal(slotWanted("browser"), false, "a parent's slot is never taken twice");
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  }
});

test("SLOT-04 usage: an unknown slot or a missing command is exit 2", () => {
  for (const args of [["run", "gpu", "--", "true"], ["run", "build"], ["nothing"]]) {
    assert.equal(spawnSync(process.execPath, [tool, ...args], { encoding: "utf8" }).status, 2, args.join(" "));
  }
});
