import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PERSISTENT_DEFINITIONS, PERSISTENT_ENTRY_KEYS, PERSISTENT_FORMAT_ENTRIES, goldenFormatVersions, initialVersionProblems, registeredUpgradeChains, sourceVersionProblems, upgradeStepProblems, versionOriginProblems } from "../scripts/gates/initial-versions.mjs";
import { PERSISTENT_FORMAT_LOCATIONS } from "../scripts/golden/formats.mjs";

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
  // A golden records each one under its version entry, so the entry is the one its definition carries, and the golden knows where it sits.
  for (const definition of PERSISTENT_DEFINITIONS) {
    const [file, name] = definition.split("#") as [string, string], entry = PERSISTENT_FORMAT_ENTRIES[definition];
    assert.ok(entry, `${definition} names its entry`);
    if (!(entry in PERSISTENT_ENTRY_KEYS)) assert.match(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), new RegExp(`\\b${name} = /\\* @version ${entry.replace(/\./gu, "\\.")}\\b`), `${definition} carries ${entry}`);
  }
  assert.deepEqual(Object.keys(PERSISTENT_FORMAT_LOCATIONS).sort(), Object.values(PERSISTENT_FORMAT_ENTRIES).sort(), "scripts/golden/formats.mjs says where each one sits in a Home, or why a golden cannot hold it");
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
  ["apps/local-host/src/onboarding.ts", "ONBOARDING_SCHEMA_VERSION", "format.home.onboarding"],
  ["apps/local-host/src/project-arrival.ts", "PROJECT_ARRIVAL_SCHEMA_VERSION", "format.project.arrival"],
  ["apps/local-host/src/browser/browser-surfaces.ts", "BROWSER_SITES_VERSION", "format.browser.site-decisions"],
  ["apps/local-host/src/computer/computer-settings.ts", "COMPUTER_SETTINGS_VERSION", "format.computer.settings"],
  ["apps/local-host/src/computer/computer-records.ts", "COMPUTER_RECORD_VERSION", "format.computer.record"],
  ["apps/local-host/src/model-configuration.ts", "MODEL_PREFERENCE_SCHEMA_VERSION", "format.model.preference"],
] as const;
const inspectEntries = (versionEntries: Record<string, number>, chains?: Map<string, unknown>) =>
  initialVersionProblems({ manifests: [], hostViews: [], registrations: [], versionEntries, ...(chains ? { chains } : {}) });

test("UPG1-i-initial-11: the six files of design §2.6 at 2 fail with no chain and pass only with a consecutive chain and a passed replay", () => {
  for (const [file, name, tag] of CHAIN_FILES) {
    const definition = `${file}#${name}`, source = (version: number) => `const ${name} = /* @version ${tag} */ ${version};`;
    assert.deepEqual(sourceVersionProblems(file, source(1)), [], `${name} at 1 needs no chain`);
    assert.deepEqual(sourceVersionProblems(file, source(2)), [`${definition} = 2 (expected 1; above 1 it needs a registered upgrade chain and a replay that passed)`]);
    const withChain = (froms: number[], replay_passed: boolean) => sourceVersionProblems(file, source(2), new Map([[definition, { version: 2, froms, replay_passed }]]));
    assert.deepEqual(withChain([1], true), [], `${name}: a consecutive chain with a passed replay`);
    assert.equal(withChain([], true).length, 1, `${name}: a chain with a gap`);
    assert.equal(withChain([1], false).length, 1, `${name}: a replay that did not pass`);
    assert.ok(PERSISTENT_DEFINITIONS.includes(definition), `${definition} is on the list`);
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
  const ledger = "apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE";
  const raised = { "tooling/versions.json": versions({ "database.ledger_baseline": 2 }) };
  assert.match(inspect(raised)[0]!, /installed-plugin-libraries\.ts#LEDGER_BASELINE = 2 .*registered upgrade chain/);
  assert.deepEqual(inspect(raised, { chains: new Map([[ledger, { version: 2, froms: [1], replay_passed: true }]]) }), []);
  const excepted = JSON.stringify([{ file: "packages/a/src/a.ts", name: "A_VERSION", reason: "x" }]);
  assert.deepEqual(inspect({ "packages/a/src/a.ts": "const A_VERSION = 2;", "tooling/gates/version-exceptions.json": excepted }), [], "the exceptions of the repository it reads, not of this one");
});

test("UPG1-12: the register is read from the definition's own file: its steps beside it, or in its baseline. What cannot be read exactly is no chain", () => {
  const catalog = "apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION", file = catalog.split("#")[0]!;
  const ledger = "apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE", ledgerFile = ledger.split("#")[0]!;
  const chainsOf = (texts: Record<string, string>) => registeredUpgradeChains({ read: (name: string) => texts[name] ?? null });
  assert.deepEqual(chainsOf({ [file]: "export const CATALOG_SCHEMA_VERSION = 3;\nexport const CATALOG_UPGRADES: readonly SqliteUpgradeStep[] = [{ from: 1, sql: `x` }, { from: 2, run: () => {} }];" }).get(catalog),
    { version: 3, froms: [1, 2], replay_passed: false, unheld: [1, 2] });
  assert.deepEqual(chainsOf({ [ledgerFile]: "const LEDGER_BASELINE: SqliteBaseline = { version: 2, schema: ``, upgrades: [{ from: 1, sql: `x` }] };" }).get(ledger),
    { version: 2, froms: [1], replay_passed: false, unheld: [1] });
  assert.deepEqual(chainsOf({ [ledgerFile]: "const STEPS = [{ from: 1, sql: `x` }];\nconst LEDGER_BASELINE = { version: 2, schema: ``, upgrades: STEPS } satisfies SqliteBaseline;" }).get(ledger),
    { version: 2, froms: [1], replay_passed: false, unheld: [1] });
  assert.equal(chainsOf({ [file]: "const CATALOG_SCHEMA_VERSION = 2;\nconst CATALOG_UPGRADES = [...older];" }).has(catalog), false, "a spread");
  assert.equal(chainsOf({ [file]: "const CATALOG_SCHEMA_VERSION = 2;\nconst CATALOG_UPGRADES = [{ from: FIRST }];" }).has(catalog), false, "a computed from");
  assert.equal(chainsOf({ [file]: "const CATALOG_SCHEMA_VERSION = 2;" }).has(catalog), false, "no steps");
  assert.equal(chainsOf({ [ledgerFile]: "const LEDGER_BASELINE = { version: CURRENT, schema: `` };" }).has(ledger), false, "a version that is not a number");
});

test("UPG1-12: steps alone do not raise a persistent format: with no golden that holds the old version, what is above 1 fails, and here it reaches the rule", () => {
  const file = "apps/local-host/src/project-catalog-contract.ts", text = "export const CATALOG_SCHEMA_VERSION = 2;\nexport const CATALOG_UPGRADES = [{ from: 1, sql: `x` }];";
  const snapshot = snapshotOf({ [file]: text });
  const problems = versionOriginProblems(snapshot, { chains: registeredUpgradeChains(snapshot) });
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0]!, /^apps\/local-host\/src\/project-catalog-contract\.ts#CATALOG_SCHEMA_VERSION = 2: the replay of its upgrade chain did not pass: no golden Home under tests\/fixtures\/golden-homes\/ holds it at 1,/u);
});

// U2-d (the coordinator 2026-11-08, upgrade-chain-design §11.1): the replay is the `golden-replay` job, which `Verify` requires; what the half
// with no build checks is that the goldens hold the format at every older version, read from their manifests' `formats` by version entry.
const CATALOG_FILE = "apps/local-host/src/project-catalog-contract.ts";
const catalogTo = (version: number) => ({ [CATALOG_FILE]: `export const CATALOG_SCHEMA_VERSION = ${version};\nexport const CATALOG_UPGRADES = [${Array.from({ length: version - 1 }, (_, i) => `{ from: ${i + 1}, sql: \`x\` }`).join(", ")}];` });
const goldenAt = (formats: Array<{ entry: string; version: number; path?: string }>) => JSON.stringify({ formats: formats.map(item => ({ path: "projects/catalog.db", ...item })) });
const raisedWith = (texts: Record<string, string>) => { const tree = snapshotOf(texts); return versionOriginProblems(tree, { chains: registeredUpgradeChains(tree) }); };

test("UPG1-i-initial-16: a persistent format above 1 passes when the goldens hold it at every older version, in one golden or several", () => {
  assert.deepEqual(raisedWith({ ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 1 }]) }), []);
  assert.deepEqual(raisedWith({ ...catalogTo(3), "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 1 }]),
    "tests/fixtures/golden-homes/0.2.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 2 }]) }), []);
  assert.deepEqual(raisedWith({ ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 1, path: "spaces/space_1/projects/catalog.db" }]) }), [], "the account Home's copy counts");
});

test("UPG1-i-initial-17: no golden, a golden with only some of the older versions, or one that holds another format, does not let it through", () => {
  const cases: Array<[string, Record<string, string>, RegExp]> = [
    ["no golden", catalogTo(3), /holds it at 1, 2,/u],
    ["only some older versions", { ...catalogTo(3), "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 1 }]) }, /holds it at 2,/u],
    ["another format at those versions", { ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "format.shelf.catalog", version: 1 }]) }, /holds it at 1,/u],
    ["the same format at another version", { ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 2 }]) }, /holds it at 1,/u],
    ["a manifest it cannot read", { ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/manifest.json": "{ not json" }, /holds it at 1,/u],
    ["a library recorded only as a store, not as a format", { ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/manifest.json": JSON.stringify({ stores: [{ path: "projects/catalog.db", schema_version: 1 }] }) }, /holds it at 1,/u],
    ["a manifest that is not a golden's own", { ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/copy/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 1 }]) }, /holds it at 1,/u],
    ["a version that is not a whole number", { ...catalogTo(2), "tests/fixtures/golden-homes/0.1.0/manifest.json": JSON.stringify({ formats: [{ entry: "database.home.catalog", version: "1" }] }) }, /holds it at 1,/u],
  ];
  for (const [name, texts, pattern] of cases) {
    const problems = raisedWith(texts);
    assert.equal(problems.length, 1, `${name}: ${problems.join("; ")}`);
    assert.match(problems[0]!, /CATALOG_SCHEMA_VERSION = \d: the replay of its upgrade chain did not pass: no golden Home/u, name);
    assert.match(problems[0]!, pattern, name);
  }
  // The steps are still checked on their own: a golden does not make up for a missing one.
  const gap = raisedWith({ [CATALOG_FILE]: "export const CATALOG_SCHEMA_VERSION = 2;\nexport const CATALOG_UPGRADES = [];", "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 1 }]) });
  assert.deepEqual(gap, [`${CATALOG_FILE}#CATALOG_SCHEMA_VERSION = 2: the registered upgrade chain has no step from 1`]);
});

test("UPG1-i-initial-18: the goldens' formats are read by version entry, and only from a golden's own manifest", () => {
  const held = goldenFormatVersions(snapshotOf({
    "tests/fixtures/golden-homes/0.1.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 1 }, { entry: "format.home.onboarding", version: 1, path: "config/onboarding.json" }]),
    "tests/fixtures/golden-homes/0.2.0/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 2 }]),
    "tests/fixtures/golden-homes/0.2.0/files/manifest.json": goldenAt([{ entry: "database.home.catalog", version: 9 }]),
  }));
  assert.deepEqual([...held.get("database.home.catalog")!].sort(), [1, 2]);
  assert.deepEqual([...held.get("format.home.onboarding")!], [1]);
});

test("UPG1-i-initial-15: a table it cannot read, or one this repository had and lost, is a problem and not a pass", () => {
  assert.match(versionOriginProblems(snapshotOf({ "tooling/versions.json": "{" }))[0]!, /tooling\/versions\.json cannot be read/);
  assert.match(versionOriginProblems(snapshotOf({ "tooling/gates/version-exceptions.json": "{" }))[0]!, /version-exceptions\.json cannot be read/);
  const hadIt = (file: string) => (file === "tooling/versions.json" ? "{}" : "");
  assert.deepEqual(versionOriginProblems(snapshotOf({}), { readBase: hadIt }), ["tooling/versions.json is gone, so the versions it holds cannot be checked"]);
});

test("UPG1-i-initial-09: the step rule is from 1 to version - 1, each once", () => {
  assert.deepEqual(upgradeStepProblems(1, []), []);
  assert.deepEqual(upgradeStepProblems(2, [1]), []);
  assert.deepEqual(upgradeStepProblems(2, []), ["no step from 1"]);
  assert.deepEqual(upgradeStepProblems(1, [1]), ["a step from 1, outside 1 to 0"]);
});
