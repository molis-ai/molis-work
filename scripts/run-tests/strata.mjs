/**
 * Test suite strata for CI scheduling:
 * - VISUAL_AUDIT_TESTS: full-screen VUX multi-width/multi-surface crawl tests (~1.35 CPU-hr), run by
 *   `.github/workflows/visual-audit.yml` on UI/style PRs and nightly, and still included in nightly `full-suite.yml`.
 * - isGateMetaTest: CI/gate/health/runner self-tests already exercised by `ci.yml` (`gates`)
 *   when gate or workflow inputs change; excluded only from PR `full-suite` runs,
 *   retained in nightly/integration `full-suite` runs and local runs.
 */

export const VISUAL_AUDIT_TESTS = Object.freeze([
  "tests/chinese-layers.e2e.test.ts",
  "tests/chinese-walkthrough.e2e.test.ts",
  "tests/dialog-submit-rules.e2e.test.ts",
  "tests/english-walkthrough.e2e.test.ts",
  "tests/geometry-boundaries.e2e.test.ts",
  "tests/load-geometry.e2e.test.ts",
  "tests/narrow-surfaces.e2e.test.ts",
  "tests/remaining-forms-viewport.e2e.test.ts",
  "tests/repeat-no-accumulation.e2e.test.ts",
  "tests/touch-targets.e2e.test.ts",
  "tests/truncation-tip.e2e.test.ts",
  "tests/visual-order-details.e2e.test.ts",
  "tests/visual-order.e2e.test.ts",
]);

const VISUAL_AUDIT_SET = new Set(VISUAL_AUDIT_TESTS);

// These files used to be named explicitly by the blocking workflow. A missing file must still fail the job.
const REQUIRED_GATE_RULE_FILES = [
  "tests/affected-tests.test.ts",
  "tests/ci-check-selection.test.ts",
  "tests/ci-font-install.test.ts",
  "tests/ci-install.test.ts",
  "tests/ci-linux-probe.test.ts",
  "tests/ci-product-subset-plan.test.ts",
  "tests/ci-product-subset.test.ts",
  "tests/ci-queue-verified.test.ts",
  "tests/ci-shard-weights.test.ts",
  "tests/ci-test-selection.test.ts",
  "tests/ci-timeouts.test.ts",
  "tests/cursor-skill-links.test.ts",
  "tests/doc-reference-gates.test.ts",
  "tests/first-screen-budget.test.mjs",
  "tests/first-screen-report.test.mjs",
  "tests/package-inventory-gate.test.ts",
  "tests/page-assets-budget.test.ts",
  "tests/plugin-styles-gate.test.ts",
  "tests/run-tests-pool.test.ts",
  "tests/run-tests-shard.test.ts",
  "tests/translation-check.test.ts",
  "tests/vendor-provenance.test.ts",
  "tests/verify-release-versions.test.ts",
  "tests/version-source.test.ts",
];
const namedGateRules = new Set(REQUIRED_GATE_RULE_FILES);
// S-19 and S-48 run on every code build; native checks and Studio replay have their own jobs/steps.
const separateGateTests = new Set([
  "tests/secret-scan.test.ts", "tests/health-gates-dual-instance.test.ts",
  "tests/native-checks.test.mjs", "tests/studio-replay.test.ts",
]);
const gateRuleFamily = /^tests\/(?:health-gates-|ci-|run-tests-|first-screen-)[\w.-]+\.test\.(?:ts|mjs)$/u;
const normalize = (file) => String(file).replaceAll("\\", "/").replace(/^\.\//u, "");

export const isVisualAuditTest = (file) => VISUAL_AUDIT_SET.has(normalize(file));
export const isGateRuleTest = (file) => !separateGateTests.has(file) && (namedGateRules.has(file) || gateRuleFamily.test(file));

export function isGateMetaTest(file) {
  const name = normalize(file);
  return isGateRuleTest(name) || separateGateTests.has(name);
}

/** The checkout owns the full list. An empty, malformed or foreign selection runs it all. */
export function gateRuleFiles(testFiles, selection) {
  const suite = testFiles.filter(isGateRuleTest);
  const missing = REQUIRED_GATE_RULE_FILES.filter(file => !suite.includes(file));
  if (missing.length) throw new Error(`Missing gate self-tests: ${missing.join(", ")}`);
  if (!selection) return suite;
  let files;
  try {
    files = JSON.parse(selection);
  } catch {
    return suite;
  }
  if (!Array.isArray(files) || !files.length || !files.every(file => suite.includes(file))) return suite;
  const selected = new Set(files);
  return suite.filter(file => selected.has(file));
}
