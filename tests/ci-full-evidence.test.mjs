import assert from "node:assert/strict";
import test from "node:test";
import { inspectFullEvidence } from "../scripts/ci-full-evidence.mjs";
import { checkFullJobs, fullDecision, fullPlan } from "../scripts/ci-full-evidence/plan.mjs";

const repository = { full_name: "molis-ai/molis-work" };
const head = "1".repeat(40), base = "2".repeat(40), merge = "3".repeat(40);
const workflow = ".github/workflows/full-suite.yml";
const pr = { number: 7, head: { sha: head, ref: "change", repo: repository }, base: { sha: base, ref: "main", repo: repository } };
const run = { id: 31, run_attempt: 1, path: workflow, head_sha: head, event: "pull_request",
  head_branch: "change", repository, head_repository: repository, pull_requests: [], status: "completed", conclusion: "success" };
const yaml = "inputs.only_files != '' && '[1]' || '[1, 2]'\n  result:\n    name: Full suite\n    needs: [build, shard, sync-worker]\n";
const at = seconds => new Date(seconds * 1000).toISOString();
const job = (id, name, start, step) => ({ id, name, status: "completed", conclusion: "success", runner_id: id,
  run_id: 31, run_attempt: 1, started_at: at(start), completed_at: at(start + 4), steps: [{ name: step, conclusion: "success" }] });
const jobs = [job(1, "Build workspace", 0, "Build"), job(2, "Full suite (1/2)", 5, "Run this shard"),
  job(3, "Full suite (2/2)", 5, "Run this shard"), job(4, "Sync Worker integration", 5, "Run Worker against ephemeral D1 and R2"),
  job(5, "Full suite", 10, "Every shard passed")];

function inspect({ candidate = run, current = pr, logSha = merge, documents = [], override = () => undefined, required } = {}) {
  const read = route => {
    const alternate = override(route);
    if (alternate !== undefined) return alternate;
    if (route === "pulls/7") return current;
    if (route.startsWith("actions/workflows/")) return [{ total_count: 1, workflow_runs: [candidate] }];
    if (route.includes("/attempts/1/jobs?")) return [{ total_count: jobs.length, jobs }];
    if (route === "actions/jobs/1/logs") return `checkout refs/remotes/pull/7/merge\ngit log -1 --format=%H\n2026-01-01Z ${logSha}\n`;
    if (route === `git/commits/${merge}`) return { parents: [{ sha: base }, { sha: head }] };
    if (route.startsWith("compare/")) return { merge_base_commit: { sha: base } };
    if (route.startsWith(`contents/${workflow}?`)) return { sha: base, encoding: "base64", content: Buffer.from(yaml).toString("base64") };
    if (route.startsWith("contents/scripts?")) return ["run-tests.mjs", "run-tests", "ci-full-retry.mjs"].map(name => ({ name, sha: base }));
    if (route.startsWith("issues/7/comments?")) return [documents];
    throw new Error(`Unexpected read ${route}`);
  };
  return inspectFullEvidence(7, { read, required });
}

test("A PR Full must belong to this merge checkout and run every shard and the Worker", () => {
  assert.equal(inspect().state, "passed");
  const routeJob = list => route => route.includes("/attempts/1/jobs?") ? [{ jobs: list, total_count: list.length }] : undefined;
  for (const list of [jobs.slice(1), jobs.filter(j => j.id !== 4), jobs.map(j => j.id === 3 ? {...j, steps: []} : j),
    jobs.map(j => j.id === 2 ? {...j, started_at: at(0)} : j), [...jobs, jobs[2]]]) {
    assert.equal(inspect({override: routeJob(list)}).state, "review");
  }
  assert.equal(inspect({ override: route => route.startsWith("git/commits/") ? {parents: [{sha: base}, {sha: base}]} : undefined }).state, "review");
  assert.equal(inspect({ override: route => route === "actions/jobs/1/logs" ? `git log -1 --format=%H\nZ ${merge}` : undefined }).state, "review");
  assert.equal(inspect({ override: route => route === `contents/scripts?ref=${head}` ? [] : undefined }).state, "review");
});

test("The merge checkout can use a newer protected main tip than the base recorded on the PR", () => {
  const newer = "4".repeat(40);
  const inspectBase = ancestor => inspect({ override: route => {
    if (route === `git/commits/${merge}`) return { parents: [{sha: newer}, {sha: head}] };
    if (route === `compare/${newer}...main?per_page=1`) return { merge_base_commit: { sha: ancestor } };
  }});
  assert.equal(inspectBase(newer).state, "passed");
  assert.equal(inspectBase(base).state, "review");
});

test("Existing integration on the exact head is usable once linked. A PR label and an older head supply no evidence", () => {
  const candidate = {...run, event: "push", head_branch: "integration/batch"};
  const current = {...pr, labels: [{name: "full-suite"}]};
  const ref = { body: "Full https://github.com/molis-ai/molis-work/actions/runs/31/job/901" };
  assert.equal(inspect({candidate, current, logSha: head, documents: [ref]}).state, "passed");
  assert.equal(inspect({candidate, current, logSha: head}).state, "needs-link");
  assert.equal(inspect({candidate, current: {...pr, head: {...pr.head, ref: candidate.head_branch}}, logSha: head}).state, "passed");
  assert.equal(inspect({candidate, current, logSha: merge, documents: [ref]}).state, "review");
  assert.equal(inspect({candidate: {...candidate, head_sha: merge}, current, documents: [ref]}).state, "missing");
  assert.equal(inspect({candidate: {...run, head_repository: {full_name: "other/repo"}}}).state, "missing");
  assert.equal(inspect({candidate: {...run, status: "in_progress", conclusion: null}}).state, "pending");
});

test("Targeted, skipped, cancelled and failed runs retain their distinct meanings", () => {
  const plan = fullPlan(yaml);
  const one = [jobs[0], {...jobs[1], name: "Full suite (1/1)"}, jobs[4]];
  assert.equal(checkFullJobs({...run, event: "workflow_dispatch"}, one, plan).state, "targeted");
  assert.equal(checkFullJobs(run, jobs.map(j => ({...j, conclusion: "skipped"})), plan).state, "irrelevant");
  assert.equal(checkFullJobs({...run, conclusion: "failure"}, jobs, plan).state, "review");
  assert.equal(checkFullJobs({...run, conclusion: "cancelled"}, jobs, plan).state, "incomplete");
  assert.equal(checkFullJobs({...run, run_attempt: 2}, jobs.map(j => ({...j, run_attempt: 2})), plan).state, "review");
  assert.equal(fullDecision([{state: "passed"}, {state: "review"}]), "review");
  assert.equal(fullDecision([{state: "incomplete"}, {state: "passed"}]), "passed");
  assert.equal(fullDecision([{state: "pending"}, {state: "passed"}]), "passed");
  assert.equal(checkFullJobs({...run, status: "in_progress", conclusion: null}, jobs.map(j => j.id === 2 ? {...j, conclusion: "failure"} : j)).state, "review");
  assert.throws(() => fullPlan(yaml.replace("[1, 2]", "[2]")), /matrix/);
});

test("A changed head, a new retry or an incomplete API page cannot publish a positive decision", () => {
  let reads = 0;
  assert.throws(() => inspect({override: route => route === "pulls/7" && ++reads === 2 ? {...pr, head: {...pr.head, sha: merge}} : undefined}), /changed/);
  reads = 0;
  assert.throws(() => inspect({override: route => route.startsWith("actions/workflows/") && ++reads === 2
    ? [{total_count: 1, workflow_runs: [{...run, run_attempt: 2}]}] : undefined}), /changed/);
  assert.throws(() => inspect({override: route => route.startsWith("actions/workflows/") ? [{total_count: 2, workflow_runs: [run]}] : undefined}), /Incomplete/);
  assert.equal(inspect({required: () => false, override: route => { assert.equal(route, "pulls/7"); }}).state, "not-required");
});
