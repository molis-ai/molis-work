// A fixed clock and seeded ids for one generation of a golden Home (specs/upgrade-continuity/golden-replay-design.md §2): the product has no
// injection point for them, and should not get one for a test, so the process replaces them before it loads any product code. Install this
// first; everything else is imported dynamically after it.
//
// Time stands still for the whole generation, periods included: a Host's round every 30 seconds is about time passing, and how much real time a
// generation takes is the machine's business. On a slow enough one the round came due and woke what was due (Feed's job is due the moment it is
// registered), which is a row that is there or not, so no normalized column can make it the same. A short timer still runs: that is code waiting
// for something else to settle, and what it records must not depend on which step it landed in. The id stream is keyed by the step and by the line asking, not by a global counter: anything in
// the background may take an id any number of times, and that must not shift what other code gets. A step does not start until the last one has
// gone quiet, so what a step started in the background lands in that step.
import childProcess from "node:child_process";
import crypto, { createHash } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import timers from "node:timers";
import { fileURLToPath } from "node:url";
import { freezeDate, GENERATION_START } from "./generation-clock.mjs";

const QUIET_MILLISECONDS = 150;
/** A period this long never comes due. The longest one that has to run for a generation to work is 2 seconds, and the shortest of the Host's rounds is 20. */
const LONG_PERIOD_MILLISECONDS = 10_000;
const LONGEST_TIMER_MILLISECONDS = 2 ** 31 - 1;
const THIS_FILE = path.basename(fileURLToPath(import.meta.url));

/** The two nearest frames outside this file, by file name and position: the same across checkouts, unlike a path. */
function callerKey() {
  const lines = new Error().stack.split("\n").slice(1).filter(line => !line.includes(THIS_FILE));
  return lines.slice(0, 2).map(line => /([^/\\(\s]+:\d+:\d+)\)?$/u.exec(line)?.[1] ?? "").join("|");
}

export function installDeterminism(seed) {
  const realNow = Date.now;
  let label = "start", counters = new Map(), lastUse = realNow();

  freezeDate(GENERATION_START);

  // Still a real timer, so whoever holds it can unref and clear it as usual. Only its callback is gone.
  const realInterval = globalThis.setInterval;
  const standingInterval = (callback, period, ...rest) => period >= LONG_PERIOD_MILLISECONDS
    ? realInterval(() => undefined, LONGEST_TIMER_MILLISECONDS)
    : realInterval(callback, period, ...rest);
  globalThis.setInterval = standingInterval;
  timers.setInterval = standingInterval;

  // A forked process runs on the same clock: the statement process enforces the deadlines this one gives it (scripts/golden/frozen-clock.mjs).
  const realFork = childProcess.fork;
  childProcess.fork = (module, args, options) => realFork(module, args, { ...options, execArgv: [...(options?.execArgv ?? []), "--import", new URL("./frozen-clock.mjs", import.meta.url).href] });

  // Still a real timer, so whoever holds it can unref and clear it as usual. Only its callback is gone.
  const realInterval = globalThis.setInterval;
  const standingInterval = (callback, period, ...rest) => period >= LONG_PERIOD_MILLISECONDS
    ? realInterval(() => undefined, LONGEST_TIMER_MILLISECONDS)
    : realInterval(callback, period, ...rest);
  globalThis.setInterval = standingInterval;
  timers.setInterval = standingInterval;

  const fill = (target, offset = 0, size = target.length - offset) => {
    lastUse = realNow();
    const key = callerKey(), first = counters.get(key) ?? 0;
    let block = Buffer.alloc(0), counter = first;
    for (let at = 0; at < size; at++) {
      if (at % 32 === 0) block = createHash("sha256").update(`${seed}:${label}:${key}:${counter++}`).digest();
      target[offset + at] = block[at % 32];
    }
    counters.set(key, counter);
    return target;
  };
  const bytes = size => fill(Buffer.alloc(size));
  const uuid = () => {
    const value = bytes(16);
    value[6] = (value[6] & 0x0f) | 0x40; value[8] = (value[8] & 0x3f) | 0x80;
    const hex = value.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const later = (callback, value) => { if (callback) { setImmediate(callback, null, value); return undefined; } return value; };

  // Ids in the Prologue SDK and in Shelf come from Math.random, not from crypto.
  Math.random = () => bytes(6).readUIntBE(0, 6) / 2 ** 48;
  crypto.randomUUID = uuid;
  crypto.randomBytes = (size, callback) => later(callback, bytes(size));
  crypto.randomFillSync = (target, offset, size) => fill(target, offset, size);
  crypto.randomFill = (target, ...rest) => { const callback = rest.pop(); setImmediate(callback, null, fill(target, ...rest)); };
  const web = globalThis.crypto;
  Object.defineProperty(web, "randomUUID", { value: uuid, configurable: true });
  Object.defineProperty(web, "getRandomValues", { value: target => { fill(new Uint8Array(target.buffer, target.byteOffset, target.byteLength)); return target; }, configurable: true });
  syncBuiltinESMExports();

  return {
    /** Everything from here until the next step reads this id stream. */
    async step(name) {
      while (realNow() - lastUse < QUIET_MILLISECONDS) await new Promise(resolve => setTimeout(resolve, QUIET_MILLISECONDS));
      label = name; counters = new Map();
    },
  };
}
