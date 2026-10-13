// Health gate: the CI product subset's two files keep their rules (specs/repository-anti-corruption §4.7, W2-16, decision #14).
//
//   tests/ci-product-subset.txt   the test files the CI job `product-subset` runs; 3 to 5 of them are browser smokes
//   tests/quarantine.json         the flaky ones among them, each with an owner and an end date
//
// An invariant of the working tree, like the status line of a spec: no baseline, no comparison with the merge-base, any hit fails.
// Plugged into the `absolute` problems of scripts/check-health-gates.mjs. The rules themselves are in scripts/ci-product-subset/
// plan.mjs, which the runner reads too, so the gate and the job cannot disagree about what a valid list is:
//
//   1. Every line is a path like tests/<name>.test.ts that exists, once.
//   2. No listed file is a live file; no non-browser file is marked darwin (the subset runs on Linux, without live opt-ins).
//   3. Between 3 and 5 listed files are browser files (smokes), and tests/i18n.test.ts is in the list.
//   4. Every quarantine entry names a listed file once, an owner who is an account in .github/CODEOWNERS, real dates, an end date at
//      most 30 days after `since`, and a reason that says something; at most 10 entries; at least 3 smokes still count.
//
// What it does not read: whether a quarantine has run out. That depends on today's date, so it is not a rule of the tree: the runner
// counts an expired file again, and the job goes red if it still fails. And it does not compare the list with the merge-base, so
// taking a file out of the list is a reviewed edit of a visible file, not something this gate refuses.
// A repository with neither file (the scratch repositories of the other gates' tests) is not under this gate.
//
// Every rule is a `problems.push` in plan.mjs; tests/ci-product-subset-plan.test.ts has a case for each. Pure Node built-ins, so the gate
// runs before any dependency is installed.
import { readPlan } from "../ci-product-subset/plan.mjs";

/** Problems of the product subset's files under `root`, every one a failure. */
export const productSubsetProblems = (root) => readPlan(root).problems.map((problem) => `product subset: ${problem}`);
