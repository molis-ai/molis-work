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
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const fillerLines = (count: number) => Array.from({ length: count }, (_, index) => `// filler ${index}`);
const filler = (count: number) => fillerLines(count).map(line => `${line}\n`).join("");
// Fixture limits (tooling/gates/limits.json): file 20 lines, class 10 lines or 3 methods, function 8 lines, 2 vendored SDKs.
const klass = (name: string, methods: number, pad: number) =>
  `export class ${name} {\n${Array.from({ length: methods }, (_, index) => `  m${index}() { return ${index}; }\n`).join("")}${fillerLines(pad).map(line => `  ${line}\n`).join("")}}\n`;
const fn = (name: string, pad: number) => `export function ${name}() {\n${fillerLines(pad).map(line => `  ${line}\n`).join("")}  return 1;\n}\n`;

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-health-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 20, classLines: 10, classMethods: 3, functionLines: 8, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
  put("packages/alpha/src/long.ts", filler(22)); // a giant file (22 lines)
  put("packages/alpha/src/longclass.ts", klass("LongClass", 1, 10)); // giant by lines only
  put("packages/alpha/src/methods.ts", klass("Methods", 4, 0)); // giant by methods only
  put("packages/alpha/src/bigfn.ts", fn("bigFunction", 9)); // a giant function
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

test("the report prints per-unit and per-file numbers, class lines and methods apart", () => {
  git("checkout", "-q", "-f", "main");
  const text = gate("--report").out;
  assert.match(text, /Giant units: 4 \(1 class lines, 1 class methods, 1 file, 1 function\)/);
  assert.match(text, /class methods\s+\d+\s+4\s+packages\/alpha\/src\/methods\.ts#Methods/);
  assert.match(text, /class lines\s+13\s+1\s+packages\/alpha\/src\/longclass\.ts#LongClass/);
  assert.match(text, /Test internal imports: 1 in 1 files/);
  assert.match(text, /\s+1\s+tests\/old\.test\.ts/);
  const json = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.deepEqual(json.head.giant["class packages/alpha/src/methods.ts#Methods"], { lines: 6, methods: 4 });
  assert.deepEqual(json.head.testImports, { "tests/old.test.ts": 1 }, "an import inside a comment or a string is not an import");
  assert.deepEqual(json.head, json.base);
  assert.match(gate("--report", "--base", "main", "--top", "1").out, /… 3 more/);
});

test("an unusable --base is an error, never a silent pass", () => {
  git("checkout", "-q", "-f", "main");
  const missing = gate("--base", "no-such-ref");
  assert.equal(missing.code, 2);
  assert.match(missing.out, /--base no-such-ref is not a commit/);
  assert.equal(gate("--bogus").code, 2);
  assert.equal(gate("--base").code, 2);
});
