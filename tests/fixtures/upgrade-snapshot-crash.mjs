// Fault only the real filesystem boundary, then run the public capture or restore: SIGKILL just before the n-th call that changes a file
// (or flushes one), or print the order of those calls. No test seam exists in the production code for this.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [home, relativePath, runId, operation, mode] = process.argv.slice(2);
const kill = mode === "trace" ? undefined : Number(mode), trace = [];
const descriptors = new Map();
let armed = false, calls = 0;
const before = (name, path) => {
  if (!armed) return;
  calls += 1;
  if (calls === kill) process.kill(process.pid, "SIGKILL");
  trace.push(`${name}:${path === undefined ? "" : basename(String(path))}`);
};
const pathArgument = (name, fd) => name === "fsyncSync" ? descriptors.get(fd) : fd;
for (const name of ["rmSync", "unlinkSync", "copyFileSync", "chmodSync", "fsyncSync", "renameSync", "mkdirSync", "writeFileSync"]) {
  const real = fs[name];
  fs[name] = function (...args) { before(name, pathArgument(name, args[0])); return real.apply(this, args); };
}
const realOpen = fs.openSync;
fs.openSync = function (path, ...args) { const fd = realOpen.call(this, path, ...args); descriptors.set(fd, String(path)); return fd; };
syncBuiltinESMExports();

const { acquireStorageOwner, captureUpgradeSnapshot, restoreUpgradeSnapshot } = await import("@molis-ai/molis-work-storage");
const owner = acquireStorageOwner(home), unit = { owner, home, runId, relativePath };
armed = true;
if (operation === "capture") captureUpgradeSnapshot(unit, path => new DatabaseSync(path));
else restoreUpgradeSnapshot(unit);
armed = false;
owner.release();
process.stdout.write(JSON.stringify(trace));
