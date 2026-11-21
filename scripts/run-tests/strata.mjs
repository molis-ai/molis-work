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

const GATE_META_PATTERN = /^tests\/(?:health-gates-|ci-|run-tests-|first-screen-|doc-reference-gates\.|translation-check\.|package-inventory-gate\.|vendor-provenance\.|verify-release-versions\.|version-source\.|secret-scan\.|cursor-skill-links\.|native-checks\.|page-assets-budget\.|plugin-styles-gate\.|studio-replay\.|affected-tests\.)/u;

const normalize = (file) => String(file).replaceAll("\\", "/").replace(/^\.\//u, "");

export const isVisualAuditTest = (file) => VISUAL_AUDIT_SET.has(normalize(file));

export const isGateMetaTest = (file) => GATE_META_PATTERN.test(normalize(file));
