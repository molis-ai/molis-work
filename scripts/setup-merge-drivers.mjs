#!/usr/bin/env node
// Register the merge drivers `.gitattributes` names (docs/system/PARALLEL-DEVELOPMENT.md §2.1). `.gitattributes` only says which driver
// a file uses; git runs a driver only when the repository's config defines it, so without this every file merges as plain text.
//
//   node scripts/setup-merge-drivers.mjs           register (or confirm) the drivers; runs on every `pnpm install` (the root `prepare`)
//   node scripts/setup-merge-drivers.mjs --check   exit 1 when they are not registered as below
//
// The config goes into the repository's shared config, so every worktree has it; the command is relative ("node scripts/…"), and git
// runs a merge driver from the top of the worktree that merges, so each worktree runs its own copy of the driver. Running it again
// changes nothing. It never fails an install: outside a git checkout, or when git refuses the write, it says so and exits 0.
import { execFileSync } from "node:child_process";
import { isMainScript } from "./script-paths.mjs";

export const MERGE_DRIVERS = {
  "molis-json": {
    name: "Molis Work: three-way merge of JSON by key",
    driver: "node scripts/merge-drivers/driver.mjs json %O %A %B %L %P %S %X %Y",
  },
  "molis-snapshot": {
    name: "Molis Work: take the incoming generated snapshot and list it for pnpm merge:regenerate",
    driver: "node scripts/merge-drivers/driver.mjs snapshot %O %A %B %L %P %S %X %Y",
  },
};

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const current = (key, cwd) => { try { return git(["config", "--local", "--get", key], cwd); } catch { return undefined; } };

/** The settings that differ from MERGE_DRIVERS, as [key, wanted] pairs. */
export function missingSettings(cwd = process.cwd()) {
  return Object.entries(MERGE_DRIVERS).flatMap(([driver, settings]) => Object.entries(settings)
    .map(([field, value]) => [`merge.${driver}.${field}`, value])
    .filter(([key, value]) => current(key, cwd) !== value));
}

/** Write what is missing; returns "registered", "unchanged" or the reason nothing was written. */
export function setupMergeDrivers(cwd = process.cwd()) {
  try {
    if (git(["rev-parse", "--is-inside-work-tree"], cwd) !== "true") return "not a git checkout";
  } catch {
    return "not a git checkout";
  }
  const missing = missingSettings(cwd);
  for (const [key, value] of missing) git(["config", "--local", key, value], cwd);
  return missing.length ? "registered" : "unchanged";
}

if (isMainScript(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const missing = missingSettings();
    if (missing.length) {
      console.error(`merge drivers not registered: ${missing.map(([key]) => key).join(", ")}; run node scripts/setup-merge-drivers.mjs`);
      process.exit(1);
    }
    console.log("merge drivers registered");
  } else {
    let outcome;
    try { outcome = setupMergeDrivers(); } catch (error) { outcome = `git config failed (${error instanceof Error ? error.message.split("\n")[0] : error})`; }
    if (outcome === "registered") console.log("merge drivers: registered molis-json and molis-snapshot (docs/system/PARALLEL-DEVELOPMENT.md §2.1)");
    else if (outcome !== "unchanged") console.log(`merge drivers: not registered, ${outcome}; JSON tables and snapshots will merge as plain text`);
  }
}
