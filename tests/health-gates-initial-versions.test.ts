import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PERSISTENT_DEFINITIONS, initialVersionProblems, sourceVersionProblems, upgradeStepProblems } from "../scripts/gates/initial-versions.mjs";

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
  assert.equal(PERSISTENT_DEFINITIONS.length, 9);
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

test("UPG1-i-initial-09: the step rule is from 1 to version - 1, each once", () => {
  assert.deepEqual(upgradeStepProblems(1, []), []);
  assert.deepEqual(upgradeStepProblems(2, [1]), []);
  assert.deepEqual(upgradeStepProblems(2, []), ["no step from 1"]);
  assert.deepEqual(upgradeStepProblems(1, [1]), ["a step from 1, outside 1 to 0"]);
});
