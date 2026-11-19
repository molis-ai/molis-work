// CIP-01/04/05: scopes for the existing CI selector. Unknown changes always retain the checks.
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
  "tests/fixtures/feed-content-home-v1.sql", "tests/fixtures/agent-definitions-v1.sql", "tests/fixtures/observation-v1.sql",
];
const STUDIO_INPUTS = [
  ".github/", "skills/molis-plugin-dev/", "plugins/native/plugin-builder/",
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
  "packages/contracts/", "packages/storage/", "packages/test-kit/", "packages/design-system/", "packages/ui-host/",
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
const ruleInput = (file) => rootConfig(file) || starts(file, [".github/", "scripts/", "tooling/", "skills/", ...PROTECTED_DOCUMENTS, ...GATE_RULE_TEST_INPUTS])
  || /(?:^|\/)(?:package\.json|README\.md|tsconfig[^/]*\.json|AGENTS\.md)$/.test(file)
  || file.startsWith("vendor/");
const productSource = (file) => /^(?:apps|plugins|packages|horizontal|modules|server)\/(?:.*\/)?src\/.+\.(?:ts|tsx|js|css|scss)$/.test(file);
const productTest = (file) => /^tests\/(?:[^/]+\.test\.(?:ts|mjs)|fixtures\/[^/]+\.(?:ts|mjs))$/.test(file) && !starts(file, GATE_RULE_TEST_INPUTS);
const shellInput = (file) => /\.(?:sh|py)$/.test(file) || rootConfig(file)
  || starts(file, [".github/workflows/", "scripts/gates/native-checks.mjs", "tests/native-checks.test.mjs", "scripts/ci-test-selection.mjs", "scripts/ci-check-selection.mjs"]);
const studioInput = (file) => rootConfig(file) || packageConfig(file) || starts(file, STUDIO_INPUTS);
const accountLoginInput = (file) => rootConfig(file) || packageConfig(file) || starts(file, ACCOUNT_LOGIN_INPUTS)
  || (!ordinaryDocument(file) && !productSource(file) && !productTest(file));

export function decideChecks({ affected, failure }) {
  const changed = changedPaths(affected);
  const whole = (reason) => ({ mode: "whole", reasons: [reason] });
  if (!changed || ["tests", "full", "uncovered"].some((key) => !Array.isArray(affected?.[key]))) {
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
      : decide((file) => !ordinaryDocument(file) && (ruleInput(file) || (!productSource(file) && !productTest(file))), "gate-rule tests"),
    shell: decide(shellInput, "Shell and Python checks"),
    studio_replay: documentation ? { mode: "none", reasons: ["ordinary documentation only"] } : decide(studioInput, "Studio Skill replay rules"),
    account_login: documentation ? { mode: "none", reasons: ["ordinary documentation only"] } : decide(accountLoginInput, "P1 login contract and regression"),
  };
}
