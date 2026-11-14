// What the two merge drivers (scripts/merge-drivers/driver.mjs) know about the files `.gitattributes` gives them, and the list of
// files a merge left for regeneration. docs/system/PARALLEL-DEVELOPMENT.md §2.1 says which files these are and why.
//
// molis-json      a three-way merge by key (scripts/merge-drivers/json-merge.mjs). An array is merged only where ARRAY_IDENTITIES
//                 names how its elements are told apart; any other array changed on both sides is a conflict.
// molis-snapshot  a generated snapshot: take the incoming side, list the path, and let `pnpm merge:regenerate`
//                 (scripts/regenerate-after-merge.mjs) rewrite it from the merged source.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Arrays the JSON driver may merge element by element, per file: a path pattern (object keys joined with ".", "*" for any key, ""
 * for the top-level value) and the fields that tell two elements apart, or "self" when the element is its own identity (a set of
 * strings, or of small records where every field is identity). Order of elements is not meaningful in any of these: each is read as
 * a set or a table by its reader.
 */
export const ARRAY_IDENTITIES = {
  // A carrier is {file, key, pattern}; generate-versions.mjs applies every one of them, in no particular order.
  "tooling/versions.json": { carriers: "self" },
  // One row per exempted literal; version-declarations.mjs and initial-versions.mjs look rows up by file and name (or entry, row).
  "tooling/gates/version-exceptions.json": { "": ["file", "name", "entry", "row"] },
  // Path lists: "the most specific path wins" (error-owners.mjs), so each list is a set.
  "tooling/gates/error-owners.json": { "owners.*.paths": "self", "platform.prefixes": "self" },
};

/**
 * What to run after a merge took or merged these files, in the order of REGENERATE_STEPS. `pnpm build` comes after
 * `versions:generate` (the build only checks the version outputs and fails while they are stale) and before the two snapshots that
 * read the built packages.
 */
export const REGENERATE_STEPS = [
  { id: "versions", command: ["pnpm", "versions:generate"], matches: (file) => file === "tooling/versions.json" },
  { id: "build", command: ["pnpm", "build"], needs: ["actions", "schemas"] },
  { id: "api", command: ["pnpm", "api:update"], matches: (file) => file.startsWith("tooling/gates/api/") },
  { id: "actions", command: ["pnpm", "actions:update"], matches: (file) => /^tooling\/gates\/actions\/[^/]+\.tsv$/.test(file) },
  { id: "schemas", command: ["pnpm", "schemas:update"], matches: (file) => file === "tooling/gates/schemas/stores.tsv" },
];

/** The steps a list of merged paths needs, in order (a step with `needs` runs when any step it serves does). */
export function stepsFor(files) {
  const wanted = new Set(REGENERATE_STEPS.filter(step => step.matches && files.some(file => step.matches(file))).map(step => step.id));
  return REGENERATE_STEPS.filter(step => wanted.has(step.id) || (step.needs ?? []).some(id => wanted.has(id)));
}

/** Does merging this file leave something to regenerate? */
export const needsRegeneration = (file) => REGENERATE_STEPS.some(step => step.matches?.(file));

const LIST_NAME = "molis-merge-regenerate";

/**
 * The per-worktree list of paths waiting for regeneration: `git rev-parse --git-path` gives each worktree its own file under
 * .git/worktrees/<name>/ (and .git/ for the main checkout), so two worktrees merging at once do not share one list.
 */
export function regenerationList(cwd = process.cwd()) {
  const listed = execFileSync("git", ["rev-parse", "--git-path", LIST_NAME], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return path.resolve(cwd, listed);
}

export function recordForRegeneration(file, cwd = process.cwd()) {
  appendFileSync(regenerationList(cwd), `${file}\n`);
}

export function readRegenerationList(cwd = process.cwd()) {
  const list = regenerationList(cwd);
  if (!existsSync(list)) return [];
  return [...new Set(readFileSync(list, "utf8").split("\n").map(line => line.trim()).filter(Boolean))].sort();
}

export function clearRegenerationList(cwd = process.cwd()) {
  rmSync(regenerationList(cwd), { force: true });
}
