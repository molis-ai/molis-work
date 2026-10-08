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
  put("scripts/workspace-packages.mjs", [
    "const entry = (path, name, kind) => ({ path, name, kind });",
    "export const WORKSPACE_PACKAGES = [",
    '  entry("server", "@fx/server", "module"),', // the chat and identity package is a Module by classification, not by directory
    '  entry("modules/alpha", "@fx/alpha", "module"),',
    '  entry("plugins/native/one", "@fx/plugin-one", "native-plugin"),',
    '  entry("apps/other", "@fx/other", "app"),',
    "];",
    "",
  ].join("\n"));
  put("server/src/index.ts", "export const serverValue = 1;\n");
  put("apps/other/src/index.ts", "export class OtherStore {}\n"); // an App is not a Module: its Store is not counted
  // The listed layer exceptions (packages/test-kit/src/boundaries.ts): two App edges and one Plugin → Module edge.
  put("packages/test-kit/src/boundaries.ts", [
    "export const APP_IMPORT_ALLOWLIST: readonly string[] = [",
    '  ". -> apps/desktop",',
    '  "apps/desktop -> apps/local-host",',
    "];",
    "export const PLUGIN_MODULE_IMPORT_ALLOWLIST: readonly string[] = [",
    '  "plugins/native/one -> modules/alpha",',
    "];",
    "",
  ].join("\n"));
  // Host: three `export *`, a named re-export (not counted), the supervisor, the hand-registered providers, plugin-named files.
  put("apps/local-host/src/index.ts", 'export * from "./helpers.js";\nexport * from "./more.js";\nexport * from "./extra.js";\nexport { named } from "./named.js";\n');
  for (const file of ["helpers", "more", "extra", "named"]) put(`apps/local-host/src/${file}.ts`, `export const ${file === "named" ? "named" : `${file}Value`} = 1;\n`);
  put("apps/local-host/src/project-plugins.ts", 'export const entries = [["@fx/plugin-two", "createTwoPlugin"]];\n');
  put("apps/local-host/src/project-host.ts", "export function wire(registry: { registerProvider(p: unknown): void }) {\n  registry.registerProvider(oneActionProvider());\n  registry.registerProvider(searchProvider());\n}\ndeclare function oneActionProvider(): unknown;\ndeclare function searchProvider(): unknown;\n");
  put("apps/local-host/src/one-actions.ts", "export const oneActionProvider = () => ({});\n");
  put("apps/local-host/src/one-native-plugin-http.ts", "export const handleOne = () => 1;\n");
  put("apps/local-host/src/search-actions.ts", "export const searchProvider = () => ({});\n"); // not a plugin's name
  put("apps/local-host/src/local-host.ts", "import type { HostCapabilityDefinition } from '../../../packages/contracts/src/platform/app-host.js';\nexport class LocalHost {\n  register(definition: HostCapabilityDefinition, handler: (runtime: unknown, input: unknown) => unknown) { return [definition, handler]; }\n  registerCapability(definition: HostCapabilityDefinition) { return this.register(definition, () => 1); }\n}\nexport const make = (host: LocalHost, definition: HostCapabilityDefinition) => host.registerCapability(definition);\n");
  // The Casebook shape: a factory that mints descriptors, and registrations through a `LocalHost` parameter.
  put("apps/local-host/src/casebook/integration.ts", [
    "import type { HostCapabilityDefinition } from '../../../../packages/contracts/src/platform/app-host.js';",
    "import type { LocalHost } from '../local-host.js';",
    "const capability = (name: string, operation: 'query' | 'command'): HostCapabilityDefinition<unknown, unknown> => ({",
    "  capability_id: `io.example.casebook.${name}`, version: 1, operation,",
    "});",
    "const read = capability('read', 'query');",
    "const write = capability('write', 'command');",
    "export function registerCasebookCapabilities(host: LocalHost): void {",
    "  host.register(read, (_runtime, input) => input);",
    "  host.register(write, (_runtime, input) => input);",
    "}",
    "",
  ].join("\n"));
  // The Agent Host shape: a registrar interface, a local helper that takes the definition first and registers it, and the
  // registrations made through the helper (they are not `.register(…)` calls of the file's own).
  put("horizontal/agent-host/src/capability-registration.ts", [
    "import type { HostCapabilityDefinition } from '../../../packages/contracts/src/platform/app-host.js';",
    "export interface AgentRegistrar { register(definition: HostCapabilityDefinition, handler: () => void): () => void }",
    "export const agentCapabilities = {",
    "  list: { capability_id: 'agent.list.v1', version: 1, operation: 'query' } as HostCapabilityDefinition<void, void>,",
    "};",
    "export function registerAgentCapabilities(registrar: AgentRegistrar) {",
    "  const register = (definition: HostCapabilityDefinition, handler: () => void) => registrar.register(definition, handler);",
    "  register(agentCapabilities.list, () => undefined);",
    "}",
    "",
  ].join("\n"));
  // The Goals shape: an alias that wraps the definition, imported under another name in one file.
  put("plugins/native/one/src/entry-capabilities.ts", [
    'import type { HostMethodCapability as MethodCapability } from "../../../../packages/contracts/src/platform/app-host.js";',
    "export const entry = { capability_id: \"io.example.one.entry\", version: 1, operation: \"query\" } as MethodCapability<() => void>;",
    "",
  ].join("\n"));
  // Modules: alpha exports a Repository class (baseline) and has a private `repository` member (not public).
  put("modules/alpha/src/index.ts", 'export { AlphaRepository } from "./repository.js";\nexport * from "./api.js";\nexport interface AlphaService { readonly repository: AlphaRepository; }\nimport type { AlphaRepository } from "./repository.js";\n');
  put("modules/alpha/src/repository.ts", "export class AlphaRepository {}\n");
  put("modules/alpha/src/api.ts", "export class AlphaApi {\n  constructor(private readonly repository: object) {}\n}\nclass Hidden { readonly repository = 1; }\nexport const unused = Hidden;\n");
  // Contracts: a pure file, a file with one timer, one long validator, one typed capability.
  put("packages/contracts/src/platform/pure.ts", "export interface Thing { id: string }\nexport const parseThing = (value: unknown): Thing => ({ id: String(value) });\n");
  put("packages/contracts/src/platform/lifetime.ts", "export const wait = () => setTimeout(() => undefined, 1);\n");
  put("packages/contracts/src/platform/validator.ts", helper("inspectThing", 22));
  put("packages/contracts/src/platform/app-host.ts", "export interface HostCapabilityDefinition<Input = unknown, Output = unknown> { capability_id: string; version: number; operation: \"query\" | \"command\"; action?: object; __types__?: { input: Input; output: Output } }\nexport const legacy = { capability_id: \"a.b.v1\", version: 1, operation: \"query\" } as HostCapabilityDefinition<void, void>;\nexport type HostMethodCapability<Method> = Method extends (...args: infer Args) => infer Result ? HostCapabilityDefinition<Args, Result> : never;\nexport type HostCapabilityInput<Capability> = Capability extends HostCapabilityDefinition<infer Input, unknown> ? Input : never;\n");
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

// `launder`: also run the move this gate exists for (rewrite the baseline in the branch). One scenario per rule family does it;
// the mechanism itself is shared and covered in tests/health-gates-merge-base.test.ts, so the others only check that they are caught.
type Scenario = { name: string; mutate: () => void; expect: RegExp[]; launder?: boolean };
const violations: Scenario[] = [
  // ---- contracts purity -------------------------------------------------------------------------------------------------
  { name: "a timer in a pure contracts file", launder: true, mutate: () => put("packages/contracts/src/platform/pure.ts", read("packages/contracts/src/platform/pure.ts") + "export const later = () => setTimeout(() => undefined, 5);\n"),
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
  { name: "another export * in the Host entry", launder: true, mutate: () => put("apps/local-host/src/index.ts", read("apps/local-host/src/index.ts") + 'export * from "./another.js";\n'),
    expect: [/Host entry `export \*` in apps\/local-host\/src\/index\.ts#export-star 3 → 4/] },
  { name: "an export * as namespace in the Host entry", mutate: () => put("apps/local-host/src/index.ts", read("apps/local-host/src/index.ts") + 'export * as everything from "./more.js";\n'),
    expect: [/Host entry `export \*` in apps\/local-host\/src\/index\.ts#export-star 3 → 4/] },

  // ---- Module repositories -----------------------------------------------------------------------------------------------
  { name: "a Module entry exports another Store", launder: true, mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export { BetaStore } from "./beta.js";\n'),
    expect: [/Module entry exposes a Repository: modules\/alpha#export:BetaStore 0 → 1/] },
  { name: "a Repository reaches the entry through export * of an inner file", mutate: () => { put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export * from "./inner.js";\n'); put("modules/alpha/src/inner.ts", "export class GammaRepository {}\n"); },
    expect: [/modules\/alpha#export:GammaRepository 0 → 1/] },
  { name: "a Repository exported under another name", mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export { AlphaRepository as AlphaData } from "./repository.js";\n'),
    expect: [/modules\/alpha#export:AlphaData 0 → 1/] },
  { name: "a service object with a public repository member", mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + "export interface AlphaOther { readonly repository: object }\nexport type AlphaLiteral = { repository: object };\nexport class AlphaThird { constructor(readonly repository: object) {} }\n"),
    expect: [/modules\/alpha#member:AlphaOther\.repository 0 → 1/, /modules\/alpha#member:AlphaLiteral\.repository 0 → 1/, /modules\/alpha#member:AlphaThird\.repository 0 → 1/] },
  { name: "a new Module that exports its Store", mutate: () => put("modules/beta/src/index.ts", "export class BetaStore {}\nexport function openBetaStore() { return new BetaStore(); }\n"),
    expect: [/modules\/beta#export:BetaStore 0 → 1/, /modules\/beta#export:openBetaStore 0 → 1/] },
  // Namespace re-exports make everything in the target public under the namespace's name (found by a reviewer, verified on a scratch clone).
  { name: "a Repository reaches the entry as `export * as ns`", launder: true, mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export * as alphaStorage from "./repository.js";\n'),
    expect: [/modules\/alpha#export:alphaStorage\.AlphaRepository 0 → 1/] },
  { name: "a Repository reaches the entry as a re-exported namespace import", mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'import * as alphaRepositoryFile from "./repository.js";\nexport { alphaRepositoryFile };\n'),
    expect: [/modules\/alpha#export:alphaRepositoryFile\.AlphaRepository 0 → 1/] },
  { name: "a re-exported namespace import under another name", mutate: () => put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'import * as everything from "./repository.js";\nexport { everything as data };\n'),
    expect: [/modules\/alpha#export:data\.AlphaRepository 0 → 1/] },
  { name: "a Repository reaches the entry through a namespace inside a namespace", mutate: () => {
    put("modules/alpha/src/barrel.ts", 'export * as deep from "./repository.js";\n');
    put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export * as outer from "./barrel.js";\n');
  }, expect: [/modules\/alpha#export:outer\.deep\.AlphaRepository 0 → 1/] },
  { name: "a Repository reaches the entry through export * of a file that holds a namespace", mutate: () => {
    put("modules/alpha/src/barrel.ts", 'import * as files from "./repository.js";\nexport { files };\n');
    put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'export * from "./barrel.js";\n');
  }, expect: [/modules\/alpha#export:files\.AlphaRepository 0 → 1/] },
  { name: "a namespace re-export in the server package", mutate: () => {
    put("server/src/index.ts", read("server/src/index.ts") + 'export * as serverFiles from "./store.js";\n');
    put("server/src/store.ts", "export class ServerStore {}\n");
  }, expect: [/server#export:serverFiles\.ServerStore 0 → 1/] },

  // ---- typed capabilities ------------------------------------------------------------------------------------------------
  { name: "a new typed capability descriptor", launder: true, mutate: () => put("packages/contracts/src/platform/app-host.ts", read("packages/contracts/src/platform/app-host.ts") + 'export const another = { capability_id: "c.d.v1", version: 1, operation: "command" } as HostCapabilityDefinition<void, void>;\n'),
    expect: [/typed Host capability type-refs in packages\/contracts\/src\/platform\/app-host\.ts 3 → 4/, /typed Host capability without-action in packages\/contracts\/src\/platform\/app-host\.ts 1 → 2/] },
  { name: "a typed capability that carries an action is still a new typed entry", mutate: () => put("packages/contracts/src/platform/app-host.ts", read("packages/contracts/src/platform/app-host.ts") + 'export const withAction = { capability_id: "c.d.v1", version: 1, operation: "command", action: {} } as HostCapabilityDefinition<void, void>;\n'),
    expect: [/typed Host capability type-refs in packages\/contracts\/src\/platform\/app-host\.ts 3 → 4/] },
  { name: "a typed capability written as a typed constant and as a factory", mutate: () => put("plugins/native/one/src/capabilities.ts", 'import type { HostCapabilityDefinition } from "../../../../packages/contracts/src/platform/app-host.js";\nexport const typed: HostCapabilityDefinition<void, void> = { capability_id: "e.f.v1", version: 1, operation: "query" };\nexport const make = (id: string): HostCapabilityDefinition<void, void> => ({ capability_id: id, version: 1, operation: "query" });\n'),
    expect: [/typed Host capability type-refs in plugins\/native\/one\/src\/capabilities\.ts 0 → 2/, /typed Host capability without-action in plugins\/native\/one\/src\/capabilities\.ts 0 → 2/] },
  { name: "a new registerCapability call", mutate: () => put("apps/local-host/src/local-host.ts", read("apps/local-host/src/local-host.ts") + "export const again = (host: LocalHost, definition: HostCapabilityDefinition) => host.registerCapability(definition);\n"),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/local-host\.ts 2 → 3/] },
  { name: "a new file that accepts a typed capability", mutate: () => put("horizontal/extra/src/index.ts", 'import type { HostCapabilityDefinition } from "../../../packages/contracts/src/platform/app-host.js";\nexport const use = (definition: HostCapabilityDefinition) => definition;\n'),
    expect: [/typed Host capability type-refs in horizontal\/extra\/src\/index\.ts 0 → 1/] },

  // The bypasses of the first version of this rule, each verified by hand on a scratch clone before it was closed.
  { name: "a typed descriptor cast to the HostMethodCapability alias, under its import rename", launder: true, mutate: () => put("plugins/native/one/src/entry-capabilities.ts", read("plugins/native/one/src/entry-capabilities.ts") + 'export const shadow = { capability_id: "io.example.one.shadow", version: 1, operation: "command" } as MethodCapability<() => void>;\n'),
    expect: [/typed Host capability type-refs in plugins\/native\/one\/src\/entry-capabilities\.ts 1 → 2/, /typed Host capability without-action in plugins\/native\/one\/src\/entry-capabilities\.ts 1 → 2/] },
  { name: "a typed descriptor cast to the HostMethodCapability alias in a new file", mutate: () => put("plugins/native/two/src/shadow.ts", 'import type { HostMethodCapability } from "../../../../packages/contracts/src/platform/app-host.js";\nexport const shadow = { capability_id: "io.example.two.shadow", version: 1, operation: "command" } as HostMethodCapability<() => void>;\n'),
    expect: [/typed Host capability type-refs in plugins\/native\/two\/src\/shadow\.ts 0 → 1/, /typed Host capability without-action in plugins\/native\/two\/src\/shadow\.ts 0 → 1/] },
  { name: "a new alias for the definition is followed to the files that use it", mutate: () => {
    put("packages/contracts/src/platform/app-host.ts", read("packages/contracts/src/platform/app-host.ts") + "export type Shadowed<Input> = Readonly<HostCapabilityDefinition<Input, void>>;\n");
    put("plugins/native/two/src/aliased.ts", 'import type { Shadowed } from "../../../../packages/contracts/src/platform/app-host.js";\nexport const aliased = { capability_id: "io.example.two.aliased", version: 1, operation: "query" } as Shadowed<void>;\n');
  }, expect: [/typed Host capability type-refs in packages\/contracts\/src\/platform\/app-host\.ts 3 → 4/, /typed Host capability type-refs in plugins\/native\/two\/src\/aliased\.ts 0 → 1/, /typed Host capability without-action in plugins\/native\/two\/src\/aliased\.ts 0 → 1/] },
  { name: "the definition re-exported under another name and cast to in another file", mutate: () => {
    put("packages/contracts/src/platform/barrel.ts", 'export type { HostCapabilityDefinition as TypedDefinition } from "./app-host.js";\n');
    put("plugins/native/two/src/barrel-user.ts", 'import type { TypedDefinition } from "../../../../packages/contracts/src/platform/barrel.js";\nexport const viaBarrel = { capability_id: "io.example.two.barrel", version: 1, operation: "query" } as TypedDefinition<void, void>;\n');
  }, expect: [/typed Host capability type-refs in plugins\/native\/two\/src\/barrel-user\.ts 0 → 1/, /typed Host capability without-action in plugins\/native\/two\/src\/barrel-user\.ts 0 → 1/] },
  { name: "a descriptor literal that is not cast to anything", mutate: () => put("plugins/native/two/src/plain.ts", 'export const plain = { capability_id: "io.example.two.plain", version: 1, operation: "query" };\n'),
    expect: [/typed Host capability without-action in plugins\/native\/two\/src\/plain\.ts 0 → 1/] },
  { name: "a descriptor minted by the Casebook factory and registered through a LocalHost parameter", launder: true, mutate: () => {
    const file = "apps/local-host/src/casebook/integration.ts";
    put(file, read(file).replace("  host.register(write, (_runtime, input) => input);\n", "  host.register(write, (_runtime, input) => input);\n  const shadow = capability('shadow', 'query');\n  host.register(shadow, (_runtime, input) => input);\n"));
  }, expect: [/typed Host capability register-calls in apps\/local-host\/src\/casebook\/integration\.ts 2 → 3/] },
  { name: "a registration through a LocalHost property of a class", mutate: () => put("apps/local-host/src/wiring-class.ts", 'import type { LocalHost } from "./local-host.js";\nexport class Wiring {\n  constructor(private readonly host: LocalHost) {}\n  wire(definition: never) { return this.host.register(definition, () => 1); }\n}\n'),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-class\.ts 0 → 1/] },
  { name: "a registration through a LocalHost held in an options interface", mutate: () => put("apps/local-host/src/wiring-options.ts", 'import type { LocalHost } from "./local-host.js";\ninterface Options { localHost: LocalHost }\nexport const wire = (options: Options, definition: never) => options.localHost.register(definition, () => 1);\n'),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-options\.ts 0 → 1/] },
  { name: "a registration through a registrar type that a plugin file declares itself", mutate: () => put("plugins/native/two/src/registrar.ts", 'import type { HostCapabilityDefinition } from "../../../../packages/contracts/src/platform/app-host.js";\nexport interface Registrar { register(definition: HostCapabilityDefinition, handler: () => void): () => void }\nexport const wire = (registrar: Registrar, definition: never) => registrar.register(definition, () => undefined);\n'),
    expect: [/typed Host capability type-refs in plugins\/native\/two\/src\/registrar\.ts 0 → 1/, /typed Host capability register-calls in plugins\/native\/two\/src\/registrar\.ts 0 → 1/] },
  { name: "a registration through a registrar declared in another file", mutate: () => {
    put("plugins/native/two/src/registrar.ts", 'import type { HostCapabilityDefinition } from "../../../../packages/contracts/src/platform/app-host.js";\nexport interface Registrar { register(definition: HostCapabilityDefinition, handler: () => void): () => void }\n');
    put("plugins/native/two/src/use-registrar.ts", 'import type { Registrar } from "./registrar.js";\nexport const wire = (registrar: Registrar, definition: never) => registrar.register(definition, () => undefined);\n');
  }, expect: [/typed Host capability register-calls in plugins\/native\/two\/src\/use-registrar\.ts 0 → 1/] },

  // Found by a reviewer of the second version of this rule, each verified by hand on a scratch clone before it was closed.
  { name: "a descriptor spread from a registered one, given a new id, registered through the local typed helper", launder: true, mutate: () => {
    const file = "horizontal/agent-host/src/capability-registration.ts";
    put(file, read(file).replace("  register(agentCapabilities.list, () => undefined);\n", "  register(agentCapabilities.list, () => undefined);\n  register({ ...agentCapabilities.list, capability_id: 'agent.shadow.v1' }, () => undefined);\n"));
  }, expect: [/typed Host capability register-calls in horizontal\/agent-host\/src\/capability-registration\.ts 2 → 3/, /typed Host capability without-action in horizontal\/agent-host\/src\/capability-registration\.ts 1 → 2/] },
  { name: "the same helper call on the line of an existing registration (the file does not grow)", mutate: () => {
    const file = "horizontal/agent-host/src/capability-registration.ts";
    put(file, read(file).replace("  register(agentCapabilities.list, () => undefined);\n", "  register(agentCapabilities.list, () => undefined); register(agentCapabilities.list, () => undefined);\n"));
  }, expect: [/typed Host capability register-calls in horizontal\/agent-host\/src\/capability-registration\.ts 2 → 3/] },
  { name: "an inline spread descriptor registered on a receiver whose type is a typeof of something unknown", mutate: () => put("horizontal/agent-host/src/shadow-registration.ts", [
    "import { agentCapabilities } from './capability-registration.js';",
    "declare const shadowRegistrar: { register(definition: unknown, handler: () => void): void };",
    "export const wire = (registrar: typeof shadowRegistrar) => registrar.register({ ...agentCapabilities.list, capability_id: 'agent.shadow.v1' }, () => undefined);",
    "",
  ].join("\n")),
    expect: [/typed Host capability register-calls in horizontal\/agent-host\/src\/shadow-registration\.ts 0 → 1/, /typed Host capability without-action in horizontal\/agent-host\/src\/shadow-registration\.ts 0 → 1/] },
  { name: "an inline descriptor with an operation registered on a receiver of unknown type", mutate: () => put("plugins/native/two/src/inline-register.ts", "export const wire = (unknown: { register(value: unknown, handler: () => void): void }) => unknown.register({ capability_id: 'io.example.two.inline', version: 1, operation: 'query' }, () => undefined);\n"),
    expect: [/typed Host capability register-calls in plugins\/native\/two\/src\/inline-register\.ts 0 → 1/, /typed Host capability without-action in plugins\/native\/two\/src\/inline-register\.ts 0 → 1/] },
  { name: "a minted id on a spread base, typed by nothing", mutate: () => put("plugins/native/two/src/minted.ts", "import { base } from './base.js';\nexport const minted = { ...base, capability_id: 'io.example.two.minted' };\n"),
    expect: [/typed Host capability without-action in plugins\/native\/two\/src\/minted\.ts 0 → 1/] },
  { name: "a local helper that hands its first parameter on to a registration, whatever its type", mutate: () => put("apps/local-host/src/wiring-helper.ts", [
    "import type { LocalHost } from './local-host.js';",
    "export const wire = (host: LocalHost, definition: never) => {",
    "  const reg = (candidate: any, handler: () => void) => host.register(candidate, handler);",
    "  reg(definition, () => 1);",
    "  reg(definition, () => 2);",
    "};",
    "",
  ].join("\n")),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-helper\.ts 0 → 3/] },
  { name: "a helper that hands on to a helper that registers (two hops)", mutate: () => put("apps/local-host/src/wiring-hops.ts", [
    "import type { LocalHost } from './local-host.js';",
    "export const wire = (host: LocalHost, definition: never) => {",
    "  const inner = (candidate: any) => host.register(candidate, () => 1);",
    "  const outer = (value: any) => inner(value);",
    "  outer(definition);",
    "};",
    "",
  ].join("\n")),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-hops\.ts 0 → 3/] },
  { name: "an exported function in another file that takes the definition first, called under an import rename", mutate: () => {
    put("plugins/native/two/src/typed-helper.ts", 'import type { HostCapabilityDefinition } from "../../../../packages/contracts/src/platform/app-host.js";\nexport const addTyped = (definition: HostCapabilityDefinition, handler: () => void) => [definition, handler];\n');
    put("plugins/native/two/src/uses-typed-helper.ts", 'import { addTyped as add } from "./typed-helper.js";\nexport const wire = (definition: never) => add(definition, () => 1);\n');
  }, expect: [/typed Host capability register-calls in plugins\/native\/two\/src\/uses-typed-helper\.ts 0 → 1/] },
  { name: "a registration through a function that returns a LocalHost (a call-chain receiver)", mutate: () => put("apps/local-host/src/wiring-chain.ts", [
    "import type { LocalHost } from './local-host.js';",
    "declare function currentHost(): LocalHost;",
    "export const wire = (definition: never) => currentHost().register(definition, () => 1);",
    "",
  ].join("\n")),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-chain\.ts 0 → 1/] },
  { name: "a registration through an exported function (another file) that returns a LocalHost", mutate: () => {
    put("apps/local-host/src/current-host.ts", "import type { LocalHost } from './local-host.js';\nexport function currentHost(): LocalHost { throw new Error('fixture'); }\n");
    put("apps/local-host/src/wiring-chain-import.ts", "import { currentHost as host } from './current-host.js';\nexport const wire = (definition: never) => { const local = host(); local.register(definition, () => 1); return host().register(definition, () => 2); };\n");
  }, expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-chain-import\.ts 0 → 2/] },
  { name: "a method of a class that hands its first parameter on to a registration, called as this.method", mutate: () => put("apps/local-host/src/wiring-method.ts", [
    "import type { LocalHost } from './local-host.js';",
    "export class Wiring {",
    "  constructor(private readonly host: LocalHost) {}",
    "  private add(candidate: any) { return this.host.register(candidate, () => 1); }",
    "  wire(definition: never) { this.add(definition); this.add(definition); }",
    "}",
    "",
  ].join("\n")),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-method\.ts 0 → 3/] },
  { name: "an exported typed function re-exported under another name through a barrel", mutate: () => {
    put("plugins/native/two/src/typed-helper.ts", 'import type { HostCapabilityDefinition } from "../../../../packages/contracts/src/platform/app-host.js";\nexport const addTyped = (definition: HostCapabilityDefinition, handler: () => void) => [definition, handler];\n');
    put("plugins/native/two/src/barrel.ts", 'export { addTyped as add } from "./typed-helper.js";\n');
    put("plugins/native/two/src/uses-barrel.ts", 'import { add } from "./barrel.js";\nexport const wire = (definition: never) => add(definition, () => 1);\n');
  }, expect: [/typed Host capability register-calls in plugins\/native\/two\/src\/uses-barrel\.ts 0 → 1/] },
  { name: "a registration through a typeof of a LocalHost held in the file", mutate: () => put("apps/local-host/src/wiring-typeof.ts", [
    "import { LocalHost } from './local-host.js';",
    "declare const real: LocalHost;",
    "export const wire = (copy: typeof real, definition: never) => copy.register(definition, () => 1);",
    "",
  ].join("\n")),
    expect: [/typed Host capability register-calls in apps\/local-host\/src\/wiring-typeof\.ts 0 → 1/] },

  // ---- Module repositories: the packages that the workspace list calls modules -------------------------------------------
  { name: "the server package exports a Store (it is a Module by classification)", mutate: () => put("server/src/index.ts", read("server/src/index.ts") + "export class ServerShadowStore {}\n"),
    expect: [/Module entry exposes a Repository: server#export:ServerShadowStore 0 → 1/] },
  { name: "the server package exports a service with a public repository member", mutate: () => put("server/src/index.ts", read("server/src/index.ts") + "export interface ServerService { readonly repository: object }\n"),
    expect: [/server#member:ServerService\.repository 0 → 1/] },

  // ---- layer exceptions (packages/test-kit/src/boundaries.ts) ------------------------------------------------------------
  { name: "a new App → App edge in the allowlist", launder: true, mutate: () => put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts").replace('  "apps/desktop -> apps/local-host",\n', '  "apps/desktop -> apps/local-host",\n  "apps/cli -> apps/mcp",\n')),
    expect: [/new layer exception app-import apps\/cli -> apps\/mcp/] },
  { name: "a new Plugin → Module edge in the allowlist", mutate: () => put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts").replace('  "plugins/native/one -> modules/alpha",\n', '  "plugins/native/one -> modules/alpha",\n  "plugins/native/two -> modules/beta",\n')),
    expect: [/new layer exception plugin-module-import plugins\/native\/two -> modules\/beta/] },
  { name: "an allowlist edge moved to the other list is a new edge there", mutate: () => put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts").replace('  "plugins/native/one -> modules/alpha",\n', '').replace('  "apps/desktop -> apps/local-host",\n', '  "apps/desktop -> apps/local-host",\n  "plugins/native/one -> modules/alpha",\n')),
    expect: [/new layer exception app-import plugins\/native\/one -> modules\/alpha/] },
  { name: "the allowlists renamed so that the gate cannot read them", mutate: () => put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts").replace(/APP_IMPORT_ALLOWLIST/g, "APP_EDGES")),
    expect: [/the layer exception lists can no longer be read from packages\/test-kit\/src\/boundaries\.ts/] },
  // An element that is not a string literal hides its edges from the count (found by a reviewer: the metric passed, and the same
  // change could edit the pinned test next to the new import).
  { name: "an allowlist that spreads another array", launder: true, mutate: () => put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts")
    .replace("export const APP_IMPORT_ALLOWLIST: readonly string[] = [\n", 'const LAUNCHER_EXTRAS = ["apps/cli -> apps/mcp"];\nexport const APP_IMPORT_ALLOWLIST: readonly string[] = [\n  ...LAUNCHER_EXTRAS,\n')),
    expect: [/the layer exception lists can no longer be read from packages\/test-kit\/src\/boundaries\.ts/] },
  { name: "an allowlist element that is an identifier", mutate: () => put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts")
    .replace('  "plugins/native/one -> modules/alpha",\n', '  "plugins/native/one -> modules/alpha",\n  EXTRA_EDGE,\n') + 'const EXTRA_EDGE = "plugins/native/two -> modules/beta";\n'),
    expect: [/the layer exception lists can no longer be read from packages\/test-kit\/src\/boundaries\.ts/] },
  { name: "an allowlist element that is a call or a template with a substitution", mutate: () => put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts")
    .replace('  ". -> apps/desktop",\n', '  ". -> apps/desktop",\n  edge("apps/cli", "apps/mcp"),\n  `apps/cli -> ${"apps/mcp"}`,\n') + 'declare function edge(from: string, to: string): string;\n'),
    expect: [/the layer exception lists can no longer be read from packages\/test-kit\/src\/boundaries\.ts/] },

  // ---- assembly -----------------------------------------------------------------------------------------------------------
  { name: "a new <plugin>-actions.ts file in the Host", launder: true, mutate: () => put("apps/local-host/src/two-actions.ts", "export const twoActionProvider = () => ({});\n"),
    expect: [/new Host file named for a plugin: apps\/local-host\/src\/two-actions\.ts/] },
  { name: "a new <plugin>-native-plugin-http.ts file in the Host", mutate: () => put("apps/local-host/src/two-native-plugin-http.ts", "export const handleTwo = () => 1;\n"),
    expect: [/new Host file named for a plugin: apps\/local-host\/src\/two-native-plugin-http\.ts/] },
  { name: "a Host file for a plugin directory under its singular name", mutate: () => put("apps/local-host/src/artifact-actions.ts", "export const artifactActionProvider = () => ({});\n"),
    expect: [/new Host file named for a plugin: apps\/local-host\/src\/artifact-actions\.ts/] },
  { name: "another registerProvider line in project-host.ts", mutate: () => put("apps/local-host/src/project-host.ts", read("apps/local-host/src/project-host.ts").replace("  registry.registerProvider(searchProvider());\n", "  registry.registerProvider(searchProvider());\n  registry.registerProvider(searchProvider());\n")),
    expect: [/registerProvider calls in apps\/local-host\/src\/project-host\.ts 2 → 3/] },
  { name: "registerProvider in a new Host file", launder: true, mutate: () => put("apps/local-host/src/wiring.ts", "export const wire = (registry: { registerProvider(p: unknown): void }) => registry.registerProvider({});\n"),
    expect: [/registerProvider calls in apps\/local-host\/src\/wiring\.ts 0 → 1/] },
  { name: "a Runtime plugin gets a Host file named for it", mutate: () => put("apps/local-host/src/two-surface.ts", "export const surface = 1;\n"),
    expect: [/hybrid plugin two host-files 0 → 1/] },
  { name: "a Runtime plugin gets a provider registered by hand", mutate: () => put("apps/local-host/src/project-host.ts", read("apps/local-host/src/project-host.ts") + "export const more = (registry: { registerProvider(p: unknown): void }) => registry.registerProvider(twoActionProvider());\ndeclare function twoActionProvider(): unknown;\n"),
    expect: [/hybrid plugin two host-providers 0 → 1/, /registerProvider calls in apps\/local-host\/src\/project-host\.ts 2 → 3/] },
  { name: "a plugin is named in one more file outside its package", launder: true, mutate: () => put("apps/local-host/src/uses-one.ts", 'import { one } from "@fx/plugin-one";\nexport const x = one;\n'),
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
  test(`${scenario.name} fails against the merge-base${scenario.launder ? ", and --update does not hide it" : ""}`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);
    if (!scenario.launder) return;

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
    // The typed-capability rule does not count: an extractor that only reads a definition's type, an action reference or an
    // action definition (they carry no `operation`, or carry `action`), and `.register(…)` on receivers that register nothing typed.
    put("packages/contracts/src/platform/extract.ts", 'import type { HostCapabilityInput } from "./app-host.js";\nexport type Wanted = HostCapabilityInput<number>;\n');
    put("plugins/native/two/src/neutral.ts", [
      "const reference = { capability_id: 'io.example.x', version: 1, provider_id: 'two' };",
      "const action = { capability_id: 'io.example.y', version: 1, operation: 'query', action: { permissions: [] } };",
      "export const wire = (host: { register(value: unknown): void }, ui: { register(value: unknown): void }) => { host.register(reference); ui.register(action); };",
      "",
    ].join("\n"));
    put("server/src/index.ts", read("server/src/index.ts") + "export class Cache { private readonly repository = 1; }\n"); // not a Store, a private member
    // Call sites that are not registrations: a Schedule job names a capability_id (no operation, no spread), a reference copies an id
    // from another record, a helper whose first parameter is not handed to a registration, a namespace of things that are not Stores.
    put("plugins/native/two/src/not-registrations.ts", [
      "export const wire = (schedule: { register(input: unknown): void }, base: { capability_id: string; version: number }) => {",
      "  schedule.register({ plugin_id: 'two', capability_id: 'io.example.two.wakeup', object_ref: 'o' });",
      "  const copy = { ...base, capability_id: base.capability_id };",
      "  const label = (value: any) => String(value);",
      "  return [copy, label(base)];",
      "};",
      "",
    ].join("\n"));
    put("modules/alpha/src/index.ts", read("modules/alpha/src/index.ts") + 'import * as alphaApiFile from "./api.js";\nexport { alphaApiFile };\nexport * as alphaApiNamespace from "./api.js";\n'); // a namespace of non-Stores
    put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts") + 'export const SOME_OTHER_LIST = [...APP_IMPORT_ALLOWLIST];\n'); // another list may spread them; only the two named lists must be literal
    put("apps/other/src/index.ts", read("apps/other/src/index.ts") + "export class MoreStore {}\n"); // an App is not a Module
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
    put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts").replace('  ". -> apps/desktop",\n', "")); // a listed edge is paid back
    git("mv", "packages/contracts/src/platform/app-host.ts", "packages/contracts/src/platform/host.ts"); // a moved file keeps its typed-capability record
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: .*contractsPurity/);
  assert.match(run.out, /hostEntryExports/);
  assert.match(run.out, /moduleRepositoryExports/);
  assert.match(run.out, /pluginOutsideMentions/);
  assert.match(run.out, /layerExceptions/);
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

test("the change that introduces the layer lists passes against a merge-base that does not have them yet", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", "predates");
  git("rm", "-q", "packages/test-kit/src/boundaries.ts");
  commit("before the lists");
  git("checkout", "-q", "-B", "introduces");
  git("checkout", "main", "--", "packages/test-kit/src/boundaries.ts");
  commit("introduce the lists");
  const run = gate("--base", "predates");
  assert.equal(run.code, 0, run.out);
  // From then on the lists are compared: the next change cannot widen them.
  put("packages/test-kit/src/boundaries.ts", read("packages/test-kit/src/boundaries.ts").replace('  "apps/desktop -> apps/local-host",\n', '  "apps/desktop -> apps/local-host",\n  "apps/cli -> apps/mcp",\n'));
  commit("widen");
  const widened = gate("--base", "introduces~1");
  assert.equal(widened.code, 1, widened.out);
  assert.match(widened.out, /new layer exception app-import apps\/cli -> apps\/mcp/);
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
});

// The fixture proves the rules; this proves they read this repository: the alias and the registrars are found by scanning, so
// they have to be found where they are today (a rename of LocalHost or HostMethodCapability is then a visible change to the gate).
test("on this repository the typed capability rule finds the alias and the registrars it is meant to follow", async () => {
  const { createTypedCapabilityIndex } = await import("../scripts/gates/typed-capabilities.mjs");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0")
    .filter((file) => /^(apps|horizontal|modules|packages|plugins|server|tooling)\//.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts") && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file));
  const index = createTypedCapabilityIndex({ files, read: (file: string) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } }, files);
  assert.ok(index.typeNames.has("HostCapabilityDefinition"));
  if (/export type HostMethodCapability\b/.test(readFileSync(path.join(root, "packages/contracts/src/platform/app-host.ts"), "utf8"))) {
    assert.ok(index.typeNames.has("HostMethodCapability"), "the alias that wraps the definition is followed");
  }
  assert.ok(!index.typeNames.has("HostCapabilityInput"), "a type that only reads a definition is not an alias");
  assert.ok(!index.typeNames.has("ActionDefinition"), "an interface that extends the definition is the action path, not an alias");
  for (const registrar of ["LocalHost", "CapabilityRegistry"]) assert.ok(index.registrarTypes.has(registrar), `${registrar} registers typed capabilities`);
  const counts = index.countsOf("apps/local-host/src/project-capabilities.ts");
  assert.ok(counts["register-calls"] > 0, "the Host's own registrations through `host.register(…)` are counted");
  // The Agent Host registers about 40 typed capabilities through a local helper whose first parameter is the definition.
  const agent = index.countsOf("horizontal/agent-host/src/capability-registration.ts");
  assert.ok(agent["register-calls"] >= 30, `the local \`register\` helper of the Agent Host is followed (${agent["register-calls"]} register-calls)`);
  assert.ok(agent["without-action"] >= 0 && agent["type-refs"] > 0);
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
  assert.equal(base.head.typedCapabilities["apps/local-host/src/local-host.ts#register-calls"], 2, "the call of registerCapability and the method that hands its definition on to register");
  assert.deepEqual(base.head.layerExceptions, { "lists#declared": 1, "app-import#. -> apps/desktop": 1, "app-import#apps/desktop -> apps/local-host": 1, "plugin-module-import#plugins/native/one -> modules/alpha": 1 });
  assert.equal(base.head.typedCapabilities["plugins/native/one/src/entry-capabilities.ts#type-refs"], 1, "the alias, imported under another name, is a typed reference");
  assert.equal(base.head.typedCapabilities["plugins/native/one/src/entry-capabilities.ts#without-action"], 1);
  assert.equal(base.head.typedCapabilities["apps/local-host/src/casebook/integration.ts#register-calls"], 2, "registrations on a LocalHost parameter are counted");
  assert.equal(base.head.typedCapabilities["horizontal/agent-host/src/capability-registration.ts#register-calls"], 2, "the registrar call inside the helper and the call of the helper");
  assert.equal(base.head.typedCapabilities["horizontal/agent-host/src/capability-registration.ts#without-action"], 1);
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
