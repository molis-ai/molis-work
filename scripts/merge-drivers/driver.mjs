#!/usr/bin/env node
// The git merge drivers `.gitattributes` names (registered by scripts/setup-merge-drivers.mjs; docs/system/PARALLEL-DEVELOPMENT.md §2.1).
//
//   node scripts/merge-drivers/driver.mjs json     %O %A %B %L %P %S %X %Y
//   node scripts/merge-drivers/driver.mjs snapshot %O %A %B %L %P %S %X %Y
//
// %O, %A and %B are the base, current and other versions; the result goes into %A, exit 0 is a clean merge and 1 a conflict.
//
// json      three-way merge by key (json-merge.mjs). A real conflict (one key given two values, an array changed on both sides) runs
//           git's own line merge into %A, so the file has the usual conflict markers, and exits 1.
// snapshot  a generated file: take %B, add the path to the worktree's regeneration list (rules.mjs) and say so on one line;
//           `pnpm merge:regenerate` rewrites it from the merged source. If the list cannot be written, nothing is taken.
//
// FAIL SAFE. Any error (unreadable input, a bug here) means falling back to exactly what git does without a driver: its line merge,
// clean or with markers. Nothing is written into %A until the merged text has been parsed back and compared.
import { spawnSync } from "node:child_process";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { mergeJsonText } from "./json-merge.mjs";
import { ARRAY_IDENTITIES, needsRegeneration, recordForRegeneration, regenerationList } from "./rules.mjs";

const [mode, basePath, currentPath, otherPath, markerSize = "7", file = "", baseLabel, currentLabel, otherLabel] = process.argv.slice(2);
const say = (line) => process.stderr.write(`merge-driver (${mode}) ${file}: ${line}\n`);
const label = (value, fallback) => (value && !/^%[SXY]$/.test(value) ? value : fallback);

/** Git's own line merge into the current file; returns the exit status the driver should give. */
function lineMerge() {
  const marker = /^\d+$/.test(markerSize) ? markerSize : "7";
  const merged = spawnSync("git", ["merge-file", `--marker-size=${marker}`,
    "-L", label(currentLabel, "ours"), "-L", label(baseLabel, "base"), "-L", label(otherLabel, "theirs"),
    currentPath, basePath, otherPath], { stdio: ["ignore", "ignore", "inherit"] });
  // merge-file exits with the number of conflicts (0 = clean) or a negative/large status on error; on error %A is still the current side.
  return merged.status === 0 ? 0 : 1;
}

/** Replace the current file in one step, so a failed write never leaves half a file for the fallback to merge. */
function replaceCurrent(content) {
  const temporary = `${currentPath}.molis-merge-${process.pid}`;
  try {
    writeFileSync(temporary, content);
    renameSync(temporary, currentPath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function testCrash() {
  // tests/merge-drivers.test.ts: proves a failure inside the driver still ends as git's own merge.
  if (process.env.MOLIS_MERGE_DRIVER_CRASH && process.env.MOLIS_MERGE_DRIVER_CRASH === file) throw new Error("crash requested by the test");
}

function mergeJson() {
  testCrash();
  const read = (path) => readFileSync(path, "utf8");
  const result = mergeJsonText(read(basePath), read(currentPath), read(otherPath), { identities: ARRAY_IDENTITIES[file] ?? {} });
  if (result.conflicts) {
    say(`both sides changed ${result.conflicts.slice(0, 5).join(", ")}${result.conflicts.length > 5 ? ` and ${result.conflicts.length - 5} more` : ""}; left to the line merge`);
    // Without this driver git would have taken a clean line merge as clean, so do the same: never report a conflict the file
    // shows no markers for (that state invites `git add` on our side only).
    if (lineMerge() === 0) {
      say("the lines merge cleanly although the values disagree, as a plain git merge would; check the file before you commit it");
      return 0;
    }
    return 1;
  }
  if (needsRegeneration(file)) recordForRegeneration(file);
  replaceCurrent(result.text);
  if (needsRegeneration(file)) say("merged by key; run `pnpm merge:regenerate` before building");
  return 0;
}

function takeSnapshot() {
  testCrash();
  const incoming = readFileSync(otherPath);
  recordForRegeneration(file);
  replaceCurrent(incoming);
  say(`took the incoming side; it is stale until \`pnpm merge:regenerate\` rewrites it (listed in ${regenerationList()})`);
  return 0;
}

let status;
try {
  if (mode === "json") status = mergeJson();
  else if (mode === "snapshot") status = takeSnapshot();
  else throw new Error(`unknown mode ${mode}`);
} catch (error) {
  say(`${error instanceof Error ? error.message : String(error)}; falling back to git's line merge`);
  try { status = lineMerge(); } catch { status = 1; }
}
process.exit(status);
