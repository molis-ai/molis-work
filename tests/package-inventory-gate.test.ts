import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { plannedDepth } from "../scripts/gates/package-inventory.mjs";

// specs/repository-anti-corruption §5 (W1-18): the package inventory table lists exactly the workspace packages, with the
// layer and the status the code gives them. Each rule is mutation-verified on a small scratch repository: the table that
// the generator printed passes, and one cell changed, one row removed or added, or one package edited fails.
const gateScript = fileURLToPath(new URL("../scripts/gates/package-inventory.mjs", import.meta.url));
const healthScript = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const DOC = "specs/repository-anti-corruption/spec.md";
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const run = (script: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}`, stdout: result.stdout };
};
const check = () => run(gateScript, "--check");

type Kind = "app" | "module" | "native-plugin";
const registry: Array<{ path: string; name: string; kind: Kind }> = [
  { path: "apps/desktop", name: "@molis-ai/molis-work-app-desktop", kind: "app" },
  { path: "apps/local-host", name: "@molis-ai/molis-work-app-local-host", kind: "app" },
  { path: "apps/stray", name: "@molis-ai/molis-work-app-stray", kind: "app" },
  { path: "modules/gamma", name: "@molis-ai/molis-work-module-gamma", kind: "module" },
  { path: "modules/orphan", name: "@molis-ai/molis-work-module-orphan", kind: "module" },
  { path: "modules/standalone", name: "@molis-ai/molis-work-module-standalone", kind: "module" },
  { path: "plugins/native/alpha", name: "@molis-ai/molis-work-plugin-alpha", kind: "native-plugin" },
  { path: "plugins/native/beta", name: "@molis-ai/molis-work-plugin-beta", kind: "native-plugin" },
];
const writePackage = (item: { path: string; name: string }, dependencies: string[] = [], source = "export const value = 1;\n") => {
  put(`${item.path}/package.json`, JSON.stringify({ name: item.name, private: true, exports: { ".": "./dist/index.js" }, dependencies: Object.fromEntries(dependencies.map(name => [name, "workspace:*"])) }, null, 2) + "\n");
  put(`${item.path}/src/index.ts`, source);
};
const writeRegistry = (items = registry) => put("scripts/workspace-packages.mjs", `export const WORKSPACE_PACKAGES = ${JSON.stringify(items, null, 2)};\n`);
const named = (path: string) => registry.find(item => item.path === path)!;

// The scratch product: the launcher of apps/desktop reaches apps/local-host, which reaches gamma, alpha and beta; alpha is
// started by the Runtime supervisor, beta is wired by hand; orphan is named only inside a template string. apps/stray is an
// app with a launcher of its own (the apps/server of the real repository): it imports apps/local-host and, alone, standalone,
// but nothing reaches it from apps/desktop, so neither it nor standalone is product.
const buildProduct = () => {
  writeRegistry();
  writePackage(named("apps/desktop"), [named("apps/local-host").name]);
  put("apps/desktop/launchers/main.ts", `import { host } from "${named("apps/local-host").name}";\nexport const main = host;\n`);
  writePackage(named("apps/local-host"), ["gamma", "alpha", "beta"].map(id => registry.find(item => item.path.endsWith(id))!.name),
    `import { value as gamma } from "${named("modules/gamma").name}";\nimport { value as alpha } from "${named("plugins/native/alpha").name}";\n`
    + `import type { value as beta } from "${named("plugins/native/beta").name}/types";\nexport const host = [gamma, alpha];\nexport type Beta = typeof beta;\n`
    + `export const generated = \`import { value } from "${named("modules/orphan").name}";\`;\n`);
  put("apps/local-host/src/project-plugins.ts", `export const started = ["${named("plugins/native/alpha").name}"];\n`);
  for (const path of ["modules/gamma", "modules/orphan", "plugins/native/alpha", "plugins/native/beta"]) writePackage(named(path));
  writePackage(named("apps/stray"), [named("apps/local-host").name, named("modules/standalone").name]);
  put("apps/stray/launchers/main.ts", `import { host } from "${named("apps/local-host").name}";\nimport { value } from "${named("modules/standalone").name}";\nexport const main = [host, value];\n`);
  writePackage(named("modules/standalone"));
};
const table = () => run(gateScript, "--table").stdout;
const writeDoc = (rows = table()) => put(DOC, `# Spec\n\n状态：进行中\n\n## 5. 包级清单\n\n${rows}\n### 5.x 其余\n\n正文。\n`);
const editDoc = (change: (text: string) => string) => put(DOC, change(read(DOC)));

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-package-inventory-"));
  git("init", "-q", "-b", "main");
  buildProduct();
  commit("product"); // --table asks git for the history since the Cutover, so there must be one
  writeDoc();
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }) + "\n");
  git("add", "-A");
  assert.equal(run(healthScript, "--update").code, 0);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });
const restore = () => { git("checkout", "-q", "-f", "main"); git("clean", "-fdq"); };

test("the table the generator printed is accepted, and the statuses are what the code gives", () => {
  const ok = check();
  assert.equal(ok.code, 0, ok.out);
  const rows = new Map(read(DOC).split("\n").filter(line => line.startsWith("| `")).map(line => {
    const cells = line.split("|").map(cell => cell.trim());
    return [cells[1].replace(/`/g, ""), { layer: cells[2], status: cells[9], depth: cells[10], review: cells[11] }];
  }));
  assert.equal(rows.size, registry.length);
  assert.equal(rows.get("apps/desktop")?.status, "在用");
  assert.equal(rows.get("apps/local-host")?.status, "在用");
  assert.equal(rows.get("modules/gamma")?.status, "在用", "reached through apps/local-host, not imported by the launcher itself");
  assert.equal(rows.get("plugins/native/alpha")?.status, "Runtime", "the supervisor names its package");
  assert.equal(rows.get("plugins/native/beta")?.status, "构建期", "reached by a type-only import, not started by the supervisor");
  assert.equal(rows.get("modules/orphan")?.status, "非产品", "an import written inside a template string is not an import");
  assert.equal(rows.get("apps/stray")?.status, "非产品", "the product entry is apps/desktop only: another app with a launcher of its own is not a start point");
  assert.equal(rows.get("modules/standalone")?.status, "非产品", "what only an unreached app imports is not reached either");
  assert.deepEqual([rows.get("apps/desktop")?.layer, rows.get("modules/gamma")?.layer, rows.get("plugins/native/alpha")?.layer], ["应用", "模块", "内置插件"]);
  assert.ok([...rows.values()].every(row => row.review === "待审"));
});

test("the numbers come from the code: files and lines under src, the largest file, entries, dependencies and dependents", () => {
  put("modules/gamma/src/big.ts", "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n");
  put("modules/gamma/src/big.test.ts", "export const test = 1;\n");
  put("modules/gamma/src/types.d.ts", "export type T = 1;\n");
  put("modules/gamma/tests/other.ts", "export const other = 1;\n");
  put("modules/gamma/launcher.ts", "export const outsideSrc = 1;\n");
  for (const directory of ["test", "tests", "dist", "node_modules", "fixtures"]) put(`modules/gamma/src/${directory}/inner.ts`, "export const inner = 1;\nexport const more = 2;\n");
  // devDependencies are not dependencies: gamma lists orphan as one and still depends on no internal package, and orphan
  // is still depended on by none.
  put("modules/gamma/package.json", JSON.stringify({ name: named("modules/gamma").name, private: true, exports: { ".": "./dist/index.js", "./extra": "./dist/extra.js" },
    devDependencies: { [named("modules/orphan").name]: "workspace:*" } }) + "\n");
  git("add", "-A");
  const rowOf = (packagePath: string) => table().split("\n").find(row => row.startsWith(`| \`${packagePath}\``))!;
  // index.ts has 2 segments ("...\n" splits in two) and big.ts 4; test files, declarations, test/tests/dist/node_modules/fixtures
  // directories and files outside src do not count. Two exports, no internal dependency, one dependent (apps/local-host).
  assert.match(rowOf("modules/gamma"), /\| 模块 \| 2 \| 6 \| `big\.ts` 4 \| 2 \| 0 \| 1 \| 在用 \|/);
  assert.match(rowOf("modules/orphan"), /\| 模块 \| 1 \| 2 \| `index\.ts` 2 \| 1 \| 0 \| 0 \| 非产品 \|/, "a devDependency is not counted on either side");
  // apps/stray lists apps/local-host and standalone: two dependencies; local-host is depended on by desktop and stray.
  assert.match(rowOf("apps/stray"), /\| 应用 \| 1 \| 2 \| `index\.ts` 2 \| 1 \| 2 \| 0 \| 非产品 \|/);
  assert.match(rowOf("apps/local-host"), /\| 应用 \| \d+ \| \d+ \| `.*` \d+ \| 1 \| 3 \| 2 \| 在用 \|/);
  restore();
});

type Violation = { name: string; mutate: () => void; expect: RegExp };
const cell = (packagePath: string, column: number, value: string) => (text: string) => text.split("\n").map(line => {
  if (!line.startsWith(`| \`${packagePath}\` |`)) return line;
  const cells = line.split(" | ");
  cells[column] = column === cells.length - 1 ? `${value} |` : value;
  return cells.join(" | ");
}).join("\n");
const violations: Violation[] = [
  { name: "a workspace package without a row", mutate: () => editDoc(text => text.split("\n").filter(line => !line.startsWith("| `plugins/native/beta`")).join("\n")),
    expect: /plugins\/native\/beta is a workspace package but has no row/ },
  { name: "a row for a package that is gone", mutate: () => editDoc(text => text.replace(/^(\| `modules\/gamma` \|.*)$/m, "$1\n| `modules/evidence-verification` | 模块 | 1 | 1 | `index.ts` 1 | 1 | 1 | 1 | 在用 | 浅 | 待审 |")),
    expect: /modules\/evidence-verification is not a workspace package/ },
  { name: "a package with two rows", mutate: () => editDoc(text => text.replace(/^(\| `modules\/gamma` \|.*)$/m, "$1\n$1")), expect: /modules\/gamma has more than one row/ },
  { name: "a package that is added without a row", mutate: () => {
    const delta = { path: "modules/delta", name: "@molis-ai/molis-work-module-delta", kind: "module" as Kind };
    writeRegistry([...registry, delta]); writePackage(delta);
  }, expect: /modules\/delta is a workspace package but has no row/ },
  { name: "a layer the registry does not give", mutate: () => editDoc(cell("modules/gamma", 1, "基础")), expect: /modules\/gamma is module in the registry, so its layer is 模块, not 基础/ },
  { name: "a reached package marked 非产品", mutate: () => editDoc(cell("modules/gamma", 8, "非产品")), expect: /modules\/gamma is marked 非产品, the code says 在用/ },
  { name: "an app that nothing reaches from apps/desktop marked 在用", mutate: () => editDoc(cell("apps/stray", 8, "在用")),
    expect: /apps\/stray is marked 在用, the code says 非产品 \(nothing reachable from apps\/desktop imports it\)/ },
  { name: "a package only an unreached app imports marked 在用", mutate: () => editDoc(cell("modules/standalone", 8, "在用")),
    expect: /modules\/standalone is marked 在用, the code says 非产品/ },
  { name: "an unreached package marked 在用", mutate: () => editDoc(cell("modules/orphan", 8, "在用")), expect: /modules\/orphan is marked 在用, the code says 非产品 \(nothing reachable from apps\/desktop imports it\)/ },
  { name: "a Runtime plugin marked 构建期", mutate: () => editDoc(cell("plugins/native/alpha", 8, "构建期")), expect: /plugins\/native\/alpha is marked 构建期, the code says Runtime/ },
  { name: "a hand-wired plugin marked Runtime", mutate: () => editDoc(cell("plugins/native/beta", 8, "Runtime")), expect: /plugins\/native\/beta is marked Runtime, the code says 构建期 .*does not start/ },
  { name: "a plugin the supervisor starts after the table was written", mutate: () => put("apps/local-host/src/project-plugins.ts", `export const started = ["${named("plugins/native/alpha").name}", "${named("plugins/native/beta").name}"];\n`),
    expect: /plugins\/native\/beta is marked 构建期, the code says Runtime/ },
  { name: "a package nothing imports any more", mutate: () => put("apps/local-host/src/index.ts", "export const host = 1;\n"), expect: /modules\/gamma is marked 在用, the code says 非产品/ },
  { name: "a status outside the vocabulary", mutate: () => editDoc(cell("modules/gamma", 8, "良好")), expect: /modules\/gamma status "良好" is not one of 在用, Runtime, 构建期, 非产品/ },
  { name: "a planned depth outside the vocabulary", mutate: () => editDoc(cell("modules/gamma", 9, "很深")), expect: /modules\/gamma planned depth "很深" is not one of 深, 中, 浅/ },
  { name: "a review state outside the vocabulary", mutate: () => editDoc(cell("modules/gamma", 10, "进行中")), expect: /modules\/gamma review "进行中" is not one of 待审, 已审/ },
  { name: "a count that is not a number", mutate: () => editDoc(cell("modules/gamma", 3, "很多")), expect: /modules\/gamma 行数 is "很多", not a number/ },
  { name: "a largest file without its path", mutate: () => editDoc(cell("modules/gamma", 4, "index.ts")), expect: /modules\/gamma 最大文件 is "index\.ts"/ },
  { name: "a row with a cell missing", mutate: () => editDoc(text => text.replace(/^(\| `modules\/gamma` \|.*) \| 待审 \|$/m, "$1 |")), expect: /10 cells, the table has 11 columns/ },
  { name: "a package of a kind the layer column has no name for", mutate: () => writeRegistry(registry.map(item => (item.path === "modules/gamma" ? { ...item, kind: "business" as Kind } : item))),
    expect: /modules\/gamma: registry kind "business" has no layer name/ },
  { name: "a document without the table", mutate: () => editDoc(text => text.replace("| 包 | 层 |", "| 名 | 层 |")), expect: /no package table with the header/ },
  { name: "a missing document", mutate: () => rmSync(path.join(repo, DOC)), expect: /the package inventory document is missing/ },
];
for (const violation of violations) {
  test(`${violation.name} fails the inventory check, here and in the health gates`, () => {
    restore();
    violation.mutate();
    const caught = check();
    assert.equal(caught.code, 1, caught.out);
    assert.match(caught.out, violation.expect);
    // The same finding reaches CI: check-health-gates.mjs reports it among its absolute rules.
    const reported = run(healthScript);
    assert.equal(reported.code, 1, reported.out);
    assert.match(reported.out, violation.expect);
    restore();
    assert.equal(check().code, 0, "the base table is accepted again");
  });
}

test("a repository without a package registry is not subject to the rule (the scratch repositories of the other gate tests)", () => {
  restore();
  rmSync(path.join(repo, "scripts/workspace-packages.mjs"));
  const result = run(healthScript);
  assert.equal(result.code, 0, result.out);
  restore();
});

test("the planned depth follows the risk rule: score of four, the authorization spine, or the 中 floor", () => {
  const quiet = { path: "modules/quiet", lines: 300, churn: 3, dependedBy: 1, giants: 0 };
  assert.equal(plannedDepth(quiet), "浅");
  assert.equal(plannedDepth({ ...quiet, lines: 1000 }), "中");
  assert.equal(plannedDepth({ ...quiet, giants: 1 }), "中");
  assert.equal(plannedDepth({ ...quiet, dependedBy: 3 }), "中");
  assert.equal(plannedDepth({ ...quiet, lines: 9000 }), "中", "size alone is two points");
  assert.equal(plannedDepth({ ...quiet, lines: 9000, churn: 100 }), "深");
  assert.equal(plannedDepth({ ...quiet, lines: 3000, churn: 40, dependedBy: 4, giants: 4 }), "深", "four low-threshold signals make four points");
  assert.equal(plannedDepth({ ...quiet, lines: 3000, churn: 40, dependedBy: 4 }), "中", "three points are not enough");
  assert.equal(plannedDepth({ ...quiet, dependedBy: 17, giants: 10 }), "深");
  assert.equal(plannedDepth({ ...quiet, path: "packages/kernel", lines: 100 }), "深", "the spine is deep whatever its size");
  assert.equal(plannedDepth({ ...quiet, path: "packages/plugin-runtime", lines: 100 }), "深");
});
