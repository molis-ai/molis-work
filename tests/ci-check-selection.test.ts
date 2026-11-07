// CIP-09: regression coverage for the workflow contract, alongside the existing install, timeout, product and runner cases.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { decideChecks } from "../scripts/ci-check-selection.mjs";
import { evaluateExpression, fullSuiteWorkflow, jobBlock, stepScript } from "./fixtures/ci-workflow.js";

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
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts", "specs/todo/spec.md", "README.md") }).gate_rules.mode, "none");
  for (const file of ["scripts/check.mjs", "tooling/gates/limits.json", "tests/fixture.txt", "pnpm-lock.yaml", "unknown/input.toml", "apps/workbench/vite.config.ts"]) assert.equal(decideChecks({ affected: change(file) }).gate_rules.mode, "whole", file);
});

test("CIP-05 shell and Python checks follow their own inputs", () => {
  for (const file of ["scripts/task.sh", "tools/task.py", ".github/workflows/ci.yml", "scripts/gates/native-checks.mjs"]) assert.equal(decideChecks({ affected: change(file) }).shell.mode, "whole");
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts") }).shell.mode, "none");
});

const modes = { documentation_mode: "only", gate_rules_mode: "none", shell_mode: "none", native_mode: "none", security_mode: "none", product_mode: "none", golden_third_party_mode: "none" };
const scope = (event: string, result = "success") => ({ "github.event_name": event, "needs.queue-check.result": "skipped", "needs.queue-check.outputs.verified": "", "needs.test-selection.result": result, ...Object.fromEntries(Object.entries(modes).map(([k,v]) => [`needs.test-selection.outputs.${k}`, v])) });
const skipped = ["health-gate-rules", "architecture-boundaries", "action-contracts", "native-checks", "shell-checks", "security-invariants", "product-subset", "golden-replay", "golden-replay-third-party"];
test("CIP-01 CIP-02 CIP-04 workflow skips only successful scoped work, retains health gates and secrets, and uses the merge-group base", () => {
  for (const name of [...skipped, "gates", "secret-scan"]) {
    const condition = /^    if: \$\{\{ (.*) \}\}$/m.exec(jobBlock(name))![1]!;
    for (const event of ["pull_request", "merge_group", "push", "schedule", "workflow_dispatch"]) {
      assert.equal(Boolean(evaluateExpression(condition, scope(event))), !["pull_request", "merge_group"].includes(event) || !skipped.includes(name), `${event}: ${name}`);
      for (const result of ["failure", "cancelled", "skipped"]) assert.equal(Boolean(evaluateExpression(condition, scope(event, result))), true, `${name}: ${result} runs full`);
    }
  }
  const gates = jobBlock("gates");
  assert.match(gates, /node scripts\/check-health-gates.mjs --base "\$base"/);
  const step = gates.split("\n      - ").find(step => step.startsWith("name: Gate rules reject"))!;
  const condition = /if: \$\{\{ (.*) \}\}/.exec(step)![1]!;
  assert.equal(evaluateExpression(condition, scope("pull_request")), false);
  assert.equal(evaluateExpression(condition, scope("schedule")), true);
  const selection = jobBlock("test-selection");
  assert.match(selection, /PUSH_BEFORE: \$\{\{ github.event.merge_group.base_sha \}\}/);
  assert.match(selection, /base="\$\(node scripts\/ci-health-base.mjs\)"/);
});

test("CIP-03 Verify executes the real shell verdict and rejects unauthorized skips, failures and cancellation", () => {
  const step = jobBlock("verify").split("\n      - ").find(step => step.startsWith("name: Required package gate"))!;
  const script = stepScript(step);
  const names = ["GATES", "SECRET_SCAN", "HEALTH_GATE_RULES", "PACKAGE_BOUNDARIES", "ACTION_CONTRACTS", "SHELL_CHECKS", "NATIVE_CHECKS", "SECURITY_INVARIANTS", "PRODUCT_SUBSET", "GOLDEN_REPLAY", "GOLDEN_REPLAY_THIRD_PARTY"];
  const skippedNames = names.filter(name => !["GATES", "SECRET_SCAN"].includes(name));
  const env = { ...process.env, GITHUB_EVENT_NAME: "merge_group", QUEUE_CHECK_RESULT: "skipped", QUEUE_VERIFIED: "", TEST_SELECTION_RESULT: "success", ...Object.fromEntries(Object.entries(modes).map(([k,v]) => [k.toUpperCase(),v])), ...Object.fromEntries(names.map(name => [`${name}_RESULT`, skippedNames.includes(name) ? "skipped" : "success"])) };
  const verdict = (over: Record<string,string> = {}) => spawnSync("bash", ["-eo", "pipefail", "-c", script], { env: { ...env, ...over }, encoding: "utf8" }).status;
  assert.equal(verdict(), 0);
  assert.equal(verdict({ GITHUB_EVENT_NAME: "pull_request" }), 0);
  for (const result of ["failure", "cancelled", "skipped"]) assert.notEqual(verdict({ TEST_SELECTION_RESULT: result }), 0, result);
  for (const name of names) for (const result of ["failure", "cancelled"]) assert.notEqual(verdict({ [`${name}_RESULT`]: result }), 0, name);
  for (const mode of Object.keys(modes)) for (const value of ["", "unknown"]) assert.notEqual(verdict({ [mode.toUpperCase()]: value }), 0, mode);
  for (const event of ["push", "schedule", "workflow_dispatch"]) assert.notEqual(verdict({ GITHUB_EVENT_NAME: event }), 0, event);
});

test("CIP-06 Full expands independent runners while preserving worker caps and failure semantics", () => {
  const block = jobBlock("shard", fullSuiteWorkflow);
  const count = /shard: \[([^\]]+)\]/.exec(block)![1]!.split(",").map(Number);
  assert.deepEqual(count, Array.from({ length: 32 }, (_, i) => i + 1));
  assert.match(block, /max-parallel: 16/);
  assert.match(block, /MOLIS_WORK_TEST_JOBS: 2/);
  assert.match(block, /MOLIS_WORK_TEST_BROWSER_JOBS: 1/);
  assert.match(block, /--shard \$\{\{ matrix.shard \}\}\/32/);
  assert.match(block, /--retries 1 \$BAIL/);
  assert.match(block, /fail-fast: \$\{\{ !startsWith\(github.ref, 'refs\/heads\/integration\/'\) \}\}/);
});
