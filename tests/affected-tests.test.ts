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

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-affected-tests-"));
  git("init", "-q", "-b", "main");
  put("package.json", JSON.stringify({ name: "scratch", private: true }));
  workspacePackage("plugins/native/alpha", "@molis-ai/molis-work-plugin-alpha", [
    run("tests/alpha-readme.test.ts"),
    "- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/ui-flow.e2e.test.ts`；改到设置页再加跑 `tests/settings-area.e2e.test.ts`",
    "- 助理验证：`node scripts/run-tests.mjs tests/assistant-extra.test.ts`",
  ]);
  put("plugins/native/alpha/src/alpha.ts", alphaSource);
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return 1; }\n`);
  put("plugins/native/alpha/src/client.ts", `export const CLIENT = 1;\n`);
  put("plugins/native/alpha/src/routes.ts", `export const ALPHA_ROUTE = "/api/alpha/items";\nexport const OTHER_ROUTE = "/api/alpha/other";\n`);
  put("plugins/native/alpha/src/text.ts", `export const TITLE = L("标题");\n`);
  put("plugins/native/alpha/src/orphan.ts", `export function neverTestedAnywhere() { return 0; }\n`);
  workspacePackage("plugins/native/beta", "@molis-ai/molis-work-plugin-beta", [run("tests/beta-readme.test.ts")]);
  workspacePackage("plugins/native/gamma", "@molis-ai/molis-work-plugin-gamma", [run("tests/gamma-readme.test.ts")]);
  workspacePackage("plugins/native/delta", "@molis-ai/molis-work-plugin-delta", [run("tests/delta-readme.test.ts")]);
  workspacePackage("packages/contracts", "@molis-ai/molis-work-contracts", [run("tests/contracts-readme.test.ts")], { "./platform/plugin": { types: "./dist/platform/plugin.d.ts", import: "./dist/platform/plugin.js" } });
  put("packages/contracts/src/platform/plugin.ts", `export interface PluginContract { id: string }\n`);
  workspacePackage("packages/storage", "@molis-ai/molis-work-storage", [run("tests/storage-readme.test.ts")]);
  workspacePackage("modules/goals", "@molis-ai/molis-work-module-goals", [run("tests/goals-readme.test.ts")]);
  workspacePackage("apps/local-host", "@molis-ai/molis-work-app-local-host", [run("tests/host-readme.test.ts")]);
  put("apps/local-host/src/web-request.ts", `export function handleRequest() { return 1; }\n`);
  put("apps/local-host/src/quiet.ts", `export function quietHelper() { return 2; }\n`);
  put("scripts/run-tests.mjs", `import { writeFileSync } from "node:fs";\nwriteFileSync(new URL("../ran.txt", import.meta.url), process.argv.slice(2).join("\\n"));\nprocess.exitCode = Number(process.env.FAKE_EXIT ?? 0);\n`);
  // Tests: each says what it reads, by import, by path, by name, or by a helper.
  for (const name of ["alpha-readme", "beta-readme", "gamma-readme", "delta-readme", "contracts-readme", "storage-readme", "goals-readme", "host-readme", "assistant-extra"]) put(`tests/${name}.test.ts`, `test("${name}", () => {});\n`);
  put("tests/ui-flow.e2e.test.ts", `test("ui", () => {});\n`);
  put("tests/settings-area.e2e.test.ts", `test("settings", () => {});\n`);
  put("tests/reads-alpha.test.ts", `import { computeAlphaTotal } from "../plugins/native/alpha/src/alpha.js";\ntest("x", () => computeAlphaTotal([]));\n`);
  put("tests/alpha-store.test.ts", `test("store", () => {});\n`);
  put("tests/mentions-alpha.test.ts", importsAlpha);
  put("tests/other-package.test.ts", `// a test of another package with a function of the same name\nconst computeAlphaTotal = () => 1;\ntest("x", () => computeAlphaTotal());\n`);
  put("tests/unrelated.test.ts", `test("nothing", () => {});\n`);
  put("tests/route-reader.test.ts", `test("x", async () => { await fetch("/api/alpha/items"); });\n`);
  put("tests/route-browser.e2e.test.ts", `test("x", async () => { await fetch("/api/alpha/items?x=1"); });\n`);
  put("tests/reads-quiet.test.ts", `import { quietHelper } from "../apps/local-host/src/quiet.js";\ntest("x", () => quietHelper());\n`);
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
  assert.equal(picked(select(["apps/local-host/src/quiet.ts"], { symbolLimit: 3 })).filter((file) => file.startsWith("tests/helper-user")).length, 3);
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
  assert.equal(picked(select(["plugins/native/beta/src/main.ts"], { packageLimit: 4 })).filter((file) => file.startsWith("tests/beta-user")).length, 3);
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

test("a UI change is told by the file's name and place: client, styles, a page renderer, css; not the host's web-request or a viewer", () => {
  for (const file of ["plugins/native/alpha/src/client.ts", "plugins/native/alpha/src/client-views.ts", "plugins/native/alpha/src/styles.ts", "plugins/native/alpha/src/goals-page-renderer.ts", "plugins/native/alpha/src/panel.css", "plugins/native/alpha/src/client/menu.ts"]) {
    put(file, "export const X = 1;\n");
    assert.deepEqual(select([file]).ui, [file], file);
  }
  for (const file of ["apps/local-host/src/web-request.ts", "plugins/native/alpha/src/viewer.ts", "plugins/native/alpha/src/main.ts", "plugins/native/alpha/src/routes.ts"]) assert.deepEqual(select([file]).ui, [], file);
  git("reset", "-q", "--hard", "HEAD"); git("clean", "-q", "-fd");
  put("plugins/native/alpha/src/main.ts", "export const MAIN = `<div class=\"card\">`;\n");
  assert.deepEqual(select(null).ui, ["plugins/native/alpha/src/main.ts"], "a changed line that writes markup");
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

test("a dictionary file is text even when the line has no call", () => {
  put("plugins/native/alpha/src/en.ts", `export const ALPHA_EN = { "标题": "Title" };\n`);
  assert.ok(reasonsOf(select(null), I18N_TEST).includes("text"));
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

test("shared core (contracts, a module) recommends the full suite", () => {
  assert.deepEqual(rulesOf(select(["packages/contracts/src/platform/plugin.ts"])), ["shared-core"]);
  assert.deepEqual(rulesOf(select(["modules/goals/src/main.ts"])), ["shared-core"]);
});

test("the assembly of the host recommends the full suite", () => {
  assert.deepEqual(rulesOf(select(["apps/local-host/src/web-request.ts"])), ["assembly"]);
});

test("storage, and any changed line that defines or versions a table, recommend the full suite", () => {
  assert.deepEqual(rulesOf(select(["packages/storage/src/main.ts"])), ["storage"]);
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return db.exec("CREATE TABLE alpha_items (id TEXT)"); }\n`);
  assert.deepEqual(rulesOf(select(null)), ["storage"]);
  git("reset", "-q", "--hard", "HEAD");
  put("plugins/native/alpha/src/store.ts", `export function openAlphaStore() { return db.exec("SELECT id FROM alpha_items"); }\n`);
  assert.deepEqual(rulesOf(select(null)), []);
  git("reset", "-q", "--hard", "HEAD");
  put("plugins/native/alpha/src/store.ts", `// CREATE TABLE in a comment is not a change to a table\nexport function openAlphaStore() { return 1; }\n`);
  assert.deepEqual(rulesOf(select(null)), []);
  git("reset", "-q", "--hard", "HEAD");
  put("plugins/native/alpha/src/migrations-v2.ts", `export const NOTHING = 1;\n`);
  assert.deepEqual(rulesOf(select(null)), ["storage"], "a file named for a migration");
});

test("three or more packages recommend the full suite", () => {
  const three = select(["plugins/native/alpha/src/alpha.ts", "plugins/native/beta/src/main.ts", "plugins/native/gamma/src/main.ts"]);
  assert.deepEqual(rulesOf(three), ["spans-packages"]);
  assert.match(three.full[0].detail, /3 packages/);
});

test("deleting a block of source recommends the full suite; deleting fewer files, or a document, does not", () => {
  for (const name of ["alpha", "store", "client"]) unlinkSync(path.join(repo, `plugins/native/alpha/src/${name}.ts`));
  assert.deepEqual(rulesOf(select(null)), ["deletes-code"]);
  git("reset", "-q", "--hard", "HEAD");
  for (const name of ["alpha", "store"]) unlinkSync(path.join(repo, `plugins/native/alpha/src/${name}.ts`));
  assert.deepEqual(rulesOf(select(null)), []);
  git("reset", "-q", "--hard", "HEAD");
  unlinkSync(path.join(repo, "docs/system/NOTE.md"));
  for (const name of ["alpha", "store"]) unlinkSync(path.join(repo, `plugins/native/alpha/src/${name}.ts`));
  assert.deepEqual(rulesOf(select(null)), []);
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

test("in this repository: shared core recommends the full suite, a document alone selects nothing, and the browser kind comes from the probe marks", () => {
  const files = listFiles(realRoot), packages = discoverPackages(realRoot, files), index = buildTestIndex(realRoot, files, packages);
  const at = (...paths: string[]) => selectAffected({ root: realRoot, changes: paths.map((file) => ({ path: file, status: "M", added: [], removed: [] })), packages, index });
  assert.deepEqual(at("packages/contracts/src/platform/plugin.ts").full.map((entry: { rule: string }) => entry.rule), ["shared-core"]);
  assert.deepEqual(at("apps/local-host/src/web-request.ts").full.map((entry: { rule: string }) => entry.rule), ["assembly"]);
  assert.deepEqual(at("docs/system/PARALLEL-DEVELOPMENT.md").full, []);
  assert.ok(index.tests.filter((entry: { kind: string }) => entry.kind === "browser").every((entry: { file: string; marks: string[] }) => entry.marks.includes("browser")));
  assert.ok(index.tests.filter((entry: { file: string }) => entry.file.includes(".e2e.")).every((entry: { kind: string }) => entry.kind === "browser"), "every .e2e. file is a browser file");
});
