// T-128: the blocking jobs of .github/workflows/ci.yml and `security-invariants` have a time limit, and every `Install pnpm` step has
// one, so a job that hangs does not hold a runner for the six-hour default. The limits come from the longest of the last 60 completed
// runs on 2026-10-29 (the table below); a limit below 1.8 times that would kill a normal run on a busy day, one far above it is no limit.
import assert from "node:assert/strict";
import test from "node:test";
import { jobBlock, workflow } from "./fixtures/ci-workflow.js";

/** Job -> its limit in minutes and the longest completed run of the sample in seconds. */
const JOBS: Record<string, { limit: number; longest: number }> = {
  gates: { limit: 15, longest: 360 },
  "health-gate-rules": { limit: 12, longest: 237 },
  "architecture-boundaries": { limit: 15, longest: 299 },
  "action-contracts": { limit: 12, longest: 265 },
  "security-invariants": { limit: 40, longest: 1304 },
};
/** The `Install pnpm` step took 2 seconds at the longest of the sample. */
const INSTALL_PNPM = { limit: 3, longest: 2 };

const jobTimeout = (name: string) => /^    timeout-minutes: (\d+)$/m.exec(jobBlock(name))?.[1];
const installPnpmSteps = (text: string) => text.split("\n      - ").filter((step) => step.startsWith("name: Install pnpm\n"));

test("RAC-1905 ci.yml: the blocking jobs that build or test and security-invariants stop at a limit that is at least 1.8 times their longest run and at most five times it", () => {
  for (const [name, { limit, longest }] of Object.entries(JOBS)) {
    assert.equal(jobTimeout(name), String(limit), `${name} has timeout-minutes: ${limit} at the job level`);
    assert.ok(limit * 60 >= 1.8 * longest, `${name}: ${limit} min leaves room over the longest run of ${longest} s`);
    assert.ok(limit * 60 <= 5 * longest, `${name}: ${limit} min is a limit, not the six-hour default in disguise`);
  }
  // The jobs that were limited before are as they were.
  assert.equal(jobTimeout("queue-check"), "5");
  assert.equal(jobTimeout("test-selection"), "5");
  assert.equal(jobTimeout("product-subset"), "35");
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
      assert.ok(INSTALL_PNPM.limit * 60 >= 30 * INSTALL_PNPM.longest, "far above the 2 s it takes");
    }
  }
  assert.equal(seen, 6, "the six jobs that install pnpm besides the Linux probe: the four blocking ones, security-invariants and product-subset");
  for (const name of [...Object.keys(JOBS), "product-subset"]) assert.equal(installPnpmSteps(jobBlock(name)).length, 1, `${name} installs pnpm once`);
});
