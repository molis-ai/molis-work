import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";
import { fileURLToPath } from "node:url";

// docs/releases/POLICY.md: one product version, and the per-database version table in docs/releases/CHECKLIST.md is the
// code's. The script is run against this repository (it must pass), and each rule is mutation-verified on a small scratch
// tree: one violation makes it fail and name the place, the unmutated tree passes.
const script = fileURLToPath(new URL("../scripts/verify-release-versions.mjs", import.meta.url));
const repository = fileURLToPath(new URL("..", import.meta.url));
const scratch: string[] = [];
let root = "";

const run = (...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
const edit = (file: string, from: string, to: string) => {
  const text = readFileSync(path.join(root, file), "utf8");
  assert.ok(text.includes(from), `${file} does not contain ${from}`);
  writeFileSync(path.join(root, file), text.replace(from, to));
};
const rmSyncFile = (file: string) => rmSync(path.join(root, file), { force: true });
const failsWith = (result: { code: number | null; out: string }, ...fragments: string[]) => {
  assert.equal(result.code, 1, result.out);
  for (const fragment of fragments) assert.ok(result.out.includes(fragment), `${fragment}\n--\n${result.out}`);
};

const VERSION = "1.2.3";
const TABLE = [
  "| 库 | 位置 | 版本 | 记在 | 定义处 | 版本不符时 |",
  "| --- | --- | --- | --- | --- | --- |",
  "| Alpha | `alpha/alpha.db` | 3 | `user_version` | `apps/alpha/src/store.ts#ALPHA_BASELINE` | 拒绝 |",
  "| Server | `server/server.sqlite` | 1 | `user_version` | `server/src/db.ts#SERVER_BASELINE` | 拒绝 |",
  "| Catalog | `catalog.db` | 21 | `catalog_meta` | `apps/alpha/src/store.ts#CATALOG_VERSION` | 拒绝 |",
  "| Characters | `characters.sqlite` | 1 | `user_version` | `apps/alpha/src/characters.ts#PRAGMA user_version` | 只拒绝更高的版本 |",
  "| Plain | `plain.sqlite` | 无 | 没有版本 | `apps/alpha/src/plain.ts` | 不检查 |",
].join("\n");

// A scratch repository that satisfies every rule; the tests break one thing at a time.
const buildFixture = () => {
  put("package.json", JSON.stringify({ name: "root", version: VERSION }));
  put("pnpm-workspace.yaml", "# comment\npackages:\n  - 'apps/*'\n  - 'server'\n\noverrides:\n  x: 1\n");
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "0.0.0", private: true }));
  put("apps/alpha/src/store.ts", [
    "export const ALPHA_BASELINE: SqliteBaseline = { version: 3, schema: `CREATE TABLE a (id TEXT);` };",
    "export const CATALOG_VERSION = 21;",
  ].join("\n"));
  put("apps/alpha/src/characters.ts", "db.exec(`CREATE TABLE IF NOT EXISTS c (id TEXT); PRAGMA user_version = 1;`);\n");
  put("apps/alpha/src/plain.ts", "export const plain = 'CREATE TABLE IF NOT EXISTS p (id TEXT)';\n");
  put("server/package.json", JSON.stringify({ name: "server", version: "0.0.0", private: true }));
  put("server/src/db.ts", "export const SERVER_BASELINE: SqliteBaseline = {\n  version: 1,\n  schema: ``,\n};\n");
  put("apps/desktop/src-tauri/tauri.conf.json", JSON.stringify({ productName: "Molis Work", version: VERSION }));
  put("apps/desktop/src-tauri/Cargo.toml", `[package]\nname = "molis-work-desktop"\nversion = "${VERSION}"\n\n[dependencies]\nserde = { version = "1" }\n\n[dependencies.other]\nversion = "7"\n`);
  put("apps/desktop/src-tauri/Cargo.lock", `[[package]]\nname = "other"\nversion = "7.0.0"\n\n[[package]]\nname = "molis-work-desktop"\nversion = "${VERSION}"\ndependencies = [\n "other",\n]\n`);
  put("apps/local-host/src/feed-source-runtime.ts", `const APP_VERSION = "${VERSION}";\n`);
  put("horizontal/runtime-host/src/adapters/codex-app-server.ts", `const info = { clientInfo: { name: "molis-work-session-browser", title: "Molis Work", version: "${VERSION}" } };\n`);
  put(`docs/releases/v${VERSION}.md`, "# notes\n");
  put("docs/releases/CHANGELOG.md", `# Changelog\n\n## [Unreleased]\n\n## [${VERSION}] - 2026-01-01\n\n## [1.2.2] - 2025-12-01\n`);
  put("docs/releases/CHECKLIST.md", `# Checklist\n\n## 3. 各库版本表\n\n${TABLE}\n\n- trailing text that is not a table row\n\n## 4. Other\n\n| not | the | table |\n| --- | --- | --- |\n| x | y | z |\n`);
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "molis-release-versions-"));
  scratch.push(root);
  buildFixture();
});
after(() => { for (const directory of scratch) rmSync(directory, { recursive: true, force: true }); });

test("this repository: the version sources agree and the database table is the code's", () => {
  const result = spawnSync(process.execPath, [script, "--root", repository], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const version = (JSON.parse(readFileSync(path.join(repository, "package.json"), "utf8")) as { version: string }).version;
  assert.equal(result.stdout.split("\n")[0], `Molis Work release version sources agree: ${version}`);
});

test("this repository: the table lists the JSON files whose version mismatch loses credentials or authorizations", () => {
  const checklist = readFileSync(path.join(repository, "docs/releases/CHECKLIST.md"), "utf8");
  const row = (location: string) => checklist.split("\n").find(line => line.startsWith("|") && line.includes(`\`${location}\``)) ?? "";
  assert.match(row("feed/secrets.json"), /file-secret-store\.ts#FORMAT_VERSION` \| 拒绝读取/);
  assert.match(row("config/mcp-tools.json"), /mcp-settings-store\.ts#MCP_TOOL_PREFERENCE_VERSION`.*\| 读成空/);
});

test("a consistent scratch tree passes, and the tag may be v<version>", () => {
  const plain = run();
  assert.equal(plain.code, 0, plain.out);
  assert.match(plain.out, new RegExp(`release version sources agree: ${VERSION}`));
  assert.match(plain.out, /2 workspace packages are private 0\.0\.0; 5 stores/);
  assert.equal(run("--tag", `v${VERSION}`).code, 0);
  assert.equal(run(`--tag=v${VERSION}`).code, 0);
});

test("every place that carries the product version must equal it", () => {
  const carriers: Array<[string, string, string]> = [
    ["apps/desktop/src-tauri/tauri.conf.json", `"version":"${VERSION}"`, '"version":"9.9.9"'],
    ["apps/desktop/src-tauri/Cargo.toml", `version = "${VERSION}"`, 'version = "9.9.9"'],
    ["apps/desktop/src-tauri/Cargo.lock", `name = "molis-work-desktop"\nversion = "${VERSION}"`, 'name = "molis-work-desktop"\nversion = "9.9.9"'],
    ["apps/local-host/src/feed-source-runtime.ts", `"${VERSION}"`, '"9.9.9"'],
    ["horizontal/runtime-host/src/adapters/codex-app-server.ts", `version: "${VERSION}"`, 'version: "9.9.9"'],
  ];
  for (const [file, from, to] of carriers) {
    buildFixture();
    edit(file, from, to);
    failsWith(run(), file, `9.9.9, but package.json is ${VERSION}`);
  }
});

test("a carrier that cannot be read counts as a mismatch, not as a pass", () => {
  rmSyncFile("apps/desktop/src-tauri/Cargo.toml");
  failsWith(run(), "apps/desktop/src-tauri/Cargo.toml: the file is missing");
  buildFixture();
  put("apps/desktop/src-tauri/tauri.conf.json", "{ not json");
  failsWith(run(), "apps/desktop/src-tauri/tauri.conf.json: no version found");
  buildFixture();
  put("package.json", JSON.stringify({ name: "root", version: "one" }));
  failsWith(run(), "package.json: version \"one\" is not MAJOR.MINOR.PATCH");
});

test("a tag other than v<package version> fails", () => {
  failsWith(run("--tag", "v9.9.9"), `tag v9.9.9 is not v${VERSION}`);
  failsWith(run("--tag", VERSION), `tag ${VERSION} is not v${VERSION}`);
});

test("workspace packages are private and stay 0.0.0", () => {
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "1.0.0", private: true }));
  failsWith(run(), "apps/alpha/package.json: workspace packages stay 0.0.0, found 1.0.0");
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "0.0.0" }));
  failsWith(run(), "apps/alpha/package.json: workspace packages are private");
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "0.0.0", private: true }));
  put("apps/beta/package.json", JSON.stringify({ name: "beta", version: "0.0.1", private: true }));
  failsWith(run(), "apps/beta/package.json: workspace packages stay 0.0.0");
});

test("a workspace pattern the check cannot expand is refused, not skipped", () => {
  put("pnpm-workspace.yaml", "packages:\n  - 'apps/**'\n  - 'server'\n");
  failsWith(run(), "pnpm-workspace.yaml: pattern apps/** is not supported by this check");
});

test("the current version needs release notes and a CHANGELOG section, [Unreleased] first", () => {
  rmSyncFile(`docs/releases/v${VERSION}.md`);
  failsWith(run(), `docs/releases/v${VERSION}.md: release notes for ${VERSION} are missing`);
  buildFixture();
  put("docs/releases/CHANGELOG.md", "# Changelog\n\n## [Unreleased]\n\n## [1.2.2] - 2025-12-01\n");
  failsWith(run(), `no [${VERSION}] section`);
  buildFixture();
  put("docs/releases/CHANGELOG.md", `# Changelog\n\n## [${VERSION}] - 2026-01-01\n\n## [Unreleased]\n`);
  failsWith(run(), "the first section must be [Unreleased], found [1.2.3]");
  buildFixture();
  rmSyncFile("docs/releases/CHANGELOG.md");
  failsWith(run(), "docs/releases/CHANGELOG.md: the file is missing");
});

test("the database table must agree with the code, row by row", () => {
  edit("apps/alpha/src/store.ts", "version: 3", "version: 4");
  failsWith(run(), "Alpha: the table says 3, the code (apps/alpha/src/store.ts#ALPHA_BASELINE) says 4");
  buildFixture();
  edit("docs/releases/CHECKLIST.md", "| 21 |", "| 22 |");
  failsWith(run(), "Catalog: the table says 22, the code (apps/alpha/src/store.ts#CATALOG_VERSION) says 21");
  buildFixture();
  edit("server/src/db.ts", "version: 1", "version: 2");
  failsWith(run(), "Server: the table says 1, the code (server/src/db.ts#SERVER_BASELINE) says 2");
  buildFixture();
  edit("apps/alpha/src/characters.ts", "user_version = 1", "user_version = 2");
  failsWith(run(), "Characters: the table says 1, the code (apps/alpha/src/characters.ts#PRAGMA user_version) says 2");
});

test("a row whose definition has vanished, or whose file is gone, fails", () => {
  edit("apps/alpha/src/store.ts", "ALPHA_BASELINE", "ALPHA_RENAMED");
  failsWith(run(), "Alpha: apps/alpha/src/store.ts has no ALPHA_BASELINE with a version");
  buildFixture();
  rmSyncFile("apps/alpha/src/characters.ts");
  failsWith(run(), "Characters: apps/alpha/src/characters.ts does not exist");
});

test("a SqliteBaseline the table does not list fails", () => {
  put("apps/alpha/src/more.ts", "export const MORE_BASELINE: SqliteBaseline = { version: 1, schema: `` };\n");
  failsWith(run(), "apps/alpha/src/more.ts#MORE_BASELINE is a SqliteBaseline the 各库版本表 does not list");
  // Outside package sources (tests, build output, dependencies) it does not count.
  rmSyncFile("apps/alpha/src/more.ts");
  put("apps/alpha/tests/more.ts", "export const MORE_BASELINE: SqliteBaseline = { version: 1, schema: `` };\n");
  put("apps/alpha/src/dist/more.ts", "export const MORE_BASELINE: SqliteBaseline = { version: 1, schema: `` };\n");
  put("apps/alpha/src/node_modules/x/more.ts", "export const MORE_BASELINE: SqliteBaseline = { version: 1, schema: `` };\n");
  assert.equal(run().code, 0);
});

test("a baseline declared with satisfies or as, or handed over inline, cannot hide from the table", () => {
  put("apps/alpha/src/more.ts", "export const MORE_BASELINE = { version: 1, schema: `` } satisfies SqliteBaseline;\n");
  failsWith(run(), "apps/alpha/src/more.ts#MORE_BASELINE is a SqliteBaseline the 各库版本表 does not list");
  put("apps/alpha/src/more.ts", "export const MORE_BASELINE = {\n  version: 1,\n  schema: ``,\n} as SqliteBaseline;\n");
  failsWith(run(), "apps/alpha/src/more.ts#MORE_BASELINE is a SqliteBaseline the 各库版本表 does not list");
  rmSyncFile("apps/alpha/src/more.ts");

  put("apps/alpha/src/open.ts", "applySqliteBaseline(db, path, { version: 1, schema: `CREATE TABLE t (a TEXT, b TEXT);` });\n");
  failsWith(run(), "apps/alpha/src/open.ts: applySqliteBaseline is called with an inline baseline");
  put("apps/alpha/src/open.ts", "const handle = openBaselineHomeSqlite(home, 'x',\n  makeBaseline(1));\n");
  failsWith(run(), "apps/alpha/src/open.ts: openBaselineHomeSqlite is called with an inline baseline");
  put("apps/alpha/src/open.ts", "applySqliteBaseline(db, path, OTHER_BASELINE);\n");
  failsWith(run(), "apps/alpha/src/open.ts: applySqliteBaseline is called with OTHER_BASELINE, which no package declares as a SqliteBaseline");
  put("apps/alpha/src/open.ts", "applySqliteBaseline(db, path);\n");
  failsWith(run(), "apps/alpha/src/open.ts: applySqliteBaseline is called without a baseline");

  // Calls with a declared constant, and the definition of the function itself, are fine.
  put("apps/alpha/src/open.ts", [
    "export function applySqliteBaseline(db: Db, path: string, baseline: SqliteBaseline): void {}",
    "applySqliteBaseline(db, `${home}/(a,b)`, ALPHA_BASELINE);",
    "const handle = openBaselineHomeSqlite(home, 'alpha',\n  SERVER_BASELINE);",
  ].join("\n"));
  assert.equal(run().code, 0, run().out);
});

// The detection and the version reader agree on every spelling: a baseline that has to be listed can be listed and checked.
test("a baseline written with satisfies or as is listed and read like an annotated one", () => {
  put("apps/alpha/src/more.ts", [
    "// the store that's second",
    "export const MORE_BASELINE = { meta: { version: 9 }, version: 4, schema: `CREATE TABLE m (id TEXT); -- don't` } satisfies SqliteBaseline;",
    "export const LAST_BASELINE = {",
    '  /* a comment with a " quote */',
    "  schema: ``,",
    "  version: 2,",
    "} as SqliteBaseline;",
  ].join("\n"));
  const withRows = (more: string, last: string) => put("docs/releases/CHECKLIST.md", `# Checklist\n\n## 3. 各库版本表\n\n${TABLE}\n`
    + `| More | \`more/more.db\` | ${more} | \`user_version\` | \`apps/alpha/src/more.ts#MORE_BASELINE\` | 拒绝 |\n`
    + `| Last | \`last/last.db\` | ${last} | \`user_version\` | \`apps/alpha/src/more.ts#LAST_BASELINE\` | 拒绝 |\n`);
  failsWith(run(), "apps/alpha/src/more.ts#MORE_BASELINE is a SqliteBaseline the 各库版本表 does not list",
    "apps/alpha/src/more.ts#LAST_BASELINE is a SqliteBaseline the 各库版本表 does not list");
  withRows("4", "2");
  assert.equal(run().code, 0, run().out);
  assert.match(run().out, /7 stores/);
  withRows("9", "2");
  failsWith(run(), "More: the table says 9, the code (apps/alpha/src/more.ts#MORE_BASELINE) says 4");
  withRows("4", "3");
  failsWith(run(), "Last: the table says 3, the code (apps/alpha/src/more.ts#LAST_BASELINE) says 2");
  // A version the script cannot read as a number is a failure, not a pass.
  put("apps/alpha/src/more.ts", "const V = 4;\nexport const MORE_BASELINE = { version: V, schema: `` } satisfies SqliteBaseline;\nexport const LAST_BASELINE = { version: 2, schema: `` } as SqliteBaseline;\n");
  withRows("4", "2");
  failsWith(run(), "More: apps/alpha/src/more.ts has no MORE_BASELINE with a version");
});

test("a database listed as having no version fails once it gets one", () => {
  put("apps/alpha/src/plain.ts", "db.exec('PRAGMA user_version = 1');\n");
  failsWith(run(), "Plain: apps/alpha/src/plain.ts now carries a version marker; give the table a number");
  buildFixture();
  put("apps/alpha/src/plain.ts", "const row = db.prepare('SELECT schema_version FROM meta');\n");
  failsWith(run(), "Plain: apps/alpha/src/plain.ts now carries a version marker");
});

test("the table itself must exist, have the columns, and carry a number or 无", () => {
  put("docs/releases/CHECKLIST.md", "# Checklist\n\nno table\n");
  failsWith(run(), "no section titled 各库版本表");
  put("docs/releases/CHECKLIST.md", "## 各库版本表\n\n| 库 | 版本 |\n| --- | --- |\n| Alpha | 3 |\n");
  failsWith(run(), "the table needs the columns 版本 and 定义处");
  put("docs/releases/CHECKLIST.md", "## 各库版本表\n\n| 库 | 版本 | 定义处 |\n| --- | --- | --- |\n");
  failsWith(run(), "the 各库版本表 has no rows");
  put("docs/releases/CHECKLIST.md", "## 各库版本表\n\n| 库 | 版本 | 定义处 |\n| --- | --- | --- |\n| Alpha | three | `apps/alpha/src/store.ts#ALPHA_BASELINE` |\n");
  failsWith(run(), "Alpha: needs a number or 无 in 版本 and a file in 定义处");
  rmSyncFile("docs/releases/CHECKLIST.md");
  failsWith(run(), "docs/releases/CHECKLIST.md: the file is missing");
});

test("every finding is listed in one run, not only the first", () => {
  edit("apps/desktop/src-tauri/Cargo.toml", `version = "${VERSION}"`, 'version = "9.9.9"');
  put("apps/alpha/package.json", JSON.stringify({ name: "alpha", version: "2.0.0", private: true }));
  rmSyncFile(`docs/releases/v${VERSION}.md`);
  edit("apps/alpha/src/store.ts", "version: 3", "version: 5");
  failsWith(run(), "Cargo.toml: 9.9.9", "workspace packages stay 0.0.0", "release notes", "Alpha: the table says 3");
});

test("an unusable command line exits 2, not 0 or 1", () => {
  for (const args of [["--unknown"], ["--tag"], ["--root"], ["--tag", "--root", root]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, `${args.join(" ")}\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /usage: verify-release-versions\.mjs/);
  }
});
