import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

// specs/repository-anti-corruption W2-10 (PR-0): the test-imports tool (scripts/test-imports.mjs, scripts/test-imports/) and the
// absolute-zero health gate built on its graph (scripts/gates/test-import-splits.mjs). A test process that loads a package from its
// source (../P/src) and from its build (the package name, ../P/dist) holds two copies of it. The tool finds those processes and
// rewrites the imports so a package is reached from one place; any remaining split is refused, even at the merge-base. As in tests/health-gates-source-counts.test.ts, the tool and the gate run as the commands they are, on small scratch
// repositories, so nothing here imports a package or the scripts: this file starts at 0 internal imports.
const tool = fileURLToPath(new URL("../scripts/test-imports.mjs", import.meta.url));
const gateScript = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const made: string[] = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

const lines = (...parts: string[]) => `${parts.join("\n")}\n`;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=tool", "-c", "user.email=tool@example.invalid", ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" });
const put = (dir: string, file: string, body: string) => { mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); writeFileSync(path.join(dir, file), body); };
const read = (dir: string, file: string) => readFileSync(path.join(dir, file), "utf8");
const scratch = (files: Record<string, string>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "molis-test-imports-"));
  made.push(dir);
  git(dir, "init", "-q", "-b", "main");
  for (const [file, body] of Object.entries(files)) put(dir, file, body);
  return dir;
};
const run = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [tool, "--root", dir, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};

// A library with one entry, built by tsc from src/ to dist/ as every package here is. `exclude` lists sources tsc leaves out (no built twin).
const library = (name: string, dir: string, exclude: string[] = []): Record<string, string> => ({
  [`${dir}/package.json`]: json({ name, exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } } }),
  [`${dir}/tsconfig.json`]: json({ compilerOptions: { rootDir: "src", outDir: "dist" }, include: ["src/**/*.ts"], exclude }),
});
const ROOT = json({ name: "scratch", private: true, devDependencies: { "@fx/alpha": "workspace:*", "@fx/beta": "workspace:*", "@fx/host": "workspace:*", "@fx/stores": "workspace:*" } });
// alpha's entry exports Thing and, under another name, helper. ThingShape, hidden and browserOnly are not public; browser.ts has no built twin.
const alpha = (extra: Record<string, string> = {}, exclude = ["src/browser.ts"]): Record<string, string> => ({
  ...library("@fx/alpha", "packages/alpha", exclude),
  "packages/alpha/src/index.ts": lines('export { Thing } from "./thing.js";', 'export { helper as publicHelper } from "./util.js";'),
  "packages/alpha/src/thing.ts": lines("export class Thing { id = 1; }", "export interface ThingShape { id: number }"),
  "packages/alpha/src/util.ts": lines("export const helper = () => 1;"),
  "packages/alpha/src/hidden.ts": lines("export const hidden = 2;"),
  "packages/alpha/src/browser.ts": lines("export const browserOnly = 3;"),
  ...extra,
});

test("--check lists the process that loads a package from source and from the build, with a path for each side", () => {
  const dir = scratch({
    "package.json": ROOT, ...alpha(),
    "tests/mixed.test.ts": lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../packages/alpha/src/hidden.ts";', "export const used = [Thing, hidden];"),
    "tests/clean.test.ts": lines('import { Thing } from "@fx/alpha";', "export const used = Thing;"),
  });
  const found = run(dir, "--check", "--chains");
  assert.equal(found.code, 1, found.out);
  assert.match(found.out, /1 of 2 test processes load a package both from its source and from its build/);
  assert.match(found.out, /tests\/mixed\.test\.ts: @fx\/alpha/);
  assert.doesNotMatch(found.out, /tests\/clean\.test\.ts: /);
  assert.match(found.out, /from source:\n\s+tests\/mixed\.test\.ts:2 \.\.\/packages\/alpha\/src\/hidden\.ts/);
  assert.match(found.out, /from the build:\n\s+tests\/mixed\.test\.ts:1 @fx\/alpha/);
  assert.equal(run(dir, "--check", "--json").code, 1);
  put(dir, "tests/mixed.test.ts", lines('import { Thing } from "@fx/alpha";', "export const used = Thing;"));
  assert.equal(run(dir, "--check").code, 0, "one place for every package: nothing to report");
});

test("a public name imported from src goes to the entry, an alias is spelled out, a non-public name goes to the built twin, type-only stays type-only, and no line moves", () => {
  const before = lines(
    'import { Thing } from "../packages/alpha/src/thing.ts";',
    'import type { ThingShape } from "../packages/alpha/src/thing.ts";',
    'import { helper } from "../packages/alpha/src/util.ts";',
    'import { helper as other } from "../packages/alpha/src/util.ts";',
    "export const used = [Thing, helper, other] as [unknown, unknown, unknown, ThingShape?];");
  const dir = scratch({ "package.json": ROOT, ...alpha(), "tests/route.test.ts": before });
  const planned = run(dir, "--report");
  assert.equal(planned.code, 0, planned.out);
  assert.match(planned.out, /4 internal references in 1 test files/);
  assert.match(planned.out, /R1 3 routed through an entry, R2 0 runtime and R3 1 type-only moved to the built twin/);
  assert.match(planned.out, /tests\/route\.test\.ts:3  R1  \.\.\/packages\/alpha\/src\/util\.ts → @fx\/alpha  \{helper\}/);
  assert.equal(read(dir, "tests/route.test.ts"), before, "--report writes nothing");

  const written = run(dir, "--write");
  assert.equal(written.code, 0, written.out);
  assert.equal(read(dir, "tests/route.test.ts"), lines(
    'import { Thing } from "@fx/alpha";',
    'import type { ThingShape } from "../packages/alpha/dist/thing.js";',
    'import { publicHelper as helper } from "@fx/alpha";',
    'import { publicHelper as other } from "@fx/alpha";',
    "export const used = [Thing, helper, other] as [unknown, unknown, unknown, ThingShape?];"));
  const again = run(dir, "--report", "--summary");
  assert.match(again.out, /0 files change/, "a second run has nothing left to do");
});

test("a non-public module in a split process moves to its built twin, and the process stops being split", () => {
  const dir = scratch({
    "package.json": ROOT, ...alpha(),
    "tests/split.test.ts": lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../packages/alpha/src/hidden.ts";', "export const used = [Thing, hidden];"),
  });
  assert.equal(run(dir, "--check").code, 1);
  const written = run(dir, "--write");
  assert.equal(written.code, 0, written.out);
  assert.match(written.out, /R2 1 runtime/);
  assert.equal(read(dir, "tests/split.test.ts"), lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../packages/alpha/dist/hidden.js";', "export const used = [Thing, hidden];"));
  assert.equal(run(dir, "--check").code, 0);
});

test("a test and the helper it reads are rewritten together: naming the helper alone pulls the test in", () => {
  const dir = scratch({
    "package.json": ROOT, ...alpha(),
    "tests/fixtures/helper.ts": lines('import { helper } from "../../packages/alpha/src/util.ts";', "export const run = helper;"),
    "tests/uses-helper.test.ts": lines('import { run } from "./fixtures/helper.ts";', 'import { hidden } from "../packages/alpha/src/hidden.ts";', "export const used = [run, hidden];"),
  });
  assert.equal(run(dir, "--check").code, 0, "both on source: not split yet");
  const written = run(dir, "--write", "tests/fixtures/helper.ts");
  assert.equal(written.code, 0, written.out);
  assert.match(written.out, /1 added so no process is left half on source: tests\/uses-helper\.test\.ts/);
  assert.equal(read(dir, "tests/fixtures/helper.ts"), lines('import { publicHelper as helper } from "@fx/alpha";', "export const run = helper;"));
  assert.match(read(dir, "tests/uses-helper.test.ts"), /from "\.\.\/packages\/alpha\/dist\/hidden\.js"/);
  assert.equal(run(dir, "--check").code, 0, "no process was left half on source");
});

test("dynamic imports keep their destructuring: names are routed, an unlistable use goes to the built twin", () => {
  const dir = scratch({
    "package.json": ROOT, ...alpha(),
    "tests/dynamic.test.ts": lines(
      'import { Thing } from "../packages/alpha/src/thing.ts";',
      'const { helper } = await import("../packages/alpha/src/util.ts");',
      'const loaded = await import("../packages/alpha/src/hidden.ts");',
      "export const used = [Thing, helper, loaded.hidden];"),
  });
  const written = run(dir, "--write");
  assert.equal(written.code, 0, written.out);
  assert.match(written.out, /Dynamic imports and require\(\) calls that change target[^\n]*: 2/);
  assert.equal(read(dir, "tests/dynamic.test.ts"), lines(
    'import { Thing } from "@fx/alpha";',
    'const { publicHelper: helper } = await import("@fx/alpha");',
    'const loaded = await import("../packages/alpha/dist/hidden.js");',
    "export const used = [Thing, helper, loaded.hidden];"));
});

test("a composition-root name is routed only when code outside the tests, or another test, already imports it by package name", () => {
  const host = (extra: Record<string, string> = {}): Record<string, string> => ({
    "package.json": ROOT, ...library("@fx/host", "apps/host"),
    "apps/host/src/index.ts": lines('export { Known } from "./known.js";', 'export { Unknown } from "./unknown.js";'),
    "apps/host/src/known.ts": "export class Known {}\n",
    "apps/host/src/unknown.ts": "export class Unknown {}\n",
    "scripts/use-host.mjs": lines('import { Known } from "@fx/host";', "export const known = Known;"),
    "tests/host.test.ts": lines('import { Known } from "../apps/host/src/known.ts";', 'import { Unknown } from "../apps/host/src/unknown.ts";', "export const used = [Known, Unknown];"),
    ...extra,
  });
  const alone = scratch(host());
  const first = run(alone, "--write");
  assert.equal(first.code, 0, first.out);
  assert.equal(read(alone, "tests/host.test.ts"), lines('import { Known } from "@fx/host";', 'import { Unknown } from "../apps/host/dist/unknown.js";', "export const used = [Known, Unknown];"));
  assert.match(first.out, /Names left on the built twin by rule H3 or the Repository rule: @fx\/host\.Unknown 1/);
  assert.match(first.out, /Composition-root names routed through an entry[^\n]*@fx\/host\.Known 1/);

  // Once a test imports Unknown by package name, routing it adds no name to what has to be relocated.
  const named = scratch(host({ "tests/named.test.ts": lines('import { Unknown } from "@fx/host";', "export const used = Unknown;") }));
  assert.equal(run(named, "--write").code, 0);
  assert.equal(read(named, "tests/host.test.ts"), lines('import { Known } from "@fx/host";', 'import { Unknown } from "@fx/host";', "export const used = [Known, Unknown];"));
});

test("a Module's Repository and Store names are never routed through its entry", () => {
  const dir = scratch({
    "package.json": ROOT, ...library("@fx/stores", "modules/stores"),
    "modules/stores/src/index.ts": lines('export { ThingStore } from "./store.js";', 'export { thing } from "./thing.js";'),
    "modules/stores/src/store.ts": "export class ThingStore {}\n",
    "modules/stores/src/thing.ts": "export const thing = 1;\n",
    "tests/stores.test.ts": lines('import { ThingStore } from "../modules/stores/src/store.ts";', 'import { thing } from "../modules/stores/src/thing.ts";', "export const used = [ThingStore, thing];"),
  });
  assert.equal(run(dir, "--write").code, 0);
  assert.equal(read(dir, "tests/stores.test.ts"), lines('import { ThingStore } from "../modules/stores/dist/store.js";', 'import { thing } from "@fx/stores";', "export const used = [ThingStore, thing];"));
});

test("a module with no built twin leaves its group alone and is reported", () => {
  const body = lines('import { Thing } from "@fx/alpha";', 'import { browserOnly } from "../packages/alpha/src/browser.ts";', "export const used = [Thing, browserOnly];");
  const dir = scratch({ "package.json": ROOT, ...alpha(), "tests/browser.test.ts": body });
  const result = run(dir, "--report", "--summary");
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /1 blocked/);
  assert.match(result.out, /Blocked groups \(left as they are\):\n\s+- @fx\/alpha: tests\/browser\.test\.ts:2 names \.\.\/packages\/alpha\/src\/browser\.ts, which has no built twin/);
  assert.equal(run(dir, "--write").code, 0);
  assert.equal(read(dir, "tests/browser.test.ts"), body, "the group is not touched");
  assert.equal(run(dir, "--check").code, 1, "and the process is still split");
});

test("an import used only as a type gets `type`, so the syntax says what the compiler already knows", () => {
  const dir = scratch({
    "package.json": ROOT, ...alpha(),
    "tests/erased.test.ts": lines('import { Thing } from "@fx/alpha";', 'import { browserOnly } from "../packages/alpha/src/browser.ts";', "export const used: [typeof Thing, typeof browserOnly?] = [Thing];"),
  });
  assert.equal(run(dir, "--check").code, 1, "split as the syntax reads it");
  const written = run(dir, "--write");
  assert.equal(written.code, 0, written.out);
  assert.match(written.out, /R5 1 `type` added/);
  assert.equal(read(dir, "tests/erased.test.ts"), lines('import { Thing } from "@fx/alpha";', 'import type { browserOnly } from "../packages/alpha/src/browser.ts";', "export const used: [typeof Thing, typeof browserOnly?] = [Thing];"));
  assert.equal(run(dir, "--check").code, 0);
});

// An entry loads everything it imports. Routing a test to alpha's entry therefore loads beta's build too, so a beta module the same
// test still reads from source would become a second copy. The tool converts beta's group as well; where it cannot, it writes nothing.
const chained = (excluded: string[]): Record<string, string> => ({
  "package.json": ROOT,
  ...alpha({ "packages/alpha/src/index.ts": lines('export { Thing } from "./thing.js";', 'export { beta as alphaBeta } from "@fx/beta";') }),
  ...library("@fx/beta", "packages/beta", excluded),
  "packages/beta/src/index.ts": lines('export { beta } from "./beta.js";'),
  "packages/beta/src/beta.ts": "export const beta = 1;\n",
  "packages/beta/src/internal.ts": "export const betaInternal = 2;\n",
  "tests/chain.test.ts": lines('import { Thing } from "../packages/alpha/src/thing.ts";', 'import { betaInternal } from "../packages/beta/src/internal.ts";', "export const used = [Thing, betaInternal];"),
});

test("a rewrite that would make another package load twice converts that package too", () => {
  const dir = scratch(chained([]));
  assert.equal(run(dir, "--check").code, 0);
  const written = run(dir, "--write");
  assert.equal(written.code, 0, written.out);
  assert.equal(read(dir, "tests/chain.test.ts"), lines('import { Thing } from "@fx/alpha";', 'import { betaInternal } from "../packages/beta/dist/internal.js";', "export const used = [Thing, betaInternal];"));
  assert.equal(run(dir, "--check").code, 0);
});

test("a self-check failure refuses to write anything", () => {
  const dir = scratch(chained(["src/internal.ts"]));
  const before = read(dir, "tests/chain.test.ts");
  const refused = run(dir, "--write");
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /PROBLEMS \(nothing is written\):\n\s+- tests\/chain\.test\.ts would load @fx\/beta both ways/);
  assert.equal(read(dir, "tests/chain.test.ts"), before);
  assert.doesNotMatch(refused.out, /wrote/);
});

test("the tool counts internal references as the health gate does, and R1 lowers the gate's number by exactly its count", () => {
  const dir = scratch({
    "package.json": ROOT, ...alpha(),
    "tooling/gates/limits.json": json({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }),
    "tests/count.test.ts": lines(
      'import { Thing } from "../packages/alpha/src/thing.ts";', 'import { hidden } from "../packages/alpha/dist/hidden.js";',
      'const { helper } = await import("../packages/alpha/src/util.ts");', "export const used = [Thing, hidden, helper];"),
  });
  git(dir, "add", "-A");
  const internal = () => Object.values(JSON.parse(spawnSync(process.execPath, [gateScript, "--root", dir, "--report", "--json"], { encoding: "utf8" }).stdout).head.testImports as Record<string, number>).reduce((sum, count) => sum + count, 0);
  assert.equal(internal(), 3);
  assert.match(run(dir, "--report", "--summary").out, /3 internal references in 1 test files/);
  assert.match(run(dir, "--report", "--summary").out, /internal references fall by 2;/);
  assert.equal(run(dir, "--write").code, 0);
  assert.equal(internal(), 1, "Thing and helper are routed; the non-public hidden stays an internal reference, now on one copy");
});

test("--ledger lists what is still an internal reference after the rewrite, with the reason", () => {
  const dir = scratch({
    "package.json": ROOT, ...alpha(),
    "tests/route.test.ts": lines('import { Thing } from "../packages/alpha/src/thing.ts";', 'import type { ThingShape } from "../packages/alpha/src/thing.ts";', "export const used = [Thing] as [unknown, ThingShape?];"),
  });
  const ledger = run(dir, "--ledger");
  assert.equal(ledger.code, 0, ledger.out);
  assert.match(ledger.out, /1 internal references remain after the rewrite, in 1 files/);
  assert.match(ledger.out, /\n\s+1  <name> is not exported by an entry of @fx\/alpha/);
  assert.match(ledger.out, /tests\/route\.test\.ts:2  @fx\/alpha  \{ThingShape\}  ThingShape is not exported by an entry of @fx\/alpha/);
});

test("--limit cuts a PR-sized set by file name, and --json is the same plan as data", () => {
  const body = lines('import { Thing } from "../packages/alpha/src/thing.ts";', "export const used = Thing;");
  const dir = scratch({ "package.json": ROOT, ...alpha(), "tests/a.test.ts": body, "tests/b.test.ts": body, "tests/c.test.ts": body });
  const plan = JSON.parse(run(dir, "--report", "--json", "--limit", "2").out);
  assert.deepEqual(plan.files, ["tests/a.test.ts", "tests/b.test.ts"]);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.rows.map((row: { file: string; rule: string; to: string }) => [row.file, row.rule, row.to]), [["tests/a.test.ts", "R1", "@fx/alpha"], ["tests/b.test.ts", "R1", "@fx/alpha"]]);
  assert.equal(run(dir, "--write", "--limit", "2").code, 0);
  assert.equal(read(dir, "tests/a.test.ts"), lines('import { Thing } from "@fx/alpha";', "export const used = Thing;"));
  assert.equal(read(dir, "tests/b.test.ts"), lines('import { Thing } from "@fx/alpha";', "export const used = Thing;"));
  assert.equal(read(dir, "tests/c.test.ts"), body, "the third file waits for the next cut");
  assert.equal(JSON.parse(run(dir, "--report", "--json").out).files.length, 1);
});

test("--ref reads a commit, not the working tree; bad usage is exit 2", () => {
  const dir = scratch({ "package.json": ROOT, ...alpha(), "tests/mixed.test.ts": lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../packages/alpha/src/hidden.ts";', "export const used = [Thing, hidden];") });
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "split");
  rmSync(path.join(dir, "tests/mixed.test.ts"));
  assert.equal(run(dir, "--check").code, 0, "the working tree has no tests");
  assert.equal(run(dir, "--check", "--ref", "HEAD").code, 1, "the commit has the split");
  assert.equal(run(dir, "--write", "--ref", "HEAD").code, 2);
  assert.equal(run(dir, "--nope").code, 2);
  assert.equal(run(dir, "--check", "--write").code, 2);
});

// ---- the health gate: per test file and spawned fixture, the packages its process loads twice may only fall ----------------------------------

// Every test file here has the same internal references at the merge-base and on the branch in the scenarios that matter, so the
// older test-imports gate stays quiet and only the one under test can fail.
type Scenario = { name: string; mutate: (dir: string) => void; expect: RegExp[] };
const gateBase = (): Record<string, string> => ({
  "tooling/gates/limits.json": json({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }),
  ...alpha({}, []),
  ...library("@fx/beta", "packages/beta"),
  "packages/beta/src/index.ts": lines("export const beta = 1;"),
  "packages/beta/src/internal.ts": lines("export const betaInternal = 2;"),
  "tests/clean.test.ts": lines('import { Thing } from "@fx/alpha";', "export const used = Thing;"),
  // An old split, recorded in the base: it may stay, it may not grow.
  "tests/split.test.ts": lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../packages/alpha/src/hidden.ts";', 'import { beta } from "@fx/beta";', 'import { betaInternal } from "../packages/beta/dist/internal.js";', "export const used = [Thing, hidden, beta, betaInternal];"),
  // Not splits, each for its own reason.
  "tests/type-only.test.ts": lines('import { Thing } from "@fx/alpha";', 'import type { ThingShape } from "../packages/alpha/src/thing.ts";', "export const used: ThingShape = new Thing();"),
  "tests/twin.test.ts": lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../packages/alpha/dist/hidden.js";', "export const used = [Thing, hidden];"),
  "tests/source-only.test.ts": lines('import { hidden } from "../packages/alpha/src/hidden.ts";', 'import { helper } from "../packages/alpha/src/util.ts";', "export const used = [hidden, helper];"),
  "tests/fixtures/spawned.ts": lines('import { hidden } from "../../packages/alpha/src/hidden.ts";', 'import { Thing } from "@fx/alpha";', "export const used = [hidden, Thing];"),
  "tests/spawns.test.ts": lines('import { spawnSync } from "node:child_process";', 'import { Thing } from "@fx/alpha";', 'export const used = [spawnSync, Thing, "tests/fixtures/spawned.ts", "tests/fixtures/clean-child.ts"];'),
  // Spawned fixtures: no test imports them, each is a process of its own. spawned.ts is an old split, recorded in the base; clean-child.ts is not.
  "tests/fixtures/clean-child.ts": lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../../packages/alpha/dist/hidden.js";', "export const used = [Thing, hidden];"),
  // Material for the scenarios: a helper read by a test, a test next to a package whose build is read, a dynamic import.
  "tests/fixtures/shared.ts": lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../../packages/alpha/dist/hidden.js";', "export const shared = [Thing, hidden];"),
  "tests/uses-shared.test.ts": lines('import { shared } from "./fixtures/shared.ts";', "export const used = shared;"),
  "tests/through-beta.test.ts": lines('import { beta } from "@fx/beta";', 'import { hidden } from "../packages/alpha/src/hidden.ts";', "export const used = [beta, hidden];"),
  "tests/dynamic.test.ts": lines('import { Thing } from "@fx/alpha";', 'const loaded = await import("../packages/alpha/dist/hidden.js");', "export const used = [Thing, loaded];"),
});
const gate = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [gateScript, "--root", dir, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
const commit = (dir: string, message: string) => { git(dir, "add", "-A"); git(dir, "commit", "-q", "--allow-empty", "-m", message); };
const repoForGate = () => {
  const original = gateBase();
  const dir = scratch(original);
  // Bootstrap the other metrics from a clean process graph, then keep two historical splits at main.
  for (const file of ["tests/split.test.ts", "tests/fixtures/spawned.ts"]) put(dir, file, original[file].replace(/packages\/alpha\/src\/hidden\.ts/g, "packages/alpha/dist/hidden.js"));
  git(dir, "add", "-A");
  assert.equal(gate(dir, "--update").code, 0);
  for (const [file, text] of Object.entries(original)) put(dir, file, text);
  commit(dir, "base");
  return dir;
};
const branch = (dir: string, name: string, mutate: (dir: string) => void) => {
  git(dir, "checkout", "-q", "-f", "main");
  git(dir, "clean", "-fdq");
  git(dir, "checkout", "-q", "-B", name);
  mutate(dir);
  commit(dir, name);
};
const swap = (dir: string, file: string, from: string, to: string) => { const body = read(dir, file); assert.ok(body.includes(from), `${file} has ${from}`); put(dir, file, body.replace(from, to)); };

const violations: Scenario[] = [
  { name: "a test that reads packages from source gaining an import by package name",
    mutate: (dir) => put(dir, "tests/source-only.test.ts", `import { Thing } from "@fx/alpha";\n${read(dir, "tests/source-only.test.ts")}`),
    expect: [/in tests\/source-only\.test\.ts 0 → 1/, /Now split: @fx\/alpha: source via tests\/source-only\.test\.ts:2 \.\.\/packages\/alpha\/src\/hidden\.ts; build via tests\/source-only\.test\.ts:1 @fx\/alpha/] },
  { name: "a test that already splits one package splitting a second",
    mutate: (dir) => swap(dir, "tests/split.test.ts", "packages/beta/dist/internal.js", "packages/beta/src/internal.ts"),
    expect: [/in tests\/split\.test\.ts 1 → 2/] },
  { name: "a helper that makes the tests reading it split",
    mutate: (dir) => swap(dir, "tests/fixtures/shared.ts", "packages/alpha/dist/hidden.js", "packages/alpha/src/hidden.ts"),
    expect: [/in tests\/uses-shared\.test\.ts 0 → 1/] },
  { name: "a package whose build reads the package that a test reads from source",
    mutate: (dir) => put(dir, "packages/beta/src/index.ts", lines('export { Thing as BetaThing } from "@fx/alpha";', "export const beta = 1;")),
    expect: [/in tests\/through-beta\.test\.ts 0 → 1/, /build via tests\/through-beta\.test\.ts:1 @fx\/beta → packages\/beta\/src\/index\.ts:1 @fx\/alpha/] },
  { name: "a dynamic import in a test next to a static import by name",
    mutate: (dir) => swap(dir, "tests/dynamic.test.ts", "packages/alpha/dist/hidden.js", "packages/alpha/src/hidden.ts"),
    expect: [/in tests\/dynamic\.test\.ts 0 → 1/] },
  { name: "the built twin replaced by the source next to the package name",
    mutate: (dir) => swap(dir, "tests/twin.test.ts", "packages/alpha/dist/hidden.js", "packages/alpha/src/hidden.ts"),
    expect: [/in tests\/twin\.test\.ts 0 → 1/] },
  { name: "a new test that reads a package from source and by name",
    mutate: (dir) => put(dir, "tests/new.test.ts", lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../packages/alpha/src/hidden.ts";', "export const used = [Thing, hidden];")),
    expect: [/in tests\/new\.test\.ts 0 → 1/, /Now split: @fx\/alpha: source via tests\/new\.test\.ts:2/] },
  // A tests/ file that no test imports is a process of its own when a test spawns it: it is counted under its own path.
  { name: "a new spawned fixture that starts split",
    mutate: (dir) => put(dir, "tests/fixtures/new-child.ts", lines('import { Thing } from "@fx/alpha";', 'import { hidden } from "../../packages/alpha/src/hidden.ts";', "export const used = [Thing, hidden];")),
    expect: [/packages one test process loads from both source[^\n]* in tests\/fixtures\/new-child\.ts 0 → 1/, /Now split: @fx\/alpha: source via tests\/fixtures\/new-child\.ts:2/] },
  { name: "a spawned fixture with one copy gaining a second",
    mutate: (dir) => put(dir, "tests/fixtures/clean-child.ts", `import { helper } from "../../packages/alpha/src/util.ts";\n${read(dir, "tests/fixtures/clean-child.ts")}`),
    expect: [/packages one test process loads from both source[^\n]* in tests\/fixtures\/clean-child\.ts 0 → 1/, /Now split: @fx\/alpha: source via tests\/fixtures\/clean-child\.ts:1/] },
  { name: "a spawned fixture that already splits one package splitting a second",
    mutate: (dir) => put(dir, "tests/fixtures/spawned.ts", `import { beta } from "@fx/beta";\nimport { betaInternal } from "../../packages/beta/src/internal.ts";\n${read(dir, "tests/fixtures/spawned.ts")}`),
    expect: [/packages one test process loads from both source[^\n]* in tests\/fixtures\/spawned\.ts 1 → 2/, /Now split: [^\n]*@fx\/beta: source via tests\/fixtures\/spawned\.ts:2/] },
];
// The base repository is built once; a scenario is a branch off main, so each one costs a commit and a gate run.
let gateRepo = "";
const gateMain = () => { if (!gateRepo) gateRepo = repoForGate(); return gateRepo; };
for (const scenario of violations) {
  test(`gate: ${scenario.name} fails against the merge-base`, () => {
    const dir = gateMain();
    branch(dir, "violation", scenario.mutate);
    const caught = gate(dir, "--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);
  });
}

test("gate: --update does not hide a new split, neither with the merge-base nor by rewriting the committed baseline", () => {
  const dir = gateMain();
  branch(dir, "laundering", violations[0].mutate);
  const refused = gate(dir, "--update", "--base", "main");
  assert.equal(refused.code, 1, refused.out);
  assert.match(refused.out, /Baseline not written/);
  assert.equal(git(dir, "status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
  assert.equal(gate(dir, "--update").code, 1, "W2-10-E-01 even a local update cannot record a split");
  const baseline = JSON.parse(read(dir, "tooling/gates/baseline.json"));
  baseline.testImportSplits = { "tests/source-only.test.ts": 100, "tests/split.test.ts": 100, "tests/fixtures/spawned.ts": 100 };
  baseline.testImportSplitsTotal = 300;
  put(dir, "tooling/gates/baseline.json", json(baseline));
  commit(dir, "forged baseline");
  assert.equal(gate(dir).code, 1, "W2-10-E-01 forged historical counts grant no exception");
  const still = gate(dir, "--base", "main");
  assert.equal(still.code, 1, still.out);
  for (const pattern of violations[0].expect) assert.match(still.out, pattern);
});

test("gate: only the process that reads a package from both places is counted at the merge-base", () => {
  const dir = gateMain();
  git(dir, "checkout", "-q", "-f", "main");
  // Type-only imports load nothing; the built twin and the package name are one copy; source alone is one copy. A fixture that no test
  // imports is a process of its own, counted under its own path. Two of them split: tests/split.test.ts and tests/fixtures/spawned.ts
  // (clean-child.ts has one copy).
  const report = gate(dir, "--report", "--base", "main");
  assert.match(report.out, /Packages test processes load from both source and build \(per test file or spawned fixture\): 2 in 2 files/);
  assert.deepEqual(JSON.parse(gate(dir, "--report", "--json", "--base", "main").out).head.testImportSplits, { "tests/fixtures/spawned.ts": 1, "tests/split.test.ts": 1 });
  branch(dir, "harmless", () => { for (const file of ["tests/type-only.test.ts", "tests/twin.test.ts", "tests/source-only.test.ts", "tests/fixtures/spawned.ts", "tests/fixtures/clean-child.ts"]) put(dir, file, `${read(dir, file)}// touched\n`); });
  const run1 = gate(dir, "--base", "main");
  assert.equal(run1.code, 1, run1.out);
  assert.match(run1.out, /test import absolute zero:/);
  assert.doesNotMatch(run1.out, /Lower than the merge-base: [^.]*testImportSplits/);
});

test("gate: removing a split lowers the number, and moving a split test keeps its record", () => {
  const dir = gateMain();
  branch(dir, "tidy", () => swap(dir, "tests/split.test.ts", 'import { hidden } from "../packages/alpha/src/hidden.ts";', 'import type { hidden } from "../packages/alpha/src/hidden.ts";'));
  const lowered = gate(dir, "--base", "main");
  assert.equal(lowered.code, 1, lowered.out);
  assert.match(lowered.out, /test import absolute zero:/);
  assert.match(gate(dir, "--report", "--base", "main").out, /Packages test processes load from both source and build/);
  assert.equal(gate(dir, "--update", "--base", "main").code, 1, "a decline that leaves one split cannot update the baseline");

  branch(dir, "moved", () => git(dir, "mv", "tests/split.test.ts", "tests/split-renamed.test.ts"));
  const moved = gate(dir, "--base", "main");
  assert.equal(moved.code, 1, moved.out);
  assert.match(moved.out, /test import absolute zero: tests\/split-renamed\.test\.ts/);
});

test("gate: fixing a spawned fixture lowers the number, and a fixture a test starts to import is measured through that test", () => {
  const dir = gateMain();
  branch(dir, "fixture-tidy", () => swap(dir, "tests/fixtures/spawned.ts", "packages/alpha/src/hidden.ts", "packages/alpha/dist/hidden.js"));
  const lowered = gate(dir, "--base", "main");
  assert.equal(lowered.code, 1, lowered.out);
  assert.match(lowered.out, /test import absolute zero:/);
  assert.match(gate(dir, "--report", "--base", "main").out, /Packages test processes load from both source and build/);
  assert.deepEqual(JSON.parse(gate(dir, "--report", "--json", "--base", "main").out).head.testImportSplits, { "tests/split.test.ts": 1 });

  // The same split, now read by a test: the fixture is no longer a process of its own, the test that reads it is split in its place.
  branch(dir, "fixture-imported", () => put(dir, "tests/clean.test.ts", `import "./fixtures/spawned.ts";\n${read(dir, "tests/clean.test.ts")}`));
  const taken = gate(dir, "--base", "main");
  assert.equal(taken.code, 1, taken.out);
  assert.match(taken.out, /packages one test process loads from both source[^\n]* in tests\/clean\.test\.ts 0 → 1/);
});

test("--check --json counts the spawned fixtures that split with the tests, and names them under entries", () => {
  const dir = gateMain();
  git(dir, "checkout", "-q", "-f", "main");
  const found = JSON.parse(run(dir, "--check", "--json").out) as { splits: Record<string, number>; entries: string[] };
  assert.equal(found.splits["tests/fixtures/spawned.ts"], 1);
  assert.equal(found.splits["tests/split.test.ts"], 1);
  assert.deepEqual(found.entries, ["tests/fixtures/spawned.ts"]);
  assert.equal(found.splits["tests/fixtures/clean-child.ts"], undefined);
});

test("gate: a repository with no tests has nothing to measure", () => {
  const dir = scratch({ "tooling/gates/limits.json": json({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }), ...alpha({}, []) });
  git(dir, "add", "-A");
  assert.equal(gate(dir, "--update").code, 0);
  assert.equal(Object.hasOwn(JSON.parse(read(dir, "tooling/gates/baseline.json")), "testImportSplits"), false);
});

test("W2-10-E-01 a fully unified graph passes and drops obsolete baseline keys", () => {
  const dir = gateMain();
  branch(dir, "all-unified", () => {
    swap(dir, "tests/split.test.ts", "packages/alpha/src/hidden.ts", "packages/alpha/dist/hidden.js");
    swap(dir, "tests/fixtures/spawned.ts", "packages/alpha/src/hidden.ts", "packages/alpha/dist/hidden.js");
  });
  assert.equal(gate(dir, "--base", "main").code, 0);
  assert.equal(gate(dir, "--update", "--base", "main").code, 0);
  const baseline = JSON.parse(read(dir, "tooling/gates/baseline.json"));
  assert.equal(Object.hasOwn(baseline, "testImportSplits"), false);
  assert.equal(Object.hasOwn(baseline, "testImportSplitsTotal"), false);
});
