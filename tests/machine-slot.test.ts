// scripts/machine-slot.mjs: one build and one browser batch at a time on the machine. A second run waits for the first and says who
// holds the slot, runs wait in order of arrival, a holder whose process is gone is taken over, and no slot is taken in CI, inside a
// test, or under a parent that holds it already.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { slotWanted } from "../scripts/machine-slot.mjs";

const tool = fileURLToPath(new URL("../scripts/machine-slot.mjs", import.meta.url));
const scratch: string[] = [];
const directory = () => { const made = mkdtempSync(path.join(tmpdir(), "molis-machine-slot-")); scratch.push(made); return made; };
after(() => { for (const made of scratch) rmSync(made, { recursive: true, force: true }); });
const environment = (slots: string) => ({ ...process.env, MOLIS_WORK_SLOT: "on", MOLIS_WORK_SLOT_DIR: slots, MOLIS_WORK_SLOT_HELD: "" });

// Runs `run build` with a command that appends `<name> start`, sleeps, appends `<name> end`; resolves to its output.
const holdBuild = (slots: string, log: string, name: string, ms: number) => new Promise<string>((resolve) => {
  const script = `const fs=require("node:fs");fs.appendFileSync(${JSON.stringify(log)},"${name} start\\n");setTimeout(()=>{fs.appendFileSync(${JSON.stringify(log)},"${name} end\\n")},${ms})`;
  const child = spawn(process.execPath, [tool, "run", "build", "--label", name, "--", process.execPath, "-e", script], { env: environment(slots) });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.once("exit", () => resolve(output));
});

test("run: a second and a third run wait their turn, in order of arrival, and say who holds the slot", async () => {
  const slots = directory(), log = path.join(slots, "log");
  const first = holdBuild(slots, log, "first", 1500);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const second = holdBuild(slots, log, "second", 200);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const third = holdBuild(slots, log, "third", 200);
  const [, waited] = await Promise.all([first, second, third]);
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"), ["first start", "first end", "second start", "second end", "third start", "third end"]);
  assert.match(waited, /waiting for the build slot, held by first \(pid \d+/);
});

test("run: a holder whose process is gone is taken over at once", () => {
  const slots = directory();
  const gone = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
  mkdirSync(path.join(slots, "build.held"), { recursive: true });
  writeFileSync(path.join(slots, "build.held", "info.json"), JSON.stringify({ kind: "build", label: "crashed", pid: Number(gone.stdout.trim()), cwd: "/", since: Date.now() }));
  const run = spawnSync(process.execPath, [tool, "run", "build", "--", process.execPath, "-e", "process.exit(3)"], { env: environment(slots), encoding: "utf8", timeout: 20_000 });
  assert.equal(run.status, 3, "the command ran, and its exit code is the run's");
  assert.doesNotMatch(run.stdout, /waiting/);
  const status = spawnSync(process.execPath, [tool, "status"], { env: environment(slots), encoding: "utf8" });
  assert.match(status.stdout, /^build: free$/m, "released after the command");
});

test("slotWanted: not in CI, not inside a test, not when a parent holds it; MOLIS_WORK_SLOT=off and =on decide first", () => {
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

test("usage: an unknown slot or a missing command is exit 2", () => {
  for (const args of [["run", "gpu", "--", "true"], ["run", "build"], ["nothing"]]) {
    assert.equal(spawnSync(process.execPath, [tool, ...args], { encoding: "utf8" }).status, 2, args.join(" "));
  }
});
