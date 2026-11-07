// UPG1-05: fault only the real filesystem boundary, then run the public upgrade: SIGKILL just before the n-th call that changes a file (or
// flushes one), or print the order of those calls. Without `kill`, a step can also kill the process inside its transaction. There is no
// test seam in the production code for this; the descriptors are the same ones a test would register.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";

const [home, scenario, mode] = process.argv.slice(2);
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

const { registerHomeUpgradeDescriptors, runHomeUpgrade } = await import("@molis-ai/molis-work-app-local-host");
const V2 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '');";
const ADD_TAG = "ALTER TABLE notes ADD COLUMN tag TEXT NOT NULL DEFAULT ''";
const step = name => {
  if (scenario === "fail" && name === "beta") return { from: 1, run: db => { db.exec(ADD_TAG); throw new Error("the step's own words"); } };
  if (scenario === "die-in-step" && name === "beta") return { from: 1, run: db => { db.exec(ADD_TAG); process.kill(process.pid, "SIGKILL"); } };
  return { from: 1, sql: ADD_TAG };
};
registerHomeUpgradeDescriptors(() => ["alpha", "beta"].map(name => ({
  owner: "tests/notes", pattern: `${name}/${name}.db`, baseline: { version: 2, schema: V2, upgrades: [step(name)] }, open: file => new DatabaseSync(file),
})));
armed = true;
runHomeUpgrade(home);
armed = false;
process.stdout.write(JSON.stringify(trace));
