import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkRepository, initialVersionProblems, isCheckedSource, sourceVersionProblems, versionOriginProblems } from "../scripts/gates/initial-versions.mjs";

test("U0-03: an active registration cannot hide a later action, manifest, role, prompt, instruction or method version", () => {
  const agent = {
    roles: [{ role_id: "parent", version: 1 }], prompts: [{ prompt_id: "base", version: 1 }],
    subagents: { roles: [{ role_id: "child", version: 1 }] },
  };
  const manifest = {
    plugin_id: "notes",
    schema_version: 1,
    host_api_version: 1,
    agent,
    actions: [{ capability_id: "notes.read", version: 1 }],
    methods: [{ skill_id: "notes-tidy", version: 1 }],
    databases: {
      home: { store_name: "notes-home", version: 1 },
      partition: { store_name: "notes-part", version: 1 },
      project: { store_name: "notes-proj", version: 1 },
    },
    artifacts: { produces: [{ artifact_type_id: "notes.doc", schema_version: 1 }] },
    sync: { collections: [{ id: "notes.items", schema_version: 1 }] },
  };
  const view = { provider: { provider_id: "system.home" }, capability_id: "home.read", version: 1 };
  const registration = { owner_id: "assistant", prompts: [{ prompt_id: "work", version: 1 }], roles: [{ role_id: "system", version: 1 }] };
  const versionEntries = { "prompt.notes.summarize": 1, "method.goals.work-build-change": 1, "action.notes.read": 1 };
  const inspect = () => initialVersionProblems({ manifests: [manifest], hostViews: [view], registrations: [registration], versionEntries });
  assert.deepEqual(inspect(), []);
  const mutations: Array<[string, (version: number) => void]> = [
    ["schema_version", value => { manifest.schema_version = value; }],
    ["host_api_version", value => { manifest.host_api_version = value; }],
    ["notes.read", value => { manifest.actions[0]!.version = value; }],
    ["notes-home", value => { manifest.databases.home.version = value; }],
    ["notes-part", value => { manifest.databases.partition.version = value; }],
    ["notes-proj", value => { manifest.databases.project.version = value; }],
    ["notes.doc", value => { manifest.artifacts.produces[0]!.schema_version = value; }],
    ["notes.items", value => { manifest.sync.collections[0]!.schema_version = value; }],
    ["home.read", value => { view.version = value; }],
    ["parent", value => { agent.roles[0]!.version = value; }],
    ["base", value => { agent.prompts[0]!.version = value; }],
    ["child", value => { agent.subagents.roles[0]!.version = value; }],
    ["work", value => { registration.prompts[0]!.version = value; }],
    ["system", value => { registration.roles[0]!.version = value; }],
    ["notes-tidy", value => { manifest.methods[0]!.version = value; }],
    ["prompt.notes.summarize", value => { versionEntries["prompt.notes.summarize"] = value; }],
    ["method.goals.work-build-change", value => { versionEntries["method.goals.work-build-change"] = value; }],
  ];
  for (const [name, setVersion] of mutations) {
    setVersion(2);
    const problems = inspect();
    assert.equal(problems.length, 1);
    assert.ok(problems[0]!.includes(`${name} = 2`), problems[0]);
    setVersion(1);
  }
});

test("U0-03: first-party version constants are checked in source, independently of comments and bundled protocol versions", () => {
  const file = "packages/example/src/store.ts";
  assert.deepEqual(sourceVersionProblems(file, 'const SCHEMA_VERSION = 1 as const, TEXT_VERSION = "1"; const CATALOG_VERSION = "actions/1";'), []);
  assert.deepEqual(sourceVersionProblems(file, '// const OUTDATED_VERSION = 9;\nconst prose = "const EXAMPLE_VERSION = 2";'), []);
  assert.equal(sourceVersionProblems(file, "const SCHEMA_VERSION = 2;").length, 1);
  assert.equal(sourceVersionProblems(file, 'const CATALOG_VERSION = "actions/2";').length, 1);
  assert.equal(sourceVersionProblems(file, "const STORED_VERSION = calculateVersion();").length, 1);
  assert.deepEqual(sourceVersionProblems("plugins/official-integrations/github/src/provider.ts", 'const GITHUB_API_VERSION = "2026-03-10";'), []);
  assert.equal(sourceVersionProblems(file, 'const GITHUB_API_VERSION = 2;').length, 1);
});

test("pre-dev v1 guard: every persistent store, format, and artifact stays strictly at 1 with no upgrade-chain bypass", () => {
  const cases: Array<[string, string]> = [
    ["packages/contracts/src/modules/artifacts.ts", "export const IMPORTED_DOCUMENT_SCHEMA_VERSION = /* @version artifact.io.molis.work.document */ 2;"],
    ["apps/local-host/src/project-catalog-contract.ts", "export const CATALOG_SCHEMA_VERSION = /* @version database.home.catalog */ 2;"],
    ["packages/storage/src/adapters/text-search-index.ts", 'const SCHEMA_VERSION = /* @version database.search.text-index "{version}" */ "2";'],
    ["horizontal/appearance/src/state.ts", "export const APPEARANCE_STATE_VERSION = /* @version format.ui.appearance-state */ 2;"],
    ["apps/local-host/src/onboarding.ts", "export const ONBOARDING_SCHEMA_VERSION = /* @version format.home.onboarding */ 2;"],
    ["apps/local-host/src/project-database-schema.ts", "export const B: SqliteBaseline = { version: /* @version database.project_database_baseline */ 2, schema: `` };"],
    ["packages/storage/src/adapters/memory-ledger.ts", "export const MEMORY_LEDGER_BASELINE: SqliteBaseline = { version: /* @version database.memory_ledger_baseline */ 2, schema: `` };"],
    ["plugins/native/jelly/src/contract.ts", "export interface Workspace { schema_version: /* @version format.jelly.workspace */ 2; revision: number }"],
    ["apps/local-host/src/connector-private-state.ts", "const record = () => ({ schema_version: /* @version format.connector.private-state */ 2 });"],
    ["apps/local-host/src/connector-private-state.ts", 'const record = () => ({ schema_version: /* @version format.connector.private-state */ "2" });'],
  ];
  for (const [file, source] of cases) {
    const problems = sourceVersionProblems(file, source);
    assert.equal(problems.length, 1, `${file}: ${problems.join("; ")}`);
    assert.match(problems[0]!, /\(expected 1\)/u, `${file}: ${problems[0]}`);
  }
  // At 1, all of them pass; content markers (prompt/method/role) are checked by contentVersionChanges instead.
  assert.deepEqual(sourceVersionProblems("packages/contracts/src/modules/artifacts.ts", "export const IMPORTED_DOCUMENT_SCHEMA_VERSION = /* @version artifact.io.molis.work.document */ 1;"), []);
  assert.deepEqual(sourceVersionProblems("apps/local-host/src/project-database-schema.ts", "export const B: SqliteBaseline = { version: /* @version database.project_database_baseline */ 1, schema: ``, upgrades: [] };"), []);
  assert.deepEqual(sourceVersionProblems("apps/local-host/src/prompts.ts", "export const P = { version: /* @version prompt.assistant-base */ 7 };"), []);
  // A named constant is judged once, not a second time by its @version marker.
  assert.deepEqual(sourceVersionProblems("apps/local-host/src/a.ts", "const PRIVATE_STATE_VERSION = /* @version format.connector.private-state */ 2;"), [
    "apps/local-host/src/a.ts: PRIVATE_STATE_VERSION = 2 (expected 1)",
  ]);
  // Comments are ignored.
  assert.deepEqual(sourceVersionProblems("apps/local-host/src/a.ts", "// see /* @version format.connector.private-state */ 2\nconst PLAIN_VERSION = 1;"), []);
});

test("pre-dev zero-upgrades guard: any non-empty upgrades array or *_UPGRADES constant in source is refused", () => {
  const file = "packages/example/src/store.ts";
  // Empty upgrades arrays and pass-through generic engine forwarding are allowed.
  for (const ok of [
    "export const CATALOG_UPGRADES: readonly SqliteUpgradeStep[] = [];",
    "export const UPGRADES: readonly VersionedFileStep[] = [];",
    "export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades: [] };",
    "const CATALOG_UPGRADES: readonly VersionedFileStep[] = []; export const FILE: VersionedFile<State> = { version: 1, field: 'version', upgrades: CATALOG_UPGRADES, parse };",
    "export const PLUGIN: PluginDatabaseDeclaration = { store_name: 'x', version: 1, schema: ``, upgrades: [], read_permission: 'r', write_permission: 'w' };",
    "const localEmpty = []; export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades: localEmpty };",
    "const upgrades = [] as const; export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades };",
    "export const forward = (library: { version: number; schema: string; upgrades?: readonly unknown[] }) => ({ version: library.version, schema: library.schema, ...(library.upgrades ? { upgrades: library.upgrades } : {}) });",
  ]) {
    assert.deepEqual(sourceVersionProblems(file, ok), [], ok);
  }
  // Concrete upgrade steps in any spelling fail (including shorthand properties, let/var, imported *_UPGRADES, Object.freeze, and inline baselines).
  for (const bad of [
    "const STORE_UPGRADES = [{ from: 1, sql: 'ALTER TABLE t ADD COLUMN c TEXT' }];",
    "let STORE_UPGRADES = [{ from: 1, run: () => {} }];",
    "let STORE_UPGRADES: readonly SqliteUpgradeStep[] = [];",
    "var STORE_UPGRADES = [{ from: 1, run: () => {} }];",
    "export const UPGRADES: readonly VersionedFileStep[] = [{ from: 1, transform: (v) => v }];",
    "export const UPGRADES = Object.freeze([{ from: 1, transform: (v) => v }]);",
    "export const STORE_UPGRADES = buildSteps();",
    "import { steps as STORE_UPGRADES } from './other.js'; export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades: STORE_UPGRADES };",
    "export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades: [{ from: 1, sql: 'SELECT 1' }] };",
    "export const STORE: SqliteBaseline = Object.freeze({ version: 1, schema: ``, upgrades: [{ from: 1, sql: 'SELECT 1' }] });",
    "export const FILE: VersionedFile<State> = { version: 1, field: 'version', upgrades: [{ from: 1, transform: (v) => v }], parse };",
    "export const PLUGIN = { store_name: 'x', version: 1, schema: ``, upgrades: [{ from: 1, sql: 'SELECT 1' }] } satisfies PluginDatabaseDeclaration;",
    "export const HOME_DB = { store_name: 'x', version: 1, schema: ``, upgrades: [{ from: 1, sql: 'SELECT 1' }] } as HomePluginDatabaseDeclaration;",
    "const steps = [{ from: 1, sql: 'SELECT 1' }]; export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades: steps };",
    "const upgrades = [{ from: 1, run: () => {} }]; export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades };",
    "export const STORE: SqliteBaseline = { version: 1, schema: ``, upgrades: buildSteps() };",
    "export const UNTYPED = { version: 1, schema: ``, upgrades: [{ from: 1, run: () => {} }] };",
    "const steps = [{ from: 1, run: () => {} }]; applySqliteBaseline(db, file, { version: 1, schema: ``, upgrades: steps });",
    "const steps = Object.freeze([{ from: 1, run: () => {} }]); applySqliteBaseline(db, file, { version: 1, schema: ``, upgrades: steps });",
    "let steps = [{ from: 1, run: () => {} }]; applySqliteBaseline(db, file, { version: 1, schema: ``, upgrades: steps });",
    "const upgrades = [{ from: 1, run: () => {} }]; applySqliteBaseline(db, file, { version: 1, schema: ``, upgrades });",
  ]) {
    const problems = sourceVersionProblems(file, bad);
    assert.equal(problems.length, 1, `${bad}: ${problems.join("; ")}`);
    assert.match(problems[0]!, /must be empty during pre-development/u, `${bad}: ${problems[0]}`);
  }
});

const snapshotOf = (texts: Record<string, string>) => ({ files: Object.keys(texts), read: (file: string) => texts[file] ?? null });

test("pre-dev v1 guard: tooling/versions.json holds every non-content numeric version at 1, while allowing content versions and semver strings", () => {
  const versions = (entries: Record<string, number | string>) => JSON.stringify({ versions: entries });
  const inspect = (texts: Record<string, string>, options?: Parameters<typeof versionOriginProblems>[1]) => versionOriginProblems(snapshotOf(texts), options);
  assert.deepEqual(inspect({ "packages/a/src/a.ts": "const A_VERSION = 1;" }), [], "a repository with no tables");
  assert.deepEqual(inspect({ "packages/a/src/a.ts": "const A_VERSION = 2;" }), ["packages/a/src/a.ts: A_VERSION = 2 (expected 1)"]);
  assert.deepEqual(inspect({ "packages/a/tests/a.ts": "const A_VERSION = 2;", "docs/a.ts": "const A_VERSION = 2;" }), [], "outside the checked source");
  // Content versions (prompt/method/role) and semver/release strings pass in the no-build half.
  assert.deepEqual(inspect({ "tooling/versions.json": versions({ "prompt.a.b": 2, "method.a": 2, "role.a": 2, "product.release": "0.1.0", "plugin.integration-github": "1.5.0", "identity.system.materials-producer": "1" }) }), []);
  // Every non-content numeric entry above 1 fails.
  for (const key of ["database.ledger_baseline", "database.memory_ledger_baseline", "format.ui.appearance-state", "artifact.io.molis.work.document", "remote.sync.d1-schema", "action.notes.read"]) {
    assert.deepEqual(inspect({ "tooling/versions.json": versions({ [key]: 2 }) }), [`tooling/versions.json: ${key} = 2 (expected 1)`], key);
  }
  const excepted = JSON.stringify([{ file: "packages/a/src/a.ts", name: "A_VERSION", reason: "x" }]);
  assert.deepEqual(inspect({ "packages/a/src/a.ts": "const A_VERSION = 2;", "tooling/gates/version-exceptions.json": excepted }), [], "the exceptions of the repository it reads, not of this one");
});

test("UPG1-i-initial-15: a table it cannot read, or one this repository had and lost, is a problem and not a pass", () => {
  assert.match(versionOriginProblems(snapshotOf({ "tooling/versions.json": "{" }))[0]!, /tooling\/versions\.json cannot be read/);
  assert.match(versionOriginProblems(snapshotOf({ "tooling/gates/version-exceptions.json": "{" }))[0]!, /version-exceptions\.json cannot be read/);
  const hadIt = (file: string) => (file === "tooling/versions.json" ? "{}" : "");
  assert.deepEqual(versionOriginProblems(snapshotOf({}), { readBase: hadIt }), ["tooling/versions.json is gone, so the versions it holds cannot be checked"]);
});

test("VG-28 a product marker lets through the product constant and nothing else", () => {
  const PRODUCT = "apps/local-host/src/product-version.ts", MARKER = "/* @version product.release */";
  assert.deepEqual(sourceVersionProblems(PRODUCT, `export const PRODUCT_VERSION = ${MARKER} "0.1.0";`), []);
  const refused: Array<[string, string, string]> = [
    ["packages/a/src/a.ts", `const OTHER_VERSION = ${MARKER} 9;`, "OTHER_VERSION = 9"],
    ["packages/a/src/a.ts", `const OTHER_VERSION = ${MARKER} "0.1.0";`, 'OTHER_VERSION = "0.1.0"'],
    ["packages/a/src/a.ts", `const PRODUCT_VERSION = ${MARKER} "0.1.0";`, 'PRODUCT_VERSION = "0.1.0"'],
    [PRODUCT, `const OTHER_VERSION = ${MARKER} "0.1.0";`, 'OTHER_VERSION = "0.1.0"'],
    [PRODUCT, `export const PRODUCT_VERSION = ${MARKER} 9;`, "PRODUCT_VERSION = 9"],
    [PRODUCT, 'export const PRODUCT_VERSION = "0.1.0";', 'PRODUCT_VERSION = "0.1.0"'],
    [PRODUCT, 'export const PRODUCT_VERSION = /* @version format.other */ "0.1.0";', 'PRODUCT_VERSION = "0.1.0"'],
    [PRODUCT, `export const PRODUCT_VERSION = // ${MARKER}\n"0.1.0";`, 'PRODUCT_VERSION = "0.1.0"'],
  ];
  for (const [file, source, found] of refused) assert.deepEqual(sourceVersionProblems(file, source), [`${file}: ${found} (expected 1)`], source);
});

test("VG-29 the test boundary is the package: `src/fixtures` and `src/tests` ship, so their constants are checked", () => {
  const raised = (name: string) => `const ${name}_VERSION = 2;`;
  const problems = versionOriginProblems(snapshotOf({
    "packages/a/src/fixtures/shipped.ts": raised("FIXTURE"),
    "packages/a/src/tests/shipped.ts": raised("TESTS"),
    "plugins/native/x/src/fixtures/shipped.ts": raised("PLUGIN"),
    "tooling/plugin-cli/src/cli.ts": raised("CLI"),
    "packages/a/tests/frozen.ts": raised("A"),
    "packages/a/test/frozen.ts": raised("B"),
    "packages/a/fixtures/frozen.ts": raised("C"),
    "plugins/native/x/tests/frozen.ts": raised("D"),
    "packages/a/tests/frozen.test.ts": raised("E"),
    "tooling/other/src/not-a-root.ts": raised("F"),
  }));
  assert.deepEqual(problems, [
    "packages/a/src/fixtures/shipped.ts: FIXTURE_VERSION = 2 (expected 1)",
    "packages/a/src/tests/shipped.ts: TESTS_VERSION = 2 (expected 1)",
    "plugins/native/x/src/fixtures/shipped.ts: PLUGIN_VERSION = 2 (expected 1)",
    "tooling/plugin-cli/src/cli.ts: CLI_VERSION = 2 (expected 1)",
    "packages/a/test/frozen.ts: B_VERSION = 2 (expected 1)",
  ]);
});

test("VG-39 a test file outside a `tests/` or `fixtures/` directory is checked as before the shared boundary", () => {
  const raised = (name: string) => `const ${name}_VERSION = 2;`;
  const problems = versionOriginProblems(snapshotOf({
    "apps/sync-worker/feed.test.mjs": raised("WORKER"),
    "apps/sync-worker/test.mjs": raised("RUNNER"),
    "apps/workbench/tooling/client-literals.test.mjs": raised("TOOLING"),
    "packages/a/src/frozen.test.ts": raised("SPEC"),
  }));
  assert.deepEqual(problems, [
    "apps/sync-worker/feed.test.mjs: WORKER_VERSION = 2 (expected 1)",
    "apps/sync-worker/test.mjs: RUNNER_VERSION = 2 (expected 1)",
    "apps/workbench/tooling/client-literals.test.mjs: TOOLING_VERSION = 2 (expected 1)",
    "packages/a/src/frozen.test.ts: SPEC_VERSION = 2 (expected 1)",
  ]);
  // Over this repository: every file the gate checked at #1934 (its rule copied here) it still checks.
  const before = (file: string) => /^(?:apps|packages|plugins|modules|server|horizontal)\//.test(file) && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) && !/(?:^|\/)(?:tests|fixtures)\//.test(file);
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: new URL("../", import.meta.url), encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  assert.deepEqual(files.filter(before).filter(file => !isCheckedSource(file)), []);
});

const scratchRepository = (t: { after: (cleanup: () => void) => void }, texts: Record<string, string>, untracked: Record<string, string> = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), "molis-initial-versions-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  for (const [file, text] of Object.entries(texts)) put(file, text);
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  for (const [file, text] of Object.entries(untracked)) put(file, text);
  return root;
};
const TABLES = { "tooling/versions.json": JSON.stringify({ versions: {} }), "tooling/gates/version-exceptions.json": "[]" };
const NOTHING_RUNNING = async () => ({ manifests: [], hostViews: [], registrations: [] });

test("VG-30 the whole check reads the tracked source, the two tables and the running Host, and finds every violation", async (t) => {
  assert.deepEqual(await checkRepository(scratchRepository(t, { ...TABLES, "packages/a/src/a.ts": "const A_VERSION = 1;" }), NOTHING_RUNNING), []);
  const root = scratchRepository(t, {
    "tooling/versions.json": JSON.stringify({ versions: { "prompt.a.b": 2, "method.a": 2, "database.ledger_baseline": 2 } }),
    "apps/local-host/src/onboarding.ts": "const ONBOARDING_SCHEMA_VERSION = 2;\nconst ONBOARDING_UPGRADES = [{ from: 1, transform: (value) => value }];",
    "tooling/gates/version-exceptions.json": JSON.stringify([{ file: "packages/a/src/excepted.ts", name: "EXCEPTED_VERSION", values: { 5: 1 }, reason: "an upstream's" }]),
    "packages/a/src/marked.ts": "const OTHER_VERSION = /* @version product.release */ 9;",
    "packages/a/src/fixtures/shipped.ts": "const SHIPPED_VERSION = 2;",
    "packages/a/src/excepted.ts": "const EXCEPTED_VERSION = 5;",
    "packages/a/tests/frozen.ts": "const FROZEN_VERSION = 2;",
  }, { "packages/a/src/untracked.ts": "const UNTRACKED_VERSION = 2;" });
  const problems = await checkRepository(root, async () => ({
    manifests: [{ plugin_id: "notes", schema_version: 2, host_api_version: 1, actions: [{ capability_id: "notes.read", version: 2 }] }],
    hostViews: [{ provider: { provider_id: "system.home" }, capability_id: "home.read", version: 2 }],
    registrations: [{ owner_id: "assistant", prompts: [{ prompt_id: "work", version: 2 }], roles: [] }],
  }));
  assert.deepEqual(problems, [
    "assistant: prompt work = 2 (expected 1)",
    "notes: Manifest schema_version = 2 (expected 1)",
    "notes: action notes.read = 2 (expected 1)",
    "system.home: action home.read = 2 (expected 1)",
    "tooling/versions.json: database.ledger_baseline = 2 (expected 1)",
    "tooling/versions.json: method method.a = 2 (expected 1)",
    "tooling/versions.json: prompt prompt.a.b = 2 (expected 1)",
    "apps/local-host/src/onboarding.ts: ONBOARDING_SCHEMA_VERSION = 2 (expected 1)",
    "apps/local-host/src/onboarding.ts: ONBOARDING_UPGRADES must be empty during pre-development (expected [])",
    "packages/a/src/fixtures/shipped.ts: SHIPPED_VERSION = 2 (expected 1)",
    "packages/a/src/marked.ts: OTHER_VERSION = 9 (expected 1)",
  ]);
});

test("VG-31 the whole check does not pass a repository whose tables it cannot read", async (t) => {
  await assert.rejects(checkRepository(scratchRepository(t, { "tooling/gates/version-exceptions.json": "[]" }), NOTHING_RUNNING), /versions\.json/);
  await assert.rejects(checkRepository(scratchRepository(t, { "tooling/versions.json": "{}" }), NOTHING_RUNNING), /version-exceptions\.json/);
  await assert.rejects(checkRepository(scratchRepository(t, { ...TABLES, "tooling/versions.json": '{ "versions": { "prompt.a": 1, "prompt.a": 2 } }' }), NOTHING_RUNNING), /prompt\.a appears twice/);
});

test("pre-dev v1 guard: the half with no build passes on this repository as it stands", () => {
  const root = new URL("../", import.meta.url);
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  const read = (file: string) => { try { return readFileSync(new URL(file, root), "utf8"); } catch { return null; } };
  assert.deepEqual(versionOriginProblems({ files, read }), []);
});
