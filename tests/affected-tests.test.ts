import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";
import { buildTestIndex } from "../scripts/affected-tests/index.mjs";
import { discoverPackages, listFiles, namedChanges, readChanges, resolveBase } from "../scripts/affected-tests/repository.mjs";
import { FULL_REGRESSION, I18N_TEST, UI } from "../scripts/affected-tests/rules.mjs";
import { busyProcesses, parseProcessList, staleBuilds } from "../scripts/affected-tests/run.mjs";
import { exportedNames, readmeTests, routeChunks, routesIn, selectAffected } from "../scripts/affected-tests/select.mjs";
import { holdsSchema, literalsOf, schemaChanged, schemaOf } from "../scripts/affected-tests/storage.mjs";

// specs/repository-anti-corruption §4.7 (roadmap W2-17): scripts/affected-tests.mjs turns the 2026-10-03 validation-frequency
// rule into a selector (docs/system/PARALLEL-DEVELOPMENT.md section 6). Each part of the rule is checked on a scratch repository
// with small fake packages and test files: the README's must-run line, the tests that import or are named for a changed file,
// the names it exports, the translation and route rules, the UI line, and every reason the full suite is recommended and every
// near miss that must not recommend it. Weakening a rule in scripts/affected-tests/select.mjs makes one of these fail.
// The last block runs the selector on this repository itself: the paths its rules name still exist, and every package's
// README must-run tests come out for a change to that package.
const script = fileURLToPath(new URL("../scripts/affected-tests.mjs", import.meta.url));
const realRoot = fileURLToPath(new URL("..", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=affected", "-c", "user.email=affected@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");

/** A README with the 开发要求 section the selector reads: the must-run line, UI line, a scoped extra and a conditional part. */
const readme = (name: string, lines: string[]) => `# ${name}\n\n## 开发要求\n\n- 负责：${name}\n- 不负责：other\n${lines.join("\n")}\n- 相关手册：none\n\n## 进一步阅读\n`;
const run = (...tests: string[]) => `- 改动后必跑：\`node scripts/run-tests.mjs ${tests.join(" ")}\``;
const workspacePackage = (dir: string, name: string, extraReadme: string[] = [], exports: Record<string, unknown> = {}) => {
  put(`${dir}/package.json`, JSON.stringify({ name, version: "0.0.0", private: true, exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, ...exports } }));
  put(`${dir}/README.md`, readme(dir, extraReadme));
  put(`${dir}/src/index.ts`, `export * from "./main.js";\n`);
  put(`${dir}/src/main.ts`, `export const main = 1;\n`);
};
const alphaSource = `export function computeAlphaTotal(items: number[]) { return items.length; }\nexport const ALPHA_LABEL = "alpha";\n`;
const importsAlpha = `import { computeAlphaTotal } from "@molis-ai/molis-work-plugin-alpha";\ntest("x", () => computeAlphaTotal([]));\n`;

const BT = "`";
/** A store the way the repository writes one: a baseline object with a version and a multi-line CREATE TABLE text. */
const baselineStore = (version: number, columns: string[] = ["id TEXT PRIMARY KEY", "title TEXT NOT NULL", "body TEXT NOT NULL"]) => [
  'import type { SqliteBaseline } from "@molis-ai/molis-work-storage";',
  "// The store's one schema.",
  `export const ALPHA_BASELINE: SqliteBaseline = { version: ${version}, schema: ${BT}`,
  "CREATE TABLE alpha_items (",
  ...columns.map((column, index) => `  ${column}${index < columns.length - 1 ? "," : ""}`),
  ");",
  "CREATE INDEX alpha_items_by_title ON alpha_items(title);",
  `${BT} };`,
  "export function openAlphaBaselineStore() { return ALPHA_BASELINE.version; }",
  "",
].join("\n");
/** A route file with three handlers, the way web-request.ts is built: the route on one line, the work in the lines below it. */
const alphaHttp = [
  'import { send } from "./send.js";',
  "export async function handleAlpha(request, response, url) {",
  '  if (request.method === "POST" && url.pathname === "/api/alpha/items") {',
  "    const body = await readBody(request);",
  '    const kind = body.kind === "a" ? body.kind : null;',
  "    send(response, 200, { kind });",
  "    return true;",
  "  }",
  '  if (url.pathname === "/api/alpha/other") {',
  "    const other = await readBody(request);",
  "    send(response, 200, { other });",
  "    return true;",
  "  }",
  "  return false;",
  "}",
  "",
].join("\n");
/** Many code lines, then comment lines, then blank lines: what a block of old code looks like to the deletion rule. */
const longSource = (codeLines: number, commentLines = 0, blankLines = 0) => [
  ...Array.from({ length: codeLines }, (_, index) => `const value${index} = ${index};`),
  ...Array.from({ length: commentLines }, (_, index) => `// old note ${index}`),
  ...Array.from({ length: blankLines }, () => ""),
  "",
].join("\n");
const keepLines = (file: string, keep: number) => put(file, `${read(file).split("\n").slice(0, keep).join("\n")}\n`);

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-affected-tests-"));
  git("init", "-q", "-b", "main");
  put("package.json", JSON.stringify({ name: "scratch", private: true }));
  workspacePackage("plugins/native/alpha", "@molis-ai/molis-work-plugin-alpha", [
    run("tests/alpha-readme.test.ts"),
    "- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/ui-flow.e2e.test.ts`；改到设置页再加跑 `tests/settings-area.e2e.test.ts`",
    "- 助理验证：`node scripts/run-tests.mjs tests/assistant-extra.test.ts`",
    "- 不变量：边界由 `tests/invariant-doc.test.ts` 守住",
  ]);
  workspacePackage("plugins/native/alpha/nested", "@molis-ai/molis-work-plugin-alpha-nested", [run("tests/nested-readme.test.ts")]);
  put("plugins/native/alpha/src/alpha.ts", alphaSource);
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return 1; }\n`);
  put("plugins/native/alpha/src/client.ts", `export const CLIENT = 1;\n`);
  put("plugins/native/alpha/src/routes.ts", `export const ALPHA_ROUTE = "/api/alpha/items";\nexport const OTHER_ROUTE = "/api/alpha/other";\n`);
  put("plugins/native/alpha/src/text.ts", `export const TITLE = L("标题");\n`);
  put("plugins/native/alpha/src/orphan.ts", `export function neverTestedAnywhere() { return 0; }\n`);
  workspacePackage("plugins/native/beta", "@molis-ai/molis-work-plugin-beta", [run("tests/beta-readme.test.ts")]);
  workspacePackage("plugins/native/gamma", "@molis-ai/molis-work-plugin-gamma", [run("tests/gamma-readme.test.ts")]);
  workspacePackage("plugins/native/delta", "@molis-ai/molis-work-plugin-delta", [run("tests/delta-readme.test.ts")]);
  put("plugins/native/alpha/src/baseline-store.ts", baselineStore(2));
  put("plugins/native/alpha/src/proposal-baselines.ts", `export const PROPOSAL_BASELINES = { first: "a" };\n`);
  put("plugins/native/alpha/src/alpha-http.ts", alphaHttp);
  put("plugins/native/alpha/src/large.ts", longSource(350, 60, 40));
  put("plugins/native/alpha/src/second.ts", longSource(200));
  put("plugins/native/alpha/src/ambient.ts", `export const AMBIENT_LEVEL = 1;\n`);
  put("plugins/native/alpha/tests/db/baseline.test.ts", `db.exec("CREATE TABLE inside_package_test (id TEXT)");\n`);
  workspacePackage("packages/kernel", "@molis-ai/molis-work-kernel", [run("tests/kernel-readme.test.ts")]);
  workspacePackage("packages/contracts", "@molis-ai/molis-work-contracts", [run("tests/contracts-readme.test.ts")], { "./platform/plugin": { types: "./dist/platform/plugin.d.ts", import: "./dist/platform/plugin.js" } });
  put("packages/contracts/src/platform/plugin.ts", `export interface PluginContract { id: string }\n`);
  workspacePackage("packages/storage", "@molis-ai/molis-work-storage", [run("tests/storage-readme.test.ts")]);
  workspacePackage("modules/goals", "@molis-ai/molis-work-module-goals", [run("tests/goals-readme.test.ts")]);
  workspacePackage("apps/local-host", "@molis-ai/molis-work-app-local-host", [run("tests/host-readme.test.ts")]);
  put("apps/local-host/src/web-request.ts", `export function handleRequest() { return 1; }\n`);
  put("apps/local-host/src/quiet.ts", `export function quietHelper() { return 2; }\n`);
  put("scripts/run-tests.mjs", `import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("../ran.txt", import.meta.url), process.argv.slice(2).join("\\n"));\nprocess.exitCode = Number(process.env.FAKE_EXIT ?? 0);\n`);
  // Tests: each says what it reads, by import, by path, by name, or by a helper.
  for (const name of ["alpha-readme", "nested-readme", "beta-readme", "gamma-readme", "delta-readme", "kernel-readme", "contracts-readme", "storage-readme", "goals-readme", "host-readme", "assistant-extra"]) put(`tests/${name}.test.ts`, `test("${name}", () => {});\n`);
  put("tests/ui-flow.e2e.test.ts", `test("ui", () => {});\n`);
  put("tests/beta-ui.e2e.test.ts", `test("beta ui", () => {});\n`);
  put("plugins/native/beta/src/client.ts", `export const BETA_CLIENT = 1;\n`);
  put("tests/settings-area.e2e.test.ts", `test("settings", () => {});\n`);
  put("tests/reads-alpha.test.ts", `import { computeAlphaTotal } from "../plugins/native/alpha/src/alpha.js";\ntest("x", () => computeAlphaTotal([]));\n`);
  put("tests/alpha-store.test.ts", `test("store", () => {});\n`);
  put("tests/mentions-alpha.test.ts", importsAlpha);
  put("tests/other-package.test.ts", `// a test of another package with a function of the same name\nconst computeAlphaTotal = () => 1;\ntest("x", () => computeAlphaTotal());\n`);
  put("tests/unrelated.test.ts", `test("nothing", () => {});\n`);
  put("tests/route-reader.test.ts", `test("x", async () => { await fetch("/api/alpha/items"); });\n`);
  put("tests/route-browser.e2e.test.ts", `test("x", async () => { await fetch("/api/alpha/items?x=1"); });\n`);
  put("tests/reads-quiet.test.ts", `import { quietHelper } from "../apps/local-host/src/quiet.js";\ntest("x", () => quietHelper());\n`);
  put("tests/other-route-reader.test.ts", `test("x", async () => { await fetch("/api/alpha/other"); });\n`);
  put("tests/prelude-user-1.test.ts", `import { preludeSetup } from "./fixtures/prelude.js";\ntest("1", () => preludeSetup());\n`);
  put("tests/prelude-user-2.test.ts", `import { preludeSetup } from "./fixtures/prelude.js";\ntest("2", () => preludeSetup());\n`);
  put("tests/prelude-user-3.test.ts", `import { preludeSetup } from "./fixtures/prelude.js";\ntest("3", () => preludeSetup());\n`);
  put("tests/fixtures/prelude.ts", `import "../../plugins/native/alpha/src/ambient.js";\nexport const preludeSetup = () => 1;\n`);
  put("tests/common-route-1.test.ts", `test("1", async () => { await fetch("/projects/one/"); });\n`);
  put("tests/common-route-2.test.ts", `test("2", async () => { await fetch("/projects/two/"); });\n`);
  put("tests/common-route-3.test.ts", `test("3", async () => { await fetch("/projects/three/"); });\n`);
  put("tests/helper-user-1.test.ts", `import { sharedSetup } from "./fixtures/shared.js";\ntest("1", () => sharedSetup());\n`);
  put("tests/helper-user-2.test.ts", `import { sharedSetup } from "./fixtures/shared.js";\ntest("2", () => sharedSetup());\n`);
  put("tests/helper-user-3.test.ts", `import { sharedSetup } from "./fixtures/shared.js";\ntest("3", () => sharedSetup());\n`);
  put("tests/fixtures/shared.ts", `import { quietHelper } from "../../apps/local-host/src/quiet.js";\nexport const sharedSetup = () => quietHelper();\n`);
  put("tests/i18n.test.ts", `test("i18n", () => {});\n`);
  put("docs/system/NOTE.md", `# note\n`);
  git("add", "-A");
  git("commit", "-q", "-m", "base");
});
after(() => rmSync(repo, { recursive: true, force: true }));
beforeEach(() => { git("reset", "-q", "--hard", "HEAD"); git("clean", "-q", "-fd"); });

/** The selector's own pipeline, as the command runs it: the named files, or the changes since `main`. */
type Options = Parameters<typeof selectAffected>[0]["options"];
const select = (named: string[] | null, options: Options = {}) => {
  const files = listFiles(repo), packages = discoverPackages(repo, files);
  const changes = named ? namedChanges(repo, named) : readChanges(repo, resolveBase(repo, "main").mergeBase);
  return selectAffected({ root: repo, changes, packages, index: buildTestIndex(repo, files, packages), options });
};
const picked = (result: ReturnType<typeof select>) => result.tests.map((entry) => entry.file);
const reasonsOf = (result: ReturnType<typeof select>, file: string) => result.tests.find((entry) => entry.file === file)?.reasons.map((reason) => reason.code) ?? [];
const rulesOf = (result: ReturnType<typeof select>) => result.full.map((entry) => entry.rule);
const restore = () => { git("reset", "-q", "--hard", "HEAD"); git("clean", "-q", "-fd"); };

// ---- what reads a changed file -------------------------------------------------------------------------------------------------
test("a changed file selects its package's must-run tests, the tests that import it, the tests named for it and the tests that use its names", () => {
  const result = select(["plugins/native/alpha/src/alpha.ts"]);
  assert.ok(reasonsOf(result, "tests/alpha-readme.test.ts").includes("readme"), "the README's 改动后必跑");
  assert.ok(reasonsOf(result, "tests/reads-alpha.test.ts").includes("reads-file"), "a test that imports the file");
  assert.ok(reasonsOf(result, "tests/mentions-alpha.test.ts").includes("uses-name"), "a test of the package that calls computeAlphaTotal");
  assert.deepEqual(result.full, []);
  assert.equal(picked(result).includes("tests/unrelated.test.ts"), false);
  assert.equal(picked(result).includes("tests/beta-readme.test.ts"), false, "another package's README is not read");
});

test("a name is only a reader when the test touches the file's package: another package's function of the same name is another function", () => {
  const result = select(["plugins/native/alpha/src/alpha.ts"]);
  assert.equal(picked(result).includes("tests/other-package.test.ts"), false);
});

test("a generic file name is told by the package prefix: store.ts is read by tests/alpha-store.test.ts, not by every test named store", () => {
  put("tests/store-menu.test.ts", `test("x", () => {});\n`);
  const result = select(["plugins/native/alpha/src/store.ts"]);
  assert.ok(reasonsOf(result, "tests/alpha-store.test.ts").includes("named-for-file"));
  assert.equal(picked(result).includes("tests/store-menu.test.ts"), false);
});

test("the limits on names are inclusive: tests named for a file, and tests that mention a name it exports, are selected up to the symbol limit and not beyond", () => {
  const change = ["plugins/native/alpha/src/ambient.ts"];
  for (const suffix of ["a", "b", "c"]) put(`tests/ambient-${suffix}.test.ts`, `test("${suffix}", () => {});\n`);
  const named = (result: ReturnType<typeof select>) => picked(result).filter((file) => file.startsWith("tests/ambient-"));
  assert.equal(named(select(change, { symbolLimit: 3 })).length, 3, "three tests named for the file, limit 3");
  assert.equal(named(select(change, { symbolLimit: 2 })).length, 0, "three named tests are too many for a limit of 2");
  restore();
  for (const suffix of ["a", "b", "c"]) put(`tests/level-${suffix}.test.ts`, `const file = "plugins/native/alpha/src/main.ts";\ntest("${suffix}", () => file && AMBIENT_LEVEL);\n`);
  const levels = (result: ReturnType<typeof select>) => picked(result).filter((file) => file.startsWith("tests/level-"));
  assert.equal(levels(select(change, { symbolLimit: 3 })).length, 3, "three tests that touch the package mention AMBIENT_LEVEL, limit 3");
  const crowded = select(change, { symbolLimit: 2 });
  assert.equal(levels(crowded).length, 0);
  assert.ok(crowded.notes.some((text) => text.includes("too many tests to tell readers apart") && text.includes("AMBIENT_LEVEL (3)")), crowded.notes.join("\n"));
});

test("a file stem shorter than four characters is too short to name a test: only the package-prefixed name counts", () => {
  put("tests/abc-thing.test.ts", `test("x", () => {});\n`);
  put("tests/alpha-abc.test.ts", `test("x", () => {});\n`);
  put("tests/abcd-thing.test.ts", `test("x", () => {});\n`);
  put("plugins/native/alpha/src/abc.ts", `export const SHORT_STEM = 1;\n`);
  put("plugins/native/alpha/src/abcd.ts", `export const LONGER_STEM = 1;\n`);
  const short = select(["plugins/native/alpha/src/abc.ts"]);
  assert.ok(reasonsOf(short, "tests/alpha-abc.test.ts").includes("named-for-file"));
  assert.equal(picked(short).includes("tests/abc-thing.test.ts"), false);
  assert.deepEqual(reasonsOf(select(["plugins/native/alpha/src/abcd.ts"]), "tests/abcd-thing.test.ts"), ["named-for-file"]);
});

test("a file no test reads is reported, not silently covered by the package's other tests", () => {
  const result = select(["plugins/native/alpha/src/orphan.ts"]);
  assert.deepEqual(result.uncovered, ["plugins/native/alpha/src/orphan.ts"]);
  assert.ok(picked(result).includes("tests/alpha-readme.test.ts"), "the README's tests still run");
});

test("a test that gets a file only from a shared fixture is not selected when many tests share it, and is with --wide", () => {
  const narrow = select(["apps/local-host/src/quiet.ts"], { symbolLimit: 2 });
  assert.ok(picked(narrow).includes("tests/reads-quiet.test.ts"), "its own test imports it");
  assert.equal(picked(narrow).some((file) => file.startsWith("tests/helper-user")), false);
  assert.ok(narrow.notes.some((text) => text.includes("only through shared helpers") && text.includes("tests/fixtures/shared.ts")));
  const wide = select(["apps/local-host/src/quiet.ts"], { symbolLimit: 2, wide: true });
  assert.equal(picked(wide).filter((file) => file.startsWith("tests/helper-user")).length, 3);
  // Few enough tests share it: they are selected without --wide.
  const few = select(["apps/local-host/src/quiet.ts"], { symbolLimit: 3 });
  assert.equal(picked(few).filter((file) => file.startsWith("tests/helper-user")).length, 3);
  assert.deepEqual([...reasonsOf(few, "tests/helper-user-1.test.ts")].sort(), ["reads-file", "uses-name"], "by the fixture's import and by the name it calls");
});

test("the shared-fixture limit is inclusive: a fixture shared by exactly the limit still selects its tests, one more tests does not", () => {
  const change = ["plugins/native/alpha/src/ambient.ts"];
  const users = (result: ReturnType<typeof select>) => picked(result).filter((file) => file.startsWith("tests/prelude-user"));
  assert.deepEqual(users(select(change, { symbolLimit: 3 })), ["tests/prelude-user-1.test.ts", "tests/prelude-user-2.test.ts", "tests/prelude-user-3.test.ts"]);
  assert.deepEqual(reasonsOf(select(change, { symbolLimit: 3 }), "tests/prelude-user-1.test.ts"), ["reads-file"], "the tier of the fixture, not the names the file exports");
  const over = select(change, { symbolLimit: 2 });
  assert.deepEqual(users(over), []);
  assert.ok(over.notes.some((text) => text.includes("only through shared helpers") && text.includes("tests/fixtures/prelude.ts")));
  assert.equal(users(select(change, { symbolLimit: 2, wide: true })).length, 3);
});

test("a test reads a file by its built path, by a subpath of the package, or by joining its folders; a plain word or a wide folder reads nothing in particular", () => {
  put("tests/dist-reader.test.ts", `const built = "apps/local-host/dist/quiet.js";\n`);
  put("tests/contract-reader.test.ts", `import type { PluginContract } from "@molis-ai/molis-work-contracts/platform/plugin";\n`);
  put("tests/folder-reader.test.ts", `const dir = join(root, "plugins", "native", "alpha");\n`);
  put("tests/wide-words.test.ts", `const a = "plugins/";\nconst b = "docs";\nconst c = join(root, "server");\nconst d = ["apps", "tests"];\n`);
  assert.ok(reasonsOf(select(["apps/local-host/src/quiet.ts"]), "tests/dist-reader.test.ts").includes("reads-file"), "dist stands for src");
  assert.ok(reasonsOf(select(["packages/contracts/src/platform/plugin.ts"]), "tests/contract-reader.test.ts").includes("reads-file"), "a subpath import is traced to its source");
  const folder = select(["plugins/native/alpha/src/main.ts"]);
  assert.ok(reasonsOf(folder, "tests/folder-reader.test.ts").includes("reads-folder"));
  for (const target of ["plugins/native/alpha/src/main.ts", "apps/local-host/src/quiet.ts", "docs/system/NOTE.md"]) assert.equal(picked(select([target])).includes("tests/wide-words.test.ts"), false, target);
});

test("a changed test is selected, and a changed fixture selects every test that uses it", () => {
  put("tests/unrelated.test.ts", `test("changed", () => {});\n`);
  put("tests/fixtures/shared.ts", `export const sharedSetup = () => 3;\n`);
  const result = select(null);
  assert.deepEqual(reasonsOf(result, "tests/unrelated.test.ts"), ["changed"]);
  for (const user of ["1", "2", "3"]) assert.deepEqual(reasonsOf(result, `tests/helper-user-${user}.test.ts`), ["uses-changed-helper"]);
});

test("a deleted file selects the tests that import it, because they would no longer load", () => {
  unlinkSync(path.join(repo, "plugins/native/alpha/src/alpha.ts"));
  const result = select(null);
  assert.ok(reasonsOf(result, "tests/reads-alpha.test.ts").includes("reads-file"));
  assert.ok(reasonsOf(result, "tests/mentions-alpha.test.ts").includes("uses-name"), "an export removed from the package is a name its tests used");
});

test("a renamed file selects the tests that import its old path and its new one", () => {
  renameSync(path.join(repo, "plugins/native/alpha/src/alpha.ts"), path.join(repo, "plugins/native/alpha/src/alpha-total.ts"));
  const changes = (() => { git("add", "-A"); return readChanges(repo, resolveBase(repo, "main").mergeBase); })();
  assert.deepEqual(changes.map((change: { status: string; path: string; from?: string }) => `${change.status} ${change.from ?? ""}>${change.path}`), ["R plugins/native/alpha/src/alpha.ts>plugins/native/alpha/src/alpha-total.ts"]);
  const result = select(null);
  assert.ok(reasonsOf(result, "tests/reads-alpha.test.ts").includes("reads-file"), "it imports the old path");
});

test("a package imported by more tests than the limit is narrowed to the readers of the changed file, and --wide selects it whole", () => {
  for (const index of [1, 2, 3]) put(`tests/beta-user-${index}.test.ts`, `import { main } from "@molis-ai/molis-work-plugin-beta";\ntest("x", () => main);\n`);
  const narrow = select(["plugins/native/beta/src/main.ts"], { packageLimit: 3 });
  assert.equal(picked(narrow).filter((file) => file.startsWith("tests/beta-user")).length, 0);
  assert.ok(narrow.notes.some((text) => text.includes("plugins/native/beta") && text.includes("--wide")));
  assert.equal(picked(select(["plugins/native/beta/src/main.ts"], { packageLimit: 3, wide: true })).filter((file) => file.startsWith("tests/beta-user")).length, 3);
  assert.equal(picked(select(["plugins/native/beta/src/main.ts"], { packageLimit: 4 })).filter((file) => file.startsWith("tests/beta-user")).length, 0, "5 tests import it or are named for it");
  assert.equal(picked(select(["plugins/native/beta/src/main.ts"], { packageLimit: 5 })).filter((file) => file.startsWith("tests/beta-user")).length, 3, "the limit is inclusive");
});

// ---- the README --------------------------------------------------------------------------------------------------------------------
test("the UI line of a README is selected for a UI change and not for another, and scoped extras are listed, not selected", () => {
  const code = select(["plugins/native/alpha/src/main.ts"]);
  assert.equal(picked(code).includes("tests/ui-flow.e2e.test.ts"), false, "main.ts is not UI");
  assert.deepEqual(code.ui, []);
  const ui = select(["plugins/native/alpha/src/client.ts"]);
  assert.ok(reasonsOf(ui, "tests/ui-flow.e2e.test.ts").includes("readme-ui"));
  assert.deepEqual(ui.ui, ["plugins/native/alpha/src/client.ts"]);
  assert.equal(picked(ui).includes("tests/settings-area.e2e.test.ts"), false, "what follows 再加跑 is for that area only");
  assert.equal(picked(ui).includes("tests/assistant-extra.test.ts"), false);
  assert.ok(ui.notes.some((text) => text.includes("助理验证") && text.includes("tests/assistant-extra.test.ts") && text.includes("--readme-extras")));
  assert.ok(ui.notes.some((text) => text.includes("（条件）") && text.includes("tests/settings-area.e2e.test.ts")));
  const extras = select(["plugins/native/alpha/src/client.ts"], { readmeExtras: true });
  assert.ok(picked(extras).includes("tests/assistant-extra.test.ts") && picked(extras).includes("tests/settings-area.e2e.test.ts"));
});

test("a UI change is told by the file's name and place: client, styles, a view, a renderer, a page, css, html, svg; not the host's web-request, a viewer or a pagination", () => {
  const ui = ["client.ts", "client-views.ts", "styles.ts", "goals-page-renderer.ts", "panel.css", "client/menu.ts", "alpha-view.ts", "views.ts", "list-renderer.ts", "renderers.ts", "pages.ts", "alpha-page.ts", "shell.html", "icon.svg", "views/list.ts", "ui.ts", "styles/base.ts"];
  for (const name of ui) {
    const file = `plugins/native/alpha/src/${name}`;
    put(file, "export const X = 1;\n");
    assert.deepEqual(select([file]).ui, [file], file);
  }
  for (const file of ["apps/local-host/src/web-request.ts", "plugins/native/alpha/src/viewer.ts", "plugins/native/alpha/src/pagination.ts", "plugins/native/alpha/src/uikit.ts", "plugins/native/alpha/src/main.ts", "plugins/native/alpha/src/routes.ts"]) {
    put(file, "export const X = 1;\n");
    assert.deepEqual(select([file]).ui, [], file);
  }
  restore();
  put("plugins/native/alpha/src/main.ts", "export const MAIN = `<div class=\"card\">`;\n");
  assert.deepEqual(select(null).ui, ["plugins/native/alpha/src/main.ts"], "a changed line that writes markup");
});

test("a changed line of a browser program or a page is a UI change: a script or styles constant, a style tag, innerHTML, classList, the document queries", () => {
  const lines = ["export const FOO_SCRIPT = 1;", "export const FOO_STYLES = 1;", "export const FOO_STYLE = 1;", 'export const CSS = "<style>a{}</style>";', "el.innerHTML = value;", 'el.classList.add("a");',
    'document.querySelector("a");', 'document.getElementById("a");', 'const markup = "<div class=\\"a\\">";', "const plain = 1;", "const FOO = 1;", "document.title = 1;"];
  const isUi = [true, true, true, true, true, true, true, true, true, false, false, false];
  lines.forEach((line, index) => {
    put("plugins/native/alpha/src/main.ts", `${line}\n`);
    assert.equal(select(null).ui.length === 1, isUi[index], line);
    restore();
  });
  put("plugins/native/alpha/src/main.ts", "// el.innerHTML = value; and FOO_SCRIPT in a comment\nexport const main = 3;\n");
  assert.deepEqual(select(null).ui, [], "a comment is not a line of a browser program");
});

test("the packages whose sources are all UI are UI whatever a file is called; another package's helper is not", () => {
  for (const dir of ["apps/workbench", "packages/design-system", "packages/ui-host", "packages/im-ui"]) {
    const file = `${dir}/src/zzz-helper.ts`;
    assert.deepEqual(realAt(file).ui, [file], dir);
  }
  assert.deepEqual(realAt("packages/kernel/src/zzz-helper.ts").ui, []);
});

test("a package over the limit still gets the browser tests named for it when the change is UI", () => {
  for (const index of [1, 2, 3]) put(`tests/beta-user-${index}.test.ts`, `import { main } from "@molis-ai/molis-work-plugin-beta";\ntest("x", () => main);\n`);
  put("plugins/native/beta/src/client.ts", `export const BETA_CLIENT = 2;\n`);
  const ui = select(["plugins/native/beta/src/client.ts"], { packageLimit: 3 });
  assert.deepEqual(reasonsOf(ui, "tests/beta-ui.e2e.test.ts"), ["package-ui"]);
  assert.equal(picked(ui).some((file) => file.startsWith("tests/beta-user")), false);
  put("plugins/native/beta/src/main.ts", `export const main = 3;\n`);
  assert.equal(picked(select(["plugins/native/beta/src/main.ts"], { packageLimit: 3 })).includes("tests/beta-ui.e2e.test.ts"), false, "not a UI change");
});

test("readmeTests reads the unconditional tests of the 改动后必跑 and 界面改动加跑 lines and files the rest as extras", () => {
  const files = listFiles(repo), item = discoverPackages(repo, files).find((entry: { dir: string }) => entry.dir === "plugins/native/alpha");
  const result = readmeTests(repo, item);
  assert.deepEqual(result.mustRun, ["tests/alpha-readme.test.ts"]);
  assert.deepEqual(result.ui, ["tests/ui-flow.e2e.test.ts"]);
  assert.deepEqual(result.extras.map((extra: { label: string; tests: string[] }) => [extra.label, extra.tests]), [["界面改动加跑（需要本机 Chrome）（条件）", ["tests/settings-area.e2e.test.ts"]], ["助理验证", ["tests/assistant-extra.test.ts"]]]);
  assert.deepEqual(readmeTests(repo, null), { mustRun: [], ui: [], extras: [] });
});

// ---- text and routes ---------------------------------------------------------------------------------------------------------------
test("a changed line that shows text adds tests/i18n.test.ts; a comment, or a line with no text, does not", () => {
  put("plugins/native/alpha/src/text.ts", `export const TITLE = L("标题");\nexport const NEXT = L("新的标题");\n`);
  assert.ok(reasonsOf(select(null), I18N_TEST).includes("text"));
  git("reset", "-q", "--hard", "HEAD");
  put("plugins/native/alpha/src/text.ts", `export const TITLE = L("标题");\n// L("只是注释里的 中文")\nexport const COUNT = 3;\n`);
  assert.equal(picked(select(null)).includes(I18N_TEST), false);
  put("plugins/native/alpha/src/text.ts", `export const TITLE = L("标题");\nexport const MESSAGE = "没有翻译的中文";\n`);
  assert.ok(reasonsOf(select(null), I18N_TEST).includes("text"), "a Chinese string literal is text people read");
  put("plugins/native/alpha/src/text.ts", `export const TITLE = L("标题");\nexport const SIZE = response.text();\n`);
  assert.equal(picked(select(null)).includes(I18N_TEST), false, "response.text() is not a translator call");
});

test("every translator call the gate reads is text, and a bare .text() or a plain string is not", () => {
  const calls = ['L("a")', 'this.L("a")', 'p.text("a")', 'primitives.text("a")', 'translate("a")', 'this.t("a")', 'primitives.L("a")'];
  const notCalls = ["response.text()", "node.text('a')", "value.title(1)", "this.title('a')", "const L = 1", "export const SIZE = 3", 'export const LABEL = "plain text"'];
  for (const [list, expected] of [[calls, true], [notCalls, false]] as const) {
    for (const call of list) {
      put("plugins/native/alpha/src/text.ts", `export const TITLE = L("标题");\nexport const VALUE = ${call};\n`);
      assert.equal(picked(select(null)).includes(I18N_TEST), expected, call);
      restore();
    }
  }
  put("plugins/native/alpha/src/text.ts", "export const TITLE = L(\"标题\");\nexport const VALUE = '没有翻译的中文';\n");
  assert.ok(picked(select(null)).includes(I18N_TEST), "Chinese in a single-quoted string");
  restore();
  put("plugins/native/alpha/src/text.ts", "export const TITLE = L(\"标题\");\nexport const VALUE = `带模板的${1}中文`;\n");
  assert.ok(picked(select(null)).includes(I18N_TEST), "Chinese in a template");
  restore();
  put("plugins/native/alpha/src/text.ts", "export const TITLE = L(\"标题\");\nexport const VALUE = 1; // 只是注释的中文\n");
  assert.equal(picked(select(null)).includes(I18N_TEST), false, "a Chinese trailing comment is not a Chinese string");
});

test("a dictionary file is text even when the line has no call and no Chinese: en.ts, name-en.ts and anything under i18n/; a file that merely ends in en is not", () => {
  for (const file of ["plugins/native/alpha/src/en.ts", "plugins/native/alpha/src/alpha-en.ts", "plugins/native/alpha/src/i18n/zh.ts"]) {
    put(file, `export const TEXT = { title: "Title" };\n`);
    assert.ok(reasonsOf(select(null), I18N_TEST).includes("text"), file);
    restore();
  }
  put("plugins/native/alpha/src/then.ts", `export const TEXT = { title: "Title" };\n`);
  assert.equal(picked(select(null)).includes(I18N_TEST), false, "then.ts is not a dictionary");
  restore();
  put("scripts/en.ts", `export const TEXT = { title: "Title" };\n`);
  assert.equal(picked(select(null)).includes(I18N_TEST), false, "outside the product folders there is no dictionary");
});

test("a changed route adds every test that reads it, and only that route", () => {
  put("plugins/native/alpha/src/routes.ts", `export const ALPHA_ROUTE = "/api/alpha/items";\nexport const OTHER_ROUTE = "/api/alpha/other";\nexport const NEXT_ROUTE = "/api/alpha/items";\n`);
  const result = select(null);
  assert.ok(reasonsOf(result, "tests/route-reader.test.ts").includes("route"));
  assert.ok(reasonsOf(result, "tests/route-browser.e2e.test.ts").includes("route"), "the query string is not part of the route");
  git("reset", "-q", "--hard", "HEAD");
  put("plugins/native/alpha/src/routes.ts", `export const ALPHA_ROUTE = "/api/alpha/items";\nexport const OTHER_ROUTE = "/api/alpha/other";\nexport const NEXT_ROUTE = "/api/alpha/next-thing";\n`);
  const other = select(null);
  assert.equal(picked(other).includes("tests/route-reader.test.ts"), false);
});

test("routeChunks and routesIn break a route at its parameters and ignore comments and documents", () => {
  assert.deepEqual(routeChunks("/api/projects/${id}/brief"), ["/api/projects/", "/brief"]);
  assert.deepEqual(routeChunks("/api/projects/:id/brief?x=1"), ["/api/projects/", "/brief"]);
  assert.deepEqual(routeChunks("/api/"), [], "a bare prefix says nothing");
  assert.deepEqual(routesIn({ path: "plugins/native/alpha/src/x.ts", status: "M", added: ["// see /api/alpha/comment-only"], removed: [] }), []);
  assert.deepEqual(routesIn({ path: "plugins/native/alpha/src/routes.ts", status: "M", added: [`router.get("/health-check", () => 1)`], removed: [] }).map((item: { route: string }) => item.route), ["/health-check"]);
  assert.deepEqual(routesIn({ path: "plugins/native/alpha/src/main.ts", status: "M", added: [`const x = "/health-check"`], removed: [] }), [], "outside a route file only /api and /__ count");
  assert.deepEqual(routesIn({ path: "scripts/helper.mjs", status: "M", added: [`x("/api/alpha/items")`], removed: [] }), [], "scripts serve no routes");
  const routesAt = (file: string, line: string) => routesIn({ path: file, status: "M", added: [line], removed: [] }).map((item: { route: string }) => item.route);
  assert.deepEqual(routesAt("plugins/native/alpha/src/main.ts", `x("/__ui/catalog")`), ["/__ui/catalog"], "/__ names are routes anywhere");
  assert.deepEqual(routesAt("plugins/native/alpha/src/http/items.ts", `handle("/items/recent")`), ["/items/recent"], "a file under http/ serves routes");
  assert.deepEqual(routesAt("plugins/native/alpha/src/web/items.ts", `handle("/items/recent")`), ["/items/recent"], "a file under web/ serves routes");
  assert.deepEqual(routesAt("plugins/native/alpha/src/items-http.ts", `handle("/items/recent")`), ["/items/recent"]);
  assert.deepEqual(routesAt("plugins/native/alpha/src/items.ts", `handle("/items/recent")`), [], "an ordinary file with a path-looking string");
});

test("a change inside a handler is a change to that handler's route, though the line that names the route is not among the changed ones", () => {
  put("plugins/native/alpha/src/alpha-http.ts", alphaHttp.replace('body.kind === "a"', 'body.kind === "b"'));
  const first = select(null);
  assert.deepEqual(reasonsOf(first, "tests/route-reader.test.ts"), ["route"]);
  assert.deepEqual(reasonsOf(first, "tests/route-browser.e2e.test.ts"), ["route"]);
  assert.equal(picked(first).includes("tests/other-route-reader.test.ts"), false, "the handler below it is another route");
  restore();
  put("plugins/native/alpha/src/alpha-http.ts", alphaHttp.replace("const other = await", "const another = await"));
  const second = select(null);
  assert.deepEqual(reasonsOf(second, "tests/other-route-reader.test.ts"), ["route"]);
  assert.equal(picked(second).includes("tests/route-reader.test.ts"), false, "the handler above it is another route");
  restore();
  put("plugins/native/alpha/src/alpha-http.ts", alphaHttp.replace('import { send }', 'import { sendIt as send }'));
  assert.equal(picked(select(null)).some((file) => file.includes("route-")), false, "a change above every route belongs to none");
  restore();
  // Outside a route file a string that is not an /api path is no route, and nothing above the change is taken for one.
  put("plugins/native/alpha/src/main.ts", `const first = "/api/alpha/items";\nexport const main = 2;\n`);
  assert.deepEqual(reasonsOf(select(null), "tests/route-reader.test.ts"), ["route"], "the changed line itself names an /api route");
  restore();
  put("plugins/native/alpha/src/alpha.ts", alphaSource.replace("items.length", "items.length + 1"));
  assert.equal(picked(select(null)).includes("tests/route-reader.test.ts"), false);
});

test("hunks: readChanges gives the place of each change in the file as it is now, and the base text of a source file", () => {
  put("plugins/native/alpha/src/alpha-http.ts", alphaHttp.replace('body.kind === "a"', 'body.kind === "b"'));
  const change = (file: string) => readChanges(repo, resolveBase(repo, "main").mergeBase).find((entry: { path: string }) => entry.path === file);
  assert.deepEqual(change("plugins/native/alpha/src/alpha-http.ts").hunks, [{ start: 5, count: 1 }]);
  assert.equal(change("plugins/native/alpha/src/alpha-http.ts").before, alphaHttp);
  restore();
  put("plugins/native/alpha/src/alpha-http.ts", alphaHttp.split("\n").filter((line) => !line.includes("const kind")).join("\n"));
  assert.deepEqual(change("plugins/native/alpha/src/alpha-http.ts").hunks, [{ start: 4, count: 0 }], "a deletion sits after the line before it");
  restore();
  put("plugins/native/alpha/src/fresh.ts", `export const fresh = 1;\nexport const more = 2;\n`);
  assert.deepEqual(change("plugins/native/alpha/src/fresh.ts").hunks, [{ start: 1, count: 2 }]);
  assert.equal(change("plugins/native/alpha/src/fresh.ts").before, "", "a new file had no text");
  restore();
  unlinkSync(path.join(repo, "plugins/native/alpha/src/orphan.ts"));
  assert.equal(change("plugins/native/alpha/src/orphan.ts").before, `export function neverTestedAnywhere() { return 0; }\n`);
  restore();
  assert.deepEqual(namedChanges(repo, ["plugins/native/alpha/src/alpha-http.ts"])[0].hunks, [{ start: 1, count: alphaHttp.split("\n").length - 1 }]);
  assert.equal(namedChanges(repo, ["plugins/native/alpha/src/alpha-http.ts"])[0].before, null, "named files have no base to compare with");
});

test("routesIn takes the nearest enclosing line that names a route, within the scan window, in route files only, skipping comments and siblings", () => {
  const filler = (count: number) => Array.from({ length: count }, (_, index) => `    work(${index});`);
  const text = ['  if (url.pathname === "/api/alpha/items") {', ...filler(130), "  }"].join("\n");
  const file = "plugins/native/alpha/src/alpha-http.ts";
  const routesAt = (path: string, hunks: { start: number; count: number }[], body = text, added: string[] = []) => routesIn({ path, status: "M", added, removed: [], hunks }, body).map((item: { route: string }) => item.route);
  const at = (start: number, count = 1) => routesAt(file, [{ start, count }]);
  assert.deepEqual(at(2), ["/api/alpha/items"]);
  assert.deepEqual(at(121), ["/api/alpha/items"], "the route line 120 above the hunk is still looked at");
  assert.deepEqual(at(122), [], "the line 121 above it is not");
  assert.deepEqual(at(0, 0), [], "a deletion at the top of the file is inside nothing");
  assert.deepEqual(at(1, 0), ["/api/alpha/items"], "a deletion right after the route line is inside its block");
  assert.deepEqual(at(5, 0), ["/api/alpha/items"], "a deletion after a line of the body");
  assert.deepEqual(at(132), [], "the closing brace and below are outside the handler");
  assert.deepEqual(at(1), [], "the route line itself is not inside its own block; its text is what names the route");
  assert.deepEqual(routesAt(file, [{ start: 1, count: 1 }], text, [text.split("\n")[0]]), ["/api/alpha/items"], "the changed line that names a route is taken as it is");
  assert.deepEqual(routesAt("plugins/native/alpha/src/main.ts", [{ start: 2, count: 1 }]), [], "not a route file");
  assert.deepEqual(routesAt(file, []), [], "no hunks, no place");
  assert.deepEqual(routesAt(file, [{ start: 2, count: 1 }], ""), [], "no text, no place");
  const comment = ['  if (url.pathname === "/api/alpha/real") {', '    // was url.pathname === "/api/alpha/old"', "    work();"].join("\n");
  assert.deepEqual(routesAt(file, [{ start: 3, count: 1 }], comment), ["/api/alpha/real"], "a comment above is not a route");
  const sibling = ['  if (url.pathname === "/api/alpha/real") {', '    const redirect = "/api/alpha/elsewhere";', "    work();", "  }"].join("\n");
  assert.deepEqual(routesAt(file, [{ start: 3, count: 1 }], sibling), ["/api/alpha/real"], "a path in a sibling line at the same indentation is not the enclosing route");
  const nested = ['  if (url.pathname === "/api/alpha/real") {', "    if (request.method === 'POST') {", "      work();", "    }", "  }"].join("\n");
  assert.deepEqual(routesAt(file, [{ start: 3, count: 1 }], nested), ["/api/alpha/real"], "through a block that names no route");
  const inner = ['  if (url.pathname === "/api/alpha/real") {', '    const redirect = "/api/alpha/elsewhere";', "    if (request.method === 'POST') {", "      work();", "    }", "  }"].join("\n");
  assert.deepEqual(routesAt(file, [{ start: 4, count: 1 }], inner), ["/api/alpha/real"], "a path beside the block the change is in is not above the route that holds both");
  const aside = ['  if (url.pathname === "/api/alpha/real") {', '  // was "/api/alpha/old"', "    work();"].join("\n");
  assert.deepEqual(routesAt(file, [{ start: 3, count: 1 }], aside), ["/api/alpha/real"], "a comment indented like the route line is a comment, not the route");
  const helper = ['  if (url.pathname === "/api/alpha/real") {', "    work();", "  }", "}", "function help() {", "  return 1;", "}"].join("\n");
  assert.deepEqual(routesAt(file, [{ start: 6, count: 1 }], helper), [], "a function after the handlers is inside no route");
});

test("a route that more tests mention than the symbol limit is a common piece of a path: nothing is selected for it, a note says so, and --wide selects them", () => {
  const change = alphaHttp.replace("send(response, 200, { kind });", "send(response, 200, { kind, path: `/projects/${id}/` });");
  put("plugins/native/alpha/src/alpha-http.ts", change);
  const common = (result: ReturnType<typeof select>) => picked(result).filter((file) => file.startsWith("tests/common-route"));
  assert.equal(common(select(null, { symbolLimit: 3 })).length, 3, "exactly the limit still selects");
  const over = select(null, { symbolLimit: 2 });
  assert.deepEqual(common(over), []);
  assert.ok(over.notes.some((text) => text.includes("alpha-http.ts") && text.includes("/projects/") && text.includes("(3)") && text.includes("--wide")), over.notes.join("\n"));
  assert.equal(common(select(null, { symbolLimit: 2, wide: true })).length, 3);
  // The route of the handler (read by 2 tests) is under the limit of 2 and over the limit of 1.
  assert.deepEqual(reasonsOf(over, "tests/route-reader.test.ts"), ["route"]);
  assert.equal(picked(select(null, { symbolLimit: 1 })).includes("tests/route-reader.test.ts"), false);
});

test("naming a route file selects the readers of its routes, each route capped: web-request.ts did select hundreds", () => {
  put("apps/local-host/src/web-request.ts", [
    ...Array.from({ length: 30 }, (_, index) => `  if (url.pathname === "/api/many/route-${index}") return 1;`),
    '  if (url.pathname === "/health") return 2;',
    '  if (url.pathname === "/api/alpha/items") return 3;',
  ].join("\n"));
  for (let index = 0; index < 30; index++) put(`tests/many-${index}.test.ts`, `test("x", async () => { await fetch("/api/many/route-${index}"); await fetch("/health"); });\n`);
  const result = select(["apps/local-host/src/web-request.ts"]);
  const byRoute = result.tests.filter((entry: { reasons: { code: string }[] }) => entry.reasons.some((reason) => reason.code === "route")).map((entry: { file: string }) => entry.file);
  assert.equal(byRoute.includes("tests/route-reader.test.ts"), true);
  assert.equal(byRoute.filter((file: string) => file.startsWith("tests/many-")).length, 30, "each of the 30 routes has one reader");
  assert.equal(byRoute.includes("tests/route-browser.e2e.test.ts"), true);
  assert.equal(byRoute.length, 32, "30 + 2: /health is read by 30 tests and is not a route they read");
  assert.ok(result.notes.some((text) => text.includes("/health (30)")));
});

test("exportedNames reads declarations and export lists, including type exports and aliases", () => {
  const names = exportedNames(`export function a() {}\nexport const b = 1;\nexport async function c() {}\nexport class D {}\nexport interface E {}\nexport type F = 1;\nexport { g, h as i, type J } from "./x.js";\nexport default function ignored() {}\nconst hidden = 1;\n`);
  assert.deepEqual([...names].sort(), ["D", "E", "F", "J", "a", "b", "c", "g", "i", "ignored"]);
});

// ---- the full suite -----------------------------------------------------------------------------------------------------------------
test("one plugin's source, a document, or two packages do not recommend the full suite", () => {
  assert.deepEqual(select(["plugins/native/alpha/src/alpha.ts"]).full, []);
  assert.deepEqual(select(["docs/system/NOTE.md"]).full, []);
  assert.deepEqual(select(["plugins/native/alpha/src/alpha.ts", "plugins/native/beta/src/main.ts"]).full, []);
  assert.deepEqual(select(["apps/local-host/src/quiet.ts"]).full, [], "local-host outside its assembly files is an ordinary package");
  assert.deepEqual(select(["plugins/native/alpha/README.md", "packages/contracts/README.md"]).full, [], "a README is not source");
});

test("shared core (contracts, kernel, a module) recommends the full suite", () => {
  assert.deepEqual(rulesOf(select(["packages/contracts/src/platform/plugin.ts"])), ["shared-core"]);
  assert.deepEqual(rulesOf(select(["packages/kernel/src/main.ts"])), ["shared-core"]);
  assert.deepEqual(rulesOf(select(["modules/goals/src/main.ts"])), ["shared-core"]);
});

test("the assembly of the host recommends the full suite", () => {
  assert.deepEqual(rulesOf(select(["apps/local-host/src/web-request.ts"])), ["assembly"]);
});

test("storage, a migration, a baseline call and a one-line CREATE TABLE recommend the full suite", () => {
  assert.deepEqual(rulesOf(select(["packages/storage/src/main.ts"])), ["storage"]);
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return db.exec("CREATE TABLE alpha_items (id TEXT)"); }\n`);
  assert.deepEqual(rulesOf(select(null)), ["storage"]);
  restore();
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return db.exec("SELECT id FROM alpha_items"); }\n`);
  assert.deepEqual(rulesOf(select(null)), []);
  restore();
  put("plugins/native/alpha/src/store.ts", `// CREATE TABLE in a comment is not a change to a table\nexport function openAlphaStore() { return 1; }\n`);
  assert.deepEqual(rulesOf(select(null)), []);
  restore();
  put("plugins/native/alpha/src/migrations-v2.ts", `export const NOTHING = 1;\n`);
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a file named for a migration");
  restore();
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return applySqliteBaseline(db, path, ALPHA_BASELINE); }\n`);
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a changed line that applies a baseline");
  restore();
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return row.user_version; }\n`);
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a changed line that reads the schema version");
});

test("a store's usual schema change is seen: a bumped baseline version, a column in a multi-line CREATE TABLE, a new table, a dropped one", () => {
  const baseline = "plugins/native/alpha/src/baseline-store.ts";
  const columns = ["id TEXT PRIMARY KEY", "title TEXT NOT NULL", "body TEXT NOT NULL"];
  put(baseline, baselineStore(3));
  assert.deepEqual(rulesOf(select(null)), ["storage"], "version 2 to 3, nothing else");
  assert.match(select(null).full[0].detail, /baseline-store\.ts/);
  restore();
  put(baseline, baselineStore(2, [...columns.slice(0, 2), "archived_at TEXT", columns[2]]));
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a column in the middle of the CREATE TABLE text, the version untouched");
  restore();
  put(baseline, baselineStore(2, columns.slice(0, 2)));
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a column taken out");
  restore();
  put(baseline, read(baseline).replace("CREATE INDEX alpha_items_by_title ON alpha_items(title);\n", "CREATE INDEX alpha_items_by_title ON alpha_items(title);\nCREATE TABLE alpha_tags (id TEXT);\n"));
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a new table");
  restore();
  put(baseline, read(baseline).replace("CREATE INDEX alpha_items_by_title ON alpha_items(title);\n", ""));
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a dropped index");
  restore();
  // A schema built from constants: the baseline declaration is the one place the list is written.
  put(baseline, `${read(baseline).replace(/export const ALPHA_BASELINE[\s\S]*?\};\n/, "export const ALPHA_BASELINE: SqliteBaseline = {\n  version: 2,\n  schema: [ALPHA_ITEMS_SQL, ALPHA_TAGS_SQL].join(\"\\n\"),\n};\n")}`);
  git("add", "-A"); git("commit", "-q", "-m", "constants");
  put(baseline, read(baseline).replace("[ALPHA_ITEMS_SQL, ALPHA_TAGS_SQL]", "[ALPHA_ITEMS_SQL, ALPHA_TAGS_SQL, ALPHA_LABELS_SQL]"));
  try {
    const result = select(null);
    assert.deepEqual(rulesOf(result).filter((rule) => rule === "storage"), ["storage"], "a constant added to the list of schemas");
  } finally {
    git("reset", "-q", "--hard", "HEAD~1");
  }
});

test("every kind of DDL, in capitals or not, in a string or a template, is a schema change; SELECT, UPDATE, INSERT and DELETE are not", () => {
  const statements = [
    "CREATE TABLE t (id TEXT)", "CREATE TEMP TABLE t (id TEXT)", "CREATE UNIQUE INDEX i ON t(id)", "CREATE INDEX i ON t(id)", "CREATE VIEW v AS SELECT 1",
    "CREATE TRIGGER g AFTER INSERT ON t BEGIN SELECT 1; END", "CREATE VIRTUAL TABLE s USING fts5(a)", "ALTER TABLE t ADD COLUMN c TEXT",
    "DROP TABLE t", "DROP INDEX i", "DROP VIEW v", "DROP TRIGGER g", "PRAGMA user_version = 7", "create table t (id text)", "alter   table t add column c text",
  ];
  for (const statement of statements) {
    put("plugins/native/alpha/src/store.ts", `export const STEP = "${statement}";\n`);
    assert.deepEqual(rulesOf(select(null)), ["storage"], statement);
    restore();
    put("plugins/native/alpha/src/store.ts", `export const STEP = ${BT}\n  ${statement};\n${BT};\n`);
    assert.deepEqual(rulesOf(select(null)), ["storage"], `${statement} in a template`);
    restore();
  }
  // A template that holds DDL is one schema: another line of it changing is a change to it.
  for (const [ddl, line] of [["PRAGMA user_version = 7;", "SELECT 1;"], ["CREATE TABLE t (id TEXT);", "SELECT 1;"]]) {
    put("plugins/native/alpha/src/store.ts", `export const STEP = ${BT}\n  ${ddl}\n  SELECT 1;\n${BT};\n`);
    git("add", "-A"); git("commit", "-q", "-m", "template");
    put("plugins/native/alpha/src/store.ts", read("plugins/native/alpha/src/store.ts").replace("SELECT 1;", "SELECT 2;"));
    try { assert.deepEqual(rulesOf(select(null)), ["storage"], `${ddl} with ${line} changed`); } finally { git("reset", "-q", "--hard", "HEAD~1"); }
  }
  for (const text of ["SELECT * FROM alpha_items WHERE id = ?", "UPDATE alpha_items SET title = ?", "INSERT INTO alpha_items VALUES (?)", "DELETE FROM alpha_items"]) {
    put("plugins/native/alpha/src/store.ts", `export const STEP = "${text}";\n`);
    assert.deepEqual(rulesOf(select(null)), [], text);
    restore();
  }
});

test("a change that leaves the schema as it was is not a storage change: code beside it, comments in it, the way it is indented", () => {
  const baseline = "plugins/native/alpha/src/baseline-store.ts";
  put(baseline, read(baseline).replace("return ALPHA_BASELINE.version;", "return ALPHA_BASELINE.version + 0;"));
  assert.deepEqual(rulesOf(select(null)), [], "the function beside the baseline");
  restore();
  put(baseline, read(baseline).replace("// The store's one schema.", "// The store's one schema, CREATE TABLE and all."));
  assert.deepEqual(rulesOf(select(null)), [], "the comment above it");
  restore();
  put(baseline, read(baseline).replace("{ version: 2, schema: `", "{ /* the version */ version: 2, // and the schema\n  schema: `"));
  assert.deepEqual(rulesOf(select(null)), [], "comments inside the declaration");
  restore();
  put(baseline, read(baseline).replace(/\n  /g, "\n      "));
  assert.deepEqual(rulesOf(select(null)), [], "the same text indented another way");
  restore();
  put("plugins/native/alpha/src/proposal-baselines.ts", `export const PROPOSAL_BASELINES = { first: "a", second: "b" };\n`);
  assert.deepEqual(rulesOf(select(null)), [], "a file named for baselines that stores nothing");
  restore();
  // Moving a statement or a whole baseline up or down the file is not a change to what it stores.
  const two = [
    'export const FIRST = "CREATE TABLE first (id TEXT)";', 'export const SECOND = "CREATE TABLE second (id TEXT)";',
    "export const A_BASELINE: SqliteBaseline = { version: 1, schema: FIRST };", "export const B_BASELINE: SqliteBaseline = { version: 1, schema: SECOND };", "",
  ];
  put("plugins/native/alpha/src/store.ts", two.join("\n"));
  git("add", "-A"); git("commit", "-q", "-m", "two");
  try {
    put("plugins/native/alpha/src/store.ts", [two[1], two[0], two[3], two[2], ""].join("\n"));
    assert.deepEqual(rulesOf(select(null)), [], "the same statements and baselines in another order");
  } finally {
    git("reset", "-q", "--hard", "HEAD~1");
  }
  renameSync(path.join(repo, "plugins/native/alpha/src/baseline-store.ts"), path.join(repo, "plugins/native/alpha/src/store-moved.ts"));
  git("add", "-A");
  assert.deepEqual(rulesOf(select(null)), [], "a store renamed and not changed");
  restore();
  put("plugins/native/alpha/tests/db/baseline.test.ts", `db.exec("CREATE TABLE inside_package_test (id TEXT)");\ndb.exec("CREATE TABLE another (id TEXT)");\n`);
  assert.deepEqual(rulesOf(select(null)), [], "a test inside a package is not product source");
});

test("a file that holds a schema is a storage change when it is added or deleted, and when it is named (no base to compare with)", () => {
  put("plugins/native/alpha/src/fresh-store.ts", baselineStore(1));
  assert.deepEqual(rulesOf(select(null)), ["storage"], "added");
  restore();
  unlinkSync(path.join(repo, "plugins/native/alpha/src/baseline-store.ts"));
  assert.deepEqual(rulesOf(select(null)), ["storage"], "deleted");
  restore();
  put("plugins/native/alpha/src/fresh.ts", `export const fresh = 1;\n`);
  assert.deepEqual(rulesOf(select(null)), [], "added, with no schema");
  assert.deepEqual(rulesOf(select(["plugins/native/alpha/src/baseline-store.ts"])), ["storage"], "named, with a baseline");
  assert.deepEqual(rulesOf(select(["plugins/native/alpha/src/proposal-baselines.ts", "plugins/native/alpha/src/alpha.ts"])), [], "named, with none");
});

test("a source holds a schema when it has DDL in a literal or declares a baseline, built from constants or not; a change with no lines and no base says nothing", () => {
  assert.equal(holdsSchema('export const A = "CREATE TABLE a (id TEXT)";'), true);
  assert.equal(holdsSchema("export const B: SqliteBaseline = { version: 1, schema: [A_SQL, B_SQL].join(\"\\n\") };"), true);
  assert.equal(holdsSchema('export const C = "SELECT 1"; // CREATE TABLE c (id TEXT)'), false);
  const files = listFiles(repo), packages = discoverPackages(repo, files), index = buildTestIndex(repo, files, packages);
  const file = "plugins/native/alpha/src/baseline-store.ts";
  const storage = (change: Record<string, unknown>) => selectAffected({ root: repo, changes: [change as never], packages, index }).storage;
  assert.deepEqual(storage({ path: file, status: "M", added: [], removed: [] }), [], "no lines, no base: nothing is known to have changed");
  assert.deepEqual(storage({ path: file, status: "M", added: ["x"], removed: [], before: null }), [file], "some lines, no base: the file counts in full");
  assert.deepEqual(storage({ path: file, status: "M", added: ["x"], removed: [], before: read(file) }), [], "a base equal to now: the schema is the same");
});

test("schemaOf reads literals past quotes in comments, regular expressions, escapes and nested templates, and a baseline declaration whole", () => {
  const source = [
    "const a = 'it\\'s CREATE TABLE quoted (id TEXT)';",
    "const re = /[\"'`]CREATE TABLE in_regex (id TEXT)/g;",
    "const half = total / 2; const b = \"CREATE TABLE after_division (id TEXT)\";",
    "// \"CREATE TABLE in_comment (id TEXT)\"",
    "/* 'CREATE TABLE in_block (id TEXT)' */",
    "const c = `CREATE TABLE ${ `nested ${inner}` } templated (id TEXT)`;",
    "const d = `no ddl ${ \"CREATE TABLE inside_expression (id TEXT)\" }`;",
    "const e = `a tick \\` is still inside CREATE TABLE in_escaped (id TEXT)`; const f = \"CREATE TABLE after_escaped (id TEXT)\";",
    "export const B: SqliteBaseline = { version: 4, /* c */ schema: `CREATE TABLE b (id TEXT)` };",
  ].join("\n");
  const found = literalsOf(source).map((literal: { text: string }) => literal.text);
  assert.ok(found.some((text: string) => text.includes("quoted")), "an escaped quote does not end the string");
  assert.ok(found.some((text: string) => text.includes("after_division")), "a division and a regular expression with quotes do not swallow what follows");
  assert.equal(found.some((text: string) => text.includes("in_comment") || text.includes("in_block")), false);
  const ddl = schemaOf(source).ddl.join("\n");
  assert.ok(ddl.includes("quoted") && ddl.includes("after_division") && ddl.includes("templated") && ddl.includes("inside_expression"), ddl);
  assert.equal(ddl.includes("in_regex") || ddl.includes("in_comment") || ddl.includes("in_block"), false, ddl);
  assert.ok(schemaOf(source).ddl.includes("CREATE TABLE after_escaped (id TEXT)"), "an escaped backtick does not end the template, so the string after it is a string of its own");
  assert.deepEqual(schemaOf(source).baselines, ["{ version: 4, schema: `CREATE TABLE b (id TEXT)` }"]);
  assert.equal(schemaChanged(source, source.replace("version: 4", "version: 5")), true);
  assert.equal(schemaChanged(source, source.replace("/* c */", "/* d */")), false);
  assert.equal(schemaChanged(source, source.replace("// \"CREATE TABLE in_comment (id TEXT)\"", "// nothing")), false);
  assert.equal(schemaChanged("", source), true);
  assert.equal(schemaChanged(source, ""), true);
  assert.equal(schemaChanged("const x = 1;", "const x = 2;"), false);
});

test("three or more packages recommend the full suite", () => {
  const three = select(["plugins/native/alpha/src/alpha.ts", "plugins/native/beta/src/main.ts", "plugins/native/gamma/src/main.ts"]);
  assert.deepEqual(rulesOf(three), ["spans-packages"]);
  assert.match(three.full[0].detail, /3 packages/);
});

test("deleting a block of source recommends the full suite; deleting fewer files, or a document, does not", () => {
  for (const name of ["alpha", "store", "client"]) unlinkSync(path.join(repo, `plugins/native/alpha/src/${name}.ts`));
  assert.deepEqual(rulesOf(select(null)), ["deletes-code"]);
  assert.match(select(null).full[0].detail, /3 source files deleted \(3 or more\)/);
  restore();
  for (const name of ["alpha", "store"]) unlinkSync(path.join(repo, `plugins/native/alpha/src/${name}.ts`));
  assert.deepEqual(rulesOf(select(null)), []);
  restore();
  unlinkSync(path.join(repo, "docs/system/NOTE.md"));
  for (const name of ["alpha", "store"]) unlinkSync(path.join(repo, `plugins/native/alpha/src/${name}.ts`));
  assert.deepEqual(rulesOf(select(null)), []);
});

test("renaming source files is not deleting them: three renamed files do not recommend the full suite", () => {
  for (const name of ["alpha", "store", "client"]) renameSync(path.join(repo, `plugins/native/alpha/src/${name}.ts`), path.join(repo, `plugins/native/alpha/src/${name}-renamed.ts`));
  git("add", "-A");
  const changes = readChanges(repo, resolveBase(repo, "main").mergeBase);
  assert.deepEqual(changes.map((change: { status: string }) => change.status), ["R", "R", "R"]);
  assert.deepEqual(rulesOf(select(null)), []);
});

test("taking 300 code lines out of the source is a block of old code, in one file or spread over files; comments, blank lines, rewrites and other files' additions do not hide or add to it", () => {
  const large = "plugins/native/alpha/src/large.ts", second = "plugins/native/alpha/src/second.ts";
  keepLines(large, 51);
  assert.deepEqual(rulesOf(select(null)), [], "299 code lines are taken out, with 60 comment lines and 40 blank ones");
  restore();
  keepLines(large, 50);
  const exact = select(null);
  assert.deepEqual(rulesOf(exact), ["deletes-code"], "300 code lines");
  assert.match(exact.full[0].detail, /300 code lines taken out of 1 file \(300 or more\): plugins\/native\/alpha\/src\/large\.ts -300/);
  restore();
  keepLines(large, 100);
  assert.deepEqual(rulesOf(select(null)), [], "250 code lines go with 60 comment lines and 40 blank ones: 350 lines, but not 350 of code");
  restore();
  keepLines(large, 200);
  keepLines(second, 50);
  assert.deepEqual(rulesOf(select(null)), ["deletes-code"], "150 and 150 over two files");
  restore();
  put(large, longSource(350, 60, 40).split("\n").map((line, index) => (index < 350 ? `const rewritten${index} = ${index};` : line)).join("\n"));
  assert.deepEqual(rulesOf(select(null)), [], "every line rewritten: removed and added are the same number");
  restore();
  keepLines(large, 10);
  put("plugins/native/alpha/src/brand-new.ts", longSource(700));
  assert.deepEqual(rulesOf(select(null)), ["deletes-code"], "a big new file elsewhere does not cover for the lines taken out");
  restore();
  put("scripts/old-tool.mjs", longSource(400));
  git("add", "-A"); git("commit", "-q", "-m", "tool");
  try {
    unlinkSync(path.join(repo, "scripts/old-tool.mjs"));
    assert.deepEqual(rulesOf(select(null)), [], "lines taken out of a script are not product source");
  } finally {
    git("reset", "-q", "--hard", "HEAD~1");
  }
  put("docs/system/BIG.md", longSource(400));
  git("add", "-A"); git("commit", "-q", "-m", "doc");
  try {
    unlinkSync(path.join(repo, "docs/system/BIG.md"));
    assert.deepEqual(rulesOf(select(null)), [], "nor lines of a document");
  } finally {
    git("reset", "-q", "--hard", "HEAD~1");
  }
});

test("--full states the full suite as needed whatever the change is", () => {
  assert.deepEqual(rulesOf(select(["docs/system/NOTE.md"], { full: true })), ["requested"]);
});

// ---- the change set -----------------------------------------------------------------------------------------------------------------
test("the change set holds committed, staged, unstaged and untracked work, each file once, against the merge-base", () => {
  git("switch", "-q", "-c", "work");
  put("plugins/native/alpha/src/alpha.ts", `${alphaSource}// committed\n`);
  git("add", "-A"); git("commit", "-q", "-m", "committed");
  put("plugins/native/beta/src/main.ts", `export const main = 2;\n`);
  git("add", "plugins/native/beta/src/main.ts");
  put("plugins/native/gamma/src/main.ts", `export const main = 3;\n`);
  put("plugins/native/delta/src/new-file.ts", `export const fresh = 1;\nexport const second = 2;\n`);
  try {
    const changes = readChanges(repo, resolveBase(repo, "main").mergeBase);
    assert.deepEqual(changes.map((change: { status: string; path: string }) => `${change.status} ${change.path}`), [
      "A plugins/native/delta/src/new-file.ts", "M plugins/native/alpha/src/alpha.ts", "M plugins/native/beta/src/main.ts", "M plugins/native/gamma/src/main.ts",
    ].sort((left, right) => left.slice(2).localeCompare(right.slice(2))));
    const alpha = changes.find((change: { path: string }) => change.path.endsWith("alpha.ts"));
    assert.deepEqual(alpha.added, ["// committed"]);
    assert.deepEqual(alpha.removed, []);
    assert.deepEqual(changes.find((change: { path: string }) => change.path.endsWith("new-file.ts")).added, ["export const fresh = 1;", "export const second = 2;"]);
    assert.deepEqual(changes.find((change: { path: string }) => change.path.endsWith("beta/src/main.ts")).removed, ["export const main = 1;"]);
  } finally {
    git("reset", "-q", "--hard", "HEAD");
    git("switch", "-q", "main");
    git("branch", "-q", "-D", "work");
  }
});

test("no merge-base is a clear error, not an empty selection", () => {
  assert.throws(() => resolveBase(repo, "refs/heads/does-not-exist"), /no merge-base of HEAD with refs\/heads\/does-not-exist/);
});

test("a file under docs/ or specs/ is a document whatever its extension: it selects nothing and is not reported as uncovered", () => {
  put("specs/some-task/example.ts", "export const EXAMPLE = 1;\n");
  put("docs/system/example.ts", "export const EXAMPLE = 1;\n");
  for (const file of ["specs/some-task/example.ts", "docs/system/example.ts"]) {
    const result = select([file]);
    assert.deepEqual([result.uncovered, picked(result), result.packages], [[], [], []], file);
  }
  assert.deepEqual(select(["scripts/run-tests.mjs"]).uncovered, ["scripts/run-tests.mjs"], "a script is code");
});

test("only the packages named @molis-ai/molis-work-* outside node_modules, dist and fixtures are workspace packages, and a file belongs to the deepest one", () => {
  put("plugins/native/foreign/package.json", JSON.stringify({ name: "left-pad" }));
  put("plugins/native/alpha/node_modules/dep/package.json", JSON.stringify({ name: "@molis-ai/molis-work-dep" }));
  put("plugins/native/alpha/dist/package.json", JSON.stringify({ name: "@molis-ai/molis-work-dist" }));
  put("plugins/native/alpha/fixtures/sample/package.json", JSON.stringify({ name: "@molis-ai/molis-work-sample" }));
  put("plugins/native/alpha/broken/package.json", "{ not json");
  const dirs = discoverPackages(repo, listFiles(repo)).map((item: { dir: string }) => item.dir);
  for (const gone of ["plugins/native/foreign", "plugins/native/alpha/node_modules/dep", "plugins/native/alpha/dist", "plugins/native/alpha/fixtures/sample", "plugins/native/alpha/broken"]) assert.equal(dirs.includes(gone), false, gone);
  assert.ok(dirs.indexOf("plugins/native/alpha/nested") < dirs.indexOf("plugins/native/alpha"), "the deepest directory first");
  const nested = select(["plugins/native/alpha/nested/src/main.ts"]);
  assert.deepEqual(nested.packages, ["plugins/native/alpha/nested"]);
  assert.ok(reasonsOf(nested, "tests/nested-readme.test.ts").includes("readme"));
  assert.equal(picked(nested).includes("tests/alpha-readme.test.ts"), false, "a file of the nested package is not a file of the one around it");
});

test("the base is origin/main when there is one, else main; the merge-base is what the changes are measured from", () => {
  const first = git("rev-parse", "HEAD").trim();
  assert.deepEqual(resolveBase(repo), { ref: "main", mergeBase: first });
  put("plugins/native/alpha/src/later.ts", "export const LATER = 1;\n");
  git("add", "-A"); git("commit", "-q", "-m", "later");
  git("update-ref", "refs/remotes/origin/main", first);
  try {
    assert.deepEqual(resolveBase(repo), { ref: "origin/main", mergeBase: first });
    assert.equal(resolveBase(repo, "main").ref, "main");
    assert.equal(resolveBase(repo, "main").mergeBase, git("rev-parse", "HEAD").trim());
  } finally {
    git("update-ref", "-d", "refs/remotes/origin/main");
    git("reset", "-q", "--hard", "HEAD~1");
  }
});

test("named files that do not exist are treated as deleted", () => {
  const changes = namedChanges(repo, ["plugins/native/alpha/src/gone.ts", "./plugins/native/alpha/src/alpha.ts"]);
  assert.deepEqual(changes.map((change: { path: string; status: string }) => `${change.status} ${change.path}`), ["M plugins/native/alpha/src/alpha.ts", "D plugins/native/alpha/src/gone.ts"]);
});

// ---- the command --------------------------------------------------------------------------------------------------------------------
const cli = (...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
};

test("--list prints the unit tests and then the browser tests, one per line, and --unit-only and --browser-only keep one kind", () => {
  const all = cli("plugins/native/alpha/src/client.ts", "--list");
  assert.equal(all.code, 0, all.err);
  const lines = all.out.trim().split("\n");
  const firstBrowser = lines.findIndex((line) => line.includes(".e2e."));
  assert.ok(firstBrowser > 0 && lines.slice(firstBrowser).every((line) => line.includes(".e2e.")), lines.join("\n"));
  assert.deepEqual(cli("plugins/native/alpha/src/client.ts", "--list", "--unit-only").out.trim().split("\n").filter((line) => line.includes(".e2e.")), []);
  assert.deepEqual(cli("plugins/native/alpha/src/client.ts", "--list", "--browser-only").out.trim().split("\n").filter((line) => !line.includes(".e2e.")), []);
});

test("--list with nothing to run prints nothing on stdout and says so on stderr: an empty list must never reach run-tests.mjs, which runs every test", () => {
  const docs = cli("docs/system/NOTE.md", "--list");
  assert.equal(docs.code, 0, docs.err);
  assert.equal(docs.out, "");
  assert.match(docs.err, /no related tests; the list is empty/);
  assert.match(docs.err, /runs every test/);
  const browserOnly = cli("plugins/native/alpha/src/main.ts", "--list", "--browser-only");
  assert.equal(browserOnly.out, "", "only unit tests are related, and the browser ones were asked for");
  assert.match(browserOnly.err, /list is empty/);
  const some = cli("plugins/native/alpha/src/main.ts", "--list", "--unit-only");
  assert.notEqual(some.out, "");
  assert.equal(some.err, "");
});

test("--json carries the tests with their reasons, the full-suite reasons and the checks", () => {
  const result = cli("packages/contracts/src/platform/plugin.ts", "--json");
  assert.equal(result.code, 0, result.err);
  const json = JSON.parse(result.out);
  assert.deepEqual(json.full.map((entry: { rule: string }) => entry.rule), ["shared-core"]);
  assert.ok(json.tests.some((entry: { file: string; reasons: { code: string }[] }) => entry.file === "tests/contracts-readme.test.ts" && entry.reasons[0].code === "readme"));
  assert.ok(json.checks.some((check: { command: string }) => check.command === "pnpm build"));
  assert.ok(json.checks.some((check: { command: string }) => check.command === "pnpm boundary:check"));
});

test("the text output says when the full suite is recommended and which checks go with the tests", () => {
  const text = cli("apps/local-host/src/web-request.ts").out;
  assert.match(text, /FULL REGRESSION RECOMMENDED/);
  assert.match(text, /node scripts\/run-tests\.mjs tests\//);
  assert.match(text, /pnpm build/);
  const docs = cli("docs/system/NOTE.md").out;
  assert.doesNotMatch(docs, /FULL REGRESSION/);
  assert.doesNotMatch(docs, /pnpm build/, "a document needs no build");
});

test("the checks that go with the tests: boundaries, health gates and the secret scan for any change; a build for source; page resources for UI; release versions for a package.json or a schema", () => {
  const source = cli("plugins/native/alpha/src/main.ts").out;
  for (const command of ["pnpm build", "pnpm boundary:check", "node scripts/check-health-gates.mjs --base origin/main", "node scripts/check-secrets.mjs"]) assert.ok(source.includes(command), command);
  const docs = cli("docs/system/NOTE.md").out;
  for (const command of ["pnpm boundary:check", "node scripts/check-health-gates.mjs --base origin/main", "node scripts/check-secrets.mjs"]) assert.ok(docs.includes(command), `${command} for a document too`);
  assert.equal(docs.includes("pnpm build"), false);
  for (const file of ["plugins/native/alpha/bin/run.ts", "plugins/native/alpha/tooling/make.ts", "scripts/run-tests.mjs"]) {
    put(file, "export const X = 1;\n");
    assert.ok(cli(file).out.includes("pnpm build"), `${file} is built source`);
  }
  assert.match(cli("plugins/native/alpha/src/baseline-store.ts").out, /verify-release-versions\.mjs/, "a file that holds a schema");
  assert.match(cli("plugins/native/alpha/src-tauri/tauri.conf.json").out, /verify-release-versions\.mjs/);
  assert.match(cli("docs/releases/CHECKLIST.md").out, /verify-release-versions\.mjs/);
});

test("page resources and release versions are checked when the change touches them", () => {
  assert.match(cli("plugins/native/alpha/src/client.ts").out, /page-assets\.mjs/);
  assert.doesNotMatch(cli("plugins/native/alpha/src/main.ts").out, /page-assets\.mjs/);
  assert.match(cli("plugins/native/alpha/package.json").out, /verify-release-versions\.mjs/);
  assert.doesNotMatch(cli("plugins/native/alpha/src/main.ts").out, /verify-release-versions\.mjs/);
});

test("a bad command line is exit 2 with the usage, and a repository without a base says so", () => {
  for (const args of [["--nope"], ["--base"], ["--package-limit", "0"], ["--symbol-limit", "x"], ["--unit-only", "--browser-only"], ["--json", "--list"], ["--include-browser"], ["plugins/native/alpha/src/main.ts", "--base", "main"]]) {
    const result = cli(...args);
    assert.equal(result.code, 2, args.join(" "));
    assert.match(result.err, /affected-tests:/);
  }
  const nothing = cli("--base", "refs/heads/does-not-exist");
  assert.equal(nothing.code, 2);
  assert.match(nothing.err, /no merge-base/);
});

test("--help prints the usage and the place of the rules, and exits 0", () => {
  const result = cli("--help");
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /usage: affected-tests\.mjs/);
  assert.match(result.out, /PARALLEL-DEVELOPMENT\.md section 6\.1/);
});

test("with no change there is nothing to select", () => {
  const result = cli("--base", "main");
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /0 changed files/);
  assert.match(result.out, /nothing changed/);
});

// ---- --run ---------------------------------------------------------------------------------------------------------------------------
const ran = () => (existsSync(path.join(repo, "ran.txt")) ? read("ran.txt").split("\n") : null);
const touchBuild = (source: string, built: string, newer: "source" | "built") => {
  put(built, "// built\n");
  const old = new Date(Date.now() - 3600_000), recent = new Date(Date.now() - 60_000);
  utimesSync(path.join(repo, source), newer === "source" ? recent : old, newer === "source" ? recent : old);
  utimesSync(path.join(repo, built), newer === "source" ? old : recent, newer === "source" ? old : recent);
};
beforeEach(() => rmSync(path.join(repo, "ran.txt"), { force: true }));

test("--run starts scripts/run-tests.mjs with the unit tests, and the browser tests only when asked, after a passing unit run", () => {
  const unit = cli("plugins/native/alpha/src/client.ts", "--run", "--ignore-busy", "--allow-stale");
  assert.equal(unit.code, 0, unit.err);
  assert.ok(ran()?.includes("tests/alpha-readme.test.ts"));
  assert.equal(ran()?.some((file) => file.includes(".e2e.")), false);
  rmSync(path.join(repo, "ran.txt"), { force: true });
  const both = cli("plugins/native/alpha/src/client.ts", "--run", "--include-browser", "--ignore-busy", "--allow-stale");
  assert.equal(both.code, 0, both.err);
  assert.ok(ran()?.every((file) => file.includes(".e2e.")), "the second run, of the browser tests, is the last to write the file");
  rmSync(path.join(repo, "ran.txt"), { force: true });
  const failing = spawnSync(process.execPath, [script, "--root", repo, "plugins/native/alpha/src/client.ts", "--run", "--include-browser", "--ignore-busy", "--allow-stale"], { encoding: "utf8", env: { ...process.env, FAKE_EXIT: "1" } });
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /browser tests were not started/);
  assert.ok(ran()?.every((file) => !file.includes(".e2e.")), "a failed unit run leaves the browser tests unstarted");
});

test("--run --browser-only runs the browser tests alone; --run with nothing selected starts nothing", () => {
  const browser = cli("plugins/native/alpha/src/client.ts", "--run", "--browser-only", "--ignore-busy", "--allow-stale");
  assert.equal(browser.code, 0, browser.err);
  assert.ok(ran() !== null && ran()!.length > 0 && ran()!.every((file) => file.includes(".e2e.")), `ran: ${ran()}`);
  rmSync(path.join(repo, "ran.txt"), { force: true });
  const noBrowser = cli("plugins/native/alpha/src/main.ts", "--run", "--browser-only", "--ignore-busy", "--allow-stale");
  assert.equal(noBrowser.code, 0, noBrowser.err);
  assert.match(noBrowser.err, /no related tests to run/);
  assert.equal(ran(), null, "main.ts is not UI: no browser tests, so nothing runs (not every test)");
  const docs = cli("docs/system/NOTE.md", "--run", "--ignore-busy", "--allow-stale");
  assert.equal(docs.code, 0, docs.err);
  assert.match(docs.err, /no related tests to run/);
  assert.equal(ran(), null, "a document selects nothing, and nothing is what runs");
});

test("--run never starts the full suite, and says it is still recommended", () => {
  const result = cli("apps/local-host/src/web-request.ts", "--run", "--ignore-busy", "--allow-stale");
  assert.equal(result.code, 0, result.err);
  assert.ok(ran() !== null && ran()!.every((file) => file.startsWith("tests/")), "only the named related tests");
  assert.match(result.err, /full regression is still recommended/);
});

test("--run refuses a build older than the sources, and --allow-stale lets it through", () => {
  touchBuild("plugins/native/alpha/src/alpha.ts", "plugins/native/alpha/dist/alpha.js", "source");
  const refused = cli("plugins/native/alpha/src/alpha.ts", "--run", "--ignore-busy");
  assert.equal(refused.code, 2);
  assert.match(refused.err, /build is older than the sources/);
  assert.equal(ran(), null, "nothing started");
  assert.equal(cli("plugins/native/alpha/src/alpha.ts", "--run", "--ignore-busy", "--allow-stale").code, 0);
  rmSync(path.join(repo, "plugins/native/alpha/dist"), { recursive: true, force: true });
});

test("staleBuilds: no dist, an older dist, a newer dist; a package entry stands in for a file with no built counterpart", () => {
  const files = listFiles(repo), packages = discoverPackages(repo, files);
  const change = { path: "plugins/native/alpha/src/alpha.ts", status: "M", added: [], removed: [] };
  const rows = () => staleBuilds(repo, packages, [change]).map((item: { why: string }) => item.why);
  rmSync(path.join(repo, "plugins/native/alpha/dist"), { recursive: true, force: true });
  assert.deepEqual(rows(), ["plugins/native/alpha/dist does not exist"]);
  touchBuild("plugins/native/alpha/src/alpha.ts", "plugins/native/alpha/dist/alpha.js", "source");
  assert.match(rows()[0], /newer than plugins\/native\/alpha\/dist\/alpha\.js/);
  touchBuild("plugins/native/alpha/src/alpha.ts", "plugins/native/alpha/dist/alpha.js", "built");
  assert.deepEqual(rows(), []);
  rmSync(path.join(repo, "plugins/native/alpha/dist/alpha.js"));
  put("plugins/native/alpha/dist/index.js", "// entry\n");
  utimesSync(path.join(repo, "plugins/native/alpha/dist/index.js"), new Date(Date.now() - 7200_000), new Date(Date.now() - 7200_000));
  utimesSync(path.join(repo, "plugins/native/alpha/src/alpha.ts"), new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  assert.match(rows()[0], /newer than plugins\/native\/alpha\/dist\/index\.js/);
  assert.deepEqual(staleBuilds(repo, packages, [{ ...change, status: "D" }]), [], "a deleted file has nothing to build");
  assert.deepEqual(staleBuilds(repo, packages, [{ ...change, path: "scripts/run-tests.mjs" }]), [], "only package sources have a build");
  rmSync(path.join(repo, "plugins/native/alpha/dist"), { recursive: true, force: true });
});

test("parseProcessList keeps the node and pnpm processes of a run and drops continuation lines, shells that only mention one, this process and its parent", () => {
  const listing = [
    "101 node scripts/run-tests.mjs tests/a.test.ts",
    "102 /Users/me/.nvm/bin/node /Users/me/.nvm/bin/pnpm build",
    "103 /bin/zsh -c source /snapshot.sh && node scripts/run-tests.mjs tests/b.test.ts",
    "import test from \"node:test\";",
    "const x = 1; // run-tests.mjs in a heredoc",
    "104 bash -lc node scripts/run-tests.mjs tests/c.test.ts",
    "105 sh -c pnpm build:migrated-packages && tsc -p tsconfig.json",
    "106 node scripts/affected-tests.mjs --run",
    "107 node scripts/run-tests.mjs tests/affected-tests.test.ts",
    "108 timeout 600 node scripts/run-tests.mjs tests/d.test.ts",
    "109 node scripts/run-tests.mjs tests/e.test.ts",
  ].join("\n");
  assert.deepEqual(parseProcessList(listing, 109, 110).map((item: { pid: number }) => item.pid), [101, 102, 108]);
  assert.deepEqual(parseProcessList(listing, 101, 102).map((item: { pid: number }) => item.pid), [108, 109], "self and parent are not another run");
  assert.deepEqual(parseProcessList("", 1, 2), []);
});

test("--run refuses while another test run is going on this machine", async () => {
  const other = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", "--", "run-tests.mjs-stand-in"], { stdio: "ignore" });
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const busy = busyProcesses();
    assert.ok(busy === null || busy.some((item: { pid: number }) => item.pid === other.pid), "the stand-in is found by the same pattern the run uses");
    if (busy === null) return;
    assert.equal(busy.some((item: { pid: number }) => item.pid === process.pid), false, "this process is not another run");
    const refused = cli("plugins/native/alpha/src/main.ts", "--run", "--allow-stale");
    assert.equal(refused.code, 2);
    assert.match(refused.err, /another build or test run/);
    assert.equal(ran(), null, "nothing started");
  } finally {
    other.kill();
  }
});

// ---- this repository ----------------------------------------------------------------------------------------------------------------
test("every path the rules name exists in this repository, so a rename cannot leave a rule pointing at nothing", () => {
  const files = new Set(listFiles(realRoot)), packages = discoverPackages(realRoot, [...files]);
  const dirs = new Set(packages.map((item: { dir: string }) => item.dir));
  for (const file of FULL_REGRESSION.assemblyFiles) assert.ok(files.has(file), `assembly file ${file}`);
  for (const dir of [...FULL_REGRESSION.corePackages, ...FULL_REGRESSION.storagePackages, ...UI.packages]) assert.ok(dirs.has(dir), `package ${dir}`);
  for (const prefix of FULL_REGRESSION.corePackagePrefixes) assert.ok([...dirs].some((dir) => (dir as string).startsWith(prefix)), `packages under ${prefix}`);
  assert.ok(files.has(I18N_TEST), I18N_TEST);
});

test("in this repository, a change to a package selects every test its README lists as must-run, and each of them exists", () => {
  const files = listFiles(realRoot), packages = discoverPackages(realRoot, files), index = buildTestIndex(realRoot, files, packages);
  assert.ok(packages.length >= 60, `${packages.length} packages`);
  for (const item of packages as { dir: string; name: string; readme: string | null }[]) {
    const listed = readmeTests(realRoot, item).mustRun;
    assert.ok(listed.length > 0, `${item.dir} README lists must-run tests`);
    const result = selectAffected({ root: realRoot, changes: [{ path: `${item.dir}/src/index.ts`, status: "M", added: [], removed: [] }], packages, index });
    for (const test of listed) assert.ok(result.tests.some((entry: { file: string; reasons: { code: string }[] }) => entry.file === test && entry.reasons.some((reason) => reason.code === "readme")), `${item.dir}: ${test}`);
  }
});

// The files whose change recommends the full suite as the assembly of local-host or the shell of the workbench, written out here so that
// taking one off the list in rules.mjs fails this test (the rule's own list cannot check itself).
const ASSEMBLY = [
  "apps/local-host/src/project-host.ts", "apps/local-host/src/project-plugins.ts", "apps/local-host/src/local-host.ts", "apps/local-host/src/project-capabilities.ts",
  "apps/local-host/src/web-server.ts", "apps/local-host/src/web-request.ts", "apps/local-host/src/web-catalog.ts", "apps/local-host/src/mcp-server.ts",
  "apps/local-host/src/system-agent-service.ts", "apps/local-host/src/goal-project-application.ts",
  "apps/workbench/src/builtin-plugins.ts", "apps/workbench/src/browser-assets.ts", "apps/workbench/src/document-shell.ts", "apps/workbench/src/goals-page-renderer.ts",
  "apps/workbench/src/immersive-shell.ts", "apps/workbench/src/page-assets.ts", "apps/workbench/src/plugin-catalog.ts", "apps/workbench/src/renderer.ts",
  "apps/workbench/src/ui-composition.ts", "apps/workbench/src/scripts/client/initialization.ts", "apps/workbench/src/scripts/client/plugin-workbench.ts",
];
let realCache: { packages: unknown[]; index: ReturnType<typeof buildTestIndex> } | null = null;
const realAt = (...paths: string[]) => {
  if (!realCache) { const files = listFiles(realRoot), packages = discoverPackages(realRoot, files); realCache = { packages, index: buildTestIndex(realRoot, files, packages) }; }
  return selectAffected({ root: realRoot, changes: paths.map((file) => ({ path: file, status: "M", added: [], removed: [] })), packages: realCache.packages as never, index: realCache.index });
};

test("in this repository: shared core recommends the full suite, a document alone selects nothing, and the browser kind comes from the probe marks", () => {
  const files = listFiles(realRoot), packages = discoverPackages(realRoot, files), index = buildTestIndex(realRoot, files, packages);
  assert.deepEqual(realAt("packages/contracts/src/platform/plugin.ts").full.map((entry: { rule: string }) => entry.rule), ["shared-core"]);
  assert.deepEqual(realAt("packages/kernel/src/index.ts").full.map((entry: { rule: string }) => entry.rule), ["shared-core"]);
  assert.deepEqual(realAt("apps/local-host/src/web-request.ts").full.map((entry: { rule: string }) => entry.rule), ["assembly"]);
  assert.deepEqual(realAt("docs/system/PARALLEL-DEVELOPMENT.md").full, []);
  assert.ok(index.tests.filter((entry: { kind: string }) => entry.kind === "browser").every((entry: { file: string; marks: string[] }) => entry.marks.includes("browser")));
  assert.ok(index.tests.filter((entry: { file: string }) => entry.file.includes(".e2e.")).every((entry: { kind: string }) => entry.kind === "browser"), "every .e2e. file is a browser file");
});

test("in this repository, each file the READMEs call assembly or shell recommends the full suite, and the barrels and ordinary files of the two packages do not", () => {
  for (const file of ASSEMBLY) assert.deepEqual(realAt(file).full.map((entry: { rule: string }) => entry.rule), ["assembly"], file);
  for (const file of ["apps/local-host/src/index.ts", "apps/workbench/src/index.ts", "apps/local-host/src/action-gateway.ts", "apps/workbench/src/side-panel.ts", "apps/workbench/src/settings-models.ts"]) {
    assert.deepEqual(realAt(file).full, [], file);
  }
});

test("every file a README table of local-host or workbench calls 装配 or 组合 is on the assembly list", () => {
  let found = 0;
  for (const dir of ["apps/local-host", "apps/workbench"]) {
    for (const row of readFileSync(path.join(realRoot, dir, "README.md"), "utf8").split("\n").filter((line) => line.startsWith("| [src/"))) {
      const [files, use] = row.split("|").map((cell) => cell.trim()).filter(Boolean);
      if (!/装配|组合/.test(use)) continue;
      for (const [, file] of files.matchAll(/\[(src\/[^\]]+)\]/g)) {
        found++;
        assert.ok(FULL_REGRESSION.assemblyFiles.includes(`${dir}/${file}`), `${dir}/${file} (${use}) is not on the assembly list`);
        assert.ok(ASSEMBLY.includes(`${dir}/${file}`), `${dir}/${file} is missing from the expected list of this test`);
      }
    }
  }
  assert.ok(found >= 6, `${found} files found in the READMEs' tables: the table format changed`);
});

test("in this repository, every file that declares a SqliteBaseline is read whole (version and schema), and a file named for baselines that stores nothing holds none", () => {
  const files = listFiles(realRoot).filter((file) => /^(?:apps|horizontal|modules|packages|plugins|server|tooling)\/.*\.(?:ts|mts)$/.test(file) && !/\/tests?\//.test(file));
  const declared = files.filter((file) => /\bSqliteBaseline\s*=\s*\{/.test(readFileSync(path.join(realRoot, file), "utf8")));
  assert.ok(declared.length >= 18, `${declared.length} files declare a SqliteBaseline`);
  for (const file of declared) {
    const baselines = schemaOf(readFileSync(path.join(realRoot, file), "utf8")).baselines;
    assert.ok(baselines.length > 0 && baselines.every((body: string) => /\bversion: \d+/.test(body) && /\bschema\b/.test(body)), `${file}: ${baselines.join(" | ").slice(0, 120)}`);
  }
  assert.deepEqual(schemaOf(readFileSync(path.join(realRoot, "plugins/native/goals/src/proposal-baselines.ts"), "utf8")).baselines, []);
  assert.equal(FULL_REGRESSION.storageFiles.test("plugins/native/goals/src/proposal-baselines.ts"), false);
});
