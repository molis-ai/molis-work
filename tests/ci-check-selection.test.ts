// CIP-09: regression coverage for the workflow contract, alongside the existing install, timeout, product and runner cases.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { matchesGlob } from "node:path";
import { decideChecks } from "../scripts/ci-check-selection.mjs";
import { evaluateExpression, fullSuiteWorkflow, jobBlock, stepScript, testRunsInJob, workflowFiles } from "./fixtures/ci-workflow.js";

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
  for (const file of ["scripts/check.mjs", "tooling/gates/limits.json", "tests/fixture.txt", "tests/fixtures/ci-workflow.ts", "tests/quarantine.json", "pnpm-lock.yaml", "unknown/input.toml", "apps/workbench/vite.config.ts"]) {
    assert.equal(decideChecks({ affected: change(file) }).gate_rules.mode, "whole", file);
  }
});

test("CIP-12 VG-14: changing version rules, inputs or their test runs the version self-test", () => {
  const job = jobBlock("gate-rules"), file = "tests/version-source.test.ts";
  for (const input of ["tooling/versions.json", "scripts/version-source.mjs", "scripts/generate-versions.mjs", "scripts/gates/version-declarations.mjs", "tooling/gates/version-exceptions.json", file]) {
    const gate = decideChecks({ affected: change(input) }).gate_rules;
    assert.equal(gate.mode, "some", input);
    assert.ok(testRunsInJob(job, JSON.stringify(gate.files)).some(args => args.includes(file)), input);
  }
});

test("CIP-12 gate self-tests use both rename paths, explicit readers and rule data; unknown inputs keep every rule", () => {
  const select = (affected: object) => decideChecks({ affected }).gate_rules;
  const rule = "tests/ci-install.test.ts";
  const lint = "tests/health-gates-lint.test.ts";
  assert.deepEqual(select(change(rule)).files, [rule]);
  const renamed = { ...change(), changes: [{ path: "docs/guide.md", from: "tooling/gates/secret-allowlist.txt" }], tests: [{ file: lint }] };
  assert.deepEqual(select(renamed).files, [lint], "S-19 has its own blocking step");
  const product = { ...change("plugins/native/todo/src/store.ts"), tests: [{ file: lint, reasons: [{ code: "reads-file" }] }, { file: "tests/account-session.test.ts" }] };
  assert.deepEqual(select(product).files, [lint]);
  assert.equal(select({ ...product, tests: [{ file: lint, reasons: [{ code: "reads-folder" }] }] }).mode, "none");
  const owners = "tests/health-gates-table-owners.test.ts";
  assert.deepEqual(select({ ...change("scripts/gates/table-owners.mjs"), tests: [{ file: owners }] }).files, ["tests/health-gates-merge-base.test.ts", owners]);
  assert.equal(select(change("scripts/gates/new-unmapped.mjs")).mode, "whole");
  assert.deepEqual(select(change("plugins/native/todo/README.md")).files, ["tests/affected-tests.test.ts", "tests/package-inventory-gate.test.ts"]);
  for (const file of ["scripts/run-tests/strata.mjs", "tests/fixtures/ci-workflow.ts", ".github/workflows/ci.yml", "docs/system/SECURITY-INVARIANTS.md", "new/fixture.json"]) {
    assert.equal(select(change(rule, file)).mode, "whole", file);
  }
  assert.equal(select({ ...change(rule), tests: [null] }).mode, "whole");
  assert.equal(select({ ...change(rule), tests: [{ file: lint, reasons: {} }] }).mode, "whole");
  assert.equal(select({ ...change(rule), tests: [{ file: lint, reasons: [] }] }).mode, "whole");
});

test("CIP-12 a published snapshot scopes rule self-tests even beside product code; the checker still reads the real contract", () => {
  const api = "tests/health-gates-api-snapshot.test.ts", store = "tests/health-gates-store-versions.test.ts";
  const input = {
    ...change("apps/workbench/src/view.ts", "docs/system/CONTRACT-CHANGES.md", "tooling/gates/api/plugins/native/example/contract.txt",
      "tooling/gates/actions/host-actions.tsv", "tests/fixtures/web-route-table.snapshot.json"),
    full: ["shared core"], uncovered: ["apps/workbench/src/view.ts"],
    tests: [
      { file: "tests/affected-tests.test.ts", reasons: [{ code: "readme" }] },
      { file: "tests/page-assets-budget.test.ts", reasons: [{ code: "package" }] },
      { file: "tests/ci-shard-weights.test.ts", reasons: [{ code: "uses-changed-helper" }] },
      { file: "tests/health-gates-structure.test.ts", reasons: [{ code: "uses-name" }, { code: "reads-folder" }] },
    ],
  };
  const result = decideChecks({ affected: input });
  assert.equal(result.documentation.mode, "code");
  assert.equal(result.account_login.mode, "whole");
  assert.deepEqual(result.gate_rules.files, ["tests/affected-tests.test.ts", "tests/ci-shard-weights.test.ts", api, store,
    "tests/page-assets-budget.test.ts", "tests/version-source.test.ts"].sort());
  const renamed = { ...input, changes: [{ path: "docs/design/example/pane.css", from: "tooling/gates/api/contracts/platform/example.txt" }] };
  assert.ok(decideChecks({ affected: renamed }).gate_rules.files?.includes(api));
  for (const path of ["scripts/run-tests.mjs", "tooling/gates/api/new-rules.mjs", "tests/fixtures/goals-page-golden/unknown.mjs",
    "skills/example/AGENTS.md", "docs/system/SECURITY-INVARIANTS.md"]) {
    assert.equal(decideChecks({ affected: { ...input, changes: [{ path: "docs/design/pane.css", from: path }] } }).gate_rules.mode, "whole", path);
  }
});

test("CIP-12 directory walkers and indirect rule imports still run for their inputs", () => {
  const files = (path: string) => decideChecks({ affected: change(path) }).gate_rules.files ?? [];
  assert.ok(files("packages/plugin-sdk/src/runtime.ts").includes("tests/health-gates-api-snapshot.test.ts"));
  assert.ok(files("skills/example/SKILL.md").includes("tests/cursor-skill-links.test.ts"));
  assert.ok(files("tests/fixtures/home-store-schemas/new-store.sql").includes("tests/health-gates-store-schemas.test.ts"));
  assert.ok(files("tests/ci-shard-weights.json").includes("tests/run-tests-shard.test.ts"));
  assert.ok(files("scripts/gates/browser-graph.mjs").includes("tests/health-gates-browser-fetch.test.ts"));
  assert.ok(files("scripts/gates/browser-graph.mjs").includes("tests/health-gates-source-counts.test.ts"));
});

test("CIP-05 shell, studio replay and account-login checks follow their own inputs", () => {
  for (const file of ["scripts/task.sh", "tools/task.py", ".github/workflows/ci.yml", ".github/actions/setup-work/action.yml", "scripts/gates/native-checks.mjs"]) assert.equal(decideChecks({ affected: change(file) }).shell.mode, "whole");
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts") }).shell.mode, "none");
  for (const file of ["skills/molis-plugin-dev/SKILL.md", ".github/actions/setup-work/action.yml", "horizontal/plugin-studio/src/a.ts", "apps/local-host/src/plugin-builder/skill.ts", "scripts/studio-replay.mts", "tests/studio-replay.test.ts"]) {
    assert.equal(decideChecks({ affected: change(file) }).studio_replay.mode, "whole", file);
  }
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts", "tests/todo-store.test.ts") }).studio_replay.mode, "none");
  for (const file of [
    "horizontal/account/src/a.ts",
    ".github/actions/setup-work/action.yml",
    "apps/local-host/src/a.ts",
    "apps/workbench/src/a.ts",
    "packages/contracts/src/a.ts",
    "packages/kernel/src/a.ts",
    "packages/plugin-runtime/src/a.ts",
    "packages/plugin-sdk/src/a.ts",
    "modules/sync-replication/src/a.ts",
    "scripts/account-authentication.test.mjs",
    "unknown/file.toml",
  ]) {
    assert.equal(decideChecks({ affected: change(file) }).account_login.mode, "whole", file);
  }
  assert.equal(decideChecks({ affected: change("plugins/native/todo/src/store.ts", "tests/todo-store.test.ts") }).account_login.mode, "none");
  assert.equal(decideChecks({ affected: change("docs/guide.md") }).account_login.mode, "none");
});

const modes = { documentation_mode: "only", gate_rules_mode: "none", shell_mode: "none", studio_replay_mode: "none", account_login_mode: "none", native_mode: "none", security_mode: "none", product_mode: "none", golden_third_party_mode: "none" };
const scope = (event: string, result = "success", extra: Record<string, string> = {}) => ({ "github.event_name": event, "needs.queue-check.result": "skipped", "needs.queue-check.outputs.verified": "", "needs.build.result": "success", "needs.test-selection.result": result, ...Object.fromEntries(Object.entries({ ...modes, ...extra }).map(([k, v]) => [`needs.test-selection.outputs.${k}`, v])) });
const skipped = ["build", "account-login", "gate-rules", "native-checks", "shell-checks", "security-invariants", "product-subset", "golden-replay", "golden-replay-third-party"];
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
  const studio = gates.split("\n      - ").find(item => item.startsWith("name: Studio Skill replay rules reject"))!;
  const studioCondition = /if: \$\{\{ (.*) \}\}/.exec(studio)![1]!;
  assert.equal(evaluateExpression(studioCondition, scope("pull_request")), false);
  assert.equal(evaluateExpression(studioCondition, scope("schedule")), true);
  const selection = jobBlock("test-selection");
  assert.match(selection, /PUSH_BEFORE: \$\{\{ github.event.merge_group.base_sha \}\}/);
  assert.match(selection, /base="\$\(node scripts\/ci-health-base.mjs\)"/);
});

test("CIP-12 the workflow narrows gate self-tests only for a successful PR or merge group selection", () => {
  const security = jobBlock("gates").split("\n      - ").find(item => item.startsWith("name: Security invariant gate regressions"))!;
  assert.ok(security.includes("if: ${{ needs.build.result == 'success' }}"));
  assert.ok(security.includes("run: node scripts/run-tests.mjs tests/secret-scan.test.ts tests/health-gates-dual-instance.test.ts"));
  const rules = jobBlock("gate-rules");
  const step = rules.split("\n      - ").find(item => item.startsWith("name: Gate rules reject"))!;
  const environment = /SELECTED_GATE_TESTS: \$\{\{ (.*) \}\}/.exec(step)![1]!;
  const condition = /^    if: \$\{\{ (.*) \}\}$/m.exec(rules)![1]!;
  assert.ok(step.includes('run: node scripts/run-tests.mjs --gate-rules "$SELECTED_GATE_TESTS"'));
  const files = '["tests/ci-install.test.ts"]';
  for (const event of ["pull_request", "merge_group", "push", "schedule", "workflow_dispatch"]) {
    const scoped = event === "pull_request" || event === "merge_group";
    for (const result of ["success", "failure", "cancelled", "skipped"]) {
      for (const mode of ["none", "some", "whole", "unknown", ""]) {
        const context = scope(event, result, { gate_rules_mode: mode, gate_rule_files: files });
        assert.equal(evaluateExpression(condition, context), !(scoped && result === "success" && mode === "none"));
        assert.equal(evaluateExpression(environment, context), scoped && result === "success" && mode === "some" ? files : "");
      }
    }
  }
});

test("CIP-03 CIP-14 Verify executes the real shell verdict and rejects unauthorized skips, failures and cancellation", () => {
  const step = jobBlock("verify").split("\n      - ").find(step => step.startsWith("name: Required package gate"))!;
  const script = stepScript(step);
  const names = ["BUILD", "ACCOUNT_LOGIN", "GATES", "GATE_RULES", "SECRET_SCAN", "SHELL_CHECKS", "NATIVE_CHECKS", "SECURITY_INVARIANTS", "PRODUCT_SUBSET", "GOLDEN_REPLAY", "GOLDEN_REPLAY_THIRD_PARTY"];
  const skippedNames = names.filter(name => !["GATES", "SECRET_SCAN"].includes(name));
  const env = { ...process.env, GITHUB_EVENT_NAME: "merge_group", QUEUE_CHECK_RESULT: "skipped", QUEUE_VERIFIED: "", TEST_SELECTION_RESULT: "success", ...Object.fromEntries(Object.entries(modes).map(([k,v]) => [k.toUpperCase(),v])), ...Object.fromEntries(names.map(name => [`${name}_RESULT`, skippedNames.includes(name) ? "skipped" : "success"])) };
  const verdict = (over: Record<string,string> = {}) => spawnSync("bash", ["-eo", "pipefail", "-c", script], { env: { ...env, ...over }, encoding: "utf8" }).status;
  assert.equal(verdict(), 0);
  assert.equal(verdict({ GITHUB_EVENT_NAME: "pull_request" }), 0);
  assert.notEqual(verdict({ GITHUB_EVENT_NAME: "merge_group", DOCUMENTATION_MODE: "code" }), 0, "non-doc merge_group cannot skip account-login/security/product");
  for (const result of ["failure", "cancelled", "skipped"]) assert.notEqual(verdict({ TEST_SELECTION_RESULT: result }), 0, result);
  for (const name of names) for (const result of ["failure", "cancelled"]) assert.notEqual(verdict({ [`${name}_RESULT`]: result }), 0, name);
  for (const mode of Object.keys(modes).filter(k => k !== "studio_replay_mode")) for (const value of ["", "unknown"]) assert.notEqual(verdict({ [mode.toUpperCase()]: value }), 0, mode);
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
  const result = jobBlock("result", fullSuiteWorkflow);
  assert.match(result, /test "\$BUILD_RESULT" = "success"\s+test "\$SHARDS_RESULT" = "success"/);
  const evidence = result.split("\n      - ").find(step => step.startsWith("name: Verify every shard on a retry"))!;
  assert.ok(evidence.includes("if: ${{ success() && github.run_attempt > 1 }}"));
  assert.ok(evidence.includes("BUILD_ARTIFACT: ${{ needs.build.outputs.dist-artifact }}"));
  assert.ok(evidence.includes("EXPECTED_SHARDS: ${{ github.event_name == 'workflow_dispatch' && inputs.only_files != '' && 1 || 24 }}"));
  assert.ok(evidence.includes("run: node scripts/ci-full-retry.mjs"));
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
  for (const path of [
    "plugins/native/coding/src/styles.ts",
    "plugins/native/coding/src/footnote-styles.ts",
    "plugins/native/goals/src/workbench-styles.ts",
    "plugins/native/issues/tooling/minify-styles.mjs",
    "plugins/native/risk/tooling/minify-styles.mjs",
    "plugins/native/work-brief/tooling/minify-styles.mjs",
    "plugins/native/feed/src/stage-ui.ts",
    "plugins/native/goals/src/kanban-ui.ts",
    "plugins/native/goals/src/tree-ui-model.ts",
    "plugins/native/goals/src/page/chrome.ts",
    "plugins/native/goals/src/dialogs-client.ts",
    "plugins/native/goals/src/momentum-view.ts",
    "plugins/native/goals/src/workbench-clients.ts",
    "plugins/native/goals/src/momentum-layout.ts",
    "plugins/native/coding/src/change-html.ts",
    "plugins/native/coding/src/workbench-client.ts",
    "plugins/native/coding/src/delegation-view.ts",
    "plugins/native/pages/src/editor-block-menu.ts",
    "plugins/native/pages/src/comment-side-client.ts",
    "plugins/native/pages/src/comment-side-view.ts",
    "plugins/native/pages/src/tone.ts",
    "horizontal/plugin-studio/src/workbench.ts",
    "horizontal/plugin-studio/src/agent-studio.ts",
    "modules/shelf/src/surface/settings-client.ts",
    "modules/shelf/src/surface/glyphs.ts",
    "plugins/native/ppt/src/colors.ts",
    "plugins/native/form/src/fillpage.ts",
    "packages/plugin-sdk/src/ui.ts",
    "packages/plugin-sdk/src/browser.ts",
    "packages/plugin-sdk/src/browser/subtask-conversation.ts",
    "packages/plugin-sdk/src/diff-view.ts",
    "packages/plugin-sdk/src/highlight.ts",
  ]) {
    assert.equal(triggers(path), true, path);
  }
  assert.equal(triggers("horizontal/evaluation/src/service.ts"), false);
  assert.equal(triggers("plugins/native/todo/src/store.ts"), false);
  assert.equal(triggers("horizontal/plugin-studio/src/agent-store.ts"), false);
  const auditJob = jobBlock("audit", visual);
  assert.doesNotMatch(auditJob, /tests\/fixtures\/visual-capture\.mts/, "audit shards no longer run visual-capture inline");
  const captureJob = jobBlock("visual-capture", visual);
  assert.match(captureJob, /^    needs: \[build\]$/m);
  assert.match(captureJob, /^    timeout-minutes: 45$/m);
  assert.match(captureJob, /node scripts\/run-tests\.mjs --shard 1\/1 --timeout-seconds 1200 --retries 1 tests\/fixtures\/visual-capture\.mts/);
  const captureCond = /^    if: \$\{\{ (.*) \}\}$/m.exec(captureJob)![1]!;
  assert.equal(Boolean(evaluateExpression(captureCond, { "needs.build.result": "success", "github.event_name": "schedule" })), true);
  assert.equal(Boolean(evaluateExpression(captureCond, { "needs.build.result": "success", "github.event_name": "workflow_dispatch" })), true);
  assert.equal(Boolean(evaluateExpression(captureCond, { "needs.build.result": "success", "github.event_name": "pull_request" })), false);
  assert.equal(Boolean(evaluateExpression(captureCond, { "needs.build.result": "failure", "github.event_name": "schedule" })), false);
});
