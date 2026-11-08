import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { goldenPathMatcher, parseStoreSchemas, SCHEMAS_FILE, storeSchemaProblems } from "../scripts/gates/store-schemas.mjs";

// UPG-01 (specs/upgrade-continuity/golden-replay-design.md §5, U2-d): a library's creation statements do not change under the same version,
// a raised version comes with its steps and with a golden Home that holds the old version. The rules are checked on in-memory trees, and
// that `pnpm health:check` runs them against the merge-base is checked on a scratch repository gated with `--base main`.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const HEADER = "store\towner\tversion\tstructure\tupgrades";
const HASH = "0123456789abcdef", OTHER = "fedcba9876543210";
const table = (...rows: string[]) => ["# a comment", HEADER, ...rows, ""].join("\n");
const MEMORY = (version = 1, structure = HASH, upgrades = "-") => `memory/memory.db\tpackages/storage\t${version}\t${structure}\t${upgrades}`;
const PROJECT = (version = 1, structure = HASH, upgrades = "-") => `projects/*/molis-work.db\tapps/local-host\t${version}\t${structure}\t${upgrades}`;
const PLUGIN = (version = 1, structure = HASH) => `projects/*/molis-work.db#io.molis.work.todo\tio.molis.work.todo\t${version}\t${structure}\t-`;
const CATALOG = (version = 1, structure = HASH, upgrades = "-") => `projects/catalog.db\tapps/local-host\t${version}\t${structure}\t${upgrades}`;
const BASE = table(CATALOG(), MEMORY(), PLUGIN(), PROJECT());
const golden = (stores: Array<{ path: string; schema_version: number }>) => JSON.stringify({ stores });
type Tree = Record<string, string>;
const problems = (head: Tree, base: string | null = BASE): string[] => storeSchemaProblems(
  { files: Object.keys(head), read: (file: string) => head[file] ?? null }, base === undefined ? undefined : (file: string) => (file === SCHEMAS_FILE ? base : null));

test("UPG-01 the file reads as one row per library, and a row in another shape is a problem, not a pass", () => {
  assert.equal(parseStoreSchemas(BASE).rows.get("memory/memory.db").version, 1);
  assert.deepEqual(parseStoreSchemas(table(MEMORY(3, HASH, "1,2"))).rows.get("memory/memory.db").froms, [1, 2]);
  for (const broken of [table(MEMORY().replace("\t1\t", "\tone\t")), table(MEMORY(1, "abc")), table(MEMORY(), MEMORY()), "store\towner\n", table(`${MEMORY()}\textra`), table(MEMORY(2, HASH, "0"))])
    assert.match(problems({ [SCHEMAS_FILE]: broken }).join("\n"), /tooling\/gates\/schemas\/stores\.tsv/u, broken);
  assert.match(problems({ [SCHEMAS_FILE]: BASE }, table(MEMORY().replace(HASH, "x"))).join("\n"), /merge-base:tooling\/gates\/schemas\/stores\.tsv/u);
});

test("UPG-01 unchanged rows pass, a new library and a library that is gone pass, and a scratch repository without the file is not gated", () => {
  assert.deepEqual(problems({ [SCHEMAS_FILE]: BASE }), []);
  assert.deepEqual(problems({ [SCHEMAS_FILE]: table(CATALOG(), MEMORY(), PLUGIN(), PROJECT(), `todo/todo.db\tio.molis.work.todo\t1\t${HASH}\t-`) }), []);
  assert.deepEqual(problems({ [SCHEMAS_FILE]: table(MEMORY()) }), []);
  assert.deepEqual(problems({}, null), []);
  assert.deepEqual(problems({ [SCHEMAS_FILE]: table(MEMORY(1, OTHER)) }, null), [], "the PR that brings the file has no merge-base file to compare with");
  assert.match(problems({}).join("\n"), /stores\.tsv is gone; the merge-base has it/u);
});

test("UPG-01 changed creation statements under the same version fail, naming the library and what to do", () => {
  const found = problems({ [SCHEMAS_FILE]: table(CATALOG(), MEMORY(1, OTHER), PLUGIN(1, OTHER), PROJECT()) });
  assert.equal(found.length, 2, found.join("\n"));
  assert.match(found[0]!, /^UPG-01 memory\/memory\.db: its creation statements changed and its version is still 1\. .*raise the version and add the step from 1/u);
  assert.match(found[1]!, /^UPG-01 projects\/\*\/molis-work\.db#io\.molis\.work\.todo: its creation statements changed/u);
  // The steps alone changing (a step added for a later version) is no change of the creation statements.
  assert.deepEqual(problems({ [SCHEMAS_FILE]: table(CATALOG(), MEMORY(1, HASH, "1"), PLUGIN(), PROJECT()) }), []);
});

test("UPG-01 a version that goes down fails", () => {
  assert.match(problems({ [SCHEMAS_FILE]: table(CATALOG(), MEMORY(), PLUGIN(), PROJECT()) }, table(MEMORY(2))).join("\n"), /memory\/memory\.db: its version went down, 2 → 1/u);
});

test("UPG-01 a raised version needs each step from the old version and a golden that holds the library at the old version", () => {
  const holding = golden([{ path: "memory/memory.db", schema_version: 1 }, { path: "projects/p1/molis-work.db", schema_version: 1 }, { path: "projects/catalog.db", schema_version: 0 }]);
  const raised = (memory: string, goldens: Tree = { "tests/fixtures/golden-homes/0.1.0/manifest.json": holding }) => problems({ [SCHEMAS_FILE]: table(CATALOG(), memory, PLUGIN(), PROJECT()), ...goldens });
  assert.deepEqual(raised(MEMORY(2, OTHER, "1")), [], "the step and a golden at the old version");
  assert.deepEqual(raised(MEMORY(3, OTHER, "1,2")), [], "two versions at once, each step there");
  assert.match(raised(MEMORY(3, OTHER, "2")).join("\n"), /went up, 1 → 3, with no upgrade step from 1$/mu);
  assert.match(raised(MEMORY(2, OTHER)).join("\n"), /with no upgrade step from 1/u);
  assert.match(raised(MEMORY(2, OTHER, "1"), {}).join("\n"), /no golden Home under tests\/fixtures\/golden-homes\/ holds it at 1/u);
  assert.match(raised(MEMORY(2, OTHER, "1"), { "tests/fixtures/golden-homes/0.1.0/manifest.json": golden([{ path: "memory/memory.db", schema_version: 2 }]) }).join("\n"), /holds it at 1/u,
    "a golden at another version does not count");
  assert.match(raised(MEMORY(2, OTHER, "1"), { "tests/fixtures/golden-homes/0.1.0/manifest.json": "{ not json" }).join("\n"), /holds it at 1/u, "an unreadable manifest holds nothing");
  // An account Home's copy counts, and so does a project database under any project id.
  assert.deepEqual(raised(MEMORY(2, OTHER, "1"), { "tests/fixtures/golden-homes/0.2.0/manifest.json": golden([{ path: "spaces/space_1/memory/memory.db", schema_version: 1 }]) }), []);
  assert.deepEqual(problems({ [SCHEMAS_FILE]: table(CATALOG(), MEMORY(), PLUGIN(), PROJECT(2, OTHER, "1")), "tests/fixtures/golden-homes/0.1.0/manifest.json": holding }), []);
  // A golden does not record the catalog's version (catalog_meta) or a plugin's project tables', so those cannot pass yet, and say why.
  const catalog = problems({ [SCHEMAS_FILE]: table(CATALOG(2, OTHER, "1"), MEMORY(), PLUGIN(), PROJECT()), "tests/fixtures/golden-homes/0.1.0/manifest.json": holding });
  assert.match(catalog.join("\n"), /projects\/catalog\.db: .*a golden does not record this one's version yet/u);
  const plugin = problems({ [SCHEMAS_FILE]: table(CATALOG(), MEMORY(), PLUGIN(2, OTHER), PROJECT()), "tests/fixtures/golden-homes/0.1.0/manifest.json": holding });
  assert.match(plugin.join("\n"), /#io\.molis\.work\.todo: its version went up, 1 → 2, with no upgrade step from 1/u);
  assert.match(plugin.join("\n"), /#io\.molis\.work\.todo: .*a golden does not record this one's version yet/u);
});

test("UPG-01 a golden's path is matched as the library's, in the root Home or an account Home, and nothing wider", () => {
  const project = goldenPathMatcher("projects/*/molis-work.db");
  assert.equal(project("projects/personal/molis-work.db"), true);
  assert.equal(project("spaces/space_9/projects/personal/molis-work.db"), true);
  assert.equal(project("projects/a/b/molis-work.db"), false);
  assert.equal(project("other/projects/a/molis-work.db"), false);
  assert.equal(goldenPathMatcher("memory/memory.db")("memory/memoryXdb"), false, "a dot is a dot");
  assert.equal(goldenPathMatcher("projects/*/molis-work.db#io.molis.work.todo")("projects/a/molis-work.db"), false);
});

// ---- wired into pnpm health:check against the merge-base -----------------------------------------------------------------
let repo = "";
const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-store-schema-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put(SCHEMAS_FILE, BASE);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });
const gate = (branch: string, text: string | null) => {
  git("checkout", "-q", "-f", "main");
  git("checkout", "-q", "-B", branch);
  if (text === null) rmSync(path.join(repo, SCHEMAS_FILE)); else put(SCHEMAS_FILE, text);
  commit(branch);
  const run = spawnSync(process.execPath, [script, "--root", repo, "--base", "main"], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

test("UPG-01 pnpm health:check fails a changed structure under the same version against the merge-base, and passes the unchanged file", () => {
  const same = gate("same", BASE);
  assert.equal(same.code, 0, same.out);
  const changed = gate("changed", table(CATALOG(), MEMORY(1, OTHER), PLUGIN(), PROJECT()));
  assert.equal(changed.code, 1, changed.out);
  assert.match(changed.out, /UPG-01 memory\/memory\.db: its creation statements changed and its version is still 1/u);
  const gone = gate("gone", null);
  assert.equal(gone.code, 1, gone.out);
  assert.match(gone.out, /stores\.tsv is gone/u);
});
