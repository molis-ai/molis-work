#!/usr/bin/env node
// Rewrite what a merge left stale (docs/system/PARALLEL-DEVELOPMENT.md §2.1). The snapshot merge driver takes the incoming side of a
// generated file and lists its path; the JSON driver lists tooling/versions.json when it merged it. This reads the worktree's list
// (scripts/merge-drivers/rules.mjs), runs each generator the listed paths need, in order, and clears the list when all of them pass.
//
//   pnpm merge:regenerate                        run what the list needs (nothing listed: nothing to do)
//   node scripts/regenerate-after-merge.mjs --dry-run   print the listed paths and the commands, run nothing
//   node scripts/regenerate-after-merge.mjs --all       run every generator, list or not (after a rebase, or when unsure)
//
// Forgetting it is caught: the health gate and the contract tests fail while a snapshot differs from the source, and `pnpm build`
// fails while the version outputs are stale. The rewritten files are left for you to look at and commit.
import { spawnSync } from "node:child_process";
import { REGENERATE_STEPS, clearRegenerationList, readRegenerationList, regenerationList, stepsFor } from "./merge-drivers/rules.mjs";

const args = process.argv.slice(2);
const unknown = args.filter(arg => arg !== "--dry-run" && arg !== "--all");
if (unknown.length) {
  console.error(`regenerate-after-merge: unknown argument ${unknown.join(" ")}\nusage: regenerate-after-merge.mjs [--dry-run] [--all]`);
  process.exit(2);
}
const listed = readRegenerationList();
const steps = args.includes("--all") ? REGENERATE_STEPS : stepsFor(listed);
if (!steps.length) {
  console.log(listed.length ? `nothing to regenerate for ${listed.join(", ")}` : "no merge left a generated file to regenerate");
  if (!args.includes("--dry-run")) clearRegenerationList();
  process.exit(0);
}
if (listed.length) console.log(`listed by the merge (${regenerationList()}):\n  ${listed.join("\n  ")}`);
for (const step of steps) {
  console.log(`$ ${step.command.join(" ")}`);
  if (args.includes("--dry-run")) continue;
  const run = spawnSync(step.command[0], step.command.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
  if (run.status !== 0) {
    console.error(`regenerate-after-merge: ${step.command.join(" ")} failed; the list is kept, run this again after fixing it`);
    process.exit(1);
  }
}
if (!args.includes("--dry-run")) {
  clearRegenerationList();
  console.log("regenerated; review the diff and commit it with the merge");
}
