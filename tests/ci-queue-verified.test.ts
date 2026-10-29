// T-129: a push to main that the merge queue already verified on the same commit, against the same base, does not run the blocking
// jobs again (scripts/ci-queue-verified.mjs, the `queue-check` job of .github/workflows/ci.yml), and a merge queue run whose entry was
// rebuilt or dropped stops at once instead of building and testing for nothing. The lookup is checked against a stand-in for the
// GitHub API, every way to "not verified" included; then the workflow: its conditions evaluated for every event and every way
// `queue-check` can end, `verify`'s script and the queue entry check run in bash as the runner runs them, and that nothing changes on
// a pull request, in the merge queue or at night.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { BASE_STEP, queueVerified, REQUIRED_JOB, WORKFLOW_PATH } from "../scripts/ci-queue-verified.mjs";
import { blockingJobs, evaluateExpression, jobBlock, QUEUE_CHECK_JOB, stepScript, workflow } from "./fixtures/ci-workflow.js";

const directories: string[] = [];
after(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); });

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
const BEFORE = "c".repeat(40);
const REPO = "molis-ai/molis-work";
type Run = { id: number; event: string; head_sha: string; path: string; conclusion: string; html_url: string };
const run = (over: Partial<Run> = {}): Run => ({ id: 7, event: "merge_group", head_sha: SHA, path: WORKFLOW_PATH, conclusion: "success", html_url: "https://github.com/molis-ai/molis-work/actions/runs/7", ...over });
type Reply = { status?: number; body: unknown } | Error;
/** A stand-in for the API: the runs list, then the jobs of each run by id. Records every URL asked for. */
function api(runs: Reply, jobs: Record<number, Reply> = {}) {
  const asked: string[] = [];
  const answer = (reply: Reply | undefined) => {
    if (reply instanceof Error) return Promise.reject(reply);
    const { status = 200, body } = reply ?? { status: 404, body: {} };
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => (typeof body === "string" ? Promise.reject(new SyntaxError(body)) : Promise.resolve(body)) });
  };
  const fetch = (url: string) => {
    asked.push(url);
    const id = /\/actions\/runs\/(\d+)\/jobs/.exec(url)?.[1];
    return answer(id ? jobs[Number(id)] : runs);
  };
  return { fetch, asked };
}
const baseStep = (base: string, conclusion = "success") => ({ name: `${BASE_STEP} ${base}`, conclusion });
const verifyJob = (conclusion: string, steps: unknown[] = [baseStep(BEFORE)]) => ({ body: { jobs: [{ name: "Gates", conclusion: "success" }, { name: REQUIRED_JOB, conclusion, steps }] } });
const ask = (stand: ReturnType<typeof api>, sha = SHA, before = BEFORE) => queueVerified({ repo: REPO, sha, before, token: "t", api: "https://api.example", fetch: stand.fetch });

test("RAC-1766 verified only for a successful merge_group run of ci.yml on this very commit, against this push's base, whose Verify passed", async () => {
  const yes = api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success") });
  const verified = await ask(yes);
  assert.deepEqual(verified, { verified: true, runUrl: run().html_url, reason: `merge queue run 7 passed ${REQUIRED_JOB} on ${SHA}, compared with ${BEFORE}` });
  assert.equal(yes.asked[0], `https://api.example/repos/${REPO}/actions/workflows/ci.yml/runs?event=merge_group&head_sha=${SHA}&status=success&per_page=20`, "asks for this workflow's successful queue runs of this commit");

  const no = async (what: string, stand: ReturnType<typeof api>, pattern: RegExp, sha = SHA, before = BEFORE) => {
    const result = await ask(stand, sha, before);
    assert.equal(result.verified, false, what);
    assert.equal(result.runUrl, "", what);
    assert.match(result.reason, pattern, what);
  };
  await no("no run", api({ body: { workflow_runs: [] } }), /no successful merge queue run/);
  // The API filters by event, commit and status; the answer is checked again here, so a filter the API ignored cannot let one through.
  await no("a push run", api({ body: { workflow_runs: [run({ event: "push" })] } }, { 7: verifyJob("success") }), /no successful merge queue run/);
  await no("another commit", api({ body: { workflow_runs: [run({ head_sha: OTHER })] } }, { 7: verifyJob("success") }), /no successful merge queue run/);
  await no("another workflow", api({ body: { workflow_runs: [run({ path: ".github/workflows/full-suite.yml" })] } }, { 7: verifyJob("success") }), /no successful merge queue run/);
  for (const conclusion of ["failure", "cancelled", "skipped", "timed_out"]) {
    await no(`a run that ended ${conclusion}`, api({ body: { workflow_runs: [run({ conclusion })] } }, { 7: verifyJob("success") }), /no successful merge queue run/);
    await no(`Verify ${conclusion}`, api({ body: { workflow_runs: [run()] } }, { 7: verifyJob(conclusion) }), /run 7 has no successful Verify job/);
    await no(`the base step ${conclusion}`, api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success", [baseStep(BEFORE, conclusion)]) }), new RegExp(`compared with ${BEFORE} \\(${conclusion}\\), not ${BEFORE}`));
  }
  await no("no Verify job at all", api({ body: { workflow_runs: [run()] } }, { 7: { body: { jobs: [{ name: "Gates", conclusion: "success" }] } } }), /no successful Verify job/);
  // The same commit against another base: a group built on top of another one compared with that one, not with this push's before.
  await no("the same head, another base", api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success", [baseStep(OTHER)]) }), new RegExp(`compared with ${OTHER} \\(success\\), not ${BEFORE}`));
  await no("no base recorded (a run from before T-129)", api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success", [{ name: "Required package gate passed", conclusion: "success" }]) }), /no recorded base/);
  await no("no steps listed", api({ body: { workflow_runs: [run()] } }, { 7: { body: { jobs: [{ name: REQUIRED_JOB, conclusion: "success" }] } } }), /no recorded base/);
  await no("a base that is not a full SHA", api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success", [{ name: `${BASE_STEP} none`, conclusion: "success" }]) }), /no recorded base/);
  for (const before of ["", "0".repeat(40), "abc123"]) {
    await no(`the push's before is ${JSON.stringify(before)}`, api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success", [baseStep(before)]) }), /no tip before the push/, SHA, before);
  }
  await no("the runs list answers 403", api({ status: 403, body: {} }), /could not be read: .* answered 403/);
  await no("the jobs list answers 500", api({ body: { workflow_runs: [run()] } }, { 7: { status: 500, body: {} } }), /answered 500/);
  await no("the network fails", api(new Error("socket hang up")), /socket hang up/);
  await no("the body is not JSON", api({ body: "<html>" }), /could not be read/);
  await no("the body has no list", api({ body: { message: "Not Found" } }), /no workflow_runs/);
  await no("no commit", api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success") }), /no repository or commit/, "");
  await no("a short commit", api({ body: { workflow_runs: [run()] } }, { 7: verifyJob("success") }), /no repository or commit/, "abc123");
  // A second candidate is looked at when the first one's Verify did not pass or compared with another base.
  for (const first of [verifyJob("failure"), verifyJob("success", [baseStep(OTHER)])]) {
    const second = api({ body: { workflow_runs: [run(), run({ id: 8, html_url: "https://example/8" })] } }, { 7: first, 8: verifyJob("success") });
    assert.equal((await ask(second)).runUrl, "https://example/8");
  }
});

test("RAC-1766 the command: answers false without the environment, writes both outputs, refuses arguments", () => {
  const script = fileURLToPath(new URL("../scripts/ci-queue-verified.mjs", import.meta.url));
  const environment = { ...process.env, GITHUB_REPOSITORY: "", GITHUB_SHA: "", PUSH_BEFORE: "", GITHUB_OUTPUT: "" };
  const plain = spawnSync(process.execPath, [script], { encoding: "utf8", env: environment });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /not verified: no repository or commit/);
  const usage = spawnSync(process.execPath, [script, "--force"], { encoding: "utf8", env: environment });
  assert.equal(usage.status, 2);
});

// ---- the workflow ------------------------------------------------------------------------------------------------------------------
const BLOCKING = ["gates", "health-gate-rules", "architecture-boundaries", "action-contracts", "secret-scan", "native-checks", "shell-checks"];
const RESULTS = ["GATES", "HEALTH_GATE_RULES", "PACKAGE_BOUNDARIES", "ACTION_CONTRACTS", "SECRET_SCAN", "NATIVE_CHECKS", "SHELL_CHECKS"];
const steps = (job: string) => jobBlock(job).split("\n      - ").slice(1);
const scratch = () => { const directory = mkdtempSync(path.join(tmpdir(), "molis-queue-check-")); directories.push(directory); return directory; };
/** Runs a step's script as the runner does (`bash --noprofile --norc -eo pipefail`), with `env` added and `bin` first on PATH. */
function runStep(script: string, env: Record<string, string>, bin?: string) {
  const directory = scratch();
  const file = path.join(directory, "step.sh");
  writeFileSync(file, script);
  const PATH = bin ? `${bin}${path.delimiter}${process.env.PATH}` : process.env.PATH;
  return spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", file], { encoding: "utf8", env: { ...process.env, PATH, ...env } });
}

// Every way a run can reach the blocking jobs: the event, how `queue-check` ended, and what it wrote (a failed job keeps what its
// steps wrote before failing, so a failure with `true` left behind is a case of its own). `skip` is the one combination that may.
type Case = { event: string; result: string; verified: string; skip: boolean };
const CASES: Case[] = [
  { event: "push", result: "success", verified: "true", skip: true },
  ...["failure", "cancelled", "skipped"].map((result) => ({ event: "push", result, verified: "true", skip: false })),
  { event: "push", result: "success", verified: "false", skip: false },
  { event: "push", result: "success", verified: "", skip: false },
  { event: "push", result: "skipped", verified: "", skip: false },
  ...["pull_request", "merge_group", "schedule", "workflow_dispatch"].flatMap((event) => [
    { event, result: "skipped", verified: "", skip: false },
    { event, result: "success", verified: "true", skip: false },
  ]),
];
const contexts = (item: Case) => ({ "github.event_name": item.event, "needs.queue-check.result": item.result, "needs.queue-check.outputs.verified": item.verified });

test("RAC-1767 ci.yml: queue-check runs on a push only, may read runs and nothing else, and a blocking job is skipped only on its success and true", () => {
  const check = jobBlock(QUEUE_CHECK_JOB);
  assert.match(check, /^    if: \$\{\{ github\.event_name == 'push' \}\}$/m, "only on a push: a pull request, the merge queue, the nightly and manual runs never skip anything");
  assert.match(check, /^    permissions:\n      actions: read\n      contents: read\n    outputs:/m, "it reads runs, it writes nothing");
  assert.match(check, /run: node scripts\/ci-queue-verified\.mjs$/m);
  assert.match(check, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(check, /PUSH_BEFORE: \$\{\{ github\.event\.before \}\}/, "the base the push's own gates would compare with");
  assert.doesNotMatch(check, /pnpm install/, "no dependencies");
  assert.deepEqual(blockingJobs(), BLOCKING, "the blocking jobs are the seven of today");
  for (const name of BLOCKING) {
    const job = jobBlock(name);
    assert.match(job, /^    needs: \[queue-check\]$/m, name);
    const condition = /^    if: \$\{\{ (.*) \}\}$/m.exec(job)?.[1];
    assert.ok(condition, name);
    assert.ok(condition.startsWith("!cancelled() && "), `${name}: a cancelled run stops as before`);
    for (const item of CASES) assert.equal(Boolean(evaluateExpression(condition, contexts(item))), !item.skip, `${name} on ${item.event}, queue-check ${item.result}, verified ${JSON.stringify(item.verified)}`);
  }
  // The jobs that do not block are not touched by it (decision #14: they run on every push).
  for (const name of ["security-invariants", "product-subset"]) assert.doesNotMatch(jobBlock(name), /queue-check/, name);
});

test("RAC-1768 ci.yml: in the merge queue every blocking job first checks that its entry still exists, and only a missing branch stops it", () => {
  // A stand-in for git that answers ls-remote with the exit code it is given.
  const bin = scratch();
  writeFileSync(path.join(bin, "git"), '#!/bin/sh\necho "git $*" >> "$GIT_CALLS"\nexit "$GIT_STATUS"\n');
  chmodSync(path.join(bin, "git"), 0o755);
  for (const name of BLOCKING) {
    const list = steps(name);
    const position = list.findIndex((step) => step.startsWith("name: Queue entry still exists"));
    assert.equal(position, 1, `${name}: the step comes right after the checkout, before anything is installed or built`);
    assert.match(list[0]!, /^uses: actions\/checkout@/, name);
    const step = list[position]!;
    const condition = /\n        if: \$\{\{ (.*) \}\}\n/.exec(step)?.[1];
    assert.ok(condition, `${name}: the step has its own condition`);
    for (const event of ["merge_group", "pull_request", "push", "schedule", "workflow_dispatch"]) {
      assert.equal(Boolean(evaluateExpression(condition, { "github.event_name": event })), event === "merge_group", `${name}: on ${event}`);
    }
    // The script itself, under the runner's -eo pipefail: 0 (the branch is there) goes on, 2 (connected, no such branch) stops the
    // job, any other failure (128: network, authentication) goes on, so a check that could not ask never stops a live entry.
    for (const [status, code] of [[0, 0], [2, 1], [128, 0], [1, 0]] as const) {
      const calls = path.join(scratch(), "calls");
      writeFileSync(calls, "");
      const result = runStep(stepScript(step), { GIT_STATUS: String(status), GIT_CALLS: calls, GITHUB_REF: "refs/heads/gh-readonly-queue/main/pr-1-abc" }, bin);
      assert.equal(result.status, code, `${name}: git exits ${status}: ${result.stdout}${result.stderr}`);
      assert.match(readFileSync(calls, "utf8"), /^git ls-remote --exit-code origin refs\/heads\/gh-readonly-queue\/main\/pr-1-abc$/m, `${name}: asks for this entry's branch`);
      if (status === 2) assert.match(result.stdout, /::error::refs\/heads\/gh-readonly-queue\/main\/pr-1-abc no longer exists/, name);
    }
  }
});

test("RAC-1769 ci.yml: Verify records the queue's base, waits for the same seven jobs and judges them as before, except where they were skipped", () => {
  const verify = jobBlock("verify");
  assert.match(verify, /^    name: Verify$/m, "the required check keeps its name");
  assert.match(verify, /^    needs: \[gates, health-gate-rules, architecture-boundaries, action-contracts, secret-scan, native-checks, shell-checks, queue-check\]$/m);
  assert.match(verify, /^    if: \$\{\{ always\(\) \}\}$/m);
  // The base step's name, as GitHub shows it, is what queue-check looks for on the push that follows.
  const [baseStepText, judge] = steps("verify");
  const nameExpression = /^name: Merge queue base \$\{\{ (.*) \}\}$/m.exec(baseStepText!)?.[1];
  assert.ok(nameExpression, "the first step of verify names the base");
  assert.doesNotMatch(baseStepText!, /\n        if:/, "it runs on every event, so the queue run always has it");
  const shown = (base: string) => `Merge queue base ${String(evaluateExpression(nameExpression, { "github.event.merge_group.base_sha": base }))}`;
  assert.equal(shown(BEFORE), `${BASE_STEP} ${BEFORE}`);
  assert.equal(shown(""), `${BASE_STEP} none`, "outside the merge queue it names no base, which queue-check never takes for one");

  const script = stepScript(judge!);
  const judged = (event: string, result: string, verified: string, results: string) =>
    runStep(script, { GITHUB_EVENT_NAME: event, QUEUE_CHECK_RESULT: result, QUEUE_VERIFIED: verified, QUEUE_RUN_URL: "https://example/7", ...Object.fromEntries(RESULTS.map((name) => [`${name}_RESULT`, results])) });
  for (const item of CASES) {
    // When the blocking jobs were skipped, Verify must pass without them; otherwise it judges them, every one a success.
    const skipped = judged(item.event, item.result, item.verified, "skipped");
    assert.equal(skipped.status === 0, item.skip, `${item.event}, ${item.result}, ${JSON.stringify(item.verified)}, the seven skipped: ${skipped.stdout}${skipped.stderr}`);
    if (item.skip) { assert.match(skipped.stdout, /passed Verify in the merge queue \(https:\/\/example\/7\)/); continue; }
    assert.equal(judged(item.event, item.result, item.verified, "success").status, 0, `${item.event}, ${item.result}: seven successes pass`);
    for (const name of RESULTS) {
      const one = runStep(script, { GITHUB_EVENT_NAME: item.event, QUEUE_CHECK_RESULT: item.result, QUEUE_VERIFIED: item.verified, ...Object.fromEntries(RESULTS.map((other) => [`${other}_RESULT`, other === name ? "failure" : "success"])) });
      assert.notEqual(one.status, 0, `${item.event}, ${item.result}: ${name} failing fails Verify`);
    }
  }
  // A failed queue-check is not a check of its own: with the seven green, Verify passes.
  assert.equal(judged("push", "failure", "", "success").status, 0);
});

test("RAC-1770 ci.yml: queue-check's word reaches nothing but the blocking jobs' conditions and Verify, and both read it the same way", () => {
  const readers = workflow.split("\n").filter((line) => /needs\.queue-check\./.test(line));
  assert.ok(readers.length > 0);
  assert.deepEqual([...new Set(readers.map((line) => /needs\.queue-check\.([a-z_.]+)/.exec(line)![1]))].sort(), ["outputs.run_url", "outputs.verified", "result"]);
  const outputs = [...jobBlock(QUEUE_CHECK_JOB).matchAll(/^      ([a-z_]+): \$\{\{ steps\.check\.outputs\.([a-z_]+) \}\}$/gm)].map((match) => [match[1], match[2]]);
  assert.deepEqual(outputs, [["verified", "verified"], ["run_url", "run_url"]]);
  // The jobs that read it are exactly the seven and verify.
  const jobsReading = [...workflow.slice(workflow.indexOf("\njobs:\n")).matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]!).filter((name) => /needs\.queue-check\./.test(jobBlock(name)));
  assert.deepEqual(jobsReading.sort(), [...BLOCKING, "verify"].sort());
  // Verify's three conditions are the jobs' three: the push, success, true (RAC-1767 and RAC-1769 evaluate both over the same cases).
  const verify = jobBlock("verify");
  assert.match(verify, /QUEUE_CHECK_RESULT: \$\{\{ needs\.queue-check\.result \}\}/);
  assert.match(verify, /if \[ "\$GITHUB_EVENT_NAME" = "push" \] && \[ "\$QUEUE_CHECK_RESULT" = "success" \] && \[ "\$QUEUE_VERIFIED" = "true" \]; then/);
});
