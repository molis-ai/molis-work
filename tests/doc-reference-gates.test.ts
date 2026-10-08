import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// specs/repository-anti-corruption §4.12–§4.14 (W1-06): the documentation and repository-shape gates of `pnpm health:check`
// (scripts/gates/README.md). Each rule is mutation-verified here on a small scratch repository, the way
// tests/health-gates-merge-base.test.ts does the numeric ones: the base is clean, one violation is added on a branch, and
// `--base main` must fail with the rule's message. For the counts that may only fall (root strays, .impeccable files,
// placeholder contract subpaths) the laundering move, rewriting the committed baseline in the same branch, must not help.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: dir, encoding: "utf8", stdio: "pipe" });
const git = (...args: string[]) => gitAt(repo, ...args);
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const append = (file: string, text: string) => put(file, read(file) + text);
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

const lines = (...parts: string[]) => `${parts.join("\n")}\n`;
const descriptor = (name: string) => lines(
  'import type { ContractDescriptor } from "./package.js";',
  `export const ${name}Contract = { contractId: "io.molis.work.platform.${name}.v1", kind: "platform", schemaVersion: 1, maturity: "contract-only", ssot: "docs/guide.md" } as const satisfies ContractDescriptor;`);
const allowlist = (entries: Record<string, string>) => JSON.stringify({ note: "fixture", allowed: entries }, null, 2) + "\n";
const baseAllowed: Record<string, string> = {
  ".gitignore": "ignore rules", ".impeccable": "evidence", "AGENTS.md": "rules", "README.md": "front page", apps: "apps", docs: "docs",
  "package.json": "root manifest", packages: "packages", plugins: "plugins", skills: "skills", specs: "specs", tests: "tests", tooling: "tooling", vendor: "vendored",
};
const contractsManifest = (subpaths: string[]) => JSON.stringify({ name: "@molis-ai/molis-work-contracts",
  exports: Object.fromEntries([[".", { import: "./dist/index.js" }], ...subpaths.map((subpath) => [`./${subpath}`, { import: `./dist/${subpath}.js` }])]) }, null, 2) + "\n";

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-doc-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 200, classLines: 100, classMethods: 30, functionLines: 80, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("tooling/gates/root-allowlist.json", allowlist(baseAllowed));
  put("package.json", JSON.stringify({ name: "fixture", scripts: { build: "tsc", "health:check": "node scripts/check-health-gates.mjs" } }) + "\n");
  put(".gitignore", "dist/\n.impeccable/qa/\n");
  put("leftover.md", "# Leftover\n\nA stray that is already there; a stray file is no documentation either: [gone](missing.md).\n");
  for (const name of ["a", "b", "c"]) put(`outputs/${name}.md`, `# ${name}\n\nA stray folder is not documentation: [gone](missing.md).\n`);
  put("vendor/prologue-sdk/a.tgz", "a");

  put("README.md", "# Fixture\n\nStart with [the guide](docs/guide.md#setup-steps).\n");
  put("AGENTS.md", lines("# Agents", "",
    "Read `docs/guide.md`, then `skills/dev/SKILL.md`. Run `pnpm health:check`. The old test is `tests/old.test.ts`.",
    "Archive per `specs/README.md`. Actions live in `plugins/native/<name>/src/actions.ts`.",
    "A stray folder starts no cited path: `outputs/gone.txt`."));
  put("tests/old.test.ts", "export const old = 1;\n");
  put("docs/guide.md", lines("# Guide", "", "## Setup steps", "",
    "[next](next.md) [anchor](#setup-steps) [up](../README.md#fixture) [dir](../packages/) [encoded](./%E6%96%87.md) [outside](https://example.com/x) [mail](mailto:a@b.c)",
    "", "```", "[inside a fence](nowhere.md)", "```", "", "An inline span `[inside code](nowhere.md)` is not a link either."));
  put("docs/next.md", "# Next\n");
  put("docs/文.md", "# 文\n");
  put("docs/archive/old.md", "[gone](missing.md)\n");
  put("skills/dev/SKILL.md", lines("# Dev", "",
    "Call `alpha.run`, `alpha.sub.do` or `alpha.content.receive`; `ui.views` and `services.events` are manifest fields, not ids.",
    "The MCP tool is `molis_work_v1_action_alpha.run__v1`.",
    "Write `specs/{slug}/spec.md`, keep `packages/*/package.json` honest, screenshots land in `.impeccable/qa/review/`.",
    "Build with `pnpm build`; `pnpm --filter x run y` is not read.", "", "```", "`packages/gone.ts` and `alpha.nothing` in a fence", "```"));
  put("plugins/native/alpha/src/actions.ts", lines("declare const define: (id: string) => unknown;",
    'export const run = define("alpha.run");', 'export const sub = define("sub.do");',
    "export const content = (station: string, role: string) => `${station}.content.${role}`;",
    // No fixed segment: the gate must not let this template stand for every two-part id (the real repo has dozens).
    "export const joined = (owner: string, name: string) => `${owner}.${name}`;",
    // Only the owner is fixed (the real repo has `pages.${name}`, `todo.${name}`, `shelf.${recipe}.${optionId}`): such a template
    // would accept every misspelling and every removed id of its owner, so the gate ignores it.
    "export const named = (name: string) => `alpha.${name}`;",
    "export const deeper = (recipe: string, option: string) => `alpha.${recipe}.${option}`;"));

  put("specs/README.md", lines("# 规格书怎么放", "", "## 在做的", "", "- [alpha](alpha/spec.md)：in progress", "",
    "## 现行规范", "", "- [beta](beta/spec.md)：a norm", "", "## 还没做的事", "", "都在 [BACKLOG.md](BACKLOG.md)。"));
  put("specs/alpha/spec.md", "# Alpha\n\n状态：执行中（2026-10-08）。\n");
  put("specs/beta/spec.md", "# Beta\n\n状态：现行规范（2026-10-08）。\n");
  put("specs/archive/old/spec.md", "[gone](../../missing.md)\n");
  put("specs/BACKLOG.md", lines("# 统一待办清单", "", "## 1. 待你验收", "", "| 编号 | 事项 | 类型 |", "| --- | --- | --- |", "| BL-001 | 试用首页 | 待你验收 |", "",
    "## 2. 未实现", "", "| 编号 | 事项 | 类型 |", "| --- | --- | --- |", "| BL-002 | 做一件事 | 未实现 |"));

  put("packages/contracts/package.json", contractsManifest(["platform/real", "platform/used", "platform/wired", "platform/idle"]));
  put("packages/contracts/src/index.ts", "export {};\n");
  put("packages/contracts/src/platform/real.ts", lines('import type { ContractDescriptor } from "./package.js";', "export interface Real { id: string }",
    'export const realContract = { contractId: "io.molis.work.platform.real.v1", kind: "platform", schemaVersion: 1, maturity: "partial", ssot: "docs/guide.md" } as const satisfies ContractDescriptor;'));
  for (const name of ["used", "wired", "idle"]) put(`packages/contracts/src/platform/${name}.ts`, descriptor(name));
  put("apps/host/src/use.ts", lines('import { usedContract } from "@molis-ai/molis-work-contracts/platform/used";', "export const used = usedContract;"));
  put("packages/kernel/package.json", JSON.stringify({ name: "@molis-ai/molis-work-kernel", "molis-work": { contract: "@molis-ai/molis-work-contracts/platform/wired" } }) + "\n");

  for (const file of [".impeccable/review/set-a/1.png", ".impeccable/review/set-a/2.png", ".impeccable/review/set-b/1.png", ".impeccable/review/loose.png",
    ".impeccable/design.json", "docs/design/.impeccable/ref.png"]) put(file, file);
  git("add", "-A");
  const baseline = gate("--update");
  assert.equal(baseline.code, 0, baseline.out);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

// Start a branch from the base, add one change, commit it.
const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};

// Literals that look like ids but sit in files that are not product source. Each one is a mutation of `isSourceForIds`
// (scripts/gates/doc-citations.mjs): lose one of its exclusions and that id counts as defined.
const notIdSources: Array<[file: string, id: string]> = [
  ["plugins/native/alpha/tests/ids.ts", "alpha.only_in_package_tests"],
  ["plugins/native/alpha/test/ids.ts", "alpha.only_in_test_folder"],
  ["plugins/native/alpha/fixtures/ids.json", "alpha.only_in_fixtures"],
  ["plugins/native/alpha/dist/ids.js", "alpha.only_in_dist"],
  ["plugins/native/alpha/node_modules/dep/ids.js", "alpha.only_in_node_modules"],
  ["plugins/native/alpha/src/ids.test.ts", "alpha.only_in_a_test_file"],
  ["plugins/native/alpha/src/ids.d.ts", "alpha.only_in_a_declaration"],
  ["tooling/gates/excused.json", "alpha.only_in_gate_data"],
  ["docs/ids.ts", "alpha.only_in_docs"],
];

// absolute: a rule with no baseline; ratchet: a count that may only fall, where rewriting the committed baseline must not help.
// `localCheck`: a ratchet whose rewritten baseline still leaves the quick local check red, and why.
type Scenario = { name: string; mutate: () => void; expect: RegExp[]; kind: "absolute" | "ratchet"; localCheck?: RegExp[] };
const violations: Scenario[] = [
  // ---- broken relative links ----
  { kind: "absolute", name: "a link to a file that does not exist", mutate: () => append("docs/guide.md", "\n[gone](missing.md)\n"),
    expect: [/broken link: docs\/guide\.md:\d+: link missing\.md points at docs\/missing\.md, which is not tracked/] },
  { kind: "absolute", name: "a link whose target was deleted", mutate: () => git("rm", "-q", "docs/next.md"),
    expect: [/broken link: docs\/guide\.md:\d+: link next\.md points at docs\/next\.md/] },
  { kind: "absolute", name: "a link to a folder that has no tracked files", mutate: () => append("docs/guide.md", "\n[dir](../nowhere/)\n"),
    expect: [/link \.\.\/nowhere\/ points at nowhere/] },
  { kind: "absolute", name: "a link to a heading the target does not have", mutate: () => append("docs/guide.md", "\n[x](next.md#nope)\n"),
    expect: [/link next\.md#nope points at a heading docs\/next\.md does not have/] },
  { kind: "absolute", name: "a link to a heading of its own file that does not exist", mutate: () => append("docs/guide.md", "\n[x](#nope)\n"),
    expect: [/link #nope points at a heading docs\/guide\.md does not have/] },
  { kind: "absolute", name: "a link that leaves the repository", mutate: () => append("docs/guide.md", "\n[x](../../outside.md)\n"),
    expect: [/link \.\.\/\.\.\/outside\.md leaves the repository/] },
  { kind: "absolute", name: "a broken link in the root README", mutate: () => append("README.md", "\n[x](docs/gone.md)\n"),
    expect: [/broken link: README\.md:\d+: link docs\/gone\.md points at docs\/gone\.md/] },
  { kind: "absolute", name: "a reference-style link definition that is broken", mutate: () => append("docs/guide.md", "\n[ref]: gone.md\n"),
    expect: [/link gone\.md points at docs\/gone\.md/] },
  { kind: "absolute", name: "an HTML href that is broken", mutate: () => append("docs/guide.md", '\n<a href="gone.md">x</a>\n'),
    expect: [/link gone\.md points at docs\/gone\.md/] },
  { kind: "absolute", name: "a link in a spec outside archive/", mutate: () => append("specs/alpha/spec.md", "\n[x](../../docs/gone.md)\n"),
    expect: [/broken link: specs\/alpha\/spec\.md:\d+: link \.\.\/\.\.\/docs\/gone\.md/] },

  // ---- paths and ids cited in skills/, AGENTS.md and CALL-CHAINS.md ----
  { kind: "absolute", name: "AGENTS.md cites a file that was deleted", mutate: () => git("rm", "-q", "tests/old.test.ts"),
    expect: [/bad citation: AGENTS\.md:\d+: `tests\/old\.test\.ts` points at tests\/old\.test\.ts, which is not in the repository/] },
  { kind: "absolute", name: "a skill cites a path that does not exist", mutate: () => append("skills/dev/SKILL.md", "\nSee `packages/gone/src/index.ts:10`.\n"),
    expect: [/bad citation: skills\/dev\/SKILL\.md:\d+: `packages\/gone\/src\/index\.ts:10` points at packages\/gone\/src\/index\.ts/] },
  { kind: "absolute", name: "a skill cites a glob that matches nothing", mutate: () => append("skills/dev/SKILL.md", "\nSee `plugins/native/*/src/gone.ts`.\n"),
    expect: [/`plugins\/native\/\*\/src\/gone\.ts` points at/] },
  { kind: "absolute", name: "CALL-CHAINS.md cites a path that does not exist", mutate: () => put("docs/system/CALL-CHAINS.md", "# Chains\n\nThe hop is `apps/host/src/gone.ts`.\n"),
    expect: [/bad citation: docs\/system\/CALL-CHAINS\.md:3: `apps\/host\/src\/gone\.ts`/] },
  { kind: "absolute", name: "a doc names a pnpm script that package.json does not define", mutate: () => append("AGENTS.md", "\nRun `pnpm nosuchscript` first.\n"),
    expect: [/bad citation: AGENTS\.md:\d+: `pnpm nosuchscript` names pnpm script "nosuchscript"/] },
  { kind: "absolute", name: "a skill cites an id its owner does not define", mutate: () => append("skills/dev/SKILL.md", "\nCall `alpha.vanished` next.\n"),
    expect: [/bad citation: skills\/dev\/SKILL\.md:\d+: `alpha\.vanished` is not an id the code defines/] },
  { kind: "absolute", name: "a typo of a two-part id whose owner has a template that fixes only the owner", mutate: () => append("skills/dev/SKILL.md", "\nCall `alpha.rnu` next.\n"),
    expect: [/`alpha\.rnu` is not an id the code defines/] },
  { kind: "absolute", name: "a three-part id made up under an owner whose template fixes only the owner", mutate: () => append("skills/dev/SKILL.md", "\nCall `alpha.made.up` next.\n"),
    expect: [/`alpha\.made\.up` is not an id the code defines/] },
  { kind: "absolute", name: "an id an owner used to define, after its definition is removed", mutate: () => put("plugins/native/alpha/src/actions.ts", read("plugins/native/alpha/src/actions.ts").replace('define("alpha.run")', 'define("alpha.other")')),
    expect: [/`alpha\.run` is not an id the code defines/, /`molis_work_v1_action_alpha\.run__v1` is not an id the code defines/] },
  { kind: "absolute", name: "a skill cites an MCP tool name for an id that is gone", mutate: () => append("skills/dev/SKILL.md", "\nThe tool is `molis_work_v1_action_alpha.vanished__v1`.\n"),
    expect: [/`molis_work_v1_action_alpha\.vanished__v1` is not an id the code defines/] },
  { kind: "absolute", name: "a typed id with a version suffix that is not defined", mutate: () => append("skills/dev/SKILL.md", "\nThe typed id is `alpha.run.v1`.\n"),
    expect: [/`alpha\.run\.v1` is not an id the code defines/] },
  { kind: "absolute", name: "an id that was defined only in a test does not count", mutate: () => {
    put("tests/ids.test.ts", 'export const only = "alpha.only_in_a_test";\n');
    append("skills/dev/SKILL.md", "\nCall `alpha.only_in_a_test`.\n");
  }, expect: [/`alpha\.only_in_a_test` is not an id the code defines/] },
  { kind: "absolute", name: "ids that are only in a package's own tests, fixtures, build output, a test or declaration file, gate data or docs do not count", mutate: () => {
    for (const [file, id] of notIdSources) { put(file, `export const id = "${id}";\n`); git("add", "-f", file); }
    append("skills/dev/SKILL.md", `\nNot defined: ${notIdSources.map(([, id]) => `\`${id}\``).join(", ")}.\n`);
  }, expect: notIdSources.map(([, id]) => new RegExp(`\`${id.replace(".", "\\.")}\` is not an id the code defines`)) },
  { kind: "absolute", name: "a folder added to the allow-list has its links checked and its paths read, like the folders the gate was written with", mutate: () => {
    put("tooling/gates/root-allowlist.json", allowlist({ ...baseAllowed, extras: "a root folder named in the open" }));
    put("extras/README.md", "# Extras\n\n[gone](missing.md)\n");
    append("skills/dev/SKILL.md", "\nSee `extras/gone.md`.\n");
  }, expect: [/broken link: extras\/README\.md:\d+: link missing\.md points at extras\/missing\.md/, /bad citation: skills\/dev\/SKILL\.md:\d+: `extras\/gone\.md` points at extras\/gone\.md/] },
  { kind: "absolute", name: "an exception without a reason", mutate: () => {
    append("AGENTS.md", "\nSee `docs/planned.md`.\n");
    put("tooling/gates/doc-citation-exceptions.json", JSON.stringify({ "AGENTS.md": { "docs/planned.md": "  " } }));
  }, expect: [/doc-citation-exceptions\.json: the exception for `docs\/planned\.md` in AGENTS\.md needs a reason/] },
  { kind: "absolute", name: "an exception that is not needed any more", mutate: () => put("tooling/gates/doc-citation-exceptions.json",
    JSON.stringify({ "AGENTS.md": { "docs/planned.md": "planned, not written yet" } })),
  expect: [/the exception for `docs\/planned\.md` in AGENTS\.md is not needed any more; delete it/] },

  // ---- specs/README index and root categories ----
  { kind: "absolute", name: "a spec directory the index does not list", mutate: () => put("specs/gamma/spec.md", "# Gamma\n\n状态：执行中（2026-10-08）。\n"),
    expect: [/spec index: specs\/README\.md: specs\/gamma is at the root but not in the index; list it under "在做的"/] },
  { kind: "absolute", name: "a current norm listed under the specs in progress", mutate: () => {
    put("specs/README.md", read("specs/README.md").replace("- [beta](beta/spec.md)：a norm\n", "").replace("- [alpha](alpha/spec.md)：in progress\n", "- [alpha](alpha/spec.md)：in progress\n- [beta](beta/spec.md)：a norm\n"));
  }, expect: [/specs\/beta is listed under "在做的" but its status line says it belongs under "现行规范"/] },
  { kind: "absolute", name: "a spec in progress listed as a current norm", mutate: () => put("specs/beta/spec.md", "# Beta\n\n状态：执行中（2026-10-08）。\n"),
    expect: [/specs\/beta is listed under "现行规范" but its status line says it belongs under "在做的"/] },
  { kind: "absolute", name: "an index entry for a spec that was archived", mutate: () => git("mv", "specs/alpha", "specs/archive/alpha"),
    expect: [/specs\/README\.md:\d+: "在做的" lists alpha\/spec\.md, which is not specs\/<directory>\/spec\.md of a spec at the root/] },
  { kind: "absolute", name: "a spec listed twice", mutate: () => put("specs/README.md", read("specs/README.md").replace("## 还没做的事", "- [alpha](alpha/spec.md)\n\n## 还没做的事")),
    expect: [/alpha is listed twice/] },
  { kind: "absolute", name: "a stray file at the root of specs/", mutate: () => put("specs/notes.md", "# notes\n"),
    expect: [/spec index: specs\/notes\.md: specs\/ holds README\.md, BACKLOG\.md, archive\/ and spec directories at its root/] },

  // ---- BACKLOG rows ----
  { kind: "absolute", name: "a struck-through BACKLOG row", mutate: () => append("specs/BACKLOG.md", "| BL-003 | ~~做过的事~~ 已删 | 已完成 |\n"),
    expect: [/BACKLOG: specs\/BACKLOG\.md:\d+: BL-003 is struck through; a finished item is deleted/] },
  { kind: "absolute", name: "a BACKLOG row that says it is done", mutate: () => append("specs/BACKLOG.md", "| BL-003 | 做过的事 | 已完成（#281） |\n"),
    expect: [/BACKLOG: specs\/BACKLOG\.md:\d+: BL-003 says it is done; delete the row/] },
  { kind: "absolute", name: "a BACKLOG id used twice", mutate: () => append("specs/BACKLOG.md", "| BL-002 | 又一件事 | 未实现 |\n"),
    expect: [/BL-002 is on two rows \(first at line \d+\); ids are not reused/] },

  // ---- the root allow-list file ----
  { kind: "absolute", name: "an allow-list entry without a reason", mutate: () => put("tooling/gates/root-allowlist.json", allowlist({ ...baseAllowed, "leftover.md": "" })),
    expect: [/root allow-list: tooling\/gates\/root-allowlist\.json: "leftover\.md" needs a reason/] },
  { kind: "absolute", name: "an allow-list entry for something that is not at the root any more", mutate: () => put("tooling/gates/root-allowlist.json", allowlist({ ...baseAllowed, Gone: "old" })),
    expect: [/"Gone" is not at the repository root any more; delete the entry/] },
  { kind: "absolute", name: "an allow-list that is not valid JSON", mutate: () => put("tooling/gates/root-allowlist.json", "<<<<<<< ours\n"),
    expect: [/root-allowlist\.json is not valid JSON/] },

  // ---- root strays (ratchet) ----
  { kind: "ratchet", name: "a new file at the repository root", mutate: () => put("notes.txt", "scratch\n"),
    expect: [/tracked files at the repository root outside the allow-list in notes\.txt 0 → 1/] },
  { kind: "ratchet", name: "a new folder at the repository root", mutate: () => { put("scratch/a.md", "a"); put("scratch/b.md", "b"); },
    expect: [/in scratch 0 → 2/] },
  { kind: "ratchet", name: "more files in a stray folder that is already there", mutate: () => put("outputs/d.md", "d"),
    expect: [/in outputs 3 → 4/] },
  // With no list nothing is a stray, so the document gates read every folder, the stray outputs/ among them.
  { kind: "ratchet", name: "the allow-list deleted to get around the rule", mutate: () => git("rm", "-q", "tooling/gates/root-allowlist.json"),
    expect: [/in \(tooling\/gates\/root-allowlist\.json is missing\) 0 → 1/], localCheck: [/broken link: outputs\/a\.md:\d+: link missing\.md points at outputs\/missing\.md/] },

  // ---- .impeccable (ratchet) ----
  { kind: "ratchet", name: "a new screenshot in an existing review set", mutate: () => put(".impeccable/review/set-a/3.png", "3"),
    expect: [/tracked files under \.impeccable in \.impeccable\/review\/set-a 2 → 3/] },
  { kind: "ratchet", name: "a new review set", mutate: () => put(".impeccable/review/set-c/1.png", "1"),
    expect: [/in \.impeccable\/review\/set-c 0 → 1/] },
  { kind: "ratchet", name: "a new loose file in .impeccable/review", mutate: () => put(".impeccable/review/other.png", "o"),
    expect: [/in \.impeccable\/review 1 → 2/] },
  { kind: "ratchet", name: "a new file in a nested .impeccable folder", mutate: () => put("docs/design/.impeccable/more.png", "m"),
    expect: [/in docs\/design\/\.impeccable 1 → 2/] },
  { kind: "ratchet", name: "a screenshot moved from one set to another (total unchanged)", mutate: () => {
    git("rm", "-q", ".impeccable/review/set-b/1.png");
    put(".impeccable/review/set-a/9.png", "9");
  }, expect: [/in \.impeccable\/review\/set-a 2 → 3/] },

  // ---- placeholder contract subpaths (ratchet) ----
  { kind: "ratchet", name: "a new descriptor-only, unused contracts subpath", mutate: () => {
    put("packages/contracts/package.json", contractsManifest(["platform/real", "platform/used", "platform/wired", "platform/idle", "platform/fresh"]));
    put("packages/contracts/src/platform/fresh.ts", descriptor("fresh"));
  }, expect: [/descriptor-only, unused contracts subpath in \.\/platform\/fresh 0 → 1/] },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base${scenario.kind === "ratchet" ? ", and --update does not hide it" : ""}`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);

    if (scenario.kind === "ratchet") {
      const refused = gate("--update", "--base", "main");
      assert.equal(refused.code, 1, refused.out);
      assert.match(refused.out, /Baseline not written/);
      assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    }
    // The laundering move: lift the committed baseline to the head's numbers in the same branch.
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    if (scenario.kind === "ratchet") {
      const local = gate();
      if (scenario.localCheck) {
        assert.equal(local.code, 1, local.out);
        for (const pattern of scenario.localCheck) assert.match(local.out, pattern);
      } else assert.equal(local.code, 0, "the local check against the committed baseline is satisfied by the rewrite");
    }
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
}

test("the clean base passes: archive/ links, fenced and inline code, globs, placeholders and non-owner tokens are not problems", () => {
  git("checkout", "-q", "-f", "main");
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /2 root strays, 6 \.impeccable files, 1 placeholder contract subpaths/);
  assert.equal(gate().code, 0, "and so does the quick check against the committed baseline");
});

test("changes that shrink things pass against the merge-base, and say what got smaller", () => {
  branch("tidy", () => {
    git("rm", "-q", "-r", "leftover.md", "outputs", ".impeccable/review/set-b/1.png");
    git("rm", "-q", "packages/contracts/src/platform/idle.ts");
    put("packages/contracts/package.json", contractsManifest(["platform/real", "platform/used", "platform/wired"]));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /0 root strays, 5 \.impeccable files, 0 placeholder contract subpaths/);
  assert.match(run.out, /Lower than the merge-base: rootStrays, impeccableFiles, contractPlaceholders/);
  assert.equal(gate("--update", "--base", "main").code, 0);
});

test("replacing a screenshot in place keeps the .impeccable count", () => {
  branch("refresh", () => put(".impeccable/review/set-a/1.png", "a refreshed screenshot"));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("a new root entry named in the allow-list with a reason is a decision made in the open, and passes", () => {
  branch("named", () => {
    put("NOTES.md", "# notes\n");
    put("tooling/gates/root-allowlist.json", allowlist({ ...baseAllowed, "NOTES.md": "scratch notes for the fixture" }));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("descriptor-only subpaths that something uses, or that carry types, are not placeholders", () => {
  branch("used", () => {
    put("packages/contracts/package.json", contractsManifest(["platform/real", "platform/used", "platform/wired", "platform/idle", "platform/imported", "platform/named", "platform/typed"]));
    put("packages/contracts/src/platform/imported.ts", descriptor("imported"));
    put("apps/host/src/more.ts", lines('import type { importedContract } from "@molis-ai/molis-work-contracts/platform/imported";', "export type More = typeof importedContract;"));
    put("packages/contracts/src/platform/named.ts", descriptor("named"));
    put("packages/other/package.json", JSON.stringify({ "molis-work": { contract: "@molis-ai/molis-work-contracts/platform/named" } }));
    put("packages/contracts/src/platform/typed.ts", descriptor("typed") + "export interface Typed { id: string }\n");
    put("packages/contracts/src/platform/idle.ts", descriptor("idle") + "export const idleValue = 1;\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("an exception with a reason lets a deliberate citation through, until the citation goes away", () => {
  branch("excepted", () => {
    append("AGENTS.md", "\nA file we plan to add: `docs/planned.md`.\n");
    put("tooling/gates/doc-citation-exceptions.json", JSON.stringify({ "AGENTS.md": { "docs/planned.md": "planned for the next slice" } }));
  });
  assert.equal(gate("--base", "main").code, 0);
  put("AGENTS.md", read("AGENTS.md").replace("\nA file we plan to add: `docs/planned.md`.\n", "\n"));
  commit("the citation goes away");
  const stale = gate("--base", "main");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /the exception for `docs\/planned\.md` in AGENTS\.md is not needed any more/);
});

test("an exception for an id works although gate data is quoted in tooling/gates/, and goes stale with its citation", () => {
  branch("excepted-id", () => {
    append("AGENTS.md", "\nA counter-example id: `alpha.counter.v1`.\n");
    put("tooling/gates/doc-citation-exceptions.json", JSON.stringify({ "AGENTS.md": { "alpha.counter.v1": "a deliberate counter-example, not an id" } }));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  put("AGENTS.md", read("AGENTS.md").replace("\nA counter-example id: `alpha.counter.v1`.\n", "\n"));
  commit("the citation goes away");
  const stale = gate("--base", "main");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /the exception for `alpha\.counter\.v1` in AGENTS\.md is not needed any more/);
});

test("an id declared in a manifest or package.json of a plugin counts as defined", () => {
  branch("manifest-id", () => {
    put("plugins/native/alpha/package.json", JSON.stringify({ name: "alpha", capabilities: ["alpha.declared_in_manifest"] }));
    append("skills/dev/SKILL.md", "\nCall `alpha.declared_in_manifest`.\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("a spec in the index may carry an anchor, and a heading link may use the heading as GitHub spells it", () => {
  branch("anchors", () => {
    put("specs/README.md", read("specs/README.md").replace("(alpha/spec.md)", "(alpha/spec.md#alpha)"));
    append("docs/next.md", "\n## 侧栏标签（`side`）\n\n## Repeated\n\n## Repeated\n");
    append("docs/guide.md", "\n[a](next.md#侧栏标签side) [b](next.md#repeated-1) [c](next.md#Repeated)\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("--report lists the document problems and the new counts", () => {
  branch("report", () => append("docs/guide.md", "\n[gone](missing.md)\n"));
  const text = gate("--report").out;
  assert.match(text, /Root entries outside the allow-list \(tracked files\): 4 in 2 root entries\n  count  entry/);
  assert.match(text, /Files under \.impeccable \(per group\): 6 in 5 groups\n  count  group/);
  assert.match(text, /Placeholder subpaths in @molis-ai\/molis-work-contracts: 1 in 1 subpaths\n  count  subpath/);
  assert.match(text, /Document references: 1 problems\n- broken link: docs\/guide\.md:\d+: link missing\.md/);
});

const scratch = (name: string, body: () => void) => {
  const dir = mkdtempSync(path.join(tmpdir(), `molis-doc-gates-${name}-`));
  const saved = repo;
  repo = dir;
  try { git("init", "-q", "-b", "main"); body(); } finally { repo = saved; rmSync(dir, { recursive: true, force: true }); }
};
const smallLimits = JSON.stringify({ file: 200, classLines: 100, classMethods: 30, functionLines: 80, vendoredPrologueSdk: 2 }) + "\n";

test("the run that introduces the allow-list has nothing to compare it with, and passes", () => {
  scratch("first", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("README.md", "# x\n");
    put("stray.txt", "s\n");
    commit("base without an allow-list");
    git("checkout", "-q", "-b", "adds-allowlist");
    put("tooling/gates/root-allowlist.json", allowlist({ "README.md": "front page" }));
    commit("the allow-list arrives");
    const run = gate("--base", "main");
    assert.equal(run.code, 0, run.out);
    assert.match(run.out, /2 root strays/);
  });
});

test("with no allow-list nothing is a stray: every root folder is read as documentation and can start a cited path", () => {
  scratch("nolist", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("README.md", "# x\n");
    commit("base");
    git("checkout", "-q", "-b", "later");
    put("stuff/b.md", "# b\n\n[gone](missing.md)\n");
    put("AGENTS.md", "# Agents\n\nSee `stuff/gone.txt`.\n");
    commit("later");
    const run = gate("--base", "main");
    assert.equal(run.code, 1, run.out);
    assert.match(run.out, /broken link: stuff\/b\.md:\d+: link missing\.md points at stuff\/missing\.md/);
    assert.match(run.out, /bad citation: AGENTS\.md:\d+: `stuff\/gone\.txt` points at stuff\/gone\.txt/);
  });
});

test("a repository without docs, specs or an allow-list has nothing for the document gates to say", () => {
  scratch("bare", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
    commit("base");
    git("checkout", "-q", "-b", "later");
    put("packages/alpha/src/index.ts", "export const alpha = 2;\n");
    commit("later");
    const run = gate("--base", "main");
    assert.equal(run.code, 0, run.out);
  });
});
