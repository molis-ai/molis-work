// CIP-01/04/05: scopes for the existing CI selector. Unknown changes always retain the checks.
import { isGateMetaTest, isGateRuleTest } from "./run-tests/strata.mjs";
const ROOT_DOCUMENTS = new Set(["README.md", "PRODUCT.md", "DESIGN.md", "CHANGELOG.md"]);
const PROTECTED_DOCUMENTS = ["docs/system/", "docs/releases/", "docs/platform/", "docs/prompts/", "docs/SSOT-MATRIX.md"];
const GATE_RULE_TEST_INPUTS = [
  "tests/health-gates-", "tests/ci-", "tests/run-tests-", "tests/first-screen-",
  "tests/fixtures/home-store-schemas/", "tests/fixtures/studio-replay/", "tests/fixtures/builder-designer/",
  "tests/doc-reference-gates.test.ts", "tests/translation-check.test.ts", "tests/package-inventory-gate.test.ts",
  "tests/vendor-provenance.test.ts", "tests/verify-release-versions.test.ts", "tests/version-source.test.ts",
  "tests/secret-scan.test.ts", "tests/cursor-skill-links.test.ts", "tests/native-checks.test.mjs",
  "tests/page-assets-budget.test.ts", "tests/plugin-styles-gate.test.ts", "tests/dom-events-contract.test.ts",
  "tests/storage-baseline.test.ts", "tests/home-store-baselines.test.ts", "tests/release-assets.test.ts",
  "tests/installer-symlink-dependencies.test.ts", "tests/shell-page-gate.test.ts", "tests/artifact-type-gate.test.ts",
  "tests/artifact-declaration-gate.test.ts", "tests/artifact-host-writers.test.ts", "tests/studio-replay.test.ts",
  "tests/affected-tests.test.ts", "tests/fixtures/ci-workflow.ts", "tests/fixtures/plugin-styles-build.ts",
  "tests/fixtures/feed-content-home-v1.sql",
];
const STUDIO_INPUTS = [
  ".github/", "skills/molis-plugin-dev/", "horizontal/plugin-studio/",
  "packages/plugin-sandbox/", "packages/plugin-sdk/", "packages/contracts/", "packages/storage/", "horizontal/agent-host/",
  "apps/local-host/src/plugin-builder/", "apps/local-host/src/web-locale.ts", "apps/local-host/src/ui-text-provider.ts",
  "apps/local-host/src/configured-models.ts", "apps/local-host/src/model-provider-store.ts",
  "apps/local-host/src/project-catalog-contract.ts", "apps/local-host/src/connector-connection-store.ts",
  "scripts/studio-replay.mts", "scripts/studio-replay/", "scripts/ci-test-selection.mjs", "scripts/ci-check-selection.mjs",
  "tests/fixtures/studio-replay/", "tests/fixtures/builder-designer/", "tests/fixtures/studio-bilingual.ts", "tests/studio-replay.test.ts",
  "vendor/",
];
const ACCOUNT_LOGIN_INPUTS = [
  ".github/", "horizontal/account/", "apps/desktop/", "apps/local-host/", "apps/workbench/",
  "packages/contracts/", "packages/kernel/", "packages/storage/", "packages/test-kit/", "packages/design-system/", "packages/ui-host/",
  "packages/plugin-runtime/", "packages/plugin-sdk/", "modules/sync-replication/",
  "scripts/account-", "scripts/central-account.test.mjs", "scripts/ci-test-selection.mjs", "scripts/ci-check-selection.mjs",
  "scripts/build-workspace.mjs", "scripts/workspace-packages.mjs", "scripts/machine-slot.mjs", "vendor/",
];
const starts = (file, entries) => entries.some((entry) => entry.endsWith("/") || entry.endsWith("-") ? file.startsWith(entry) : file === entry);

/** Both ends of a rename are inputs; an incomplete answer cannot waive a check. */
export function changedPaths(affected) {
  if (!Array.isArray(affected?.changes)) return null;
  if (affected.changes.some((change) => !change || typeof change.path !== "string" || !change.path
    || (change.from !== undefined && (typeof change.from !== "string" || !change.from)))) return null;
  return [...new Set(affected.changes.flatMap((change) => [change.path, change.from].filter(Boolean)))];
}

const ordinaryDocument = (file) => ROOT_DOCUMENTS.has(file) || (/^(?:docs|specs)\/.+\.md$/.test(file)
  && !/(?:^|\/)AGENTS\.md$/.test(file) && !starts(file, PROTECTED_DOCUMENTS));
const rootConfig = (file) => !file.includes("/") && !ROOT_DOCUMENTS.has(file);
const packageConfig = (file) => /(?:^|\/)(?:package\.json|tsconfig[^/]*\.json)$/.test(file);
const productSource = (file) => /^(?:apps|plugins|packages|horizontal|modules|server)\/(?:.*\/)?src\/.+\.(?:ts|tsx|js|css|scss)$/.test(file);
const productTest = (file) => /^tests\/(?:[^/]+\.test\.(?:ts|mjs)|fixtures\/[^/]+\.(?:ts|mjs))$/.test(file) && !starts(file, GATE_RULE_TEST_INPUTS);
const shellInput = (file) => /\.(?:sh|py)$/.test(file) || rootConfig(file)
  || starts(file, [".github/workflows/", ".github/actions/", "scripts/gates/native-checks.mjs", "tests/native-checks.test.mjs", "scripts/ci-test-selection.mjs", "scripts/ci-check-selection.mjs"]);
const studioInput = (file) => rootConfig(file) || packageConfig(file) || starts(file, STUDIO_INPUTS);
const accountLoginInput = (file) => rootConfig(file) || packageConfig(file) || starts(file, ACCOUNT_LOGIN_INPUTS)
  || (!ordinaryDocument(file) && !productSource(file) && !productTest(file));

// The wide affected-test index follows explicit readers. These groups also cover indirect
// imports and data that the rules open at runtime. Other tooling/fixtures keep the full suite.
const GATE_INPUTS = [
  // The security invariant regressions exercise these on every code build.
  { inputs: ["scripts/check-secrets.mjs", "tooling/gates/secret-allowlist.txt", "scripts/gates/dual-instance.mjs"], tests: [] },
  { inputs: ["scripts/gates/error-scan.mjs", "scripts/gates/error-owners.mjs", "scripts/gates/error-metrics.mjs", "tooling/gates/error-owners.json"],
    tests: ["tests/health-gates-errors.test.ts", "tests/health-gates-error-pieces.test.ts"] },
  { inputs: ["scripts/gates/lint.mjs", "tooling/gates/lint/"], tests: ["tests/health-gates-lint.test.ts"] },
  { inputs: ["scripts/gates/spec-coverage.mjs", "scripts/check-spec-coverage.mjs"], tests: ["tests/health-gates-spec-coverage.test.ts"] },
  { inputs: ["scripts/gates/translations.mjs"], tests: ["tests/translation-check.test.ts"] },
  { inputs: ["scripts/gates/browser-bundles.mjs", "scripts/gates/browser-graph.mjs", "scripts/gates/browser-programs.mjs"],
    tests: ["tests/health-gates-browser-fetch.test.ts", "tests/health-gates-source-counts.test.ts", "tests/health-gates-merge-base.test.ts"] },
  { inputs: ["scripts/verify-release-versions.mjs", "scripts/generate-versions.mjs", "scripts/version-source.mjs", "scripts/gates/version-declarations.mjs",
    "tooling/versions.json", "tooling/gates/version-exceptions.json", "docs/releases/"],
    tests: ["tests/verify-release-versions.test.ts", "tests/version-source.test.ts", "tests/doc-reference-gates.test.ts"] },
  { inputs: ["scripts/gates/page-assets.mjs", "scripts/gates/page-assets-", "scripts/gates/first-screen.mjs",
    "scripts/first-screen/", "scripts/first-screen-report.mjs", "scripts/gates/plugin-styles.mjs", "tests/fixtures/plugin-styles-build.ts",
    "tooling/gates/page-asset-budgets.json", "tooling/gates/page-asset-allowances/", "tooling/gates/first-screen.json", "tooling/gates/plugin-styles.json"],
    tests: ["tests/page-assets-budget.test.ts", "tests/first-screen-budget.test.mjs", "tests/first-screen-report.test.mjs", "tests/plugin-styles-gate.test.ts"] },
];
const packageContent = /^(?:apps|packages|plugins|modules|horizontal|server)\/(?:.*\/)?(?:README\.md|locales\/[^/]+\.json|tests\/.+\.test\.(?:m?js|ts))$/;
const accountTestScript = /^scripts\/(?:account-[\w-]+|central-account)\.test\.mjs$/;
// These are inputs to running checks. The PR still checks the real data. Register self-tests
// that also open it (including directory walks that the literal-path index cannot resolve).
const GATE_DATA = [
  { inputs: ["docs/system/CONTRACT-CHANGES.md", "docs/system/HOME-DATA.md"], tests: ["tests/health-gates-store-versions.test.ts", "tests/version-source.test.ts"] },
  { inputs: ["tooling/gates/actions/actions.tsv", "tooling/gates/actions/host-actions.tsv"], tests: ["tests/version-source.test.ts"] },
  { inputs: ["tooling/gates/schemas/stores.tsv", "tests/home-store-baselines.test.ts"], pattern: /^tests\/fixtures\/home-store-schemas\/[^/]+\.sql$/,
    tests: ["tests/health-gates-store-schemas.test.ts", "tests/health-gates-store-versions.test.ts"] },
  { inputs: ["tests/ci-shard-weights.json"], tests: ["tests/ci-shard-weights.test.ts", "tests/run-tests-shard.test.ts", "tests/ci-product-subset-plan.test.ts", "tests/ci-test-selection.test.ts"] },
  { inputs: ["docs/system/DEVELOPMENT-REQUIREMENTS.md"], tests: ["tests/affected-tests.test.ts", "tests/package-inventory-gate.test.ts"] },
  { inputs: ["tooling/gates/README.md"], tests: ["tests/doc-reference-gates.test.ts", "tests/health-gates-action-input-counts.test.ts"] },
  { inputs: ["docs/platform/UI-PLATFORM.md", "tests/fixtures/web-route-table.snapshot.json", "tests/fixtures/goals-page-golden/golden.json"], tests: [] },
];
const apiSnapshot = /^tooling\/gates\/api\/.+\.txt$/;
const apiSource = /^packages\/(?:contracts|plugin-sdk)\/src\/.+\.ts$/;
const skillDocument = /^skills\/[^/]+\/.+\.md$/;
const designPrototype = /^docs\/design\/.+\.(?:html|css|js|svg)$/;
const readerReasons = new Set(["reads-file", "uses-changed-helper", "package", "readme", "readme-ui"]);

function decideGateRules(changed, affectedTests) {
  const malformed = affectedTests.some(test => !test?.file || typeof test.file !== "string" || (test.reasons !== undefined &&
    (!Array.isArray(test.reasons) || !test.reasons.length || test.reasons.some(reason => typeof reason?.code !== "string" || !reason.code))));
  if (!changed.length || malformed) {
    return { mode: "whole", reasons: ["missing changes or invalid affected test list"] };
  }
  // Keep the wide index for implementation/config changes. A snapshot or a fixture beside
  // product code should not turn coincidental folder and identifier matches into dependencies.
  const wide = changed.some(file => file.startsWith("scripts/") || isGateMetaTest(file) || GATE_INPUTS.some(group => starts(file, group.inputs)));
  const readers = affectedTests.filter(test => isGateRuleTest(test.file) && (wide || !test.reasons ||
    test.reasons.some(reason => readerReasons.has(reason.code))));
  const files = new Set(readers.map(test => test.file));
  for (const file of changed) {
    if (isGateRuleTest(file)) {
      files.add(file);
      continue;
    }
    if (isGateMetaTest(file)) continue;
    const group = GATE_INPUTS.find(group => starts(file, group.inputs)) ?? GATE_DATA.find(group => starts(file, group.inputs) || group.pattern?.test(file));
    if (group) {
      for (const test of group.tests) files.add(test);
    } else if (/^scripts\/gates\/[\w-]+\.mjs$/.test(file) && files.has(`tests/health-gates-${file.slice("scripts/gates/".length, -4)}.test.ts`)) {
      // A dedicated self-test was found by the index. Keep the shared entry point's integration checks as well.
      files.add("tests/health-gates-merge-base.test.ts");
    } else if (apiSnapshot.test(file) || apiSource.test(file)) {
      files.add("tests/health-gates-api-snapshot.test.ts");
    } else if (skillDocument.test(file) && !file.endsWith("/AGENTS.md")) {
      files.add("tests/cursor-skill-links.test.ts");
    } else if (file.endsWith("/README.md") && packageContent.test(file)) {
      files.add("tests/package-inventory-gate.test.ts");
      files.add("tests/affected-tests.test.ts");
    } else if (file === "docs/SSOT-MATRIX.md" || file === "docs/system/PACKAGE-BOUNDARIES.md") {
      files.add("tests/doc-reference-gates.test.ts");
      files.add("tests/package-inventory-gate.test.ts");
    } else if (file.includes("/locales/") && packageContent.test(file)) {
      files.add("tests/translation-check.test.ts");
    } else if (!(ordinaryDocument(file) || productSource(file) || productTest(file) || packageContent.test(file) || designPrototype.test(file) || accountTestScript.test(file))) {
      return { mode: "whole", reasons: [`shared or unmapped gate input: ${file}`] };
    }
  }
  return files.size ? { mode: "some", files: [...files].sort(), reasons: ["affected readers and the self-tests of the changed rules"] }
    : { mode: "none", reasons: ["no gate self-test reads the changed inputs"] };
}

export function decideChecks({ affected, failure }) {
  const changed = changedPaths(affected);
  const whole = (reason) => ({ mode: "whole", reasons: [reason] });
  if (!changed || failure || ["tests", "full", "uncovered"].some((key) => !Array.isArray(affected?.[key]))) {
    const reason = failure ?? "the selection has no valid changed paths";
    return { documentation: { mode: "code", reasons: [reason] }, gate_rules: whole(reason), shell: whole(reason), studio_replay: whole(reason), account_login: whole(reason) };
  }
  const documentation = changed.length > 0 && changed.every(ordinaryDocument);
  const decide = (predicate, label) => {
    const touched = changed.filter(predicate);
    return touched.length ? whole(`${label} reads: ${touched.join(", ")}`)
      : { mode: "none", reasons: [`none of the ${changed.length} changed paths is an input of ${label}`] };
  };
  return {
    documentation: { mode: documentation ? "only" : "code", reasons: [documentation
      ? "only ordinary documentation changed; current health gates, versions and secret scan still run"
      : "the change includes code, protected documentation or an unknown path"] },
    gate_rules: documentation ? { mode: "none", reasons: ["ordinary documentation only"] }
      : decideGateRules(changed, affected.tests),
    shell: decide(shellInput, "Shell and Python checks"),
    studio_replay: documentation ? { mode: "none", reasons: ["ordinary documentation only"] } : decide(studioInput, "Studio Skill replay rules"),
    account_login: documentation ? { mode: "none", reasons: ["ordinary documentation only"] } : decide(accountLoginInput, "P1 login contract and regression"),
  };
}
