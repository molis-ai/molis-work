// CIP-01/04/05: scopes for the existing CI selector. Unknown changes always retain the checks.
const ROOT_DOCUMENTS = new Set(["README.md", "PRODUCT.md", "DESIGN.md", "CHANGELOG.md"]);
const PROTECTED_DOCUMENTS = ["docs/system/", "docs/releases/", "docs/platform/", "docs/prompts/", "docs/SSOT-MATRIX.md"];
const starts = (file, entries) => entries.some((entry) => entry.endsWith("/") ? file.startsWith(entry) : file === entry);

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
const ruleInput = (file) => rootConfig(file) || starts(file, [".github/", "scripts/", "tooling/", "tests/", "skills/", ...PROTECTED_DOCUMENTS])
  || /(?:^|\/)(?:package\.json|README\.md|tsconfig[^/]*\.json|AGENTS\.md)$/.test(file)
  || file.startsWith("vendor/");
const productSource = (file) => /^(?:apps|plugins|packages|horizontal|modules|server)\/(?:.*\/)?src\/.+\.(?:ts|tsx|js|css|scss)$/.test(file);
const shellInput = (file) => /\.(?:sh|py)$/.test(file) || rootConfig(file)
  || starts(file, [".github/workflows/", "scripts/gates/native-checks.mjs", "tests/native-checks.test.mjs", "scripts/ci-test-selection.mjs", "scripts/ci-check-selection.mjs"]);

export function decideChecks({ affected, failure }) {
  const changed = changedPaths(affected);
  const whole = (reason) => ({ mode: "whole", reasons: [reason] });
  if (!changed || ["tests", "full", "uncovered"].some((key) => !Array.isArray(affected?.[key]))) {
    const reason = failure ?? "the selection has no valid changed paths";
    return { documentation: { mode: "code", reasons: [reason] }, gate_rules: whole(reason), shell: whole(reason) };
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
    gate_rules: documentation ? { mode: "none", reasons: ["ordinary documentation only"] } : decide((file) => !ordinaryDocument(file) && (ruleInput(file) || !productSource(file)), "gate-rule tests"),
    shell: decide(shellInput, "Shell and Python checks"),
  };
}
