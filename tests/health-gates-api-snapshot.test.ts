import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// specs/repository-anti-corruption §4.13 (W1-04): the public API of the contracts package (every subpath) and of the plugin
// SDK is written down in tooling/gates/api, and the health gate fails when the source and the snapshot differ. The snapshot
// is refreshed on purpose with `node scripts/gates/api-snapshot.mjs --update`. Each rule is mutation-verified on a scratch
// repository, in the style of tests/health-gates-merge-base.test.ts: one change made on a branch makes `--base main` fail,
// the counters' `--update` does not hide it, and only the deliberate refresh does. What the snapshot leaves out passes.
// The shapes subpath below holds the cases where one name has several declarations (overloads, a type that shares its name
// with a const, a name exported twice) and where a declaration is reached through a file that no subpath exports.
const gateScript = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
const apiScript = fileURLToPath(new URL("../scripts/gates/api-snapshot.mjs", import.meta.url));
let repo = "";

const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: dir, encoding: "utf8", stdio: "pipe" });
const git = (...args: string[]) => gitAt(repo, ...args);
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const run = (script: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
};
const gate = (...args: string[]) => run(gateScript, ...args);
const api = (...args: string[]) => run(apiScript, ...args);
const exportsMap = (...subpaths: string[]) => Object.fromEntries(subpaths.map((subpath) => {
  const base = subpath === "." ? "index" : subpath.slice(2);
  return [subpath, { types: `./dist/${base}.d.ts`, import: `./dist/${base}.js` }];
}));

const ALPHA = `/** A thing. */
export interface Alpha {
  readonly id: string;
  readonly count: number;
}
export type AlphaKind = "a" | "b";
export const ALPHA_ID = "io.example.alpha";
/** Makes one. */
export function makeAlpha(id: string, count: number): Alpha {
  return { id, count };
}
export class AlphaError extends Error {
  constructor(readonly code: "bad" | "worse", message: string) { super(message); }
}
export * from "../internal/shared.js";
const hidden = () => 1;
export const useHidden = () => hidden();
`;
const BETA = `import type { Alpha } from "../modules/alpha.js";
export type Holder = { readonly alpha: Alpha; readonly tags: readonly string[] };
interface Helper { x: number }
export interface UsesHelper { helper: Helper }
`;
const SHAPES = `import type { Base } from "../internal/base.js";
export function parse(input: string): number;
export function parse(input: number): string;
export function parse(input: string | number): number | string { return typeof input === "string" ? input.length : String(input); }
export const Mode = ["fast", "slow"] as const;
export type Mode = (typeof Mode)[number];
export interface Entry extends Base { readonly kind: "entry" }
export type { Visible } from "../internal/many.js";
const sealed = { n: 1 } as const;
export { sealed };
export class Err extends Error { readonly code = "err"; }
export { Err as AliasErr };
`;
const BASE = `import type { Deep } from "./deep.js";
export interface Base { readonly id: string; readonly deep: Deep }
`;
const DEEP = "export interface Deep { readonly depth: number }\n";
const MANY = `export interface Visible { readonly part: Part }
export interface Part { readonly n: number }
export interface Unused { readonly never: true }
`;
const SDK = `import type { Alpha } from "@molis-ai/molis-work-contracts/modules/alpha";
export type { Alpha } from "@molis-ai/molis-work-contracts/modules/alpha";
export { makeAlpha } from "@molis-ai/molis-work-contracts/modules/alpha";
export function definePlugin(alpha: Alpha): Alpha { return alpha; }
`;

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-health-api-"));
  gitAt(repo, "init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("packages/contracts/package.json", JSON.stringify({ name: "@molis-ai/molis-work-contracts", exports: exportsMap(".", "./modules/alpha", "./modules/shapes", "./platform/beta") }, null, 2) + "\n");
  put("packages/contracts/src/index.ts", "export const contractsVersion = 1;\n");
  put("packages/contracts/src/modules/alpha.ts", ALPHA);
  put("packages/contracts/src/platform/beta.ts", BETA);
  put("packages/contracts/src/modules/shapes.ts", SHAPES);
  put("packages/contracts/src/internal/base.ts", BASE);
  put("packages/contracts/src/internal/deep.ts", DEEP);
  put("packages/contracts/src/internal/many.ts", MANY);
  put("packages/contracts/src/internal/shared.ts", "export const SHARED = 3;\nexport type Shared = { readonly n: number };\n");
  put("packages/plugin-sdk/package.json", JSON.stringify({ name: "@molis-ai/molis-work-plugin-sdk", exports: exportsMap(".") }, null, 2) + "\n");
  put("packages/plugin-sdk/src/index.ts", SDK);
  const generated = api("--update");
  assert.equal(generated.code, 0, generated.out);
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
const snapshot = (file: string) => read(`tooling/gates/api/${file}.txt`);

test("the snapshot holds the declarations, without comments, with the paths a caller cannot see left out", () => {
  git("checkout", "-q", "-f", "main");
  const alpha = snapshot("contracts/modules/alpha");
  assert.match(alpha, /^\/\/ @molis-ai\/molis-work-contracts\/modules\/alpha: public API snapshot\./);
  assert.match(alpha, /export interface Alpha \{\n    readonly id: string;\n    readonly count: number;\n\}/);
  assert.match(alpha, /export declare function makeAlpha\(id: string, count: number\): Alpha;/);
  assert.match(alpha, /export declare const ALPHA_ID = "io\.example\.alpha";/);
  assert.match(alpha, /export declare class AlphaError extends Error \{\n    readonly code: "bad" \| "worse";/);
  assert.match(alpha, /export declare const SHARED = 3;/, "a name re-exported from an internal file is part of the entry");
  assert.doesNotMatch(alpha, /A thing|Makes one|\/\*\*/, "comments are not part of the API");
  assert.doesNotMatch(alpha, /hidden\b/, "a non-exported helper that no export mentions is not listed");
  assert.doesNotMatch(alpha, /internal|shared\.ts/, "which file declares a name is not recorded");
  // A helper that an export refers to but does not export is listed after the exports, so changing it is not invisible.
  const beta = snapshot("contracts/platform/beta");
  assert.match(beta, /export interface UsesHelper \{\n    helper: Helper;\n\}/);
  assert.match(beta, /Declarations the exports above refer to, which no entry exports itself:\n\ninterface Helper \{\n    x: number;\n\}/);
  assert.match(snapshot("contracts/index"), /export declare const contractsVersion = 1;/);
  // The plugin SDK says where a re-exported name is declared instead of repeating the declaration.
  const sdk = snapshot("plugin-sdk/index");
  assert.match(sdk, /export type \{ Alpha \} from "@molis-ai\/molis-work-contracts\/modules\/alpha";/);
  assert.match(sdk, /export \{ makeAlpha \} from "@molis-ai\/molis-work-contracts\/modules\/alpha";/);
  assert.match(sdk, /export declare function definePlugin\(alpha: Alpha\): Alpha;/);
  assert.doesNotMatch(sdk, /readonly count: number/);
  assert.equal(gate("--base", "main").code, 0);
  assert.equal(api().code, 0);
});

test("every statement of a name is in the snapshot, and what an export reaches through a file no subpath exports is listed", () => {
  git("checkout", "-q", "-f", "main");
  const shapes = snapshot("contracts/modules/shapes");
  // Overloads: each signature, in source order (the order decides which one a call resolves to).
  const first = shapes.indexOf("export declare function parse(input: string): number;"), second = shapes.indexOf("export declare function parse(input: number): string;");
  assert.ok(first >= 0 && second > first, "both overloads, the one written first first");
  assert.doesNotMatch(shapes, /input: string \| number/, "the implementation signature is not part of the API");
  // A const and a type that share a name.
  assert.match(shapes, /export declare const Mode: readonly \["fast", "slow"\];/);
  assert.match(shapes, /export type Mode = \(typeof Mode\)\[number\];/);
  // A name exported twice, and a statement exported by `export { x }`.
  assert.match(shapes, /export declare class Err extends Error \{\n    readonly code = "err";\n\}\n/);
  assert.match(shapes, /export declare class Err extends Error \{[^]*?\}\n\/\/ exported from this entry as "AliasErr"/);
  assert.match(shapes, /export declare const sealed: \{\n    readonly n: 1;\n\};/);
  // Helpers in files that no subpath exports: the base the interface extends, what the base refers to (two files away), and
  // a declaration that its own file exports but that no entry does. A declaration nothing refers to is not listed.
  const [exportsPart, helpersPart] = shapes.split("// Declarations the exports above refer to, which no entry exports itself:");
  assert.ok(helpersPart, "there is a helper section");
  assert.match(exportsPart, /export interface Entry extends Base \{/);
  assert.match(helpersPart, /\ninterface Base \{\n    readonly id: string;\n    readonly deep: Deep;\n\}/);
  assert.match(helpersPart, /\ninterface Deep \{\n    readonly depth: number;\n\}/);
  assert.match(helpersPart, /\ninterface Part \{\n    readonly n: number;\n\}/);
  assert.doesNotMatch(shapes, /Unused|never: true/);
  assert.doesNotMatch(shapes, /internal|many\.ts|base\.ts/, "which file declares a name is not recorded");
});

// A change to the API that is not accompanied by a snapshot update. `expect` patterns are tested against the gate's output.
type Scenario = { name: string; mutate: () => void; expect: RegExp[]; restores?: boolean };
const violations: Scenario[] = [
  { name: "a new export", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA + "export const EXTRA = 1;\n"),
    expect: [/tooling\/gates\/api\/contracts\/modules\/alpha\.txt: the source no longer matches the snapshot/, /\+ export declare const EXTRA = 1;/] },
  { name: "a new export reached through an internal file", mutate: () => { put("packages/contracts/src/internal/shared.ts", read("packages/contracts/src/internal/shared.ts") + "export const MORE = 4;\n"); },
    expect: [/modules\/alpha\.txt/, /\+ export declare const MORE = 4;/] },
  { name: "a removed export", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace('export type AlphaKind = "a" | "b";\n', "")),
    expect: [/- export type AlphaKind = "a" \| "b";/] },
  { name: "a changed function signature", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace("count: number): Alpha", "count: string): Alpha")),
    expect: [/- export declare function makeAlpha\(id: string, count: number\): Alpha;/, /\+ export declare function makeAlpha\(id: string, count: string\): Alpha;/] },
  { name: "a changed return type that was inferred", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace("export const useHidden = () => hidden();", "export const useHidden = () => String(hidden());")),
    expect: [/\+ export declare const useHidden: \(\) => string;/] },
  { name: "a field added to an interface", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace("readonly count: number;\n}", "readonly count: number;\n  readonly note?: string;\n}")),
    expect: [/~ export interface Alpha \{ \(\+ readonly note\?: string\)/] },
  { name: "a field made optional", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace("readonly id: string;", "readonly id?: string;")), expect: [/~ export interface Alpha \{ \(- readonly id: string; \+ readonly id\?: string\)/] },
  { name: "a union member added", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace('"a" | "b"', '"a" | "b" | "c"')), expect: [/\+ export type AlphaKind = "a" \| "b" \| "c";/] },
  { name: "a changed constant value", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace("io.example.alpha", "io.example.alpha2")), expect: [/\+ export declare const ALPHA_ID = "io\.example\.alpha2";/] },
  { name: "a changed class member", mutate: () => put("packages/contracts/src/modules/alpha.ts", ALPHA.replace('"bad" | "worse"', '"bad" | "worse" | "dire"')), expect: [/~ export declare class AlphaError extends Error \{ \(- readonly code: "bad" \| "worse"/] },
  { name: "a helper type that an export uses changes", mutate: () => put("packages/contracts/src/platform/beta.ts", BETA.replace("interface Helper { x: number }", "interface Helper { x: number; y: number }")),
    expect: [/platform\/beta\.txt/, /~ interface Helper \{ \(\+ y: number\)/] },
  { name: "the return type of the second overload changes", mutate: () => put("packages/contracts/src/modules/shapes.ts", SHAPES.replace("parse(input: number): string;", "parse(input: number): string | null;")),
    expect: [/modules\/shapes\.txt: the source no longer matches the snapshot/, /\+ export declare function parse\(input: number\): string \| null;/] },
  { name: "an overload is added", mutate: () => put("packages/contracts/src/modules/shapes.ts", SHAPES.replace("export function parse(input: string | number)", "export function parse(input: boolean): boolean;\nexport function parse(input: string | number)")),
    expect: [/\+ export declare function parse\(input: boolean\): boolean;/] },
  { name: "the overloads swap places", mutate: () => put("packages/contracts/src/modules/shapes.ts", SHAPES.replace("export function parse(input: string): number;\nexport function parse(input: number): string;", "export function parse(input: number): string;\nexport function parse(input: string): number;")),
    expect: [/modules\/shapes\.txt: the source no longer matches the snapshot/] },
  { name: "the type that shares its name with a const changes", mutate: () => put("packages/contracts/src/modules/shapes.ts", SHAPES.replace("(typeof Mode)[number];", "(typeof Mode)[number] | null;")),
    expect: [/\+ export type Mode = \(typeof Mode\)\[number\] \| null;/] },
  { name: "the const that shares its name with a type changes", mutate: () => put("packages/contracts/src/modules/shapes.ts", SHAPES.replace('["fast", "slow"]', '["fast", "slow", "mid"]')),
    expect: [/\+ export declare const Mode: readonly \["fast", "slow", "mid"\];/] },
  { name: "a name exported under a second name loses that alias", mutate: () => put("packages/contracts/src/modules/shapes.ts", SHAPES.replace("export { Err as AliasErr };\n", "")),
    expect: [/- export declare class Err extends Error \{ \[as "AliasErr"\]/] },
  { name: "a statement exported by `export { x }` changes", mutate: () => put("packages/contracts/src/modules/shapes.ts", SHAPES.replace("{ n: 1 }", "{ n: 2 }")),
    expect: [/~ export declare const sealed: \{ \(- readonly n: 1; \+ readonly n: 2\)/] },
  { name: "a required field is added to a base declared in a file no subpath exports", mutate: () => put("packages/contracts/src/internal/base.ts", BASE.replace("readonly id: string;", "readonly id: string; readonly extra: string;")),
    expect: [/modules\/shapes\.txt/, /~ interface Base \{ \(\+ readonly extra: string\)/] },
  { name: "a declaration two files away from the export changes", mutate: () => put("packages/contracts/src/internal/deep.ts", DEEP.replace("depth: number", "depth: string")),
    expect: [/~ interface Deep \{ \(- readonly depth: number; \+ readonly depth: string\)/] },
  { name: "a declaration that its own file exports but no entry does changes", mutate: () => put("packages/contracts/src/internal/many.ts", MANY.replace("readonly n: number", "readonly n: bigint")),
    expect: [/~ interface Part \{ \(- readonly n: number; \+ readonly n: bigint\)/] },
  { name: "a new subpath without a snapshot", mutate: () => {
    put("packages/contracts/package.json", JSON.stringify({ name: "@molis-ai/molis-work-contracts", exports: exportsMap(".", "./modules/alpha", "./modules/shapes", "./platform/beta", "./platform/gamma") }, null, 2) + "\n");
    put("packages/contracts/src/platform/gamma.ts", "export const GAMMA = 1;\n");
  }, expect: [/tooling\/gates\/api\/contracts\/platform\/gamma\.txt: no snapshot/] },
  { name: "a subpath removed while its snapshot stays", mutate: () => {
    put("packages/contracts/package.json", JSON.stringify({ name: "@molis-ai/molis-work-contracts", exports: exportsMap(".", "./modules/alpha", "./modules/shapes") }, null, 2) + "\n");
  }, expect: [/tooling\/gates\/api\/contracts\/platform\/beta\.txt: no longer an exported subpath; the snapshot is stale/] },
  { name: "a snapshot edited by hand to say something else", restores: true, mutate: () => put("tooling/gates/api/contracts/modules/alpha.txt", snapshot("contracts/modules/alpha").replace("count: number): Alpha", "count: bigint): Alpha")),
    expect: [/modules\/alpha\.txt: the source no longer matches the snapshot/, /\+ export declare function makeAlpha\(id: string, count: number\): Alpha;/] },
  { name: "a snapshot file deleted", restores: true, mutate: () => rmSync(path.join(repo, "tooling/gates/api/contracts/modules/alpha.txt")), expect: [/modules\/alpha\.txt: no snapshot/] },
  { name: "a plugin SDK re-export added", mutate: () => put("packages/plugin-sdk/src/index.ts", SDK + 'export type { AlphaKind } from "@molis-ai/molis-work-contracts/modules/alpha";\n'),
    expect: [/plugin-sdk\/index\.txt/, /\+ export type \{ AlphaKind \} from "@molis-ai\/molis-work-contracts\/modules\/alpha";/] },
  { name: "a plugin SDK function signature changed", mutate: () => put("packages/plugin-sdk/src/index.ts", SDK.replace("definePlugin(alpha: Alpha): Alpha", "definePlugin(alpha: Alpha, extra?: string): Alpha")),
    expect: [/plugin-sdk\/index\.txt/, /\+ export declare function definePlugin\(alpha: Alpha, extra\?: string\): Alpha;/] },
  { name: "an export the plugin SDK takes from the contracts is removed there", mutate: () => put("packages/plugin-sdk/src/index.ts", SDK.replace('export { makeAlpha } from "@molis-ai/molis-work-contracts/modules/alpha";\n', "")),
    expect: [/- export \{ makeAlpha \} from/] },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base, and only the deliberate refresh clears it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    assert.match(caught.out, /changed without a snapshot update/);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);
    assert.match(caught.out, /node scripts\/gates\/api-snapshot\.mjs --update/, "the message names the command that refreshes the snapshot");

    // The refresh on purpose: now it passes. When the source differs from the merge-base's, the log lists what the PR
    // changes in the public API (a hand-edited or deleted snapshot is put back as it was, so there is nothing to list).
    const refreshed = api("--update");
    assert.equal(refreshed.code, 0, refreshed.out);
    commit("refresh the API snapshot");
    const passed = gate("--base", "main");
    assert.equal(passed.code, 0, passed.out);
    if (scenario.restores) assert.doesNotMatch(passed.out, /public API changes/);
    else assert.match(passed.out, /public API changes against the merge-base/);
  });
}

test("the counters' --update, a rewritten baseline and the quick check do not clear an API change", () => {
  branch("laundering", () => put("packages/contracts/src/modules/alpha.ts", ALPHA + "export const EXTRA = 1;\n"));
  assert.equal(gate("--base", "main").code, 1);
  assert.equal(gate("--update", "--base", "main").code, 0, "nothing grew, so the baseline is rewritten");
  assert.equal(gate("--update").code, 0);
  commit("update baseline");
  assert.equal(gate("--base", "main").code, 1);
  assert.equal(gate().code, 1, "the quick local check fails as well");
  assert.equal(api().code, 1, "and so does the stand-alone check");
  assert.match(api().out, /\+ export declare const EXTRA = 1;/);
  assert.equal(api("--update").code, 0);
  assert.equal(api().code, 0);
  assert.equal(api("--update").out.match(/(\d+) written/)?.[1], "0", "a second refresh changes nothing");
});

test("comments, bodies, non-exported helpers and the order of the exports are not part of the API", () => {
  branch("invisible", () => {
    put("packages/contracts/src/modules/alpha.ts", `/** A rewritten comment. */
export const ALPHA_ID = "io.example.alpha";
export class AlphaError extends Error {
  // a comment inside
  constructor(readonly code: "bad" | "worse", message: string) { super(message); }
}
const hidden = () => 2;
const another = () => 3;
export const useHidden = () => hidden() + another();
/** Rewritten. */
export function makeAlpha(id: string, count: number): Alpha {
  return { id, count: count + 0 };
}
export type AlphaKind = "a" | "b";
export interface Alpha {
  readonly id: string;
  readonly count: number;
}
export * from "../internal/shared.js";
`);
  });
  const passed = gate("--base", "main");
  assert.equal(passed.code, 0, passed.out);
  assert.doesNotMatch(passed.out, /public API changes/);
  assert.equal(api().code, 0);
});

test("a pure move of a declaration to another file of the package leaves the snapshot alone", () => {
  branch("pure-move", () => {
    put("packages/contracts/src/internal/make.ts", `import type { Alpha } from "../modules/alpha.js";
export function makeAlpha(id: string, count: number): Alpha { return { id, count }; }
`);
    put("packages/contracts/src/modules/alpha.ts", ALPHA.replace(/\/\*\* Makes one\. \*\/\nexport function makeAlpha[^]*?\n}\n/, 'export { makeAlpha } from "../internal/make.js";\n'));
    assert.doesNotMatch(read("packages/contracts/src/modules/alpha.ts"), /return \{ id, count \}/, "the declaration really moved");
  });
  const passed = gate("--base", "main");
  assert.equal(passed.code, 0, passed.out);
  assert.doesNotMatch(passed.out, /public API changes/);
  assert.equal(api("--update").out.match(/(\d+) written/)?.[1], "0");
});

test("moving a helper between files that no subpath exports leaves the snapshot alone", () => {
  branch("helper-move", () => {
    put("packages/contracts/src/internal/moved.ts", BASE);
    put("packages/contracts/src/internal/base.ts", 'export type { Base } from "./moved.js";\n');
    put("packages/contracts/src/internal/part.ts", "export interface Part { readonly n: number }\n");
    put("packages/contracts/src/internal/many.ts", 'import type { Part } from "./part.js";\nexport type { Part };\n' + MANY.replace("export interface Part { readonly n: number }\n", ""));
    assert.doesNotMatch(read("packages/contracts/src/internal/many.ts"), /interface Part/, "the declaration really moved");
  });
  const passed = gate("--base", "main");
  assert.equal(passed.code, 0, passed.out);
  assert.doesNotMatch(passed.out, /public API changes/);
  assert.equal(api("--update").out.match(/(\d+) written/)?.[1], "0");
});

test("an unreadable package is an error, never a pass", () => {
  branch("broken-exports", () => {
    put("packages/contracts/package.json", JSON.stringify({ name: "@molis-ai/molis-work-contracts", exports: { ".": "./index.js", "./modules/alpha": exportsMap("./modules/alpha")["./modules/alpha"], "./platform/beta": exportsMap("./platform/beta")["./platform/beta"], "./platform/missing": exportsMap("./platform/missing")["./platform/missing"] } }, null, 2) + "\n");
  });
  const caught = gate("--base", "main");
  assert.equal(caught.code, 1, caught.out);
  assert.match(caught.out, /export "\." is not a plain subpath pointing into \.\/dist\//);
  assert.match(caught.out, /export "\.\/platform\/missing" has no source at packages\/contracts\/src\/platform\/missing\.ts/);
  const refresh = api("--update");
  assert.equal(refresh.code, 2, "a refresh never writes from a package it cannot read");
  assert.equal(git("status", "--porcelain"), "");
});

test("a root without the API packages has nothing to snapshot and says so", () => {
  const empty = mkdtempSync(path.join(tmpdir(), "molis-health-api-empty-"));
  try {
    mkdirSync(path.join(empty, "tooling/gates"), { recursive: true });
    writeFileSync(path.join(empty, "tooling/gates/limits.json"), read("tooling/gates/limits.json"));
    gitAt(empty, "init", "-q", "-b", "main");
    gitAt(empty, "add", "-A");
    gitAt(empty, "commit", "-q", "-m", "x");
    const result = spawnSync(process.execPath, [gateScript, "--root", empty, "--base", "main"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no API package in this root/);
    assert.ok(!existsSync(path.join(empty, "tooling/gates/api")));
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("the report says whether the snapshots match", () => {
  git("checkout", "-q", "-f", "main");
  assert.match(gate("--report", "--base", "main").out, /Public API snapshots: 5 API snapshot files, \d+ declarations/);
});

// An independent check of the helpers, on this repository: a capitalised name that a committed snapshot mentions and that
// some package source declares at the top level must be declared in a snapshot (as an export or as a helper). It found
// the gap this rule closes (GoalWorkEventBase, a base type in a file no subpath exports). A generic parameter that happens
// to share its name with a top-level declaration of the packages would show up here too; rename the parameter.
test("the committed snapshots of this repository leave no mentioned declaration out", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const walk = (directory: string, found: string[] = []): string[] => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.isDirectory()) { if (item.name !== "node_modules" && item.name !== "dist") walk(path.join(directory, item.name), found); } else found.push(path.join(directory, item.name));
    }
    return found;
  };
  const declared = new Set<string>();
  for (const pkg of ["packages/contracts", "packages/plugin-sdk"]) {
    for (const file of walk(path.join(repoRoot, pkg, "src")).filter((candidate) => candidate.endsWith(".ts"))) {
      for (const statement of ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true).statements) {
        if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) { if (ts.isIdentifier(declaration.name)) declared.add(declaration.name.text); }
        else if ("name" in statement && statement.name && ts.isIdentifier(statement.name as ts.Node)) declared.add((statement.name as ts.Identifier).text);
      }
    }
  }
  const snapshots = walk(path.join(repoRoot, "tooling/gates/api")).filter((file) => file.endsWith(".txt")).map((file) => ({ file, text: readFileSync(file, "utf8") }));
  // One snapshot per contracts entry (the root and every subpath) plus the plugin SDK's own: tied to package.json, so a subpath that goes needs no edit here.
  const contractsEntries = Object.keys(JSON.parse(readFileSync(path.join(repoRoot, "packages/contracts/package.json"), "utf8")).exports).length;
  assert.ok(snapshots.length > contractsEntries, "the snapshots are committed");
  const DECLARATION = /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum|namespace)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  const carried = new Set(snapshots.flatMap(({ text }) => [...text.matchAll(DECLARATION)].map((match) => match[1])));
  const missing = snapshots.flatMap(({ file, text }) => {
    const body = text.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/^\/\/.*$/gm, "");
    return [...new Set(body.match(/[A-Z][A-Za-z0-9_$]*/g) ?? [])].filter((name) => declared.has(name) && !carried.has(name)).map((name) => `${path.relative(repoRoot, file)}: ${name}`);
  });
  assert.deepEqual(missing, [], "a snapshot mentions a declaration that no snapshot carries; the helper lookup in scripts/gates/api-snapshot.mjs does not reach it");
});
