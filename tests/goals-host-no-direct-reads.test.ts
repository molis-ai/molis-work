import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// PG-094 S4 (PG094-06): the Host reads Goals' facts through Goals' actions, not through the objects Goals composes. What still
// holds those objects is a frozen, reasoned list; a new holder fails, and so does a list that has gone stale.
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

/** Why each holder still has the coordinator (`.coordinator` and its class), and which slice removes it. A count may only go down. */
const COORDINATOR_HOLDERS: Record<string, { references: number; why: string }> = {
  "apps/local-host/src/goal-project-application.ts": { references: 1, why: "builds the coordinator from Goals' factory; S9 moves the composition into the plugin" },
  "apps/local-host/src/goals-actions.ts": { references: 19, why: "hands the coordinator's parts to Goals' action handlers; S9 deletes this file" },
  "apps/local-host/src/project-host.ts": { references: 7, why: "the open project's runtime carries the coordinator; S9 (the supervisor starts Goals) removes it" },
  "apps/local-host/src/local-plugin-development.ts": { references: 1, why: "the isolated developer door makes its own library a project with a board, as `goals.board.initialize` does for the management door; S9 (PG094-11) calls the action instead" },
  "apps/local-host/src/artifact-actions.ts": { references: 1, why: "the Artifacts provider's `goalTitle` port; waits for T1 with Coding's family (PG-091)" },
  "apps/local-host/src/demo-seed.ts": { references: 40, why: "the sample project writes Goal facts directly; S9 and the sample seed" },
};

/** Where the Host still reads Goals' own tables through `goalsQuery`, `createGoalReadServices` or the snapshot reader. */
const TABLE_READERS: Record<string, { references: number; why: string }> = {
  "apps/local-host/src/project-database.ts": { references: 6, why: "the library opens Goals' read services and the board snapshot; S8's other half (PG094-10)" },
  "apps/local-host/src/goals-actions.ts": { references: 1, why: "hands `goalsQuery` to the configuration handlers; S9 deletes this file" },
  "apps/local-host/src/demo-seed.ts": { references: 1, why: "the sample project; S9 and the sample seed" },
  "apps/local-host/src/feed-application.ts": { references: 2, why: "Feed's attention checks whether a Goal exists; Feed moves to the Runtime with PG-093" },
};

test("PG094-06 RAC-250 the web layer never holds Goals' coordinator: the project context carries no coordinator and the Goals page reads through actions", () => {
  for (const path of sourceFiles("apps/local-host").filter(path => /\/src\/web-[^/]*\.ts$/.test(path))) {
    assert.equal(count(path, /\bcoordinator\b/g), 0, `${path} does not name the Goals coordinator`);
    assert.equal(count(path, /\bGoalProjectApplication\b/g), 0, `${path} does not name the coordinator's class`);
  }
  const context = readFileSync(join(ROOT, "apps/local-host/src/web-project-context.ts"), "utf8");
  assert.doesNotMatch(context, /MolisWorkProjectRuntime\["coordinator"\]/, "the project request context does not carry the coordinator");
});

test("PG094-06 RAC-251 the Host objects that hold Goals' coordinator are exactly the reasoned list, each count exactly as listed", () => {
  const found = holders(/\bcoordinator\b|\bGoalProjectApplication\b/g);
  for (const [path, references] of Object.entries(found)) {
    const allowed = COORDINATOR_HOLDERS[path];
    assert.ok(allowed, `${path} holds the Goals coordinator (${references} references); read Goals through its actions, or take it to the owner of PG-094`);
    assert.ok(references <= allowed.references, `${path} names the coordinator ${references} times, above its ${allowed.references}`);
  }
  for (const [path, allowed] of Object.entries(COORDINATOR_HOLDERS)) {
    assert.ok(found[path], `${path} no longer holds the coordinator: remove its entry (${allowed.why})`);
    assert.equal(found[path], allowed.references, `${path} names the coordinator fewer times than listed: lower its count to ${found[path]}`);
  }
});

test("PG094-06 RAC-252 only the Host's library and seeds read Goals' tables; the other apps, the command line and the MCP server read none", () => {
  const found = holders(/\bgoalsQuery\b|\bcreateGoalReadServices\b|\breadMolisWorkSnapshot\b/g);
  for (const [path, references] of Object.entries(found)) {
    const allowed = TABLE_READERS[path];
    assert.ok(allowed, `${path} reads Goals' tables directly (${references} references); read them through Goals' actions`);
    assert.ok(references <= allowed.references, `${path} reads Goals' tables ${references} times, above its ${allowed.references}`);
  }
  for (const [path, allowed] of Object.entries(TABLE_READERS)) {
    assert.ok(found[path], `${path} no longer reads Goals' tables: remove its entry (${allowed.why})`);
    assert.equal(found[path], allowed.references, `${path} reads Goals' tables fewer times than listed: lower its count to ${found[path]}`);
  }
  for (const path of Object.keys(found)) assert.match(path, /^apps\/local-host\/src\//, `${path} is outside the Host`);
});

test("PG094-06 RAC-253 every frozen entry names a reason and the slice that removes it", () => {
  for (const [path, entry] of [...Object.entries(COORDINATOR_HOLDERS), ...Object.entries(TABLE_READERS)]) {
    assert.ok(entry.why.length > 20, `${path} gives its reason`);
    assert.match(entry.why, /\bS(?:8|9)\b|\bT1\b|\bPG-\d{3}\b|\bPG094-\d{2}\b/, `${path} names the slice or PG row that removes it`);
  }
});
