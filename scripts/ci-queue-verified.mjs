#!/usr/bin/env node
// Did the merge queue already verify this commit? (T-129) A pull request reaches main through the merge queue: GitHub builds it on
// top of main in a merge group, runs this workflow on that commit (`merge_group`), and when `Verify` passes moves main to that very
// commit. The push to main that follows is the same commit, the same tree and the same ci.yml, so the blocking jobs would only
// repeat what the queue ran. The same commit is not enough for the checks that compare with a base (the health gates and the page
// asset, plugin style and Studio replay gates against scripts/ci-health-base.mjs's commit; the secret scan over the commits since
// it): the queue compared with the merge group's base (`merge_group.base_sha`), the push compares with the tip before the push
// (`before`), and a group built on top of another one need not have that tip as its base. So the queue run's `Verify` job records its
// base in the name of a step (BASE_STEP), which the API returns, and the run counts only when that base is this push's `before`.
//
// This asks the GitHub API whether such a run exists: a `merge_group` run of .github/workflows/ci.yml with this head SHA, concluded
// `success`, whose `Verify` job concluded `success` and has the step `Merge queue base <before>`, concluded `success`. Anything else
// (an administrator's direct push, a merge that bypassed the queue, a queue run that failed or was cancelled, another base or none
// recorded, an API that cannot be read) is not verified, and the blocking jobs run as they always did: when in doubt it runs more,
// never less.
//
//   node scripts/ci-queue-verified.mjs     reads GITHUB_REPOSITORY, GITHUB_SHA, PUSH_BEFORE, GITHUB_TOKEN (and GITHUB_API_URL);
//                                          prints what it found; in CI writes `verified=true|false` and `run_url=` to $GITHUB_OUTPUT
// Exit: 0 whenever it answered (`false` from a failure included), 2 on a usage error.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOW_PATH = ".github/workflows/ci.yml";
export const REQUIRED_JOB = "Verify";
/** The name of the step of `Verify` that records the merge queue's base: `Merge queue base <sha>` (.github/workflows/ci.yml). */
export const BASE_STEP = "Merge queue base";

/**
 * `{ verified, runUrl, reason }` for `sha` pushed on top of `before` in `repo`. `fetch` is the global one in CI and a stand-in in
 * tests. Never throws: a failure is `verified: false` with the reason.
 */
export async function queueVerified({ repo, sha, before, token, api = "https://api.github.com", fetch: get = globalThis.fetch }) {
  const no = (reason) => ({ verified: false, runUrl: "", reason });
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !/^[0-9a-f]{40}$/.test(sha ?? "")) return no(`no repository or commit to look up (${repo}, ${sha})`);
  // A push that creates the branch has no tip before it (all zeros): nothing was compared with it in the queue.
  if (!/^[0-9a-f]{40}$/.test(before ?? "") || /^0+$/.test(before)) return no(`no tip before the push to compare bases with (${before})`);
  const read = async (url) => {
    const response = await get(url, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" } });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response.json();
  };
  try {
    const runs = await read(`${api}/repos/${repo}/actions/workflows/ci.yml/runs?event=merge_group&head_sha=${sha}&status=success&per_page=20`);
    if (!Array.isArray(runs?.workflow_runs)) return no("the list of runs has no workflow_runs");
    const candidates = runs.workflow_runs.filter((run) => run?.event === "merge_group" && run?.head_sha === sha && run?.path === WORKFLOW_PATH && run?.conclusion === "success");
    const misses = [];
    for (const run of candidates) {
      const jobs = await read(`${api}/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`);
      const verify = (jobs?.jobs ?? []).filter((job) => job?.name === REQUIRED_JOB);
      if (!verify.length || !verify.every((job) => job.conclusion === "success")) { misses.push(`run ${run.id} has no successful ${REQUIRED_JOB} job`); continue; }
      const bases = verify.flatMap((job) => (Array.isArray(job.steps) ? job.steps : []))
        .map((step) => ({ base: new RegExp(`^${BASE_STEP} ([0-9a-f]{40})$`).exec(String(step?.name ?? ""))?.[1], conclusion: step?.conclusion }))
        .filter((step) => step.base);
      if (!bases.some((step) => step.base === before && step.conclusion === "success")) {
        misses.push(`run ${run.id} compared with ${bases.map((step) => `${step.base} (${step.conclusion})`).join(", ") || "no recorded base"}, not ${before}`);
        continue;
      }
      return { verified: true, runUrl: String(run.html_url ?? ""), reason: `merge queue run ${run.id} passed ${REQUIRED_JOB} on ${sha}, compared with ${before}` };
    }
    return no(candidates.length ? misses.join("; ") : `no successful merge queue run of ${WORKFLOW_PATH} has head ${sha}`);
  } catch (error) {
    return no(`the GitHub API could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.length > 2) {
    console.error("usage: ci-queue-verified.mjs (reads GITHUB_REPOSITORY, GITHUB_SHA, PUSH_BEFORE, GITHUB_TOKEN from the environment)");
    process.exit(2);
  }
  const result = await queueVerified({ repo: process.env.GITHUB_REPOSITORY, sha: process.env.GITHUB_SHA, before: process.env.PUSH_BEFORE, token: process.env.GITHUB_TOKEN ?? "", api: process.env.GITHUB_API_URL || undefined });
  console.log(`ci-queue-verified: ${result.verified ? "verified" : "not verified"}: ${result.reason}${result.runUrl ? ` (${result.runUrl})` : ""}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `verified=${result.verified}\nrun_url=${result.runUrl}\n`);
}
