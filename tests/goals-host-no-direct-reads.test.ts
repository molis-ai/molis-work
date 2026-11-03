import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// PG-094 S4 (PG094-06): the Host reads Goals' facts through Goals' actions, not through the objects Goals composes. The lists of what
// still held those objects (the coordinator and the table readers) were frozen, and S12 emptied them: Goals composes its own
// application inside its plugin, so any holder that appears again fails.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(directory: string): string[] {
  return execFileSync("git", ["ls-files", directory], { cwd: ROOT, encoding: "utf8" }).split("\n")
    .filter(path => /\.(ts|mjs|js)$/.test(path) && /\/src\//.test(path));
}

function count(path: string, word: RegExp): number {
  return (readFileSync(join(ROOT, path), "utf8").match(word) ?? []).length;
}

/** Every file under `apps/` that names `word`, with how many times: the Host's holders of that object. */
function holders(word: RegExp): Record<string, number> {
  const found: Record<string, number> = {};
  for (const path of sourceFiles("apps")) {
    const n = count(path, word);
    if (n) found[path] = n;
  }
  return found;
}

test("PG094-06 RAC-250 the web layer never holds Goals' coordinator: the project context carries no coordinator and the Goals page reads through actions", () => {
  for (const path of sourceFiles("apps/local-host").filter(path => /\/src\/web-[^/]*\.ts$/.test(path))) {
    assert.equal(count(path, /\bcoordinator\b/g), 0, `${path} does not name the Goals coordinator`);
    assert.equal(count(path, /\bGoalProjectApplication\b/g), 0, `${path} does not name the coordinator's class`);
  }
  const context = readFileSync(join(ROOT, "apps/local-host/src/web-project-context.ts"), "utf8");
  assert.doesNotMatch(context, /MolisWorkProjectRuntime\["coordinator"\]/, "the project request context does not carry the coordinator");
});

test("PG094-06 RAC-251 / PG-094 S12 no Host object holds a Goals coordinator: the frozen list of holders is empty and the class is gone", () => {
  assert.deepEqual(holders(/\bcoordinator\b|\bGoalProjectApplication\b/g), {}, "read Goals through its actions; the Host composes none of its objects");
  assert.equal(existsSync(join(ROOT, "apps/local-host/src/goal-project-application.ts")), false, "the coordinator file stays deleted");
});

test("PG094-06 RAC-252 / PG-094 S12 no Host object reads Goals' tables: the other apps, the command line and the MCP server read none either", () => {
  assert.deepEqual(holders(/\bgoalsQuery\b|\bcreateGoalReadServices\b|\breadMolisWorkSnapshot\b/g), {}, "read Goals' facts through Goals' actions");
});
