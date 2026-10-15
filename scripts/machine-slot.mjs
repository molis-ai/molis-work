#!/usr/bin/env node
// Machine-wide slots for the heavy local runs (docs/system/PARALLEL-DEVELOPMENT.md §5): one workspace build and one browser test
// batch at a time on this machine, across every checkout and session. A run that finds its slot taken waits its turn in order of
// arrival and says who holds it; a slot or a place in the queue whose process is gone is taken over. Nothing to poll by hand.
//
//   node scripts/machine-slot.mjs status                    who holds each slot and who waits
//   node scripts/machine-slot.mjs run <build|browser> [--label <text>] -- <command…>
//                                                           run a command while holding the slot
// scripts/build-workspace.mjs takes `build`, scripts/run-tests.mjs takes `browser` when a run has a browser file (the full suite
// included), so neither needs this wrapper. No slot is taken in CI (CI=true), inside a test (NODE_ENV=test, which the test runner
// gives every test process), in a process whose parent already holds that slot (MOLIS_WORK_SLOT_HELD), or with MOLIS_WORK_SLOT=off;
// MOLIS_WORK_SLOT=on takes it anyway (the tests of this file). The slots live in MOLIS_WORK_SLOT_DIR, else <tmpdir>/molis-work-slots.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KINDS = ["build", "browser"];
const POLL_MS = 1000;
const ORPHAN_MS = 10_000;

export const slotDirectory = () => process.env.MOLIS_WORK_SLOT_DIR || path.join(tmpdir(), "molis-work-slots");

const heldKinds = () => (process.env.MOLIS_WORK_SLOT_HELD ?? "").split(",").filter(Boolean);

/** Whether this process should take `kind` at all (see the header). */
export function slotWanted(kind) {
  const mode = process.env.MOLIS_WORK_SLOT;
  if (mode === "on") return !heldKinds().includes(kind);
  if (mode === "off" || process.env.CI === "true" || process.env.NODE_ENV === "test") return false;
  return !heldKinds().includes(kind);
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
};

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } // gone or half-written: treated as absent
};

const describe = (info) => info ? `${info.label} (pid ${info.pid}, ${info.cwd}, since ${new Date(info.since).toLocaleTimeString()})` : "a process that is gone";

/** The holder of `kind` (null when free) and the live tickets waiting for it, oldest first; dead ones are removed. */
export function slotState(kind, directory = slotDirectory()) {
  const held = path.join(directory, `${kind}.held`);
  let holder = readJson(path.join(held, "info.json"));
  if (holder && !alive(holder.pid)) { rmSync(held, { recursive: true, force: true }); holder = null; }
  // A holder that died between making the directory and writing its info leaves the directory alone: taken over after a while.
  if (!holder && existsSync(held) && Date.now() - statSync(held).mtimeMs > ORPHAN_MS) rmSync(held, { recursive: true, force: true });
  const queue = path.join(directory, `${kind}.queue`);
  mkdirSync(queue, { recursive: true });
  const waiting = [];
  for (const name of readdirSync(queue).sort()) {
    const ticket = readJson(path.join(queue, name));
    if (ticket && alive(ticket.pid)) waiting.push({ ...ticket, name });
    else rmSync(path.join(queue, name), { force: true });
  }
  return { holder, waiting };
}

const tryTake = (held, info) => {
  try { mkdirSync(held); } catch { return false; } // someone else made it first
  writeFileSync(path.join(held, "info.json"), JSON.stringify(info));
  return true;
};

/**
 * Waits for `kind` in order of arrival and takes it. Resolves to a release function (also run on exit). Resolves at once, holding
 * nothing, when slotWanted(kind) is false. `say` gets one line whenever the holder changes while waiting.
 */
export async function acquireSlot(kind, { label = path.basename(process.cwd()), say = (line) => console.log(line), directory = slotDirectory() } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`machine-slot: unknown slot ${kind} (${KINDS.join(", ")})`);
  if (!slotWanted(kind)) return () => {};
  const info = { kind, label, pid: process.pid, cwd: process.cwd(), since: Date.now() };
  const queue = path.join(directory, `${kind}.queue`);
  mkdirSync(queue, { recursive: true });
  const ticket = path.join(queue, `${String(info.since).padStart(15, "0")}-${process.pid}.json`);
  writeFileSync(ticket, JSON.stringify(info));
  const held = path.join(directory, `${kind}.held`);
  let shown = "";
  for (;;) {
    const { holder, waiting } = slotState(kind, directory);
    const first = waiting[0]?.pid === process.pid;
    if (!holder && first && tryTake(held, { ...info, since: Date.now() })) break;
    const now = holder ? describe(holder) : `nobody, ${waiting.findIndex((entry) => entry.pid === process.pid)} ahead in the queue`;
    if (now !== shown) say(`machine-slot: waiting for the ${kind} slot, held by ${now}; ${waiting.length - 1} other(s) queued`);
    shown = now;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  rmSync(ticket, { force: true });
  process.env.MOLIS_WORK_SLOT_HELD = [...heldKinds(), kind].join(",");
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (readJson(path.join(held, "info.json"))?.pid === process.pid) rmSync(held, { recursive: true, force: true });
  };
  process.once("exit", release);
  return release;
}

async function main(args) {
  if (args[0] === "status") {
    for (const kind of KINDS) {
      const { holder, waiting } = slotState(kind);
      console.log(`${kind}: ${holder ? describe(holder) : "free"}${waiting.length ? `; waiting: ${waiting.map(describe).join(" | ")}` : ""}`);
    }
    return 0;
  }
  const split = args.indexOf("--");
  const [verb, kind, ...rest] = split < 0 ? args : args.slice(0, split);
  const command = split < 0 ? [] : args.slice(split + 1);
  const labelAt = rest.indexOf("--label");
  if (verb !== "run" || !KINDS.includes(kind) || !command.length || (labelAt >= 0 && !rest[labelAt + 1])) {
    console.error(`usage: machine-slot.mjs status | run <${KINDS.join("|")}> [--label <text>] -- <command…>`);
    return 2;
  }
  const release = await acquireSlot(kind, { label: labelAt >= 0 ? rest[labelAt + 1] : command.join(" ").slice(0, 60) });
  const child = spawn(command[0], command.slice(1), { stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => child.kill(signal));
  const code = await new Promise((resolve) => child.once("exit", (exitCode, signal) => resolve(exitCode ?? 128 + (constants.signals[signal] ?? 15))));
  release();
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
