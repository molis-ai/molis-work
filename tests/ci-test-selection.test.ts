// T-130: which files of the two non-blocking jobs of .github/workflows/ci.yml (`security-invariants`, `product-subset`) a pull
// request runs (scripts/ci-test-selection.mjs). The decision is checked rule by rule (every way to `whole`, `none`, `some` on one or
// two runners), then end to end on a scratch repository with the real script and affected-tests, then the workflow that reads it: the
// job runs on pull requests only, the two jobs fall back to their whole list whenever it did not succeed (whatever it may have
// written before failing), and nothing a merge waits for changes.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { decideJob, FULL_WHEN, outputLines, securityList } from "../scripts/ci-test-selection.mjs";
import { blockingJobs, blockingTestRuns, jobBlock, workflow } from "./fixtures/ci-workflow.js";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const directories: string[] = [];
after(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); });

type Change = { path: string; status?: string; from?: string };
type Affected = { changes: Change[]; tests: { file: string }[]; full: { rule: string; detail: string }[]; uncovered: string[] };
const affected = (over: Partial<Affected> = {}): Affected => ({ changes: [{ path: "plugins/native/todo/src/store.ts" }], tests: [], full: [], uncovered: [], ...over });
const touching = (...files: string[]) => files.map((file) => ({ file }));
const LIST = Array.from({ length: 10 }, (_, index) => `tests/item-${index}.test.ts`);
const PRODUCT = [...LIST.map((file) => ({ file, browser: false })), ...["a", "b", "c", "d"].map((name) => ({ file: `tests/smoke-${name}.e2e.test.ts`, browser: true }))];

test("RAC-1760 a job runs whole when affected-tests cannot narrow it, when what it runs with changed, or when it would select nearly all", () => {
  const whole = (job: "security" | "product", input: Partial<Record<keyof Affected, unknown>> | null, pattern: RegExp, list: Array<string | { file: string; browser: boolean }> = LIST) => {
    const decision = decideJob({ job, list, affected: input, failure: input ? undefined : "affected-tests failed: boom" });
    assert.equal(decision.mode, "whole", `${pattern}: ${JSON.stringify(decision)}`);
    assert.deepEqual(decision.shards, [1, 2], "whole is the two legs of today");
    assert.deepEqual(decision.files, [], "whole names no files: an empty list is what the jobs read as the whole list");
    assert.ok(decision.reasons.some((reason: string) => pattern.test(reason)), `${pattern} in ${JSON.stringify(decision.reasons)}`);
  };
  const someTests = touching(LIST[0]!);
  whole("security", null, /affected-tests failed: boom/);
  whole("security", affected({ tests: someTests, full: [{ rule: "shared-core", detail: "packages/contracts/src/x.ts" }] }), /full suite \(shared-core\)/);
  whole("product", affected({ tests: someTests, uncovered: ["plugins/native/todo/src/new.ts"] }), /no test reads plugins\/native\/todo\/src\/new\.ts/, PRODUCT);
  // Written out here, not read from FULL_WHEN, so that dropping one of them from the script is seen: what both jobs run with, and what
  // the selection itself reads to choose (the READMEs' test lists, the browser marks, the product list's rules).
  const BOTH = [
    ".github/workflows/ci.yml", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "AGENTS.md", "skills/molis-plugin-dev/SKILL.md",
    "vendor/prologue-sdk/README.md", "scripts/ci-test-selection.mjs", "scripts/affected-tests.mjs", "scripts/affected-tests/select.mjs",
    "scripts/run-tests.mjs", "scripts/run-tests/pool.mjs", "scripts/build-workspace.mjs", "scripts/workspace-packages.mjs",
    "scripts/package-dev-requirements.mjs", "scripts/ci-linux-probe/select.mjs", "scripts/ci-product-subset/plan.mjs",
  ];
  for (const file of BOTH) {
    for (const job of ["security", "product"] as const) whole(job, affected({ tests: someTests, changes: [{ path: file }] }), new RegExp(`runs whole when these change: ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  }
  assert.equal(FULL_WHEN.both.length, BOTH.length, "a new entry of FULL_WHEN.both is added to BOTH too");
  // An answer that lacks one of its four lists is not trusted: a missing `uncovered` is not "every file is covered".
  for (const key of ["tests", "full", "changes", "uncovered"] as const) {
    const partial: Partial<Affected> = affected({ tests: someTests });
    delete partial[key];
    whole("security", partial, new RegExp(`answered without ${key}`));
    whole("product", { ...affected({ tests: someTests }), [key]: null }, new RegExp(`answered without ${key}`), PRODUCT);
  }
  assert.equal(decideJob({ job: "security", list: LIST, affected: affected({ tests: someTests, uncovered: [] }) }).mode, "some", "an empty uncovered is an answer");
  // A rename counts by its old path too.
  whole("security", affected({ tests: someTests, changes: [{ path: "tests/elsewhere.test.ts", from: "tests/security-invariants-host.test.ts" }] }), /security-invariants-host/);
  whole("security", affected({ tests: someTests, changes: [{ path: "docs/system/SECURITY-INVARIANTS.md" }] }), /SECURITY-INVARIANTS\.md/);
  whole("product", affected({ tests: someTests, changes: [{ path: "tests/quarantine.json" }] }), /quarantine\.json/, PRODUCT);
  whole("product", affected({ tests: someTests, changes: [{ path: "scripts/ci-linux-probe/select.mjs" }] }), /ci-linux-probe/, PRODUCT);
  whole("security", affected({ tests: someTests, changes: [{ path: "biome.jsonc" }] }), /biome\.jsonc/);
  whole("security", affected({ tests: touching(...LIST.slice(1)) }), /9 of its 10 files are selected/);
  // A trigger of one job does not make the other one whole.
  assert.notEqual(decideJob({ job: "product", list: PRODUCT, affected: affected({ tests: someTests, changes: [{ path: "docs/system/SECURITY-INVARIANTS.md" }] }) }).mode, "whole");
  assert.notEqual(decideJob({ job: "security", list: LIST, affected: affected({ tests: someTests, changes: [{ path: "tests/ci-product-subset.txt" }] }) }).mode, "whole");
  // A Markdown file at the root is a document, not a config; AGENTS.md is named on its own.
  assert.equal(decideJob({ job: "security", list: LIST, affected: affected({ tests: someTests, changes: [{ path: "README.md" }] }) }).mode, "some");
});

test("RAC-1761 none skips the job; some runs the touched files on one runner when they fit in one shard, the smokes counted apart", () => {
  const none = decideJob({ job: "security", list: LIST, affected: affected({ tests: touching("tests/not-in-the-list.test.ts") }) });
  assert.equal(none.mode, "none");
  assert.deepEqual(none.files, []);
  const one = decideJob({ job: "security", list: LIST, affected: affected({ tests: touching(...LIST.slice(0, 5), "tests/not-in-the-list.test.ts") }) });
  assert.deepEqual({ mode: one.mode, shards: one.shards, files: one.files }, { mode: "some", shards: [1], files: LIST.slice(0, 5) }, "five of ten fit in one leg");
  assert.deepEqual(decideJob({ job: "security", list: LIST, affected: affected({ tests: touching(...LIST.slice(0, 6)) }) }).shards, [1, 2], "six of ten do not");
  const smokes = PRODUCT.filter((entry) => entry.browser).map((entry) => entry.file);
  assert.deepEqual(decideJob({ job: "product", list: PRODUCT, affected: affected({ tests: touching(...smokes.slice(0, 2), LIST[0]!) }) }).shards, [1], "two of four smokes fit in one leg");
  assert.deepEqual(decideJob({ job: "product", list: PRODUCT, affected: affected({ tests: touching(...smokes.slice(0, 3), LIST[0]!) }) }).shards, [1, 2], "three of four smokes do not, however few other files");
});

test("RAC-1762 the outputs: files only for some, an anchored pattern that matches the chosen files and nothing else, the shards as JSON", () => {
  const product = decideJob({ job: "product", list: PRODUCT, affected: affected({ tests: touching(LIST[1]!, "tests/smoke-a.e2e.test.ts") }) });
  const security = decideJob({ job: "security", list: LIST, affected: affected({ tests: touching(LIST[2]!, LIST[3]!) }) });
  const lines = Object.fromEntries(outputLines({ security, product }).map((line: string) => line.split(/=(.*)/s).slice(0, 2)));
  assert.deepEqual(lines, {
    security_mode: "some", security_shards: "[1]", security_files: `${LIST[2]} ${LIST[3]}`,
    product_mode: "some", product_shards: "[1]", product_only: lines.product_only,
  });
  const only = new RegExp(lines.product_only!);
  assert.deepEqual(PRODUCT.map((entry) => entry.file).filter((file) => only.test(file)), [LIST[1], "tests/smoke-a.e2e.test.ts"]);
  assert.ok(!only.test(`${LIST[1]}x`) && !only.test(`x${LIST[1]}`) && !only.test("tests/item-1-test-ts"), "anchored, and a dot is a dot");
  const whole = decideJob({ job: "security", list: LIST, affected: null });
  const wholeLines = outputLines({ security: whole, product: whole });
  assert.ok(wholeLines.includes("security_files=") && wholeLines.includes("product_only=") && wholeLines.includes("security_shards=[1,2]"), wholeLines.join(" | "));
});

test("RAC-1762 the security list is test:security with its globs expanded over tests/", () => {
  const files = readdirSync(path.join(repoRoot, "tests")).map((name) => `tests/${name}`);
  const packageJson = readFileSync(path.join(repoRoot, "package.json"), "utf8");
  const list = securityList(packageJson, files);
  const script = String(JSON.parse(packageJson).scripts["test:security"]);
  for (const file of files.filter((name) => /^tests\/security-invariants-[^/]+\.test\.ts$/.test(name))) assert.ok(list.includes(file), `${file} is matched by the glob`);
  for (const token of script.split(/\s+/).filter((word) => word.startsWith("tests/") && !word.includes("*"))) assert.ok(list.includes(token), token);
  assert.ok(list.every((file: string) => files.includes(file)), "every file of the list exists");
  assert.deepEqual(securityList(JSON.stringify({ scripts: { "test:security": "node scripts/run-tests.mjs tests/a-*.test.ts tests/b.test.ts" } }), ["tests/a-1.test.ts", "tests/a-2.test.mjs", "tests/ab.test.ts", "tests/a-x/y.test.ts"]), ["tests/a-1.test.ts", "tests/b.test.ts"]);
});

// ---- end to end ------------------------------------------------------------------------------------------------------------------
const SCRIPTS = ["scripts/ci-test-selection.mjs", "scripts/affected-tests.mjs", "scripts/affected-tests", "scripts/ci-product-subset/plan.mjs", "scripts/ci-linux-probe/select.mjs", "scripts/package-dev-requirements.mjs"];
function scratch() {
  const root = mkdtempSync(path.join(tmpdir(), "molis-test-selection-"));
  directories.push(root);
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=selection", "-c", "user.email=selection@example.invalid", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  for (const item of SCRIPTS) cpSync(path.join(repoRoot, item), path.join(root, item), { recursive: true });
  put("package.json", JSON.stringify({ name: "scratch", private: true, scripts: { "test:security": "node scripts/run-tests.mjs tests/security-invariants-*.test.ts tests/demo-guard.test.ts" } }));
  put("plugins/native/demo/package.json", JSON.stringify({ name: "@molis-ai/molis-work-plugin-demo", private: true }));
  put("plugins/native/demo/src/thing.ts", "export function demoThingCount() { return 1; }\n");
  put("plugins/native/other/package.json", JSON.stringify({ name: "@molis-ai/molis-work-plugin-other", private: true }));
  put("plugins/native/other/src/other.ts", "export function otherPieceCount() { return 2; }\n");
  const plain = (body: string) => `import test from "node:test";\n${body}\ntest("ok", () => {});\n`;
  put("tests/demo-guard.test.ts", plain('import { demoThingCount } from "../plugins/native/demo/src/thing.ts";\nvoid demoThingCount;'));
  put("tests/demo-flow.test.ts", plain('import { demoThingCount } from "../plugins/native/demo/src/thing.ts";\nvoid demoThingCount;'));
  put("tests/other-flow.test.ts", plain('import { otherPieceCount } from "../plugins/native/other/src/other.ts";\nvoid otherPieceCount;'));
  for (const name of ["host", "socket", "paths"]) put(`tests/security-invariants-${name}.test.ts`, plain(""));
  put("tests/i18n.test.ts", plain(""));
  for (const name of ["a", "b", "c"]) put(`tests/smoke-${name}.e2e.test.ts`, plain(""));
  put("tests/ci-product-subset.txt", ["tests/i18n.test.ts", "tests/demo-flow.test.ts", "tests/other-flow.test.ts", "tests/smoke-a.e2e.test.ts", "tests/smoke-b.e2e.test.ts", "tests/smoke-c.e2e.test.ts", ""].join("\n"));
  put("tests/quarantine.json", '{ "entries": [] }\n');
  put("docs/guide.md", "# Guide\n");
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return { root, put, commit: (message: string) => { git("add", "-A"); git("commit", "-q", "-m", message); } };
}
const select = (root: string, base = "HEAD^1", summary = "") => {
  const outputFile = path.join(root, "..", `${path.basename(root)}-output`);
  writeFileSync(outputFile, "");
  const run = spawnSync(process.execPath, [path.join(root, "scripts/ci-test-selection.mjs"), "--root", root, "--base", base], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: outputFile, GITHUB_STEP_SUMMARY: summary } });
  directories.push(outputFile);
  const outputs = Object.fromEntries(readFileSync(outputFile, "utf8").trim().split("\n").filter(Boolean).map((line) => line.split(/=(.*)/s).slice(0, 2)));
  return { code: run.status, text: `${run.stdout}${run.stderr}`, outputs };
};

test("RAC-1763 end to end: a document skips both jobs, a plugin change runs its own files, a failure runs everything and still exits 0", () => {
  const { root, put, commit } = scratch();
  put("docs/guide.md", "# Guide\n\nMore words.\n");
  commit("docs");
  const docs = select(root);
  assert.equal(docs.code, 0, docs.text);
  assert.deepEqual(docs.outputs, { security_mode: "none", security_shards: "[1]", product_mode: "none", product_shards: "[1]", security_files: "", product_only: "" }, docs.text);

  put("plugins/native/demo/src/thing.ts", "export function demoThingCount() { return 3; }\n");
  commit("demo");
  const demo = select(root);
  assert.equal(demo.code, 0, demo.text);
  assert.equal(demo.outputs.security_mode, "some", demo.text);
  assert.equal(demo.outputs.security_files, "tests/demo-guard.test.ts");
  assert.equal(demo.outputs.product_mode, "some");
  assert.equal(demo.outputs.product_only, "^(?:tests/demo-flow\\.test\\.ts)$");
  assert.match(demo.text, /### Security invariants: some, 1 runner/);

  put("tests/security-invariants-host.test.ts", 'import test from "node:test";\ntest("still ok", () => {});\n');
  commit("an invariant test");
  const invariant = select(root);
  assert.equal(invariant.outputs.security_mode, "whole", invariant.text);
  assert.equal(invariant.outputs.security_shards, "[1,2]");
  assert.equal(invariant.outputs.product_mode, "none", "the invariant test is not in the product list");

  const broken = select(root, "no-such-ref");
  assert.equal(broken.code, 0, broken.text);
  assert.equal(broken.outputs.security_mode, "whole");
  assert.equal(broken.outputs.product_mode, "whole");
  assert.match(broken.text, /affected-tests failed/);

  put("tests/ci-product-subset.txt", "tests/i18n.test.ts\n");
  commit("a list that breaks its rules");
  const badList = select(root);
  assert.equal(badList.code, 0, badList.text);
  assert.deepEqual([badList.outputs.security_mode, badList.outputs.product_mode], ["whole", "whole"], badList.text);
  assert.match(badList.text, /the job lists could not be read/);

  const usage = spawnSync(process.execPath, [path.join(root, "scripts/ci-test-selection.mjs"), "--bogus"], { encoding: "utf8" });
  assert.equal(usage.status, 2);
});

test("RAC-1763 end to end: a summary that cannot be written fails nothing, and an answer without uncovered runs everything", () => {
  const { root, put, commit } = scratch();
  put("plugins/native/demo/src/thing.ts", "export function demoThingCount() { return 3; }\n");
  commit("demo");
  // The summary is written before the outputs and cannot fail the step: the outputs are the step's last act.
  const noSummary = select(root, "HEAD^1", path.join(root, "no-such-directory", "summary.md"));
  assert.equal(noSummary.code, 0, noSummary.text);
  assert.match(noSummary.text, /the job summary could not be written/);
  assert.equal(noSummary.outputs.security_files, "tests/demo-guard.test.ts", "the decision is still written");

  // An affected-tests whose JSON lacks `uncovered` (an older or broken one) is not taken as "every changed file is read by a test".
  put("scripts/affected-tests.mjs", `console.log(JSON.stringify({ tests: [{ file: "tests/demo-guard.test.ts" }, { file: "tests/demo-flow.test.ts" }], full: [], changes: [{ path: "plugins/native/demo/src/thing.ts" }] }));\n`);
  const partial = select(root);
  assert.equal(partial.code, 0, partial.text);
  assert.deepEqual([partial.outputs.security_mode, partial.outputs.product_mode], ["whole", "whole"], partial.text);
  assert.match(partial.text, /answered without uncovered/);
});

// ---- the workflow ------------------------------------------------------------------------------------------------------------------
test("RAC-1764 ci.yml: the selection runs on pull requests only, decides nothing a merge waits for, and every job that reads it falls back to its whole list", () => {
  const selection = jobBlock("test-selection");
  assert.match(selection, /^    if: \$\{\{ github\.event_name == 'pull_request' \}\}$/m, "only on a pull request: push, nightly, manual runs and the merge queue are as before");
  assert.match(selection, /^    timeout-minutes: \d+$/m);
  assert.match(selection, /fetch-depth: 2/, "HEAD^1 is in the checkout");
  assert.match(selection, /run: node scripts\/ci-test-selection\.mjs --base HEAD\^1$/m);
  assert.doesNotMatch(selection, /pnpm install/, "no dependencies: it starts at once");
  assert.ok(!blockingJobs().includes("test-selection"), "Verify does not wait for it");
  assert.deepEqual(blockingJobs(), ["gates", "health-gate-rules", "architecture-boundaries", "action-contracts", "secret-scan", "native-checks", "shell-checks"], "the blocking jobs are the ones of today");
  assert.match(jobBlock("verify"), /^    name: Verify$/m, "the required check keeps its name");

  for (const [name, key] of [["security-invariants", "security"], ["product-subset", "product"]] as const) {
    const job = jobBlock(name);
    assert.match(job, /^    needs: \[test-selection\]$/m, name);
    assert.ok(job.includes(`    if: \${{ !cancelled() && github.event_name != 'merge_group' && (needs.test-selection.result != 'success' || needs.test-selection.outputs.${key}_mode != 'none') }}`), `${name}: runs when the selection did not succeed, never in the merge queue, skipped only on a clear none`);
    assert.ok(job.includes(`shard: \${{ fromJSON(needs.test-selection.result == 'success' && needs.test-selection.outputs.${key}_shards || '[1, 2]') }}`), `${name}: two legs unless a selection that succeeded said one`);
    assert.match(job, /^    continue-on-error: true$/m, `${name} still cannot turn the workflow red (decision #14)`);
    assert.ok(job.includes("${{ matrix.shard }}/${{ strategy.job-total }}"), `${name}: the shard is counted out of the legs that run`);
  }
  const security = jobBlock("security-invariants");
  assert.match(security, /if \[ -n "\$SELECTED" \]; then\n\s+read -r -a files <<< "\$SELECTED"\n\s+node scripts\/run-tests\.mjs --shard .+ "\$\{files\[@\]\}"\n\s+else\n\s+pnpm test:security --shard /, "an empty list never reaches run-tests.mjs (it would run every test): the whole list goes through test:security");
  const product = jobBlock("product-subset");
  assert.match(product, /set --\n\s+if \[ -n "\$ONLY" \]; then set -- --only "\$ONLY"; fi\n\s+exec node scripts\/ci-product-subset\.mjs --expect-platform linux "\$@" /, "--only only when files were chosen");
  // What the two jobs do for each way `test-selection` can end, the expressions of ci.yml evaluated as GitHub would. A selection that
  // failed after writing some or all of its outputs (the step died after the GITHUB_OUTPUT write, the runner was lost) is the case
  // that matters: none of what it left is read.
  const NONE = { security_mode: "none", security_shards: "[1]", security_files: "", product_mode: "none", product_shards: "[1]", product_only: "" };
  const SOME = { security_mode: "some", security_shards: "[1]", security_files: "tests/a.test.ts", product_mode: "some", product_shards: "[1]", product_only: "^(?:tests/a\\.test\\.ts)$" };
  const WHOLE = { security_mode: "whole", security_shards: "[1,2]", security_files: "", product_mode: "whole", product_shards: "[1,2]", product_only: "" };
  const EMPTY = { security_mode: "", security_shards: "", security_files: "", product_mode: "", product_shards: "", product_only: "" };
  const all = { runs: true, shards: [1, 2], list: "" };
  const cases: Array<[string, string, Record<string, string>, { runs: boolean; shards?: number[]; list?: string }]> = [
    ["pull_request", "success", NONE, { runs: false }],
    ["pull_request", "success", SOME, { runs: true, shards: [1], list: "some" }],
    ["pull_request", "success", WHOLE, all],
    ["pull_request", "success", EMPTY, all],
    ...["failure", "cancelled", "skipped"].flatMap((result) => [NONE, SOME, WHOLE, EMPTY].map((left) => ["pull_request", result, left, all] as [string, string, Record<string, string>, typeof all])),
    ["push", "skipped", EMPTY, all],
    ["schedule", "skipped", EMPTY, all],
    ["merge_group", "skipped", EMPTY, { runs: false }],
    ["merge_group", "success", SOME, { runs: false }],
  ];
  for (const [name, key, env] of [["security-invariants", "security", "SELECTED"], ["product-subset", "product", "ONLY"]] as const) {
    const job = jobBlock(name);
    const expression = (pattern: RegExp) => { const found = pattern.exec(job)?.[1]; assert.ok(found, `${name}: ${pattern}`); return found; };
    const condition = expression(/^    if: \$\{\{ (.*) \}\}$/m);
    const matrix = expression(/^        shard: \$\{\{ (.*) \}\}$/m);
    const list = expression(new RegExp(`^          ${env}: \\$\\{\\{ (.*) \\}\\}$`, "m"));
    for (const [event, result, outputs, expected] of cases) {
      const scope = { event, result, outputs };
      const what = `${name} on ${event}, test-selection ${result}, outputs ${JSON.stringify(outputs)}`;
      assert.equal(Boolean(evaluate(condition, scope)), expected.runs, `${what}: runs`);
      if (!expected.runs) continue;
      assert.deepEqual(evaluate(matrix, scope), expected.shards, `${what}: shards`);
      assert.equal(evaluate(list, scope), expected.list === "some" ? SOME[key === "security" ? "security_files" : "product_only"] : expected.list, `${what}: the files`);
    }
  }
  // The merge queue still runs exactly the blocking jobs and Verify: the jobs that do not block, and the selection, stay out of it.
  for (const name of ["security-invariants", "product-subset", "linux-probe", "test-selection"]) assert.match(jobBlock(name), /^    if: \$\{\{.*(?:!= 'merge_group'|== 'pull_request'|== 'schedule').*\}\}$/m, `${name} is not in the merge queue`);
  assert.ok(blockingTestRuns().some((words) => words.includes("tests/ci-test-selection.test.ts")), "a blocking job runs this file");
});

/**
 * A GitHub expression of the two jobs evaluated for one event, one result of `test-selection` and the outputs it left. Only what these
 * expressions use is known (`!cancelled()`, the event, the result, the outputs, `fromJSON`, quoted strings, `==`, `!=`, `&&`, `||`);
 * anything else fails, so a new term in ci.yml is added here before it is trusted. GitHub's `&&` and `||` give back an operand as
 * JavaScript's do, and a missing output is the empty string.
 */
function evaluate(expression: string, scope: { event: string; result: string; outputs: Record<string, string> }): unknown {
  const code = expression
    .replace(/!cancelled\(\)/g, "true")
    .replace(/github\.event_name/g, "scope.event")
    .replace(/needs\.test-selection\.result/g, "scope.result")
    .replace(/needs\.test-selection\.outputs\.([a-z_]+)/g, "scope.outputs.$1")
    .replace(/fromJSON\(/g, "JSON.parse(");
  assert.match(code.replace(/'[^']*'|scope\.(?:event|result|outputs\.[a-z_]+)|JSON\.parse|true/g, ""), /^[\s()]*(?:(?:==|!=|&&|\|\||!)[\s()]*)*$/, `only known terms: ${expression}`);
  return new Function("scope", `return (${code});`)(scope);
}

test("RAC-1765 ci.yml: every output the script writes is passed on by the job, and the jobs read only those", () => {
  const security = decideJob({ job: "security", list: LIST, affected: null });
  const written = outputLines({ security, product: security }).map((line: string) => line.split("=")[0]).sort();
  const selection = jobBlock("test-selection");
  const passed = [...selection.matchAll(/^      ([a-z_]+): \$\{\{ steps\.select\.outputs\.([a-z_]+) \}\}$/gm)].map((match) => { assert.equal(match[1], match[2]); return match[1]!; }).sort();
  assert.deepEqual(passed, written);
  const read = [...new Set([...workflow.matchAll(/needs\.test-selection\.outputs\.([a-z_]+)/g)].map((match) => match[1]!))].sort();
  assert.deepEqual(read.filter((name) => !written.includes(name)), [], "no job reads an output that is never written");
  assert.deepEqual(written.filter((name: string) => !read.includes(name)), [], "every output is read by a job");
});
