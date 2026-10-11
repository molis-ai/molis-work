import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

// specs/repository-anti-corruption W2-10 (PR-0): the test-imports tool (scripts/test-imports.mjs, scripts/test-imports/). A test
// process that loads a package from its source (../P/src) and from its build (the package name, ../P/dist) holds two copies of it.
// The tool finds those processes and rewrites the imports so a package is reached from one place. As in
// tests/health-gates-source-counts.test.ts, it runs as the command it is, on small scratch repositories, so nothing here imports a
// package or the scripts: this file starts at 0 internal imports.
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
