// T-128: the blocking jobs of .github/workflows/ci.yml and `security-invariants` have a time limit, and every `Install pnpm` step has
// one, so a job that hangs does not hold a runner for the six-hour default. That is all a limit is for, so it is not tight: a blocking
// job gets at least 30 minutes (a slow runner took `action-contracts` 15.4 minutes in the merge queue and it still passed), and no job
// gets less than 1.8 times its longest successful run, measured on the completed runs from 2026-10-28 13:06Z to 2026-10-29 (the table).
import assert from "node:assert/strict";
import test from "node:test";
import { blockingJobs, jobBlock, workflow } from "./fixtures/ci-workflow.js";

/** The least a blocking job may be given, in minutes. */
const BLOCKING_FLOOR = 30;
/** No limit is above this, in minutes: it must still be a limit and not the six-hour default in disguise. */
const CEILING = 60;
/** Job -> its limit in minutes, the longest successful run of the sample in seconds, and whether it blocks the merge. */
const JOBS: Record<string, { limit: number; longest: number; blocking: boolean }> = {
  gates: { limit: 30, longest: 409, blocking: true },
  "health-gate-rules": { limit: 30, longest: 312, blocking: true },
  "architecture-boundaries": { limit: 30, longest: 350, blocking: true },
  "action-contracts": { limit: 30, longest: 923, blocking: true },
  "security-invariants": { limit: 40, longest: 1315, blocking: false },
};
/** The `Install pnpm` step took 66 seconds at the longest of 2547 in the sample. */
const INSTALL_PNPM = { limit: 3, longest: 66 };

const jobTimeout = (name: string) => /^    timeout-minutes: (\d+)$/m.exec(jobBlock(name))?.[1];
const installPnpmSteps = (text: string) => text.split("\n      - ").filter((step) => step.startsWith("name: Install pnpm\n"));

test("RAC-1905 ci.yml: the blocking jobs that build or test and security-invariants stop at a limit of at least 1.8 times their longest run, a blocking job at 30 minutes or more, and none above an hour", () => {
  for (const [name, { limit, longest, blocking }] of Object.entries(JOBS)) {
    assert.equal(jobTimeout(name), String(limit), `${name} has timeout-minutes: ${limit} at the job level`);
    assert.ok(limit * 60 >= 1.8 * longest, `${name}: ${limit} min leaves room over the longest run of ${longest} s`);
    if (blocking) assert.ok(limit >= BLOCKING_FLOOR, `${name}: a blocking job gets ${BLOCKING_FLOOR} minutes or more, a slow runner must not cost a merge group`);
    assert.ok(limit <= CEILING, `${name}: ${limit} min is a limit, not the six-hour default in disguise`);
  }
  // The jobs that were limited before are as they were.
  assert.equal(jobTimeout("queue-check"), "5");
  assert.equal(jobTimeout("test-selection"), "5");
  assert.equal(jobTimeout("product-subset"), "35");
});

test("RAC-2411 ci.yml: a blocking job with a job-level limit gets 30 minutes or more, and the table's blocking jobs are the verify needs it records", () => {
  const blocking = blockingJobs();
  // `queue-check` is among verify's needs only to let a push already verified by the merge queue pass (T-129): it decides no merge,
  // and its 5-minute limit is the intentional exception.
  assert.ok(!blocking.includes("queue-check"), "queue-check is not a blocking job");
  assert.equal(jobTimeout("queue-check"), "5", "queue-check keeps its intentional 5-minute limit");
  // `secret-scan`, `native-checks` and `shell-checks` are verify's needs without a job-level limit, so they fall back to the six-hour
  // default if they hang; giving them a limit is a workflow change of its own, and a job without one is skipped here.
  const limited = blocking.filter((name) => jobTimeout(name) !== undefined);
  for (const name of limited) assert.ok(Number(jobTimeout(name)) >= BLOCKING_FLOOR,
    `${name}: a blocking job with a limit gets ${BLOCKING_FLOOR} minutes or more, so a slow runner does not fail a merge group`);
  // The table marks what blocks a merge and `verify` is what decides it: neither may drift from the other, or a new blocking job would
  // go unchecked, and a job the table calls blocking but verify does not need would hold a merge group for nothing.
  const tableBlocking = Object.entries(JOBS).filter(([, job]) => job.blocking).map(([name]) => name).sort();
  assert.deepEqual(tableBlocking, blocking.filter((name) => Object.hasOwn(JOBS, name)).sort(),
    "the table's blocking jobs are exactly verify's needs that the table records");
  // A blocking job that gains a limit must enter the table, or its number is never checked.
  for (const name of limited) assert.ok(Object.hasOwn(JOBS, name), `${name}: a blocking job with a limit is in the JOBS table, so its limit is checked`);
});

test("RAC-1906 ci.yml: every Install pnpm step has a limit of a few minutes, except the Linux probe's, which another change is editing", () => {
  const names = [...workflow.matchAll(/^  ([a-z0-9-]+):\s*$/gm)].map((match) => match[1]!);
  let seen = 0;
  for (const name of names.slice(names.indexOf("queue-check"))) {
    const steps = installPnpmSteps(jobBlock(name));
    if (name === "linux-probe") continue;
    for (const step of steps) {
      seen++;
      const limit = /^        timeout-minutes: (\d+)$/m.exec(step)?.[1];
      assert.equal(limit, String(INSTALL_PNPM.limit), `${name}: the Install pnpm step has timeout-minutes: ${INSTALL_PNPM.limit}`);
      assert.ok(INSTALL_PNPM.limit * 60 >= 1.8 * INSTALL_PNPM.longest, "above 1.8 times the longest it took");
    }
  }
  assert.equal(seen, 6, "the six jobs that install pnpm besides the Linux probe: the four blocking ones, security-invariants and product-subset");
  for (const name of [...Object.keys(JOBS), "product-subset"]) assert.equal(installPnpmSteps(jobBlock(name)).length, 1, `${name} installs pnpm once`);
});
