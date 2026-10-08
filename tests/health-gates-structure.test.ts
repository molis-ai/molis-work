import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// specs/repository-anti-corruption W1-05 (scripts/gates/*.mjs): the structure gates are numbers compared with the merge-base,
// so a pull request cannot widen them by rewriting tooling/gates/baseline.json. As in tests/health-gates-merge-base.test.ts,
// each rule is mutation-verified on a small scratch repository: one violation added on a branch makes `--base main` fail,
// `--update` on that branch neither makes it pass nor is accepted when it is given the merge-base, and what the rule must
// NOT flag stays green.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const pad = (lines: number, indent = "  ") => Array.from({ length: lines }, (_, index) => `${indent}// filler ${index}\n`).join("");
// A function of exactly `lines` lines (the contracts helper limit is 20).
const helper = (name: string, lines: number) => `export function ${name}() {\n${pad(lines - 3)}  return 1;\n}\n`;
const manifest = (name: string) => JSON.stringify({ name }, null, 2) + "\n";

// The fixture mimics the parts of the repository the gates read. Plugins: one (build-time, Host files named for it), two
// (started by the Runtime), artifacts (the Host files say "artifact"). Everything it contains is the baseline.
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-structure-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 2000, classLines: 2000, classMethods: 200, functionLines: 2000, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  for (const name of ["one", "two", "artifacts"]) {
    put(`plugins/native/${name}/package.json`, manifest(`@fx/plugin-${name}`));
    put(`plugins/native/${name}/src/index.ts`, `export const ${name} = 1;\n`);
  }
  put("package.json", JSON.stringify({ name: "fx", dependencies: { "@fx/plugin-one": "1", "@fx/plugin-two": "1" } }, null, 2) + "\n");
  put("apps/local-host/package.json", JSON.stringify({ name: "@fx/host", dependencies: { "@fx/plugin-one": "1", "@fx/plugin-two": "1" } }, null, 2) + "\n");
  put("scripts/workspace-packages.mjs", 'export const names = ["@fx/plugin-one"];\n');
  // Host: three `export *`, a named re-export (not counted), the supervisor, the hand-registered providers, plugin-named files.
  put("apps/local-host/src/index.ts", 'export * from "./helpers.js";\nexport * from "./more.js";\nexport * from "./extra.js";\nexport { named } from "./named.js";\n');
  for (const file of ["helpers", "more", "extra", "named"]) put(`apps/local-host/src/${file}.ts`, `export const ${file === "named" ? "named" : `${file}Value`} = 1;\n`);
  put("apps/local-host/src/project-plugins.ts", 'export const entries = [["@fx/plugin-two", "createTwoPlugin"]];\n');
  put("apps/local-host/src/project-host.ts", "export function wire(registry: { registerProvider(p: unknown): void }) {\n  registry.registerProvider(oneActionProvider());\n  registry.registerProvider(searchProvider());\n}\ndeclare function oneActionProvider(): unknown;\ndeclare function searchProvider(): unknown;\n");
  put("apps/local-host/src/one-actions.ts", "export const oneActionProvider = () => ({});\n");
  put("apps/local-host/src/one-native-plugin-http.ts", "export const handleOne = () => 1;\n");
  put("apps/local-host/src/search-actions.ts", "export const searchProvider = () => ({});\n"); // not a plugin's name
  put("apps/local-host/src/local-host.ts", "import type { HostCapabilityDefinition } from '../../../packages/contracts/src/platform/app-host.js';\nexport class LocalHost {\n  register(definition: HostCapabilityDefinition) { return definition; }\n  registerCapability(definition: HostCapabilityDefinition) { return this.register(definition); }\n}\nexport const make = (host: LocalHost, definition: HostCapabilityDefinition) => host.registerCapability(definition);\n");
  // Modules: alpha exports a Repository class (baseline) and has a private `repository` member (not public).
  put("modules/alpha/src/index.ts", 'export { AlphaRepository } from "./repository.js";\nexport * from "./api.js";\nexport interface AlphaService { readonly repository: AlphaRepository; }\nimport type { AlphaRepository } from "./repository.js";\n');
  put("modules/alpha/src/repository.ts", "export class AlphaRepository {}\n");
  put("modules/alpha/src/api.ts", "export class AlphaApi {\n  constructor(private readonly repository: object) {}\n}\nclass Hidden { readonly repository = 1; }\nexport const unused = Hidden;\n");
  // Contracts: a pure file, a file with one timer, one long validator, one typed capability.
  put("packages/contracts/src/platform/pure.ts", "export interface Thing { id: string }\nexport const parseThing = (value: unknown): Thing => ({ id: String(value) });\n");
  put("packages/contracts/src/platform/lifetime.ts", "export const wait = () => setTimeout(() => undefined, 1);\n");
  put("packages/contracts/src/platform/validator.ts", helper("inspectThing", 22));
  put("packages/contracts/src/platform/app-host.ts", "export interface HostCapabilityDefinition<Input = unknown, Output = unknown> { capability_id: string; version: number; operation: \"query\" | \"command\"; action?: object; __types__?: { input: Input; output: Output } }\nexport const legacy = { capability_id: \"a.b.v1\", version: 1, operation: \"query\" } as HostCapabilityDefinition<void, void>;\n");
  git("add", "-A");
  assert.equal(gate("--update").code, 0);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};

type Scenario = { name: string; mutate: () => void; expect: RegExp[] };
const violations: Scenario[] = [
  // ---- contracts purity -------------------------------------------------------------------------------------------------
  { name: "a timer in a pure contracts file", mutate: () => put("packages/contracts/src/platform/pure.ts", read("packages/contracts/src/platform/pure.ts") + "export const later = () => setTimeout(() => undefined, 5);\n"),
    expect: [/contracts purity effects 0 → 1 in packages\/contracts\/src\/platform\/pure\.ts#effects/] },
  { name: "a second timer in the file that already has one", mutate: () => put("packages/contracts/src/platform/lifetime.ts", read("packages/contracts/src/platform/lifetime.ts") + "export const tick = () => setInterval(() => undefined, 5);\n"),
    expect: [/contracts purity effects 1 → 2 in packages\/contracts\/src\/platform\/lifetime\.ts#effects/] },
  { name: "AbortController, fetch, process and globalThis in contracts", mutate: () => put("packages/contracts/src/platform/io.ts", "export const a = new AbortController();\nexport const b = () => fetch('/x');\nexport const c = process.env.HOME;\nexport const d = globalThis;\n"),
    expect: [/contracts purity effects 0 → 4 in packages\/contracts\/src\/platform\/io\.ts#effects/] },
  { name: "Date.now(), new Date() and Math.random() in contracts", mutate: () => put("packages/contracts/src/platform/clock.ts", "export const a = Date.now();\nexport const b = new Date();\nexport const c = Math.random();\nexport const parsed = new Date('2026-01-01');\n"),
    expect: [/contracts purity effects 0 → 3 in packages\/contracts\/src\/platform\/clock\.ts#effects/] },
  { name: "a Node built-in imported by contracts", mutate: () => put("packages/contracts/src/platform/disk.ts", 'import { readFileSync } from "node:fs";\nimport path from "path";\nexport const read = () => [readFileSync, path];\n'),
    expect: [/contracts purity node-imports 0 → 2 in packages\/contracts\/src\/platform\/disk\.ts#node-imports/] },
  { name: "module-level mutable state in contracts", mutate: () => put("packages/contracts/src/platform/state.ts", "let counter = 0;\nexport const bump = () => ++counter;\nconst cache = new Map<string, number>();\nexport const get = (key: string) => cache.get(key);\n"),
    expect: [/contracts purity mutable-state 0 → 2 in packages\/contracts\/src\/platform\/state\.ts#mutable-state/] },
  { name: "an HTTP status table in contracts", mutate: () => put("packages/contracts/src/platform/route.ts", "export const toStatus = (ok: boolean, missing: boolean) => {\n  const status = ok ? 200 : missing ? 404 : 400;\n  return { status, body: {} };\n};\nexport const reply = { statusCode: 503 };\n"),
    expect: [/contracts purity http-status 0 → 2 in packages\/contracts\/src\/platform\/route\.ts#http-status/] },
  { name: "a new long helper in contracts", mutate: () => put("packages/contracts/src/platform/algo.ts", helper("compareThings", 21)),
    expect: [/new contracts function of 21 lines .* in packages\/contracts\/src\/platform\/algo\.ts#long-fn:compareThings/] },
  { name: "a long validator in contracts grows", mutate: () => put("packages/contracts/src/platform/validator.ts", helper("inspectThing", 23)),
    expect: [/contracts function grew to 23 lines .* in packages\/contracts\/src\/platform\/validator\.ts#long-fn:inspectThing/] },
  { name: "a long arrow function and a long class method in contracts", mutate: () => put("packages/contracts/src/platform/forms.ts", `export const long = () => {\n${pad(19)}  return 1;\n};\nexport class Walker {\n  walk() {\n${pad(19)}    return 1;\n  }\n}\n`),
    expect: [/new contracts function of 22 lines .* in packages\/contracts\/src\/platform\/forms\.ts#long-fn:long/, /forms\.ts#long-fn:Walker\.walk/] },

  // ---- Host entry --------------------------------------------------------------------------------------------------------
  { name: "another export * in the Host entry", mutate: () => put("apps/local-host/src/index.ts", read("apps/local-host/src/index.ts") + 'export * from "./another.js";\n'),
    expect: [/Host entry `export \*` in apps\/local-host\/src\/index\.ts#export-star 3 → 4/] },
  { name: "an export * as namespace in the Host entry", mutate: () => put("apps/local-host/src/index.ts", read("apps/local-host/src/index.ts") + 'export * as everything from "./more.js";\n'),
    expect: [/Host entry `export \*` in apps\/local-host\/src\/index\.ts#export-star 3 → 4/] },

  // ---- Module repositories -----------------------------------------------------------------------------------------------
  { name: "a Module entry exports another Store", mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export { BetaStore } from "./beta.js";\n'),
    expect: [/Module entry exposes a Repository: modules\/alpha#export:BetaStore 0 → 1/] },
  { name: "a Repository reaches the entry through export * of an inner file", mutate: () => { put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export * from "./inner.js";\n'); put("modules/alpha/src/inner.ts", "export class GammaRepository {}\n"); },
    expect: [/modules\/alpha#export:GammaRepository 0 → 1/] },
  { name: "a Repository exported under another name", mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export { AlphaRepository as AlphaData } from "./repository.js";\n'),
    expect: [/modules\/alpha#export:AlphaData 0 → 1/] },
  { name: "a service object with a public repository member", mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + "export interface AlphaOther { readonly repository: object }\nexport type AlphaLiteral = { repository: object };\nexport class AlphaThird { constructor(readonly repository: object) {} }\n"),
    expect: [/modules\/alpha#member:AlphaOther\.repository 0 → 1/, /modules\/alpha#member:AlphaLiteral\.repository 0 → 1/, /modules\/alpha#member:AlphaThird\.repository 0 → 1/] },
  { name: "a new Module that exports its Store", mutate: () => put("modules/beta/src/index.ts", "export class BetaStore {}\nexport function openBetaStore() { return new BetaStore(); }\n"),
    expect: [/modules\/beta#export:BetaStore 0 → 1/, /modules\/beta#export:openBetaStore 0 → 1/] },

  // ---- typed capabilities ------------------------------------------------------------------------------------------------
  { name: "a new typed capability descriptor", mutate: () => put("packages/contracts/src/platform/app-host.ts", read("packages/contracts/src/platform/app-host.ts") + 'export const another = { capability_id: "c.d.v1", version: 1, operation: "command" } as HostCapabilityDefinition<void, void>;\n'),
    expect: [/typed Host capability type-refs in packages\/contracts\/src\/platform\/app-host\.ts 1 → 2/, /typed Host capability without-action in packages\/contracts\/src\/platform\/app-host\.ts 1 → 2/] },
  { name: "a typed capability that carries an action is still a new typed entry", mutate: () => put("packages/contracts/src/platform/app-host.ts", read("packages/contracts/src/platform/app-host.ts") + 'export const withAction = { capability_id: "c.d.v1", version: 1, operation: "command", action: {} } as HostCapabilityDefinition<void, void>;\n'),
    expect: [/typed Host capability type-refs in packages\/contracts\/src\/platform\/app-host\.ts 1 → 2/] },
  { name: "a typed capability written as a typed constant and as a factory", mutate: () => put("plugins/native/one/src/capabilities.ts", 'import type { HostCapabilityDefinition } from "../../../../packages/contracts/src/platform/app-host.js";\nexport const typed: HostCapabilityDefinition<void, void> = { capability_id: "e.f.v1", version: 1, operation: "query" };\nexport const make = (id: string): HostCapabilityDefinition<void, void> => ({ capability_id: id, version: 1, operation: "query" });\n'),
    expect: [/typed Host capability type-refs in plugins\/native\/one\/src\/capabilities\.ts 0 → 2/, /typed Host capability without-action in plugins\/native\/one\/src\/capabilities\.ts 0 → 2/] },
  { name: "a new registerCapability call", mutate: () => put("apps/local-host/src/local-host.ts", read("apps/local-host/src/local-host.ts") + "export const again = (host: LocalHost, definition: HostCapabilityDefinition) => host.registerCapability(definition);\n"),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/local-host\.ts 1 → 2/] },
  { name: "a new file that accepts a typed capability", mutate: () => put("horizontal/extra/src/index.ts", 'import type { HostCapabilityDefinition } from "../../../packages/contracts/src/platform/app-host.js";\nexport const use = (definition: HostCapabilityDefinition) => definition;\n'),
    expect: [/typed Host capability type-refs in horizontal\/extra\/src\/index\.ts 0 → 1/] },

  // ---- assembly -----------------------------------------------------------------------------------------------------------
  { name: "a new <plugin>-actions.ts file in the Host", mutate: () => put("apps/local-host/src/two-actions.ts", "export const twoActionProvider = () => ({});\n"),
    expect: [/new Host file named for a plugin: apps\/local-host\/src\/two-actions\.ts/] },
  { name: "a new <plugin>-native-plugin-http.ts file in the Host", mutate: () => put("apps/local-host/src/two-native-plugin-http.ts", "export const handleTwo = () => 1;\n"),
    expect: [/new Host file named for a plugin: apps\/local-host\/src\/two-native-plugin-http\.ts/] },
  { name: "a Host file for a plugin directory under its singular name", mutate: () => put("apps/local-host/src/artifact-actions.ts", "export const artifactActionProvider = () => ({});\n"),
    expect: [/new Host file named for a plugin: apps\/local-host\/src\/artifact-actions\.ts/] },
  { name: "another registerProvider line in project-host.ts", mutate: () => put("apps/local-host/src/project-host.ts", read("apps/local-host/src/project-host.ts").replace("  registry.registerProvider(searchProvider());\n", "  registry.registerProvider(searchProvider());\n  registry.registerProvider(searchProvider());\n")),
    expect: [/registerProvider calls in apps\/local-host\/src\/project-host\.ts 2 → 3/] },
  { name: "registerProvider in a new Host file", mutate: () => put("apps/local-host/src/wiring.ts", "export const wire = (registry: { registerProvider(p: unknown): void }) => registry.registerProvider({});\n"),
    expect: [/registerProvider calls in apps\/local-host\/src\/wiring\.ts 0 → 1/] },
  { name: "a Runtime plugin gets a Host file named for it", mutate: () => put("apps/local-host/src/two-surface.ts", "export const surface = 1;\n"),
    expect: [/hybrid plugin two host-files 0 → 1/] },
  { name: "a Runtime plugin gets a provider registered by hand", mutate: () => put("apps/local-host/src/project-host.ts", read("apps/local-host/src/project-host.ts") + "export const more = (registry: { registerProvider(p: unknown): void }) => registry.registerProvider(twoActionProvider());\ndeclare function twoActionProvider(): unknown;\n"),
    expect: [/hybrid plugin two host-providers 0 → 1/, /registerProvider calls in apps\/local-host\/src\/project-host\.ts 2 → 3/] },
  { name: "a plugin is named in one more file outside its package", mutate: () => put("apps/local-host/src/uses-one.ts", 'import { one } from "@fx/plugin-one";\nexport const x = one;\n'),
    expect: [/plugin one is named in 4 files outside its package \(was 3\)/] },
  { name: "a plugin package name is added to a script", mutate: () => put("scripts/other.mjs", 'export const n = "@fx/plugin-two";\n'),
    expect: [/plugin two is named in 4 files outside its package \(was 3\)/] },
  { name: "a new plugin named in more files than the smallest existing plugin", mutate: () => {
    put("plugins/native/three/package.json", manifest("@fx/plugin-three"));
    put("plugins/native/three/src/index.ts", "export const three = 1;\n");
    for (let index = 0; index < 8; index++) put(`apps/local-host/src/uses-${index}.ts`, `export const t${index} = "@fx/plugin-three";\n`);
  }, expect: [/plugin three is named in 8 files outside its package \(a new plugin may be named in at most 7\)/] },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    // The laundering move: lift the committed baseline to the head's numbers in the same branch.
    const refused = gate("--update", "--base", "main");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /Baseline not written/);
    assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    assert.equal(gate().code, 0, "the local check against the committed baseline is satisfied by the rewrite");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
}

// What the rules must not flag, in one branch: every line here is legal and the merge-base comparison stays green.
test("things the structure gates do not count", () => {
  branch("legal", () => {
    put("packages/contracts/src/platform/legal.ts", [
      "export interface Timer { setTimeout: number; process: string }",
      "export const shape = { setTimeout: 1, process: 'x', fetch: 2 };",
      "export const read = (timer: Timer, fetch: number) => timer.setTimeout + fetch;", // a parameter named like a global
      "// setTimeout(() => undefined, 1) is only a comment",
      "export const text = 'import fs from \"node:fs\"; setTimeout(); Date.now()';",
      "export const known: ReadonlySet<string> = new Set(['a']);",
      "export const values = new Date('2026-01-01');",
      "export const small = (value: number) => value + 1;",
      "export const statusText = { status: 'ok' };",
      "",
    ].join("\n"));
    put("apps/local-host/src/index.ts", read("apps/local-host/src/index.ts") + 'export { more } from "./more.js";\nexport type { Extra } from "./extra.js";\n'); // named re-exports are not `export *`
    put("apps/local-host/src/search-actions.ts", read("apps/local-host/src/search-actions.ts") + "export const more = 1;\n"); // not named for a plugin
    put("apps/local-host/src/twofold-helper.ts", "export const helper = 1;\n"); // starts with "two" but is not "two-…"
    put("modules/alpha/src/api.ts", read("modules/alpha/src/api.ts") + "export class Safe { private repository = 1; protected store = 2; }\n"); // private member
    put("plugins/native/one/src/own.ts", 'export const self = "@fx/plugin-one";\n'); // a plugin may name itself
    put("apps/local-host/src/prefix.ts", 'export const other = "@fx/plugin-onefold";\n'); // a longer package name that starts with "…plugin-one"
    put("apps/local-host/src/project-host.ts", read("apps/local-host/src/project-host.ts") + "export const registerProviderHint = 'registerProvider(x)';\n"); // text, not a call
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("changes that shrink or only move things pass against the merge-base", () => {
  branch("tidy", () => {
    mkdirSync(path.join(repo, "apps/local-host/src/moved"), { recursive: true });
    git("mv", "apps/local-host/src/one-actions.ts", "apps/local-host/src/moved/one-actions.ts"); // not a new file: it keeps its record
    put("apps/local-host/src/index.ts", 'export * from "./helpers.js";\nexport * from "./more.js";\nexport { named } from "./named.js";\n');
    put("packages/contracts/src/platform/lifetime.ts", "export const wait = () => 1;\n");
    put("packages/contracts/src/platform/validator.ts", helper("inspectThing", 21));
    put("modules/alpha/src/index.ts", 'export * from "./api.js";\n');
    put("scripts/workspace-packages.mjs", "export const names = [];\n");
    git("mv", "packages/contracts/src/platform/app-host.ts", "packages/contracts/src/platform/host.ts"); // a moved file keeps its typed-capability record
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: .*contractsPurity/);
  assert.match(run.out, /hostEntryExports/);
  assert.match(run.out, /moduleRepositoryExports/);
  assert.match(run.out, /pluginOutsideMentions/);
  assert.equal(gate("--update", "--base", "main").code, 0, "lowering the baseline with the merge-base given is accepted");
});

test("a new plugin that stays within the allowance passes", () => {
  branch("small-plugin", () => {
    put("plugins/native/three/package.json", manifest("@fx/plugin-three"));
    put("plugins/native/three/src/index.ts", "export const three = 1;\n");
    for (let index = 0; index < 7; index++) put(`apps/local-host/src/uses-${index}.ts`, `export const t${index} = "@fx/plugin-three";\n`);
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("the report flags hybrid plugins (Characters with its decision) and prints the new numbers", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  const base = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.deepEqual(base.head, base.base, "the head is the merge-base here");
  assert.deepEqual(base.head.hostEntryExports, { "apps/local-host/src/index.ts#export-star": 3 });
  assert.deepEqual(base.head.pluginOutsideMentions, { "artifacts#outside-files": 0, "one#outside-files": 3, "two#outside-files": 3 });
  assert.deepEqual(Object.keys(base.head.hostPluginFiles).sort(), ["apps/local-host/src/one-actions.ts#actions", "apps/local-host/src/one-native-plugin-http.ts#native-plugin-http"]);
  assert.deepEqual(base.head.registerProviderSites, { "apps/local-host/src/project-host.ts#register-provider": 2 });
  assert.deepEqual(base.head.hybridPlugins, {});
  assert.equal(base.head.typedCapabilities["packages/contracts/src/platform/app-host.ts#without-action"], 1);
  assert.equal(base.head.typedCapabilities["apps/local-host/src/local-host.ts#register-calls"], 1);
  assert.deepEqual(base.head.contractsPurity, { "packages/contracts/src/platform/lifetime.ts#effects": 1, "packages/contracts/src/platform/validator.ts#long-fn:inspectThing": 22 });
  assert.deepEqual(base.head.moduleRepositoryExports, { "modules/alpha#export:AlphaRepository": 1, "modules/alpha#member:AlphaService.repository": 1 }, "a private parameter property is not public");

  // Characters is the second hybrid and carries the decision that it stops being a Runtime plugin.
  put("plugins/native/characters/package.json", manifest("@fx/plugin-characters"));
  put("plugins/native/characters/src/index.ts", "export const characters = 1;\n");
  put("apps/local-host/src/project-plugins.ts", read("apps/local-host/src/project-plugins.ts") + 'export const more = [["@fx/plugin-characters", "createCharactersPlugin"]];\n');
  put("apps/local-host/src/characters-host.ts", "export const host = 1;\n");
  put("apps/local-host/src/character-import.ts", "export const imported = 1;\n");
  put("apps/local-host/src/two-surface.ts", "export const surface = 1;\n");
  git("add", "-A"); // the working tree is what git tracks
  const text = gate("--report").out;
  assert.match(text, /Hybrid plugins: .*: 3 in 2 entries\n.*count.*\n\s+2\s+characters#host-files\n\s+1\s+two#host-files\n\s+flagged as hybrid: characters, two\n\s+characters: decision 26/);
  assert.match(text, /Contracts purity .*: 2 in 2 entries/);
  assert.match(text, /Host entry `export \*` declarations: 3 in 1 entries/);
  assert.match(text, /Files outside a built-in plugin's package that name its package: \d+ in 4 entries/);
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
});
