#!/usr/bin/env node
// One FIFO for heavy local work across checkouts (docs/system/PARALLEL-DEVELOPMENT.md §5).
// The kind describes the holder; builds, health checks and test batches contend for the same slot.
//
//   node scripts/machine-slot.mjs status                    who holds each slot and who waits
//   node scripts/machine-slot.mjs run <build|test|browser|health> [--label <text>] -- <command…>
//                                                           run a command while holding the slot
// No slot is taken in CI (CI=true), inside a test (NODE_ENV=test), in a child of a holder or with MOLIS_WORK_SLOT=off;
// MOLIS_WORK_SLOT=on takes it anyway (the tests of this file). The slots live in MOLIS_WORK_SLOT_DIR, else <tmpdir>/molis-work-slots.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import path from "node:path";
import { isMainScript } from "./script-paths.mjs";

const KINDS = ["build", "test", "browser", "health"];
const POLL_MS = 1000;
const ORPHAN_MS = 10_000;

export const slotDirectory = () => process.env.MOLIS_WORK_SLOT_DIR || path.join(tmpdir(), "molis-work-slots");

/** A nested command shares its parent's slot, even when its kind differs. */
export function slotWanted() {
  if (process.env.MOLIS_WORK_SLOT_HELD) return false;
  const mode = process.env.MOLIS_WORK_SLOT;
  return mode === "on" || (mode !== "off" && process.env.CI !== "true" && process.env.NODE_ENV !== "test");
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
};

// A ticket is named <arrival>-<pid>.json; NaN (a name that is not a ticket) counts as gone.
const ownerOf = (name) => Number(/-(\d+)\.json$/.exec(name)?.[1]);

const readJson = (file) => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } // gone or half-written: treated as absent
};

const describe = (info) => info ? `${info.label} (pid ${info.pid}, ${info.cwd}, since ${new Date(info.since).toLocaleTimeString()})` : "a process that is gone";

function ownerMarker(held) {
  try {
    return readdirSync(held)[0];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  }
}

/** The live holder and waiting tickets in arrival order. Only the head waiter reclaims an abandoned lock. */
export function slotState(directory = slotDirectory()) {
  const held = path.join(directory, "heavy.held");
  const marker = ownerMarker(held);
  const info = marker && readJson(path.join(held, marker));
  const holder = info && alive(info.pid) ? info : null;
  const expired = !holder && (Boolean(info) || Date.now() - (statSync(held, { throwIfNoEntry: false })?.mtimeMs ?? Date.now()) > ORPHAN_MS);
  const abandoned = expired ? { marker } : null;
  const queue = path.join(directory, "heavy.queue");
  mkdirSync(queue, { recursive: true });
  const waiting = [];
  for (const name of readdirSync(queue).sort()) {
    // Whose ticket it is comes from its name, not its contents, so a ticket another waiter cannot read is still a live place.
    if (!alive(ownerOf(name))) { rmSync(path.join(queue, name), { force: true }); continue; }
    const ticket = readJson(path.join(queue, name));
    if (ticket) waiting.push({ ...ticket, name });
  }
  const writing = `${queue}.writing`;
  for (const name of existsSync(writing) ? readdirSync(writing) : []) if (!alive(ownerOf(name))) rmSync(path.join(writing, name), { recursive: true, force: true });
  return { holder, waiting, abandoned };
}

// Written whole beside the queue and renamed into it, so no reader sees it half-written (and none reads the half-written copy).
const writeTicket = (ticket, info) => {
  const writing = path.join(`${path.dirname(ticket)}.writing`, path.basename(ticket));
  mkdirSync(path.dirname(writing), { recursive: true });
  writeFileSync(writing, JSON.stringify(info));
  renameSync(writing, ticket);
};

// Publish a nonempty directory atomically. Its unique marker lets a delayed cleanup remove only the owner it observed.
function tryTake(held, ticket, info) {
  const marker = path.basename(ticket);
  const staging = path.join(`${path.dirname(ticket)}.writing`, marker);
  mkdirSync(staging);
  try {
    writeFileSync(path.join(staging, marker), JSON.stringify(info));
    renameSync(staging, held);
    return true;
  } catch (error) {
    if (error.code === "EEXIST" || error.code === "ENOTEMPTY") return false;
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function releaseHolder(held, marker) {
  try {
    if (marker) unlinkSync(path.join(held, marker));
    rmdirSync(held);
  } catch (error) {
    // Another waiter finished cleanup, or an occupied directory has already replaced the empty one.
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
  }
}

/**
 * Waits for `kind` in order of arrival and takes it. Resolves to a release function (also run on exit). Resolves at once, holding
 * nothing, when slotWanted() is false. `say` gets one line whenever the holder changes while waiting.
 */
export async function acquireSlot(kind, { label = path.basename(process.cwd()), say = (line) => console.log(line), directory = slotDirectory() } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`machine-slot: unknown slot ${kind} (${KINDS.join(", ")})`);
  if (!slotWanted()) return () => {};
  const info = { kind, label, pid: process.pid, cwd: process.cwd(), since: Date.now() };
  const queue = path.join(directory, "heavy.queue");
  mkdirSync(queue, { recursive: true });
  const ticket = path.join(queue, `${String(info.since).padStart(15, "0")}-${process.pid}.json`);
  writeTicket(ticket, info);
  const held = path.join(directory, "heavy.held");
  let shown = "";
  for (;;) {
    const { holder, waiting, abandoned } = slotState(directory);
    // A place that went missing (removed from outside) is taken again with its first arrival time, so the run cannot wait forever.
    if (!waiting.some((entry) => entry.pid === process.pid)) { writeTicket(ticket, info); continue; }
    const first = waiting[0]?.pid === process.pid;
    if (first && !holder) {
      if (abandoned) releaseHolder(held, abandoned.marker);
      if (tryTake(held, ticket, { ...info, since: Date.now() })) break;
    }
    const now = holder ? describe(holder) : `nobody, ${waiting.findIndex((entry) => entry.pid === process.pid)} ahead in the queue`;
    if (now !== shown) say(`machine-slot: waiting for the heavy slot, held by ${now}; ${waiting.length - 1} other(s) queued`);
    shown = now;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  rmSync(ticket, { force: true });
  process.env.MOLIS_WORK_SLOT_HELD = kind;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    delete process.env.MOLIS_WORK_SLOT_HELD;
    process.removeListener("exit", release);
    releaseHolder(held, path.basename(ticket));
  };
  process.once("exit", release);
  return release;
}

async function main(args) {
  if (args[0] === "status") {
    const { holder, waiting } = slotState();
    console.log(`heavy: ${holder ? `1/1 occupied; ${holder.kind} ${describe(holder)}` : "0/1 occupied; free"}${waiting.length ? `; waiting: ${waiting.map(describe).join(" | ")}` : ""}`);
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

if (isMainScript(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
