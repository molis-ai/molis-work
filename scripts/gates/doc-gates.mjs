// The documentation and repository-shape gates of `pnpm health:check` (specs/repository-anti-corruption §4.12–§4.14,
// slice W1-06). check-health-gates.mjs imports this one file; scripts/gates/README.md says what each gate checks.
//
//   problems   rules with no baseline: they start at zero and any hit fails (links, citations, spec index, BACKLOG rows,
//              the root allow-list file itself, placeholder contract subpaths)
//   metrics    counts that may only fall, in the entry's METRICS shape and compared with the merge-base like the rest
//              (root strays; the .impeccable count is its own metric, scripts/gates/impeccable-files.mjs)
import { brokenCitations } from "./doc-citations.mjs";
import { brokenLinks } from "./doc-links.mjs";
import { backlogProblems } from "./backlog-rows.mjs";
import { contractPlaceholderProblems } from "./contract-placeholders.mjs";
import { countMetric } from "./count-metric.mjs";
import { ROOT_ALLOWLIST, rootAllowlistProblems, rootStrays } from "./root-entries.mjs";
import { specIndexProblems } from "./spec-index.mjs";

const tagged = (tag, problems) => problems.map((problem) => `${tag}: ${problem}`);

/** Problems in the working tree, every one of them a failure. */
export function docGateProblems(snapshot) {
  return [
    ...tagged("broken link", brokenLinks(snapshot)),
    ...tagged("bad citation", brokenCitations(snapshot)),
    ...tagged("spec index", specIndexProblems(snapshot)),
    ...tagged("BACKLOG", backlogProblems(snapshot)),
    ...tagged("root allow-list", rootAllowlistProblems(snapshot)),
    ...tagged("contract placeholder", contractPlaceholderProblems(snapshot)),
  ];
}

/** The count metrics, built with the entry's own helpers. */
export const docGateMetrics = (kit) => [rootStrays].map((rule) => countMetric(kit, rule));

/** Files the merge-base snapshot must be able to read for the metrics above (it reads TypeScript sources and tests by default). */
export const docGateInputs = (file) => file === ROOT_ALLOWLIST;
