import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { PROJECT_START_LIST, dualInstanceProblems } from "../scripts/gates/dual-instance.mjs";

// DUAL-11 and DUAL-12 (specs/dual-instance-plugins), the gate half: a Home catalog entry marked `runtime.dual_instance` has its
// project half on the project start list and the other way round, both halves ship with the Host, and its Manifest has no optional
// permission (scripts/gates/dual-instance.mjs). The Host refuses the first two when it starts; the third only this gate checks.
// Each case is a small in-memory tree; the repository's own tree has no problem.

type Tree = Record<string, string>;
const snapshot = (tree: Tree) => ({ files: Object.keys(tree), read: (file: string) => tree[file] ?? null });
const CATALOG = "apps/workbench/src/builtin-plugins.ts";
const PACKAGE = "@molis-ai/molis-work-plugin-probe";
const lines = (...parts: string[]) => `${parts.join("\n")}\n`;

/**
 * A tree with one dual-instance plugin, `probe`. Its project half is an entry of the project start list by default; `declared`
 * writes it as the registration's `project_runtime` instead, the way a built-in plugin package writes it (PG-067).
 */
function dualTree(change: { runtime?: string; manifest?: string; project?: string; permissions?: string; declared?: string } = {}): Tree {
  return {
    [CATALOG]: lines(`import { registration as probe } from "${PACKAGE}/registration";`, "export const BUILTIN_PLUGIN_CATALOG = [probe];"),
    "plugins/native/probe/package.json": JSON.stringify({ name: PACKAGE }),
    "plugins/native/probe/src/registration.ts": lines(
      `import { probeManifest, createProbePlugin } from "./index.js";`,
      "export const registration = {",
      `  manifest: ${change.manifest ?? "probeManifest"},`,
      `  runtime: { create: createProbePlugin, package_name: "${PACKAGE}", factory_export: "createProbePlugin"${change.runtime ?? ", dual_instance: true"} },`,
      ...change.declared === undefined ? [] : [`  project_runtime: ${change.declared},`],
      "};"),
    "plugins/native/probe/src/index.ts": lines(`export * from "./manifest.js";`, `export { createProbePlugin } from "./plugin.js";`),
    "plugins/native/probe/src/manifest.ts": lines(
      `const PERMISSIONS = [${change.permissions ?? `{ permission: "storage:private", required: true, reason: "库" }, { permission: "probe:read", required: true, reason: "读" }`}];`,
      `export const probeManifest = { plugin_id: "io.molis.work.example.probe", permissions: PERMISSIONS } as const satisfies object;`),
    [PROJECT_START_LIST]: lines(
      `import { createProbePlugin } from "${PACKAGE}";`,
      `import { createOtherPlugin } from "@molis-ai/molis-work-plugin-other";`,
      `const entries = [${change.project ?? "{ definition: createProbePlugin(ports), trust: HOST_BUILD_TRUST }"}, { definition: createOtherPlugin(), trust: HOST_BUILD_TRUST }];`),
  };
}

test("DUAL-12 a marked Home entry with its bundled project half and only required permissions passes", () => {
  assert.deepEqual(dualInstanceProblems(snapshot(dualTree())), []);
});

test("DUAL-12 a marked Home entry needs its project half, and a plugin on both lists needs the mark on its Home entry", () => {
  const [lonely] = dualInstanceProblems(snapshot(dualTree({ project: "{ definition: createOtherPlugin(), trust: HOST_BUILD_TRUST }" })));
  assert.match(lonely, /runtime\.dual_instance marks @molis-ai\/molis-work-plugin-probe as a dual-instance plugin, but .* starts no project half/u);
  const [unmarked] = dualInstanceProblems(snapshot(dualTree({ runtime: "" })));
  assert.match(unmarked, /@molis-ai\/molis-work-plugin-probe is also a Home catalog entry .*runtime\.dual_instance: true/u);
  assert.match(dualInstanceProblems(snapshot(dualTree({ runtime: ", dual_instance: Boolean(1)" })))[0], /write runtime\.dual_instance as the literal true/u);
});

test("DUAL-12 RAC-571 the project half may be the registration's project_runtime: marked passes, unmarked fails, an unreadable one fails", () => {
  const declared = `{ create: createProjectProbePlugin, package_name: "${PACKAGE}", factory_export: "createProjectProbePlugin" }`;
  const startsOther = "{ definition: createOtherPlugin(), trust: HOST_BUILD_TRUST }";
  assert.deepEqual(dualInstanceProblems(snapshot(dualTree({ declared, project: startsOther }))), []);
  const [unmarked] = dualInstanceProblems(snapshot(dualTree({ declared, project: startsOther, runtime: "" })));
  assert.match(unmarked, /plugins\/native\/probe\/src\/registration\.ts: @molis-ai\/molis-work-plugin-probe is also a Home catalog entry .*runtime\.dual_instance: true/u);
  assert.match(dualInstanceProblems(snapshot(dualTree({ declared: "PROJECT_RUNTIME", project: startsOther })))[0], /cannot tell which plugin package project_runtime starts/u);
});

test("DUAL-12 both halves ship with the Host: a project half that is not bundled fails", () => {
  for (const project of ["{ definition: createProbePlugin(ports) }", "{ definition: createProbePlugin(ports), trust: UNSIGNED_TRUST }"]) {
    assert.match(dualInstanceProblems(snapshot(dualTree({ project })))[0], /project half of the dual-instance plugin .* must say trust: HOST_BUILD_TRUST/u, project);
  }
});

test("DUAL-11 a dual-instance Manifest with an optional permission, or one the gate cannot read, fails", () => {
  const optional = [
    `{ permission: "probe:read", required: false, reason: "读" }`,
    `{ permission: "probe:read", reason: "读" }`,
    `{ permission: "probe:read", required: name === "probe:read", reason: "读" }`,
    `...READS`,
    `permissionFor("probe:read")`,
  ];
  for (const permission of optional) {
    const problems = dualInstanceProblems(snapshot(dualTree({ permissions: `{ permission: "storage:private", required: true, reason: "库" }, ${permission}` })));
    assert.equal(problems.length, 1, `${permission}: ${problems.join("\n")}`);
    assert.match(problems[0], /has a permission that is not `required: true` as a literal/u, permission);
  }
  assert.match(dualInstanceProblems(snapshot(dualTree({ manifest: "defineManifest({})" })))[0], /cannot read the Manifest of the dual-instance plugin/u);
  // An unmarked Home plugin may keep optional permissions: the rule is only for dual-instance plugins.
  const unmarked = dualTree({ runtime: "", permissions: `{ permission: "probe:read", required: false, reason: "读" }`, project: "{ definition: createOtherPlugin(), trust: HOST_BUILD_TRUST }" });
  assert.deepEqual(dualInstanceProblems(snapshot(unmarked)), []);
});

test("DUAL-11 a dual-instance Manifest whose permissions the gate cannot follow fails rather than passes", () => {
  const manifest = (body: string): Tree => ({ ...dualTree(), "plugins/native/probe/src/manifest.ts": body });
  const unreadable = [
    // The permissions come from a module the gate does not follow.
    lines(`import { SHARED } from "@molis-ai/molis-work-plugin-shared";`, `export const probeManifest = { plugin_id: "io.molis.work.example.probe", permissions: SHARED };`),
    // A spread can bring permissions in.
    lines(`const BASE = { permissions: [{ permission: "probe:read", required: false, reason: "读" }] };`, `export const probeManifest = { ...BASE, plugin_id: "io.molis.work.example.probe" };`),
    // A spread in a permission can override its required.
    lines(`const OPTIONAL = { required: false };`, `export const probeManifest = { plugin_id: "io.molis.work.example.probe", permissions: [{ permission: "probe:read", required: true, reason: "读", ...OPTIONAL }] };`),
  ];
  for (const body of unreadable) {
    const problems = dualInstanceProblems(snapshot(manifest(body)));
    assert.equal(problems.length, 1, `${body}${problems.join("\n")}`);
    assert.match(problems[0], /cannot read the (Manifest|permissions) of the dual-instance plugin|has a permission that is not `required: true`/u, body);
  }
  // The shorthand `{ permissions }` is followed as `{ permissions: permissions }`.
  const shorthand = (required: string) => manifest(lines(`const permissions = [{ permission: "probe:read", required: ${required}, reason: "读" }];`,
    `export const probeManifest = { plugin_id: "io.molis.work.example.probe", permissions };`));
  assert.deepEqual(dualInstanceProblems(snapshot(shorthand("true"))), []);
  assert.match(dualInstanceProblems(snapshot(shorthand("false")))[0], /has a permission that is not `required: true`/u);
  // Two files that `export *` each other end the search, which says it cannot read the Manifest, instead of recursing forever.
  const cycle: Tree = { ...dualTree(), "plugins/native/probe/src/manifest.ts": lines(`export * from "./index.js";`) };
  assert.match(dualInstanceProblems(snapshot(cycle))[0], /cannot read the Manifest of the dual-instance plugin/u);
});

test("DUAL-12 a project entry whose plugin package the gate cannot tell fails rather than passes", () => {
  const [problem] = dualInstanceProblems(snapshot(dualTree({ project: "{ definition: probeDefinition, trust: HOST_BUILD_TRUST }" })));
  assert.match(problem, /cannot tell which plugin package the entry .* starts/u);
});

test("DUAL-12 the repository's own catalog and project start list have no dual-instance problem", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = [CATALOG, PROJECT_START_LIST, ...readdirSync(`${root}plugins/native`).map(directory => `plugins/native/${directory}/package.json`)];
  const read = (file: string) => { try { return readFileSync(`${root}${file}`, "utf8"); } catch { return null; } };
  assert.deepEqual(dualInstanceProblems({ files, read }), []);
});

// ---- the wiring into pnpm health:check (scripts/check-health-gates.mjs), on a scratch repository -------------------------------------
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";
const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (tree: Tree) => {
  for (const [file, text] of Object.entries(tree)) { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); }
};
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = () => {
  const run = spawnSync(process.execPath, [script, "--root", repo, "--base", "main"], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const branch = (name: string, tree: Tree) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  put(tree);
  commit(name);
};
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-dual-instance-gates-"));
  git("init", "-q", "-b", "main");
  put({ "tooling/gates/limits.json": JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n", ...dualTree() });
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

test("DUAL-11 DUAL-12 health:check passes a well-formed dual-instance plugin and fails a lonely half or an optional permission", () => {
  git("checkout", "-q", "-f", "main");
  const clean = gate();
  assert.equal(clean.code, 0, clean.out);
  branch("lonely-half", dualTree({ project: "{ definition: createOtherPlugin(), trust: HOST_BUILD_TRUST }" }));
  const lonely = gate();
  assert.equal(lonely.code, 1, lonely.out);
  assert.match(lonely.out, /starts no project half of it/u);
  branch("optional-permission", dualTree({ permissions: `{ permission: "probe:read", required: false, reason: "读" }` }));
  const optional = gate();
  assert.equal(optional.code, 1, optional.out);
  assert.match(optional.out, /has a permission that is not `required: true` as a literal/u);
});
