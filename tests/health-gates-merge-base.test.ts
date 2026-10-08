import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// specs/repository-anti-corruption §4.5/§4.7 (W1-03): the health gates compare the head with the merge-base, so a PR
// that grows a number cannot hide it by rewriting tooling/gates/baseline.json. Each rule is mutation-verified here on a
// small scratch repository: one violation added on a branch makes `--base main` fail, and running `--update` on that
// branch (the laundering move) neither makes it pass nor is accepted when it is given the merge-base.
// specs/repository-anti-corruption §4.5 (W1-19): tooling/gates/giant-exceptions.json records which giant units have to be
// long, each with a reason. It admits nothing: a unit that was not a giant unit at the merge-base is new whatever the
// registry says (the PR that adds a unit would add its entry too, and review requests are not enforced), a registered unit
// may never grow, and an entry has to describe a giant unit that exists now. The same scratch repository checks all three.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const ciScript = fileURLToPath(new URL("../scripts/ci-health-base.mjs", import.meta.url));
let repo = "";

const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: dir, encoding: "utf8", stdio: "pipe" });
const git = (...args: string[]) => gitAt(repo, ...args);
// Run a body against another scratch repository (the helpers below work on `repo`); tests run one after another.
const inRepo = <T,>(dir: string, body: () => T): T => { const saved = repo; repo = dir; try { return body(); } finally { repo = saved; } };
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gateAt = (dir: string, ...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", dir, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const gate = (...args: string[]) => gateAt(repo, ...args);
const fillerLines = (count: number) => Array.from({ length: count }, (_, index) => `// filler ${index}`);
const filler = (count: number) => fillerLines(count).map(line => `${line}\n`).join("");
// Fixture limits (tooling/gates/limits.json): file 20 lines, class 10 lines or 3 methods, function 8 lines, 2 vendored SDKs.
const klass = (name: string, methods: number, pad: number) =>
  `export class ${name} {\n${Array.from({ length: methods }, (_, index) => `  m${index}() { return ${index}; }\n`).join("")}${fillerLines(pad).map(line => `  ${line}\n`).join("")}}\n`;
const fn = (name: string, pad: number) => `export function ${name}() {\n${fillerLines(pad).map(line => `  ${line}\n`).join("")}  return 1;\n}\n`;
// tooling/gates/giant-exceptions.json: one registered unit is a translation table that has to be long.
const exceptionEntry = { kind: "translation-table", reason: "the English dictionary: string pairs only, no logic to split" };
const exceptionsFile = (entries: Record<string, unknown>) => JSON.stringify({ note: "fixture", exceptions: entries }, null, 2) + "\n";
const EXCEPTIONS = "tooling/gates/giant-exceptions.json";
// The registry of the base (table.ts) plus whatever else a branch registers, each with a complete entry.
const registry = (...units: string[]) => exceptionsFile({ "file packages/alpha/src/table.ts": exceptionEntry, ...Object.fromEntries(units.map(unit => [unit, exceptionEntry])) });

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-health-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 20, classLines: 10, classMethods: 3, functionLines: 8, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
  put("packages/alpha/src/long.ts", filler(22)); // a giant file (22 lines)
  put("packages/alpha/src/table.ts", filler(24)); // a giant file that is registered as an exception
  put("tooling/gates/giant-exceptions.json", exceptionsFile({ "file packages/alpha/src/table.ts": exceptionEntry }));
  put("packages/alpha/src/longclass.ts", klass("LongClass", 1, 10)); // giant by lines only
  put("packages/alpha/src/methods.ts", klass("Methods", 4, 0)); // giant by methods only
  put("packages/alpha/src/bigfn.ts", fn("bigFunction", 9)); // a giant function
  put("packages/alpha/src/smallclass.ts", klass("Small", 3, 0)); // a class on the limit, not giant: a fourth method makes it so
  put("packages/alpha/src/marked.ts", "// legacy path\nexport const marked = 1;\n");
  put("tests/old.test.ts", 'import { alpha } from "../packages/alpha/src/index";\nexport const used = alpha;\n');
  // Not imports: a comment and a string that merely contain an internal path.
  put("tests/clean.test.ts", '// import { alpha } from "../packages/alpha/src/index";\nexport const text = \'import x from "../packages/alpha/src/index"\';\n');
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  put("vendor/prologue-sdk/a.tgz", "a");
  git("add", "-A");
  assert.equal(gate("--update").code, 0);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

// Start a branch from the base, add one violation, commit it.
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};

// growth: rewriting the committed baseline makes the local check pass, which only the merge-base comparison still catches;
// absolute: a rule that does not depend on any reference; limit: a threshold that was loosened.
type Scenario = { name: string; mutate: () => void; expect: RegExp[]; kind?: "absolute" | "limit" };
const violations: Scenario[] = [
  { name: "a new giant file", mutate: () => put("packages/alpha/src/newlong.ts", filler(25)), expect: [/new giant unit: file packages\/alpha\/src\/newlong\.ts/] },
  { name: "a giant file grows", mutate: () => put("packages/alpha/src/long.ts", filler(23)), expect: [/giant unit grew: file packages\/alpha\/src\/long\.ts 23 → 24/] },
  { name: "a new class over the line limit", mutate: () => put("packages/alpha/src/newclass.ts", klass("Fresh", 1, 10)), expect: [/new giant unit: class packages\/alpha\/src\/newclass\.ts#Fresh \(\d+ lines, 1 methods\)/] },
  { name: "a new class over the method limit", mutate: () => put("packages/alpha/src/newmethods.ts", klass("Many", 4, 0)), expect: [/new giant unit: class packages\/alpha\/src\/newmethods\.ts#Many/] },
  { name: "a giant class grows in lines", mutate: () => put("packages/alpha/src/longclass.ts", klass("LongClass", 1, 11)), expect: [/giant class grew: class packages\/alpha\/src\/longclass\.ts#LongClass lines 13 → 14/] },
  { name: "a class giant by methods gets another method while its lines stay under the limit", mutate: () => put("packages/alpha/src/methods.ts", klass("Methods", 5, 0)), expect: [/giant class grew: class packages\/alpha\/src\/methods\.ts#Methods methods 4 → 5/] },
  // The old single number was max(lines, methods): for a class giant only by methods that is its line count, which stays frozen
  // although the line limit itself is not exceeded.
  { name: "a class giant by methods only gets longer while still under the line limit", mutate: () => put("packages/alpha/src/methods.ts", klass("Methods", 4, 3)),
    expect: [/giant class grew: class packages\/alpha\/src\/methods\.ts#Methods 6 → 9 \(lines 6 → 9, methods 4 → 4\)/] },
  { name: "a class giant by lines crosses the method limit", mutate: () => put("packages/alpha/src/longclass.ts", klass("LongClass", 4, 7)), expect: [/giant class grew: class packages\/alpha\/src\/longclass\.ts#LongClass methods 1 → 4/] },
  { name: "a new giant function", mutate: () => put("packages/alpha/src/newfn.ts", fn("newFunction", 9)), expect: [/new giant unit: function packages\/alpha\/src\/newfn\.ts#newFunction/] },
  { name: "a giant function grows", mutate: () => put("packages/alpha/src/bigfn.ts", fn("bigFunction", 10)), expect: [/giant unit grew: function packages\/alpha\/src\/bigfn\.ts#bigFunction 12 → 13/] },
  { name: "a copied giant file counts as new", mutate: () => put("packages/alpha/src/long-copy.ts", filler(22)), expect: [/new giant unit: file packages\/alpha\/src\/long-copy\.ts/] },
  { name: "a test file grows its internal imports", mutate: () => put("tests/old.test.ts", read("tests/old.test.ts") + 'import { alpha as again } from "../packages/alpha/src/index";\nexport const second = again;\n'),
    expect: [/tests reach into package internals in tests\/old\.test\.ts 1 → 2/] },
  { name: "a new test file with an internal import starts at 0", mutate: () => put("tests/fresh.test.ts", 'import { alpha } from "../packages/alpha/src/index";\nexport const used = alpha;\n'),
    expect: [/tests\/fresh\.test\.ts 0 → 1/] },
  { name: "a dynamic import() of package source", mutate: () => put("tests/dynamic.test.ts", 'export const load = () => import("../packages/alpha/src/index");\n'), expect: [/tests\/dynamic\.test\.ts 0 → 1/] },
  { name: "an export … from package source", mutate: () => put("tests/reexport.test.ts", 'export * from "../packages/alpha/src/index";\n'), expect: [/tests\/reexport\.test\.ts 0 → 1/] },
  { name: "an import of server/src", mutate: () => put("tests/server.test.ts", 'import { app } from "../server/src/app";\nexport const used = app;\n'), expect: [/tests\/server\.test\.ts 0 → 1/] },
  { name: "an import of a package's dist", mutate: () => put("tests/dist.test.ts", 'import { alpha } from "../packages/alpha/dist/index.js";\nexport const used = alpha;\n'), expect: [/tests\/dist\.test\.ts 0 → 1/] },
  { name: "an import moved from one test file to another (total unchanged)", mutate: () => {
    put("tests/old.test.ts", "export const used = 1;\n");
    put("tests/clean.test.ts", read("tests/clean.test.ts") + 'import { alpha } from "../packages/alpha/src/index";\nexport const used = alpha;\n');
  }, expect: [/tests reach into package internals in tests\/clean\.test\.ts 0 → 1/] },
  { name: "a third vendored SDK package", mutate: () => { put("vendor/prologue-sdk/b.tgz", "b"); put("vendor/prologue-sdk/c.tgz", "c"); }, expect: [/vendor\/prologue-sdk holds 3 packages/], kind: "absolute" },
  { name: "an in-place schema patch", mutate: () => put("packages/alpha/src/patch.ts", 'export const sql = "ALTER TABLE t ADD COLUMN c TEXT";\n'), expect: [/in-place schema patches 0 → 1/] },
  { name: "another compatibility marker in a file", mutate: () => put("packages/alpha/src/marked.ts", read("packages/alpha/src/marked.ts") + "// legacy again\n"), expect: [/compatibility markers in packages\/alpha\/src\/marked\.ts 1 → 2/] },
  { name: "a new file with a compatibility marker", mutate: () => put("packages/alpha/src/shim.ts", "// @deprecated\nexport const shim = 1;\n"), expect: [/compatibility markers in packages\/alpha\/src\/shim\.ts 0 → 1/] },
  { name: "a spec without a status line", mutate: () => put("specs/other/spec.md", "# Other\n\nno status here\n"), expect: [/specs\/other: no status line near the top/], kind: "absolute" },
  // ---- tooling/gates/giant-exceptions.json (W1-19) ----
  // A registered unit is a deliberate verdict, not a licence to grow.
  { name: "a registered exception grows", mutate: () => put("packages/alpha/src/table.ts", filler(25)), expect: [/giant unit grew: file packages\/alpha\/src\/table\.ts 25 → 26/] },
  // Registering an unregistered unit in the same branch does not admit its growth either: the unit is already recorded.
  { name: "a giant file grows and is registered in the same branch", mutate: () => {
    put("packages/alpha/src/long.ts", filler(23));
    put(EXCEPTIONS, exceptionsFile({ "file packages/alpha/src/table.ts": exceptionEntry, "file packages/alpha/src/long.ts": exceptionEntry }));
  }, expect: [/giant unit grew: file packages\/alpha\/src\/long\.ts 23 → 24/] },
  // The registry admits nothing: a unit that was not giant at the merge-base is new, whatever the entry says. Each unit kind
  // takes its own path through the gate, and a file or a class that existed under the limit is still new as a giant unit.
  { name: "a new giant file registered with a complete exception", mutate: () => {
    put("packages/alpha/src/newtable.ts", filler(30));
    put(EXCEPTIONS, registry("file packages/alpha/src/newtable.ts"));
  }, expect: [/new giant unit: file packages\/alpha\/src\/newtable\.ts \(31\)/, /does not admit it/] },
  { name: "a new giant class registered with a complete exception", mutate: () => {
    put("packages/alpha/src/newclass.ts", klass("Fresh", 1, 10));
    put(EXCEPTIONS, registry("class packages/alpha/src/newclass.ts#Fresh"));
  }, expect: [/new giant unit: class packages\/alpha\/src\/newclass\.ts#Fresh \(\d+ lines, 1 methods\)/, /does not admit it/] },
  { name: "a new giant function registered with a complete exception", mutate: () => {
    put("packages/alpha/src/newfn.ts", fn("newFunction", 9));
    put(EXCEPTIONS, registry("function packages/alpha/src/newfn.ts#newFunction"));
  }, expect: [/new giant unit: function packages\/alpha\/src\/newfn\.ts#newFunction \(12\)/, /does not admit it/] },
  { name: "a file under the limit grows past it and is registered", mutate: () => {
    put("packages/alpha/src/index.ts", filler(30));
    put(EXCEPTIONS, registry("file packages/alpha/src/index.ts"));
  }, expect: [/new giant unit: file packages\/alpha\/src\/index\.ts \(31\)/, /does not admit it/] },
  { name: "a class on the method limit gets another method and is registered", mutate: () => {
    put("packages/alpha/src/smallclass.ts", klass("Small", 4, 0));
    put(EXCEPTIONS, registry("class packages/alpha/src/smallclass.ts#Small"));
  }, expect: [/new giant unit: class packages\/alpha\/src\/smallclass\.ts#Small \(\d+ lines, 4 methods\)/, /does not admit it/] },
  { name: "an exception with a one-word reason", mutate: () => put(EXCEPTIONS, exceptionsFile({ "file packages/alpha/src/table.ts": { kind: "translation-table", reason: "long" } })),
    expect: [/giant exception for file packages\/alpha\/src\/table\.ts: "reason" needs at least 20 characters/], kind: "absolute" },
  { name: "an exception with a kind outside the list", mutate: () => put(EXCEPTIONS, exceptionsFile({ "file packages/alpha/src/table.ts": { kind: "too-complicated-to-split", reason: exceptionEntry.reason } })),
    expect: [/giant exception for file packages\/alpha\/src\/table\.ts: "kind" must be one of translation-table, stylesheet, static-data, generated-code/], kind: "absolute" },
  { name: "an exception with a field nobody reads", mutate: () => put(EXCEPTIONS, exceptionsFile({ "file packages/alpha/src/table.ts": { ...exceptionEntry, until: "2027" } })),
    expect: [/giant exception for file packages\/alpha\/src\/table\.ts: unknown field "until"/], kind: "absolute" },
  { name: "an exception that is not an object", mutate: () => put(EXCEPTIONS, exceptionsFile({ "file packages/alpha/src/table.ts": "see the spec" })),
    expect: [/giant exception for file packages\/alpha\/src\/table\.ts: the entry must be an object/], kind: "absolute" },
  { name: "an exception keyed like an Object.prototype property", mutate: () => put(EXCEPTIONS, registry("constructor")),
    expect: [/giant exception for constructor is stale/], kind: "absolute" },
  { name: "an exception for a unit that is not giant", mutate: () => put(EXCEPTIONS, exceptionsFile({ "file packages/alpha/src/table.ts": exceptionEntry, "file packages/alpha/src/index.ts": exceptionEntry })),
    expect: [/giant exception for file packages\/alpha\/src\/index\.ts is stale/], kind: "absolute" },
  { name: "a registered unit is split and its entry stays behind", mutate: () => put("packages/alpha/src/table.ts", "export const table = 1;\n"),
    expect: [/giant exception for file packages\/alpha\/src\/table\.ts is stale/], kind: "absolute" },
  { name: "a registered file is renamed and its entry keeps the old name", mutate: () => git("mv", "packages/alpha/src/table.ts", "packages/alpha/src/table-moved.ts"),
    expect: [/giant exception for file packages\/alpha\/src\/table\.ts is stale/], kind: "absolute" },
  { name: "a loosened limit", mutate: () => put("tooling/gates/limits.json", JSON.stringify({ file: 20, classLines: 11, classMethods: 3, functionLines: 8, vendoredPrologueSdk: 2 }, null, 2) + "\n"),
    expect: [/limit "classLines" loosened 10 → 11/], kind: "limit" },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    // The laundering move: lift the committed baseline to the head's numbers in the same branch.
    const refused = gate("--update", "--base", "main");
    if (scenario.kind !== "absolute") {
      assert.equal(refused.code, 1, refused.out);
      assert.match(refused.out, /Baseline not written/);
      assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    }
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    if (!scenario.kind) {
      // The committed baseline now agrees with the head, which is exactly the hole the merge-base comparison closes.
      assert.equal(gate().code, 0, "the local check against the committed baseline is satisfied by the rewrite");
    }
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
}

test("changes that shrink or only move things pass against the merge-base", () => {
  branch("tidy", () => {
    git("mv", "packages/alpha/src/long.ts", "packages/alpha/src/long-renamed.ts"); // a moved giant file is not a new one
    git("mv", "tests/old.test.ts", "tests/renamed.test.ts"); // its internal import moves with it
    put("packages/alpha/src/marked.ts", "export const marked = 1;\n"); // a marker removed
    // A refactor that splits a long method: fewer lines, one more method (still under the method limit).
    put("packages/alpha/src/longclass.ts", klass("LongClass", 2, 8));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: giant, compatMarkers/);
  // …and lowering the baseline with the merge-base given is accepted.
  assert.equal(gate("--update", "--base", "main").code, 0);
});

test("a registered exception never admits a unit that was not giant at the merge-base, and splitting it is the way out", () => {
  // The registry is read from the head, so the PR that adds a new giant unit would add its entry in the same breath.
  branch("admit", () => {
    put("packages/alpha/src/newtable.ts", filler(30)); // 31 lines, over the 20-line limit, and not giant at the merge-base
    put(EXCEPTIONS, registry("file packages/alpha/src/newtable.ts"));
  });
  const refused = gate("--base", "main");
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /new giant unit: file packages\/alpha\/src\/newtable\.ts \(31\)/);
  assert.doesNotMatch(refused.out, /giant exception for/, "the entry is well formed and names a giant unit; the unit is what the gate refuses");
  const noUpdate = gate("--update", "--base", "main");
  assert.equal(noUpdate.code, 1, noUpdate.out);
  assert.match(noUpdate.out, /Baseline not written/);
  // The two ways out: split the unit under the limit and take the entry with it (an entry left behind is stale)…
  put("packages/alpha/src/newtable.ts", filler(10));
  commit("split");
  const stale = gate("--base", "main");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /giant exception for file packages\/alpha\/src\/newtable\.ts is stale/);
  assert.doesNotMatch(stale.out, /new giant unit/);
  put(EXCEPTIONS, registry());
  commit("entry removed");
  const split = gate("--base", "main");
  assert.equal(split.code, 0, split.out);
  assert.match(split.out, /1 of the giant units registered as exceptions/);
  // …and a unit that is giant at the merge-base, registered or not, keeps existing as long as it does not grow.
  git("checkout", "-q", "-B", "recorded", "main");
  put("packages/alpha/src/long.ts", filler(21));
  put(EXCEPTIONS, registry("file packages/alpha/src/long.ts"));
  commit("register a recorded unit and shrink it");
  const shrunk = gate("--base", "main");
  assert.equal(shrunk.code, 0, shrunk.out);
  assert.match(shrunk.out, /2 of the giant units registered as exceptions/);
});

test("moving a registered file passes when its entry moves with it", () => {
  branch("move-registered", () => {
    git("mv", "packages/alpha/src/table.ts", "packages/alpha/src/table-moved.ts");
    put(EXCEPTIONS, exceptionsFile({ "file packages/alpha/src/table-moved.ts": exceptionEntry }));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /1 of the giant units registered as exceptions/);
});

// A registry that cannot be read is exit 2 (like limits.json), never a silently empty one.
const unreadableRegistries: Array<[string, string]> = [["not JSON", "<<<<<<< ours\n"], ["without an exceptions object", '{"note":"x"}\n'], ["a list instead of an object", '{"exceptions":[]}\n']];
for (const [state, text] of unreadableRegistries) {
  test(`a giant-exceptions.json ${state} is exit 2, never a skipped check`, () => {
    branch(`registry-${state.replace(/\W+/g, "-")}`, () => put(EXCEPTIONS, text));
    const run = gate("--base", "main");
    assert.equal(run.code, 2, run.out);
    assert.match(run.out, /giant-exceptions\.json (is not valid JSON|needs an "exceptions" object)/);
  });
}

test("the report prints per-unit and per-file numbers, class lines and methods apart", () => {
  git("checkout", "-q", "-f", "main");
  const text = gate("--report").out;
  assert.match(text, /Giant units: 5 \(1 class lines, 1 class methods, 2 file, 1 function\)/);
  assert.match(text, /registered as exceptions \(tooling\/gates\/giant-exceptions\.json\): 1; the other 4 are to be split/);
  assert.match(text, /file\s+25\s+packages\/alpha\/src\/table\.ts  \[exception: translation-table\]/);
  assert.doesNotMatch(text, /long\.ts  \[exception/, "an unregistered unit carries no marker");
  assert.match(text, /class methods\s+\d+\s+4\s+packages\/alpha\/src\/methods\.ts#Methods/);
  assert.match(text, /class lines\s+13\s+1\s+packages\/alpha\/src\/longclass\.ts#LongClass/);
  assert.match(text, /Test internal imports: 1 in 1 files/);
  assert.match(text, /\s+1\s+tests\/old\.test\.ts/);
  const json = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.deepEqual(json.head.giant["class packages/alpha/src/methods.ts#Methods"], { lines: 6, methods: 4 });
  assert.deepEqual(json.head.testImports, { "tests/old.test.ts": 1 }, "an import inside a comment or a string is not an import");
  assert.deepEqual(json.head, json.base);
  assert.deepEqual(json.giantExceptions, { "file packages/alpha/src/table.ts": exceptionEntry });
  assert.match(gate("--report", "--base", "main", "--top", "1").out, /… 4 more/);
});

test("an unusable --base is an error, never a silent pass", () => {
  git("checkout", "-q", "-f", "main");
  const missing = gate("--base", "no-such-ref");
  assert.equal(missing.code, 2);
  assert.match(missing.out, /--base no-such-ref is not a commit/);
  assert.equal(gate("--bogus").code, 2);
  assert.equal(gate("--base").code, 2);
});

// --base measures both sides itself: the committed baseline.json is not read, so a missing, old-shaped or unparsable one
// changes nothing, also when some number went down (the only case in which it used to be looked at).
const spoiledBaselines: Array<[string, () => void]> = [
  ["missing", () => rmSync(path.join(repo, "tooling/gates/baseline.json"))],
  ["an old shape", () => put("tooling/gates/baseline.json", '{"giant":{}}\n')],
  ["not JSON", () => put("tooling/gates/baseline.json", "<<<<<<< ours\n")],
];
for (const [state, spoil] of spoiledBaselines) {
  test(`--base never reads baseline.json (${state}), whether or not a number went down`, () => {
    branch(`baseline-${state.replace(/\W+/g, "-")}`, spoil);
    const same = gate("--base", "main");
    assert.equal(same.code, 0, same.out);
    assert.doesNotMatch(same.out, /Lower than/);

    put("packages/alpha/src/marked.ts", "export const marked = 1;\n"); // a compat marker removed: a number went down
    commit("lower a number");
    const lowered = gate("--base", "main");
    assert.equal(lowered.code, 0, lowered.out);
    assert.match(lowered.out, /Lower than the merge-base: compatMarkers/);
    assert.doesNotMatch(lowered.out, /is missing|old shape|not valid/);

    // …and without --base the committed file is still what the quick local check needs.
    assert.equal(gate().code, 2, "the quick check cannot run without a usable baseline.json");
    assert.equal(gate("--update", "--base", "main").code, 0, "--update --base writes a fresh baseline.json");
    assert.equal(gate().code, 0);
  });
}

const scratchRepo = (name: string, body: () => void) => {
  const dir = mkdtempSync(path.join(tmpdir(), `molis-health-${name}-`));
  try { inRepo(dir, () => { git("init", "-q", "-b", "main"); body(); }); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const smallLimits = JSON.stringify({ file: 20, classLines: 10, classMethods: 3, functionLines: 8, vendoredPrologueSdk: 2 }, null, 2) + "\n";

test("without giant-exceptions.json nothing is registered, and a new giant unit is judged as before", () => {
  scratchRepo("noregistry", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("packages/alpha/src/long.ts", filler(22));
    commit("base");
    git("checkout", "-q", "-b", "next");
    put("packages/alpha/src/other.ts", filler(22));
    commit("a second giant file");
    const run = gate("--base", "main");
    assert.equal(run.code, 1, run.out);
    assert.match(run.out, /new giant unit: file packages\/alpha\/src\/other\.ts/);
    assert.match(gate("--report").out, /registered as exceptions \(tooling\/gates\/giant-exceptions\.json\): 0; the other 2 are/);
  });
});

test("a merge-base without limits.json skips the limit comparison and says so", () => {
  scratchRepo("nolimits", () => {
    put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
    commit("base without limits.json");
    git("checkout", "-q", "-b", "adds-limits");
    put("tooling/gates/limits.json", smallLimits);
    commit("limits.json arrives");
    const run = gate("--base", "main");
    assert.equal(run.code, 0, run.out);
    assert.match(run.out, /the merge-base has no tooling\/gates\/limits\.json, so the limits were not compared/);
  });
});

test("a limits.json that git cannot read in the merge-base is an error, not a skipped comparison", () => {
  scratchRepo("badlimits", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
    commit("base");
    git("checkout", "-q", "-b", "later");
    put("packages/alpha/src/index.ts", "export const alpha = 2;\n");
    commit("later");
    assert.equal(gate("--base", "main").code, 0, "readable: passes");
    // Lose the blob (loose objects: the first two hex digits name the directory).
    const blob = git("rev-parse", "main:tooling/gates/limits.json").trim();
    rmSync(path.join(repo, ".git/objects", blob.slice(0, 2), blob.slice(2)));
    const run = gate("--base", "main");
    assert.equal(run.code, 2, run.out);
    assert.match(run.out, /git cat-file blob \w+:tooling\/gates\/limits\.json failed/);
  });
});

// scripts/ci-health-base.mjs: with a shallow checkout (fetch-depth: 2) the comparison commit is found, or fetched, without
// the whole history. The "remote" is a local bare repository that serves commits by hash, as GitHub does.
type CiWorld = { root: string; url: string; mergeSha: string; mergeParent: string; forkPoint: string; prTip: string; mainTip: string };
let ciWorldCache: CiWorld | undefined;
const ciWorld = (): CiWorld => {
  if (ciWorldCache) return ciWorldCache;
  const root = mkdtempSync(path.join(tmpdir(), "molis-health-ci-"));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  mkdirSync(work);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote], { stdio: "pipe" });
  gitAt(remote, "config", "uploadpack.allowAnySHA1InWant", "true");
  const world = { root, url: `file://${remote}` } as CiWorld;
  inRepo(work, () => {
    git("init", "-q", "-b", "main");
    put("tooling/gates/limits.json", smallLimits);
    put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
    commit("base");
    for (let index = 0; index < 30; index++) commit(`main ${index}`);
    world.forkPoint = git("rev-parse", "HEAD~10").trim();
    git("checkout", "-q", "-b", "pr", world.forkPoint);
    put("packages/alpha/src/newlong.ts", filler(25)); // the pull request adds a giant file
    commit("pull request");
    world.prTip = git("rev-parse", "HEAD").trim();
    git("checkout", "-q", "-b", "mergeref", "main"); // what GitHub builds as refs/pull/1/merge
    git("merge", "-q", "--no-ff", "pr", "-m", "merge ref");
    world.mergeSha = git("rev-parse", "HEAD").trim();
    world.mergeParent = git("rev-parse", "HEAD^1").trim();
    git("checkout", "-q", "main");
    commit("main moves on 1");
    commit("main moves on 2");
    world.mainTip = git("rev-parse", "HEAD").trim();
    git("remote", "add", "origin", world.url);
    git("push", "-q", "origin", "main", "pr");
    git("push", "-q", "origin", "mergeref:refs/pull/1/merge");
  });
  ciWorldCache = world;
  return world;
};
after(() => { if (ciWorldCache) rmSync(ciWorldCache.root, { recursive: true, force: true }); });

let clones = 0;
// What actions/checkout does: init, add the remote, fetch one thing to a given depth, check it out.
const shallowClone = (wants: string, depth: number) => {
  const world = ciWorld();
  const dir = path.join(world.root, `clone-${++clones}`);
  mkdirSync(dir);
  gitAt(dir, "init", "-q", "-b", "main");
  gitAt(dir, "remote", "add", "origin", world.url);
  gitAt(dir, "fetch", "-q", "--no-tags", `--depth=${depth}`, "origin", wants);
  gitAt(dir, "checkout", "-q", "--detach", "FETCH_HEAD");
  return dir;
};
const ciBase = (dir: string, env: Record<string, string>, ...args: string[]) => {
  const run = spawnSync(process.execPath, [ciScript, "--root", dir, ...args], { encoding: "utf8", env: { ...process.env, EVENT_NAME: "", BASE_REF: "", PUSH_BEFORE: "", ...env } });
  return { code: run.status, base: run.stdout.trim(), log: run.stderr };
};
const commitCount = (dir: string) => Number(gitAt(dir, "rev-list", "--count", "HEAD").trim());
const isShallow = (dir: string) => gitAt(dir, "rev-parse", "--is-shallow-repository").trim() === "true";
const MERGE_REF = "+refs/pull/1/merge:refs/remotes/pull/1/merge";

test("ci base, pull_request: a depth-2 checkout compares with the merge commit's first parent and fetches nothing", () => {
  const world = ciWorld();
  const dir = shallowClone(MERGE_REF, 2);
  assert.equal(gitAt(dir, "rev-parse", "HEAD").trim(), world.mergeSha);
  const run = ciBase(dir, { EVENT_NAME: "pull_request", BASE_REF: "main" });
  assert.equal(run.code, 0, run.log);
  assert.equal(run.base, world.mergeParent, "the base branch as it was merged, not main as it is now");
  assert.notEqual(run.base, world.mainTip);
  assert.equal(commitCount(dir), 3, "the merge commit and its two parents, as checked out");
  assert.ok(isShallow(dir));
  // The gate itself works in that shallow clone and sees the pull request's violation.
  const caught = gateAt(dir, "--base", run.base);
  assert.equal(caught.code, 1, caught.out);
  assert.match(caught.out, /new giant unit: file packages\/alpha\/src\/newlong\.ts/);
});

test("ci base, pull_request: a depth-1 checkout (the default) falls back to origin/main with its full history", () => {
  const world = ciWorld();
  const dir = shallowClone(MERGE_REF, 1);
  const run = ciBase(dir, { EVENT_NAME: "pull_request", BASE_REF: "main" });
  assert.equal(run.code, 0, run.log);
  assert.equal(run.base, "origin/main");
  assert.ok(!isShallow(dir));
  assert.equal(gitAt(dir, "rev-list", "--parents", "-n", "1", "HEAD").trim().split(" ").length, 3, "the checked-out merge commit is no longer cut off from its parents");
  assert.equal(gitAt(dir, "merge-base", "HEAD", "origin/main").trim(), world.mergeParent);
  assert.equal(gateAt(dir, "--base", run.base).code, 1);
});

test("ci base, pull_request: a HEAD that is not a merge commit falls back to origin/main and the true merge-base", () => {
  const world = ciWorld();
  const dir = shallowClone(world.prTip, 2);
  const run = ciBase(dir, { EVENT_NAME: "pull_request", BASE_REF: "main" });
  assert.equal(run.code, 0, run.log);
  assert.equal(run.base, "origin/main");
  assert.equal(gitAt(dir, "merge-base", "HEAD", "origin/main").trim(), world.forkPoint, "the fork point, 10 commits down: found by fetching, not guessed");
  const caught = gateAt(dir, "--base", run.base);
  assert.equal(caught.code, 1, caught.out);
  assert.match(caught.out, /new giant unit: file packages\/alpha\/src\/newlong\.ts/);
});

test("ci base, push: the previous tip is HEAD^1 and nothing is deepened", () => {
  const world = ciWorld();
  const dir = shallowClone(world.mainTip, 2);
  const before = gitAt(dir, "rev-parse", "HEAD^1").trim();
  const run = ciBase(dir, { EVENT_NAME: "push", PUSH_BEFORE: before });
  assert.equal(run.code, 0, run.log);
  assert.equal(run.base, before);
  assert.equal(commitCount(dir), 2);
  assert.ok(isShallow(dir));
  assert.equal(gateAt(dir, "--base", run.base).code, 0);
});

test("ci base, push of several commits: the previous tip is fetched and the history deepened only as far as needed", () => {
  const world = ciWorld();
  const dir = shallowClone(world.mainTip, 2);
  const before = gitAt(ciWorld().root + "/work", "rev-parse", "main~5").trim();
  assert.throws(() => gitAt(dir, "cat-file", "-e", `${before}^{commit}`), "not in the depth-2 checkout");
  const run = ciBase(dir, { EVENT_NAME: "push", PUSH_BEFORE: before });
  assert.equal(run.code, 0, run.log);
  assert.equal(run.base, before);
  assert.doesNotThrow(() => gitAt(dir, "merge-base", "--is-ancestor", before, "HEAD"));
  assert.ok(isShallow(dir), "34 commits exist; deepening stopped as soon as the previous tip was reachable");
  assert.ok(commitCount(dir) > 5 && commitCount(dir) < 30, `commits visible: ${commitCount(dir)}`);
  assert.equal(gateAt(dir, "--base", run.base).code, 0);
});

test("ci base, push that creates the branch, and other events: origin/main with its full history", () => {
  const world = ciWorld();
  for (const env of [{ EVENT_NAME: "push", PUSH_BEFORE: "0".repeat(40) }, { EVENT_NAME: "workflow_dispatch" }]) {
    const dir = shallowClone(world.mainTip, 2);
    const run = ciBase(dir, env);
    assert.equal(run.code, 0, run.log);
    assert.equal(run.base, "origin/main");
    assert.ok(!isShallow(dir));
    assert.equal(gateAt(dir, "--base", run.base).code, 0);
  }
});

test("ci base: a previous tip that cannot be fetched, or a bad argument, is exit 2 (never a silent pass)", () => {
  const world = ciWorld();
  const dir = shallowClone(world.mainTip, 2);
  const gone = ciBase(dir, { EVENT_NAME: "push", PUSH_BEFORE: "1234567890123456789012345678901234567890" });
  assert.equal(gone.code, 2, gone.log);
  assert.equal(gone.base, "");
  assert.match(gone.log, /git fetch .* failed/);
  assert.equal(ciBase(dir, {}, "--bogus").code, 2);
});
