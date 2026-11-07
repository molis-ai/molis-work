import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PERSISTENT_DEFINITIONS, PERSISTENT_ENTRY_KEYS, checkRepository, initialVersionProblems, isCheckedSource, sourceVersionProblems, upgradeStepProblems, versionOriginProblems } from "../scripts/gates/initial-versions.mjs";

test("U0-03: an active registration cannot hide a later action, manifest, role, prompt, instruction or method version", () => {
  const agent = {
    roles: [{ role_id: "parent", version: 1 }], prompts: [{ prompt_id: "base", version: 1 }],
    subagents: { roles: [{ role_id: "child", version: 1 }] },
  };
  const manifest = { plugin_id: "notes", schema_version: 1, host_api_version: 1, agent, actions: [{ capability_id: "notes.read", version: 1 }], methods: [{ skill_id: "notes-tidy", version: 1 }] };
  const view = { provider: { provider_id: "system.home" }, capability_id: "home.read", version: 1 };
  const registration = { owner_id: "assistant", prompts: [{ prompt_id: "work", version: 1 }], roles: [{ role_id: "system", version: 1 }] };
  const versionEntries = { "prompt.notes.summarize": 1, "method.goals.work-build-change": 1, "action.notes.read": 1 };
  const inspect = () => initialVersionProblems({ manifests: [manifest], hostViews: [view], registrations: [registration], versionEntries });
  assert.deepEqual(inspect(), []);
  const mutations: Array<[string, (version: number) => void]> = [
    ["schema_version", value => { manifest.schema_version = value; }],
    ["host_api_version", value => { manifest.host_api_version = value; }],
    ["notes.read", value => { manifest.actions[0]!.version = value; }],
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

// specs/upgrade-continuity/upgrade-chain-design.md §11.1: a persistent format above 1 is let through by a registered chain with
// consecutive steps and a replay that passed; nothing else ever is. The rebuild window needs none of this while everything is 1.
const CATALOG = "apps/local-host/src/project-catalog-contract.ts";
const CATALOG_CONSTANT = `${CATALOG}#CATALOG_SCHEMA_VERSION`;
const catalogAt = (version: number) => `export const CATALOG_SCHEMA_VERSION = /* @version database.home.catalog */ ${version};`;
const chain = (fields: Record<string, unknown> = {}) => new Map([[CATALOG_CONSTANT, { version: 3, froms: [1, 2], replay_passed: true, ...fields }]]);

test("UPG1-i-initial-01: at 1 a persistent format needs no chain, marker or not, number or text", () => {
  assert.deepEqual(sourceVersionProblems(CATALOG, catalogAt(1)), []);
  assert.deepEqual(sourceVersionProblems("packages/storage/src/adapters/text-search-index.ts", 'const SCHEMA_VERSION = /* @version database.search.text-index "{version}" */ "1";'), []);
});

test("UPG1-i-initial-02: above 1 with no registered chain fails, and says what it needs", () => {
  const problems = sourceVersionProblems(CATALOG, catalogAt(2));
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /CATALOG_SCHEMA_VERSION = 2 .*registered upgrade chain and a replay that passed/);
  assert.equal(sourceVersionProblems("packages/storage/src/adapters/text-search-index.ts", 'const SCHEMA_VERSION = "2";').length, 1, "a version kept as text is the same");
});

test("UPG1-i-initial-03: a consecutive chain with a passed replay lets it through", () => {
  assert.deepEqual(sourceVersionProblems(CATALOG, catalogAt(3), chain()), []);
  assert.deepEqual(sourceVersionProblems(CATALOG, catalogAt(3), chain({ froms: [2, 1] })), [], "the order they are listed in does not matter");
});

test("UPG1-i-initial-04: each way the chain falls short fails on its own", () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    ["a gap", { froms: [2] }, /has no step from 1/],
    ["a repeated step", { froms: [1, 1, 2] }, /has 2 steps from 1/],
    ["a step past the end", { froms: [1, 2, 3] }, /a step from 3, outside 1 to 2/],
    ["a step from zero", { froms: [0, 1, 2] }, /a step from 0, outside 1 to 2/],
    ["a chain to another version", { version: 4, froms: [1, 2, 3] }, /chain goes to 4/],
    ["a replay that failed", { replay_passed: false }, /replay of its upgrade chain did not pass/],
    ["a replay with no result", { replay_passed: undefined }, /replay of its upgrade chain did not pass/],
    ["a replay result that is not true", { replay_passed: "yes" }, /replay of its upgrade chain did not pass/],
  ];
  for (const [name, fields, pattern] of cases) {
    const problems = sourceVersionProblems(CATALOG, catalogAt(3), chain(fields));
    assert.equal(problems.length, 1, `${name}: ${problems.join("; ")}`);
    assert.match(problems[0]!, pattern, name);
  }
});

test("UPG1-i-initial-05: a chain lets through nothing but its own persistent format", () => {
  const anyChain = new Map(["apps/local-host/src/plugin-builder/catalog.ts#CATALOG_VERSION", "plugins/x/src/store.ts#STORED_VERSION", `${CATALOG}#OTHER_VERSION`]
    .map(definition => [definition, { version: 2, froms: [1], replay_passed: true }]));
  assert.equal(sourceVersionProblems("apps/local-host/src/plugin-builder/catalog.ts", 'const CATALOG_VERSION = "actions/2";', anyChain).length, 1, "the same name in another file is not the Shelf catalog");
  assert.equal(sourceVersionProblems("plugins/x/src/store.ts", "const STORED_VERSION = 2;", anyChain).length, 1, "a constant not on the list");
  assert.equal(sourceVersionProblems(CATALOG, "const OTHER_VERSION = 2;", anyChain).length, 1, "another constant in a listed file");
  const manifest = { plugin_id: "notes", schema_version: 2, host_api_version: 2, actions: [{ capability_id: "notes.read", version: 2 }] };
  const problems = initialVersionProblems({ manifests: [manifest], hostViews: [], registrations: [], chains: anyChain });
  assert.equal(problems.length, 3, "actions and Manifests never go through a chain");
});

test("UPG1-i-initial-06: a computed version or a chain for a lower one is not a way through", () => {
  assert.equal(sourceVersionProblems(CATALOG, "export const CATALOG_SCHEMA_VERSION = compute();", chain()).length, 1);
  assert.equal(sourceVersionProblems(CATALOG, "export const CATALOG_SCHEMA_VERSION = 0;", chain()).length, 1);
  assert.equal(sourceVersionProblems(CATALOG, "export const CATALOG_SCHEMA_VERSION = 2.5;", chain()).length, 1);
});

test("UPG1-i-initial-07: the two ledgers and Jelly's schema_version are no constants, and go by their version entries the same way", () => {
  const inspect = (versionEntries: Record<string, number>, chains?: Map<string, unknown>) => initialVersionProblems({ manifests: [], hostViews: [], registrations: [], versionEntries, ...(chains ? { chains } : {}) });
  assert.deepEqual(inspect({ "database.ledger_baseline": 1, "database.memory_ledger_baseline": 1, "format.jelly.workspace": 1 }), []);
  assert.match(inspect({ "database.memory_ledger_baseline": 2 })[0]!, /memory-ledger\.ts#MEMORY_LEDGER_BASELINE = 2 .*registered upgrade chain/);
  assert.match(inspect({ "database.ledger_baseline": 2 })[0]!, /installed-plugin-libraries\.ts#LEDGER_BASELINE = 2 .*registered upgrade chain/);
  assert.match(inspect({ "format.jelly.workspace": 2 })[0]!, /jelly\/src\/contract\.ts#schema_version = 2 .*registered upgrade chain/);
  const jelly = "plugins/native/jelly/src/contract.ts#schema_version";
  assert.deepEqual(inspect({ "format.jelly.workspace": 2 }, new Map([[jelly, { version: 2, froms: [1], replay_passed: true }]])), []);
  assert.equal(inspect({ "format.jelly.workspace": 2 }, new Map([[jelly, { version: 2, froms: [], replay_passed: true }]])).length, 1);
  assert.deepEqual(inspect({ "database.other_baseline": 2 }), [], "other baselines stay with scripts/verify-release-versions.mjs");
});

test("UPG1-i-initial-08: every persistent format named here is still where it says, so moving one cannot lose it", () => {
  for (const definition of PERSISTENT_DEFINITIONS) {
    const [file, name] = definition.split("#") as [string, string];
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), new RegExp(`\\b${name}\\b`), definition);
  }
  for (const [key, definition] of Object.entries(PERSISTENT_ENTRY_KEYS)) {
    const [file] = definition.split("#") as [string];
    assert.ok(readFileSync(new URL(`../${file}`, import.meta.url), "utf8").includes(`/* @version ${key} */`), `${file} carries ${key}`);
  }
  assert.equal(PERSISTENT_DEFINITIONS.length, 15);
});

test("UPG1-i-initial-10: a payload version kept in a row is no persistent format, so a chain does not let it above 1", () => {
  const stored = [
    ["plugins/native/coding/src/plans.ts", "CODING_PLAN_SCHEMA_VERSION"],
    ["plugins/native/feed/src/identity.ts", "FEED_CAPTURE_SCHEMA_VERSION"],
    ["plugins/official-integrations/gmail/src/history-cursor.ts", "GMAIL_LIVE_CURSOR_VERSION"],
    ["plugins/native/pages/src/contract.ts", "PAGES_ARTIFACT_SCHEMA_VERSION"],
  ];
  for (const [file, name] of stored) {
    const chain = new Map([[`${file}#${name}`, { version: 2, froms: [1], replay_passed: true }]]);
    const problems = sourceVersionProblems(file!, `const ${name} = 2;`, chain);
    assert.deepEqual(problems, [`${file}: ${name} = 2 (expected 1)`]);
  }
});

const CHAIN_FILES = [
  ["format.home.onboarding", "apps/local-host/src/onboarding.ts#schema_version"],
  ["format.project.arrival", "apps/local-host/src/project-arrival.ts#schema_version"],
  ["format.browser.site-decisions", "apps/local-host/src/browser/browser-surfaces.ts#version"],
  ["format.computer.settings", "apps/local-host/src/computer/computer-settings.ts#version"],
  ["format.computer.record", "apps/local-host/src/computer/computer-records.ts#version"],
  ["format.model.preference", "apps/local-host/src/model-configuration.ts#schema_version"],
] as const;
const inspectEntries = (versionEntries: Record<string, number>, chains?: Map<string, unknown>) =>
  initialVersionProblems({ manifests: [], hostViews: [], registrations: [], versionEntries, ...(chains ? { chains } : {}) });

test("UPG1-i-initial-11: the six files of design §2.6 at 2 fail with no chain and pass only with a consecutive chain and a passed replay", () => {
  for (const [key, definition] of CHAIN_FILES) {
    assert.deepEqual(inspectEntries({ [key]: 1 }), [], `${key} at 1 needs no chain`);
    assert.deepEqual(inspectEntries({ [key]: 2 }), [`${definition} = 2 (expected 1; above 1 it needs a registered upgrade chain and a replay that passed)`]);
    const withChain = (froms: number[], replay_passed: boolean) => inspectEntries({ [key]: 2 }, new Map([[definition, { version: 2, froms, replay_passed }]]));
    assert.deepEqual(withChain([1], true), [], `${key}: a consecutive chain with a passed replay`);
    assert.equal(withChain([], true).length, 1, `${key}: a chain with a gap`);
    assert.equal(withChain([1], false).length, 1, `${key}: a replay that did not pass`);
  }
});

test("UPG1-i-initial-12: the machine receipt stays out of the list, as design §2.6 says", () => {
  const definitions = new Set<string>(PERSISTENT_DEFINITIONS);
  assert.ok(!definitions.has("apps/local-host/src/installer/web-service-contract.ts#schema_version"));
  assert.deepEqual(inspectEntries({ "format.web.service.receipt": 2 }), []);
});

const snapshotOf = (texts: Record<string, string>) => ({ files: Object.keys(texts), read: (file: string) => texts[file] ?? null });

test("UPG1-i-initial-13: the half with no build passes on this repository as it stands", () => {
  const root = new URL("../", import.meta.url);
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  const read = (file: string) => { try { return readFileSync(new URL(file, root), "utf8"); } catch { return null; } };
  assert.deepEqual(versionOriginProblems({ files, read }), []);
});

test("UPG1-i-initial-14: the half with no build finds a constant and a persistent format, leaves prompts and methods, keeps an exception, and passes a chain", () => {
  const versions = (entries: Record<string, number>) => JSON.stringify({ versions: entries });
  const inspect = (texts: Record<string, string>, options?: Parameters<typeof versionOriginProblems>[1]) => versionOriginProblems(snapshotOf(texts), options);
  assert.deepEqual(inspect({ "packages/a/src/a.ts": "const A_VERSION = 1;" }), [], "a repository with no tables");
  assert.deepEqual(inspect({ "packages/a/src/a.ts": "const A_VERSION = 2;" }), ["packages/a/src/a.ts: A_VERSION = 2 (expected 1)"]);
  assert.deepEqual(inspect({ "packages/a/tests/a.ts": "const A_VERSION = 2;", "docs/a.ts": "const A_VERSION = 2;" }), [], "outside the checked source");
  // A prompt or method goes up when its text changes (tests/prompt-registration.test.ts); only the hand-run half holds them at 1 (U0-03).
  assert.deepEqual(inspect({ "tooling/versions.json": versions({ "prompt.a.b": 2, "method.a": 2, "role.a": 2 }) }), [], "not data files, so not this half");
  const onboarding = "apps/local-host/src/onboarding.ts#schema_version";
  const raised = { "tooling/versions.json": versions({ "format.home.onboarding": 2 }) };
  assert.match(inspect(raised)[0]!, /onboarding\.ts#schema_version = 2 .*registered upgrade chain/);
  assert.deepEqual(inspect(raised, { chains: new Map([[onboarding, { version: 2, froms: [1], replay_passed: true }]]) }), []);
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

// The whole check over a tracked repository, with the running Host's half handed in: this job has no build, and
// tests/initial-versions-check.test.ts runs the script itself against the real build.
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

test("VG-30 the whole check reads the tracked source, the two tables and the running Host, and finds what each of them holds", async (t) => {
  assert.deepEqual(await checkRepository(scratchRepository(t, { ...TABLES, "packages/a/src/a.ts": "const A_VERSION = 1;" }), NOTHING_RUNNING), []);
  const root = scratchRepository(t, {
    "tooling/versions.json": JSON.stringify({ versions: { "prompt.a.b": 2, "method.a": 2, "format.home.onboarding": 2 } }),
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
    "apps/local-host/src/onboarding.ts#schema_version = 2 (expected 1; above 1 it needs a registered upgrade chain and a replay that passed)",
    "assistant: prompt work = 2 (expected 1)",
    "notes: Manifest schema_version = 2 (expected 1)",
    "notes: action notes.read = 2 (expected 1)",
    "system.home: action home.read = 2 (expected 1)",
    "tooling/versions.json: method method.a = 2 (expected 1)",
    "tooling/versions.json: prompt prompt.a.b = 2 (expected 1)",
    "packages/a/src/fixtures/shipped.ts: SHIPPED_VERSION = 2 (expected 1)",
    "packages/a/src/marked.ts: OTHER_VERSION = 9 (expected 1)",
  ]);
});

test("VG-31 the whole check does not pass a repository whose tables it cannot read", async (t) => {
  await assert.rejects(checkRepository(scratchRepository(t, { "tooling/gates/version-exceptions.json": "[]" }), NOTHING_RUNNING), /versions\.json/);
  await assert.rejects(checkRepository(scratchRepository(t, { "tooling/versions.json": "{}" }), NOTHING_RUNNING), /version-exceptions\.json/);
  await assert.rejects(checkRepository(scratchRepository(t, { ...TABLES, "tooling/versions.json": '{ "versions": { "prompt.a": 1, "prompt.a": 2 } }' }), NOTHING_RUNNING), /prompt\.a appears twice/);
});

test("UPG1-i-initial-09: the step rule is from 1 to version - 1, each once", () => {
  assert.deepEqual(upgradeStepProblems(1, []), []);
  assert.deepEqual(upgradeStepProblems(2, [1]), []);
  assert.deepEqual(upgradeStepProblems(2, []), ["no step from 1"]);
  assert.deepEqual(upgradeStepProblems(1, [1]), ["a step from 1, outside 1 to 0"]);
});
