// scripts/machine-slot.mjs: one machine-wide slot, with real child processes controlling when it is released.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { releaseHolder, slotState, slotWanted } from "../scripts/machine-slot.mjs";

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
  const child = spawn(process.execPath, [tool, "run", kind, "--label", name, "--", process.execPath, "-e", script], { cwd: directory(), env: environment(slots) });
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

test("CIP-11 SLOT-01/SLOT-02: builds, non-browser tests, health and browser batches share FIFO across checkouts", async () => {
  const slots = directory();
  const runs: ReturnType<typeof hold>[] = [];
  const kinds = ["build", "test", "health", "browser"];
  try {
    for (const [index, kind] of kinds.entries()) {
      const run = hold(slots, kind, kind);
      runs.push(run);
      if (index === 0) await waitFor(run.started);
      else await waitFor(() => slotState(slots).waiting.length === index);
    }
    const snapshot = status(slots);
    assert.equal(snapshot.status, 0);
    assert.match(snapshot.stdout, /heavy: 1\/1 occupied; build build .*waiting: test .*health .*browser /);
    for (const [index, run] of runs.entries()) {
      await waitFor(run.started);
      assert.equal(slotState(slots).holder?.kind, kinds[index]);
      for (const later of runs.slice(index + 1)) assert.equal(later.started(), false);
      run.release();
      assert.equal(await run.done, 0);
    }
    const events = readFileSync(path.join(slots, "log"), "utf8").trim().split("\n");
    assert.deepEqual(events, kinds.flatMap(kind => [`${kind} start`, `${kind} end`]));
    assert.match(status(slots).stdout, /heavy: 0\/1 occupied; free/);
  } finally {
    for (const run of runs) run.stop();
    await Promise.allSettled(runs.map(run => run.done));
  }
});

test("CIP-11 SLOT-04: nested kinds reuse their parent's slot, including forced-on validation", () => {
  const slots = directory();
  const result = spawnSync(process.execPath, [tool, "run", "build", "--", process.execPath, tool, "run", "health", "--",
    process.execPath, "-e", "process.stdout.write(process.env.MOLIS_WORK_SLOT_HELD)"], { env: environment(slots), encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "build");
  assert.equal(slotState(slots).holder, null);
});

test("CIP-11: direct test and health entry points wait for a build before touching their inputs", async () => {
  const slots = directory();
  const fixture = directory();
  const marker = path.join(fixture, "ran");
  const file = path.join(fixture, "probe.test.mjs");
  writeFileSync(file, `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "ran");`);
  const holder = hold(slots, "build", "building");
  const start = (name: string, args: string[]) => {
    const child = spawn(process.execPath, [path.join(path.dirname(tool), name), ...args], { env: environment(slots), stdio: "ignore" });
    const done = new Promise<number | null>((resolve, reject) => {
      child.once("exit", resolve);
      child.once("error", reject);
    });
    return { child, done };
  };
  const commands: ReturnType<typeof start>[] = [];
  try {
    await waitFor(holder.started);
    commands.push(start("run-tests.mjs", [file]));
    await waitFor(() => slotState(slots).waiting.some((ticket: { kind: string }) => ticket.kind === "test"));
    commands.push(start("check-health-gates.mjs", ["--root", fixture]));
    await waitFor(() => slotState(slots).waiting.some((ticket: { kind: string }) => ticket.kind === "health"));
    assert.equal(existsSync(marker), false);
    holder.release();
    assert.equal(await commands[0]!.done, 0);
    assert.equal(readFileSync(marker, "utf8"), "ran");
    assert.notEqual(await commands[1]!.done, 0, "the empty fixture has no health limits or baseline");
    assert.equal(slotState(slots).holder, null);
  } finally {
    holder.stop();
    for (const { child } of commands) child.kill("SIGTERM");
    await Promise.allSettled([holder.done, ...commands.map(command => command.done)]);
  }
});

test("CIP-11: workspace typecheck and clean hold the shared slot while pnpm runs a package script", () => {
  const slots = directory(), fixture = directory();
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const scripts = { "workspace:typecheck": manifest.scripts["workspace:typecheck"], "workspace:clean": manifest.scripts["workspace:clean"] };
  writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "workspace-probe", private: true, packageManager: manifest.packageManager, scripts }));
  writeFileSync(path.join(fixture, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
  mkdirSync(path.join(fixture, "scripts"));
  for (const file of ["machine-slot.mjs", "script-paths.mjs"]) copyFileSync(path.join(path.dirname(tool), file), path.join(fixture, "scripts", file));
  const pkg = path.join(fixture, "packages", "probe");
  mkdirSync(pkg, { recursive: true });
  const observe = "node ../../scripts/machine-slot.mjs status";
  writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "probe", scripts: { typecheck: observe, clean: observe } }));
  for (const [command, expected] of [["workspace:typecheck", "health workspace-types"], ["workspace:clean", "build workspace-clean"]] as const) {
    const result = spawnSync("pnpm", ["run", command], { cwd: fixture, env: environment(slots), encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    assert.ok(result.stdout.includes(`heavy: 1/1 occupied; ${expected} (`), result.stdout);
    assert.equal(slotState(slots).holder, null);
  }
});

test("SLOT-03: the next kind reclaims a dead holder and preserves the command exit code", () => {
  const slots = directory();
  const gone = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
  const held = path.join(slots, "heavy.held");
  mkdirSync(held);
  writeFileSync(path.join(held, "info.json"), JSON.stringify({ kind: "build", label: "crashed", pid: Number(gone.stdout.trim()), cwd: "/", since: Date.now() }));
  const run = spawnSync(process.execPath, [tool, "run", "test", "--", process.execPath, "-e", "process.exit(3)"], { env: environment(slots), encoding: "utf8", timeout: 20_000 });
  assert.equal(run.status, 3);
  assert.doesNotMatch(run.stdout, /waiting/);
  assert.equal(slotState(slots).holder, null);
  assert.equal(existsSync(held), false);
});

test("SLOT-03: a live waiter's ticket that another reader cannot parse yet is kept; a dead one's is removed", () => {
  const slots = directory(), queue = path.join(slots, "heavy.queue");
  const gone = Number(spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim());
  mkdirSync(queue, { recursive: true });
  const live = path.join(queue, `000000000000001-${process.pid}.json`), dead = path.join(queue, `000000000000002-${gone}.json`);
  writeFileSync(live, ""); // the moment between creating the file and writing it
  writeFileSync(dead, JSON.stringify({ kind: "build", label: "crashed", pid: gone, cwd: "/", since: 2 }));
  mkdirSync(`${queue}.writing`);
  writeFileSync(path.join(`${queue}.writing`, path.basename(dead)), "");
  slotState(slots);
  assert.ok(existsSync(live), "a reader must not take a half-written ticket for a dead one and remove it");
  assert.deepEqual(readdirSync(queue), [path.basename(live)]);
  assert.deepEqual(readdirSync(`${queue}.writing`), [], "a dead writer's unfinished copy is removed");
});

test("CIP-11: two waiters reclaiming the same dead owner cannot remove its live successor", async () => {
  const slots = directory();
  const held = path.join(slots, "heavy.held");
  const gone = Number(spawnSync(process.execPath, ["-p", "process.pid"], { encoding: "utf8" }).stdout);
  mkdirSync(held);
  writeFileSync(path.join(held, `1-${gone}.json`), JSON.stringify({ pid: gone, kind: "build", label: "dead", since: 1 }));
  const observed = slotState(slots).abandoned;
  assert.ok(observed?.marker);
  const live = hold(slots, "test", "successor");
  const runs = [live];
  try {
    await waitFor(live.started);
    releaseHolder(held, observed.marker); // a second cleaner resumes with the earlier observation
    assert.equal(slotState(slots).holder?.label, "successor");
    const waiting = hold(slots, "build", "queued");
    runs.push(waiting);
    await waitFor(() => slotState(slots).waiting.length === 1);
    assert.equal(waiting.started(), false);
    live.release();
    await waitFor(waiting.started);
    waiting.release();
    assert.deepEqual(await Promise.all(runs.map(run => run.done)), [0, 0]);
  } finally {
    for (const run of runs) run.stop();
    await Promise.allSettled(runs.map(run => run.done));
  }
});

test("SLOT-03: a waiter whose ticket is removed restores its place and acquires a released slot", async () => {
  const slots = directory(), queue = path.join(slots, "heavy.queue"), runs: ReturnType<typeof hold>[] = [];
  try {
    const first = hold(slots, "build", "first");
    runs.push(first);
    await waitFor(first.started);
    const waiter = hold(slots, "build", "waiter"); runs.push(waiter);
    await waitFor(() => slotState(slots).waiting.length === 1);
    for (const name of readdirSync(queue)) rmSync(path.join(queue, name), { force: true });
    await waitFor(() => slotState(slots).waiting.length === 1);
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
    set({}); assert.equal(slotWanted(), true);
    set({ CI: "true" }); assert.equal(slotWanted(), false);
    set({ NODE_ENV: "test" }); assert.equal(slotWanted(), false);
    set({ MOLIS_WORK_SLOT_HELD: "browser,build" }); assert.equal(slotWanted(), false);
    set({ MOLIS_WORK_SLOT: "off" }); assert.equal(slotWanted(), false);
    set({ MOLIS_WORK_SLOT: "on", NODE_ENV: "test" }); assert.equal(slotWanted(), true);
    set({ MOLIS_WORK_SLOT: "on", MOLIS_WORK_SLOT_HELD: "browser" }); assert.equal(slotWanted(), false, "a parent's slot is never taken twice");
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
