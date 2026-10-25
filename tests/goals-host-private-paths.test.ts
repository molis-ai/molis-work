import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// PG-094 S12 (specs/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §6): the Host keeps no private road to Goals. A static
// scan of its source, so the paths stay deleted: a person's act reaches Goals as one more caller of the registered actions, with the
// provenance its entry gives (`entryUserAction`) and the permissions the installation's grants solve (`localWebActionContext`).

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOST = join(ROOT, "apps", "local-host", "src");

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|mts)$/u.test(name) ? [path] : [];
  });
}
const text = (path: string) => readFileSync(path, "utf8");
const where = (paths: string[]) => paths.map(path => relative(ROOT, path)).join(", ");

test("RAC-713 the Host's own copy of the Goals application is gone, and nothing in the Host builds one", () => {
  assert.equal(existsSync(join(HOST, "goal-project-application.ts")), false);
  const found = sources(HOST).filter(path => /\bGoalProjectApplication\b|\bgovernanceSqlite\b|\bopenGoalsStorage\b/u.test(text(path)));
  assert.deepEqual(found, [], `the Host holds Goals' application or storage again: ${where(found)}`);
});

test("RAC-713 the Host hand-writes no authority for Goals: no per-action provenance, no pin permission list, no Goals-owned decision authority", () => {
  const symbols = sources(HOST).filter(path => /\bpinPermissions\b|\bmanagementTreeAuthority\b|\bmanagementEventDecisionAuthority\b|\bhostEventDecisionAuthority\b/u.test(text(path)));
  assert.deepEqual(symbols, [], `a hand-written Goals authority is back in the Host: ${where(symbols)}`);

  // A person's act gets its provenance from `entryUserAction` alone; a literal `user_action` in a Goals caller is the old private road.
  for (const name of ["goal-callers.ts", "personal-planning-actions.ts"]) {
    const source = text(join(HOST, name));
    assert.doesNotMatch(source, /user_action\s*:\s*\{/u, `${name} writes a user_action by hand`);
    assert.doesNotMatch(source, /source\s*:\s*"(?:web|management)"\s*,\s*conversation_ref/u, `${name} writes a provenance by hand`);
  }
  // The page entry binds the person once for every action; it does not know which action it carries (that was the old per-action branches).
  const callers = text(join(HOST, "goal-callers.ts"));
  const start = callers.indexOf("export function bindGoalsWebActions");
  assert.notEqual(start, -1, "bindGoalsWebActions is gone or renamed: update this scan");
  const web = callers.slice(start, callers.indexOf("\n}\n", start));
  assert.doesNotMatch(web, /goalsActions\.|capability_id/u, "bindGoalsWebActions branches on an action");
});

test("RAC-713 the person at this machine holds no Goals permission of their own; the installation's grants are what reach Goals", () => {
  const owner = text(join(HOST, "local-owner-permissions.ts"));
  assert.doesNotMatch(owner, /["']goals:[a-z-]+["']/u, "LOCAL_OWNER_PERMISSIONS names a goals permission");
  const found = sources(HOST).filter(path => /\bGOALS_ACTION_PERMISSIONS\b/u.test(text(path)));
  assert.deepEqual(found, [], `the Host lists Goals' permissions itself: ${where(found)}`);
});

test("RAC-715 Goals' tables have one owner: the table-owner gate passes with no table shared between Goals and the Host", () => {
  const registry = JSON.parse(text(join(ROOT, "tooling", "gates", "table-owners.json"))) as { shared: Record<string, { packages: string[] }> };
  const shared = Object.entries(registry.shared).filter(([, entry]) => entry.packages.some(name => name.includes("goals"))).map(([table]) => table);
  assert.deepEqual(shared, [], "a Goals table is listed as shared with another package; the Host calls Goals' actions instead");
  const gate = spawnSync(process.execPath, [join(ROOT, "scripts", "gates", "table-owners.mjs")], { encoding: "utf8" });
  assert.equal(gate.status, 0, gate.stdout + gate.stderr);
});
