// CIP-09: regression coverage for the workflow contract, alongside the existing install, timeout, product and runner cases.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { matchesGlob } from "node:path";
import { decideChecks } from "../scripts/ci-check-selection.mjs";
import { evaluateExpression, fullSuiteWorkflow, jobBlock, stepScript, workflowFiles } from "./fixtures/ci-workflow.js";

const change = (...paths: string[]) => ({ changes: paths.map(path => ({ path })), tests: [], full: [], uncovered: [] });
test("CIP-01 CIP-02 CIP-04 documentation selection rejects mixed, protected, unknown and malformed changes", () => {
  for (const file of ["docs/guide.md", "specs/example/spec.md", "specs/README.md", "README.md"]) {
    const result = decideChecks({ affected: change(file) });
    assert.equal(result.documentation.mode, "only", file);
    assert.equal(result.gate_rules.mode, "none", file);
    assert.equal(result.shell.mode, "none", file);
  }
  for (const file of ["AGENTS.md", "skills/example/SKILL.md", "docs/system/SECURITY-INVARIANTS.md", "docs/releases/CHECKLIST.md", "docs/SSOT-MATRIX.md", "plugins/native/todo/README.md", "unknown.md", "docs/tool.json", "plugins/native/todo/src/store.ts"]) {
    assert.equal(decideChecks({ affected: change("docs/guide.md", file) }).documentation.mode, "code", file);
  }
  const rename = { ...change("docs/guide.md"), changes: [{ path: "docs/guide.md", from: "scripts/check.mjs" }] };
  assert.equal(decideChecks({ affected: rename }).documentation.mode, "code");
  for (const affected of [null, {}, { changes: [] }, { ...change(), changes: [{ path: null }] }]) {
    const result = decideChecks({ affected });
    assert.equal(result.documentation.mode, "code");
    assert.equal(result.gate_rules.mode, "whole");
  }
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts", "tests/todo-store.test.ts", "tests/fixtures/todo-helper.ts", "specs/todo/spec.md", "README.md") }).gate_rules.mode, "none");
  for (const file of ["scripts/check.mjs", "tooling/gates/limits.json", "tests/fixture.txt", "tests/health-gates-errors.test.ts", "tests/ci-install.test.ts", "tests/fixtures/ci-workflow.ts", "tests/quarantine.json", "pnpm-lock.yaml", "unknown/input.toml", "apps/workbench/vite.config.ts"]) {
    assert.equal(decideChecks({ affected: change(file) }).gate_rules.mode, "whole", file);
  }
});

test("CIP-05 shell, studio replay and account-login checks follow their own inputs", () => {
  for (const file of ["scripts/task.sh", "tools/task.py", ".github/workflows/ci.yml", ".github/actions/setup-work/action.yml", "scripts/gates/native-checks.mjs"]) assert.equal(decideChecks({ affected: change(file) }).shell.mode, "whole");
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts") }).shell.mode, "none");
  for (const file of ["skills/molis-plugin-dev/SKILL.md", ".github/actions/setup-work/action.yml", "plugins/native/plugin-builder/src/a.ts", "apps/local-host/src/plugin-builder/skill.ts", "scripts/studio-replay.mts", "tests/studio-replay.test.ts"]) {
    assert.equal(decideChecks({ affected: change(file) }).studio_replay.mode, "whole", file);
  }
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts", "tests/todo-store.test.ts") }).studio_replay.mode, "none");
  for (const file of ["horizontal/account/src/a.ts", ".github/actions/setup-work/action.yml", "apps/local-host/src/a.ts", "apps/workbench/src/a.ts", "packages/contracts/src/a.ts", "packages/kernel/src/a.ts", "scripts/account-authentication.test.mjs", "unknown/file.toml"]) {
    assert.equal(decideChecks({ affected: change(file) }).account_login.mode, "whole", file);
  }
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts", "tests/todo-store.test.ts") }).account_login.mode, "none");
  assert.equal(decideChecks({ affected: change("docs/guide.md") }).account_login.mode, "none");
});

const modes = { documentation_mode: "only", gate_rules_mode: "none", shell_mode: "none", studio_replay_mode: "none", account_login_mode: "none", native_mode: "none", security_mode: "none", product_mode: "none", golden_third_party_mode: "none" };
const scope = (event: string, result = "success", extra: Record<string, string> = {}) => ({ "github.event_name": event, "needs.queue-check.result": "skipped", "needs.queue-check.outputs.verified": "", "needs.build.result": "success", "needs.test-selection.result": result, ...Object.fromEntries(Object.entries({ ...modes, ...extra }).map(([k, v]) => [`needs.test-selection.outputs.${k}`, v])) });
const skipped = ["build", "account-login", "native-checks", "shell-checks", "security-invariants", "product-subset", "golden-replay", "golden-replay-third-party"];
test("CIP-01 CIP-02 CIP-04 workflow skips only successful scoped work, retains health gates and secrets, and uses the merge-group base", () => {
  for (const name of [...skipped, "gates", "secret-scan"]) {
    const condition = /^    if: \$\{\{ (.*) \}\}$/m.exec(jobBlock(name))![1]!;
    for (const event of ["pull_request", "merge_group", "push", "schedule", "workflow_dispatch"]) {
      assert.equal(Boolean(evaluateExpression(condition, scope(event))), !["pull_request", "merge_group"].includes(event) || !skipped.includes(name), `${event}: ${name}`);
      for (const result of ["failure", "cancelled", "skipped"]) assert.equal(Boolean(evaluateExpression(condition, scope(event, result))), true, `${name}: ${result} runs full`);
    }
  }
  // On doc-only PRs / merge groups, `build` is skipped and `gates` still runs its non-build checks.
  const gatesCond = /^    if: \$\{\{ (.*) \}\}$/m.exec(jobBlock("gates"))![1]!;
  for (const event of ["pull_request", "merge_group"]) {
    assert.equal(Boolean(evaluateExpression(gatesCond, { ...scope(event), "needs.build.result": "skipped" })), true, `${event}: gates runs when build skipped on doc-only change`);
    assert.equal(Boolean(evaluateExpression(gatesCond, { ...scope(event, "success", { documentation_mode: "code" }), "needs.build.result": "failure" })), false, `${event}: gates does not run when build failed on code change`);
  }
  // Non-doc merge_group always runs account-login even if account_login_mode is none.
  const accountCond = /^    if: \$\{\{ (.*) \}\}$/m.exec(jobBlock("account-login"))![1]!;
  assert.equal(Boolean(evaluateExpression(accountCond, scope("merge_group", "success", { documentation_mode: "code", account_login_mode: "none" }))), true);
  assert.equal(Boolean(evaluateExpression(accountCond, scope("pull_request", "success", { documentation_mode: "code", account_login_mode: "none" }))), false);
  const gates = jobBlock("gates");
  assert.match(gates, /node scripts\/check-health-gates.mjs --base "\$base"/);
  for (const prefix of ["name: Gate rules reject", "name: Health gates reject", "name: Build gate rules reject", "name: Studio Skill replay rules reject"]) {
    const step = gates.split("\n      - ").find(item => item.startsWith(prefix))!;
    const cond = /if: \$\{\{ (.*) \}\}/.exec(step)![1]!;
    assert.equal(evaluateExpression(cond, scope("pull_request")), false, prefix);
    assert.equal(evaluateExpression(cond, scope("schedule")), true, prefix);
  }
  const selection = jobBlock("test-selection");
  assert.match(selection, /PUSH_BEFORE: \$\{\{ github.event.merge_group.base_sha \}\}/);
  assert.match(selection, /base="\$\(node scripts\/ci-health-base.mjs\)"/);
});

test("CIP-03 Verify executes the real shell verdict and rejects unauthorized skips, failures and cancellation", () => {
  const step = jobBlock("verify").split("\n      - ").find(step => step.startsWith("name: Required package gate"))!;
  const script = stepScript(step);
  const names = ["BUILD", "ACCOUNT_LOGIN", "GATES", "SECRET_SCAN", "SHELL_CHECKS", "NATIVE_CHECKS", "SECURITY_INVARIANTS", "PRODUCT_SUBSET", "GOLDEN_REPLAY", "GOLDEN_REPLAY_THIRD_PARTY"];
  const skippedNames = names.filter(name => !["GATES", "SECRET_SCAN"].includes(name));
  const env = { ...process.env, GITHUB_EVENT_NAME: "merge_group", QUEUE_CHECK_RESULT: "skipped", QUEUE_VERIFIED: "", TEST_SELECTION_RESULT: "success", ...Object.fromEntries(Object.entries(modes).map(([k,v]) => [k.toUpperCase(),v])), ...Object.fromEntries(names.map(name => [`${name}_RESULT`, skippedNames.includes(name) ? "skipped" : "success"])) };
  const verdict = (over: Record<string,string> = {}) => spawnSync("bash", ["-eo", "pipefail", "-c", script], { env: { ...env, ...over }, encoding: "utf8" }).status;
  assert.equal(verdict(), 0);
  assert.equal(verdict({ GITHUB_EVENT_NAME: "pull_request" }), 0);
  assert.notEqual(verdict({ GITHUB_EVENT_NAME: "merge_group", DOCUMENTATION_MODE: "code" }), 0, "non-doc merge_group cannot skip account-login/security/product");
  for (const result of ["failure", "cancelled", "skipped"]) assert.notEqual(verdict({ TEST_SELECTION_RESULT: result }), 0, result);
  for (const name of names) for (const result of ["failure", "cancelled"]) assert.notEqual(verdict({ [`${name}_RESULT`]: result }), 0, name);
  for (const mode of Object.keys(modes).filter(k => k !== "studio_replay_mode" && k !== "gate_rules_mode")) for (const value of ["", "unknown"]) assert.notEqual(verdict({ [mode.toUpperCase()]: value }), 0, mode);
  for (const event of ["push", "schedule", "workflow_dispatch"]) assert.notEqual(verdict({ GITHUB_EVENT_NAME: event }), 0, event);
});

test("CIP-06 Full builds once and runs 24 shards in one wave while preserving worker caps and failure semantics", () => {
  const build = jobBlock("build", fullSuiteWorkflow);
  assert.match(build, /run: pnpm build/);
  const block = jobBlock("shard", fullSuiteWorkflow);
  assert.match(block, /^    needs: \[build\]$/m);
  const shardExpr = /shard: \$\{\{ (.*) \}\}/.exec(block)![1]!;
  assert.ok(shardExpr.includes("'[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]'"));
  assert.match(block, /max-parallel: 24/);
  assert.match(block, /MOLIS_WORK_TEST_JOBS: 2/);
  assert.match(block, /MOLIS_WORK_TEST_BROWSER_JOBS: 1/);
  assert.match(block, /--shard \$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}/);
  assert.match(block, /--retries 1 \$BAIL/);
  // The nightly run, integration branches and roadmap batch pull requests (decision 31) run every file; everything else stops
  // at the first failure. `fail-fast` and `--bail` must use the same condition.
  const runsEveryFile =
    "(github.event_name == 'schedule' || startsWith(github.ref, 'refs/heads/integration/') || startsWith(github.ref, 'refs/heads/batch/') || startsWith(github.head_ref, 'batch/'))";
  assert.ok(block.includes(`fail-fast: \${{ !${runsEveryFile} }}`));
  assert.ok(block.includes(`BAIL: \${{ !${runsEveryFile} && '--bail' || '' }}`));
  assert.ok(block.includes("STRATA_FLAGS: ${{ github.event_name == 'pull_request' && '--exclude-gate-meta --exclude-visual-audit' || '' }}"));
});

test("MR19-07 plugin stylesheet and shared browser component changes run the PR visual audit", () => {
  const visual = workflowFiles().find(({ file }) => file.endsWith("/visual-audit.yml"))!.text;
  const filters = visual.split("    paths:")[1]!.split("  workflow_dispatch:")[0]!;
  const patterns = [...filters.matchAll(/^\s+- "([^"]+)"$/gm)].map(match => match[1]!);
  const triggers = (path: string) => patterns.some(pattern => matchesGlob(path, pattern));
  for (const path of ["plugins/native/coding/src/styles.ts", "packages/plugin-sdk/src/browser/subtask-conversation.ts"])
    assert.equal(triggers(path), true, path);
  assert.equal(triggers("horizontal/evaluation/src/service.ts"), false);
});
