// T-129: a push to main that the merge queue already verified on the same commit, against the same base, does not run the blocking
// jobs again (scripts/ci-queue-verified.mjs, the `queue-check` job of .github/workflows/ci.yml), and a merge queue run whose entry was
// rebuilt or dropped stops at once instead of building and testing for nothing. The lookup is checked against a stand-in for the
// GitHub API, every way to "not verified" included; then the workflow: its conditions evaluated for every event and every way
// `queue-check` can end, `verify`'s script and the queue entry check run in bash (a little stricter than the runner's, see `runStep`),
// and that nothing changes on a pull request, in the merge queue or at night.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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

test("RAC-1900 verified only for a successful merge_group run of ci.yml on this very commit, against this push's base, whose Verify passed", async () => {
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

test("RAC-1900 the command: answers false without the environment, writes both outputs, refuses arguments", () => {
  const script = fileURLToPath(new URL("../scripts/ci-queue-verified.mjs", import.meta.url));
  const environment = { ...process.env, GITHUB_REPOSITORY: "", GITHUB_SHA: "", PUSH_BEFORE: "", GITHUB_OUTPUT: "" };
  const plain = spawnSync(process.execPath, [script], { encoding: "utf8", env: environment });
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /not verified: no repository or commit/);
  const usage = spawnSync(process.execPath, [script, "--force"], { encoding: "utf8", env: environment });
  assert.equal(usage.status, 2);

  // The two outputs `queue-check` hands on (`steps.check.outputs.verified` and `.run_url`, which the job's `outputs` read) are two lines
  // added to the file `$GITHUB_OUTPUT` names, after whatever other steps wrote there. Not verified: `false` and an empty address.
  const directory = mkdtempSync(path.join(tmpdir(), "molis-queue-output-"));
  directories.push(directory);
  const falseOutput = path.join(directory, "output-false");
  writeFileSync(falseOutput, "earlier=step\n");
  const notVerified = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...environment, GITHUB_OUTPUT: falseOutput } });
  assert.equal(notVerified.status, 0, notVerified.stderr);
  assert.equal(readFileSync(falseOutput, "utf8"), "earlier=step\nverified=false\nrun_url=\n", "both lines, added after what was there");
  // Verified: a stand-in for `fetch`, loaded into the command before it starts, answers the runs list and the jobs of run 7 the way the
  // first test of RAC-1900 does. Then the lines are `true` and the address of that run.
  const standIn = path.join(directory, "stand-in-fetch.mjs");
  writeFileSync(standIn, [
    "const reply = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });",
    `const runs = ${JSON.stringify({ workflow_runs: [run()] })};`,
    `const jobs = ${JSON.stringify(verifyJob("success").body)};`,
    'globalThis.fetch = (url) => reply(String(url).includes("/actions/runs/7/jobs") ? jobs : runs);',
  ].join("\n"));
  const trueOutput = path.join(directory, "output-true");
  writeFileSync(trueOutput, "");
  const found = spawnSync(process.execPath, ["--import", pathToFileURL(standIn).href, script], {
    encoding: "utf8",
    env: { ...environment, GITHUB_REPOSITORY: REPO, GITHUB_SHA: SHA, PUSH_BEFORE: BEFORE, GITHUB_TOKEN: "t", GITHUB_OUTPUT: trueOutput },
  });
  assert.equal(found.status, 0, found.stderr);
  assert.match(found.stdout, /^ci-queue-verified: verified: /);
  assert.equal(readFileSync(trueOutput, "utf8"), `verified=true\nrun_url=${run().html_url}\n`, "both lines: true, and the run that verified it");
});

// ---- the workflow ------------------------------------------------------------------------------------------------------------------
/** The two test jobs that joined Verify (decision #14, 2026-10-31): on a pull request they also wait for `test-selection`. */
const TEST_JOBS = ["security-invariants", "product-subset"];
const BLOCKING = ["gates", "health-gate-rules", "architecture-boundaries", "action-contracts", "secret-scan", "native-checks", "shell-checks", ...TEST_JOBS];
const RESULTS = ["GATES", "HEALTH_GATE_RULES", "PACKAGE_BOUNDARIES", "ACTION_CONTRACTS", "SECRET_SCAN", "NATIVE_CHECKS", "SHELL_CHECKS", "SECURITY_INVARIANTS", "PRODUCT_SUBSET"];
const TEST_RESULTS = ["SECURITY_INVARIANTS", "PRODUCT_SUBSET"];
const steps = (job: string) => jobBlock(job).split("\n      - ").slice(1);
const scratch = () => { const directory = mkdtempSync(path.join(tmpdir(), "molis-queue-check-")); directories.push(directory); return directory; };
/**
 * Runs a step's script in `bash --noprofile --norc -eo pipefail`, a little stricter than the runner: ci.yml names no shell, so the runner runs a
 * step with `bash -e {0}` (RAC-1902 checks that nothing names one). The scripts run here have no pipe, so both give the same result.
 * With `env` added and `bin` first on PATH.
 */
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
// The two test jobs also read `test-selection`; here it chose some of their files, so on a pull request they run and only `queue-check`
// decides (what they do for every other way the selection ends is tests/ci-test-selection.test.ts, RAC-1764).
const contexts = (item: Case) => ({
  "github.event_name": item.event, "needs.queue-check.result": item.result, "needs.queue-check.outputs.verified": item.verified,
  "needs.test-selection.result": "success", "needs.test-selection.outputs.security_mode": "some", "needs.test-selection.outputs.product_mode": "some",
});

test("RAC-1901 ci.yml: queue-check runs on a push only, may read runs and nothing else, and a blocking job is skipped only on its success and true", () => {
  const check = jobBlock(QUEUE_CHECK_JOB);
  assert.match(check, /^    if: \$\{\{ github\.event_name == 'push' \}\}$/m, "only on a push: a pull request, the merge queue, the nightly and manual runs never skip anything");
  assert.match(check, /^    permissions:\n      actions: read\n      contents: read\n    outputs:/m, "it reads runs, it writes nothing");
  assert.match(check, /run: node scripts\/ci-queue-verified\.mjs$/m);
  assert.match(check, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(check, /PUSH_BEFORE: \$\{\{ github\.event\.before \}\}/, "the base the push's own gates would compare with");
  assert.doesNotMatch(check, /pnpm install/, "no dependencies");
  assert.deepEqual(blockingJobs(), BLOCKING, "the blocking jobs are the nine of today");
  for (const name of BLOCKING) {
    const job = jobBlock(name);
    assert.match(job, TEST_JOBS.includes(name) ? /^    needs: \[test-selection, queue-check\]$/m : /^    needs: \[queue-check\]$/m, name);
    const condition = /^    if: \$\{\{ (.*) \}\}$/m.exec(job)?.[1];
    assert.ok(condition, name);
    assert.ok(condition.startsWith("!cancelled() && "), `${name}: a cancelled run stops as before`);
    for (const item of CASES) assert.equal(Boolean(evaluateExpression(condition, contexts(item))), !item.skip, `${name} on ${item.event}, queue-check ${item.result}, verified ${JSON.stringify(item.verified)}`);
  }
});

test("RAC-1902 ci.yml: in the merge queue every blocking job first checks that its entry still exists, and only a missing branch stops it", () => {
  // `runStep` is stricter than the runner only while ci.yml names no shell (then the runner runs a step with `bash -e {0}`). A `shell:` or
  // `defaults:` added to it means the comment on `runStep` and the arguments it gives bash need a second look.
  assert.doesNotMatch(workflow, /^\s*(?:shell|defaults):/m, "ci.yml names no shell: the runner runs a step with `bash -e {0}`");
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
    // The script itself, under `runStep`'s bash (stricter than the runner's `bash -e`): 0 (the branch is there) goes on, 2 (connected, no
    // such branch) stops the job, any other failure (128: network, authentication) goes on, so a check that could not ask never stops a
    // live entry.
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

test("RAC-1903 ci.yml: Verify records the queue's base, waits for the nine blocking jobs and judges them, except where they may be skipped", () => {
  const verify = jobBlock("verify");
  assert.match(verify, /^    name: Verify$/m, "the required check keeps its name");
  // Direct selector dependencies and env mappings are checked after the actual shell verdicts below.
  for (const [name, job] of [["SECURITY_INVARIANTS", "security-invariants"], ["PRODUCT_SUBSET", "product-subset"]]) {
    assert.ok(verify.includes(`          ${name}_RESULT: \${{ needs.${job}.result }}`), `${job}'s result reaches the last step`);
  }
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
  const selectorSome = { TEST_SELECTION_RESULT: "success", SECURITY_MODE: "some", PRODUCT_MODE: "some" };
  const judged = (event: string, result: string, verified: string, results: string) =>
    runStep(script, { GITHUB_EVENT_NAME: event, QUEUE_CHECK_RESULT: result, QUEUE_VERIFIED: verified, QUEUE_RUN_URL: "https://example/7", ...selectorSome, ...Object.fromEntries(RESULTS.map((name) => [`${name}_RESULT`, results])) });
  for (const item of CASES) {
    // When the blocking jobs were skipped, Verify must pass without them; otherwise it judges them, every one a success.
    const skipped = judged(item.event, item.result, item.verified, "skipped");
    assert.equal(skipped.status === 0, item.skip, `${item.event}, ${item.result}, ${JSON.stringify(item.verified)}, the nine skipped: ${skipped.stdout}${skipped.stderr}`);
    if (item.skip) { assert.match(skipped.stdout, /passed Verify in the merge queue \(https:\/\/example\/7\)/); continue; }
    assert.equal(judged(item.event, item.result, item.verified, "success").status, 0, `${item.event}, ${item.result}: nine successes pass`);
    const withOne = (name: string, result: string) => runStep(script, { GITHUB_EVENT_NAME: item.event, QUEUE_CHECK_RESULT: item.result, QUEUE_VERIFIED: item.verified, ...selectorSome, ...Object.fromEntries(RESULTS.map((other) => [`${other}_RESULT`, other === name ? result : "success"])) });
    for (const name of RESULTS) {
      for (const result of ["failure", "cancelled"]) assert.notEqual(withOne(name, result).status, 0, `${item.event}, ${item.result}: ${name} ${result} fails Verify`);
      // With a successful some selection an actual run is required, on PRs too.
      assert.notEqual(withOne(name, "skipped").status, 0, `${item.event}, ${item.result}: ${name} some cannot pass with a skipped job`);
    }
  }
  // A failed queue-check is not a check of its own: with the nine green, Verify passes.
  assert.equal(judged("push", "failure", "", "success").status, 0);


  // Independent allowed-skip table: each mode belongs to its own job, and only a successful none is evidence for a PR skip.
  const selections: Array<[string, string, string, string[]]> = [
    ["success", "none", "none", TEST_RESULTS],
    ["success", "none", "some", ["SECURITY_INVARIANTS"]],
    ["success", "none", "whole", ["SECURITY_INVARIANTS"]],
    ["success", "some", "none", ["PRODUCT_SUBSET"]],
    ["success", "whole", "none", ["PRODUCT_SUBSET"]],
    ["success", "some", "some", []],
    ["success", "some", "whole", []],
    ["success", "whole", "some", []],
    ["success", "whole", "whole", []],
    ["success", "", "", []],
    ["success", "unknown", "unknown", []],
    ["success", "none", "", ["SECURITY_INVARIANTS"]],
    ["success", "", "none", ["PRODUCT_SUBSET"]],
    ["success", "none", "unknown", ["SECURITY_INVARIANTS"]],
    ["success", "unknown", "none", ["PRODUCT_SUBSET"]],
    ...["failure", "cancelled", "skipped"].flatMap(result =>
      [["none", "none"], ["none", "some"], ["some", "none"], ["whole", "whole"], ["", ""]].map(([security, product]) =>
        [result, security!, product!, []] as [string, string, string, string[]])),
  ];
  const checkSelection = (event: string, selection: [string, string, string, string[]], overrides: Record<string, string>) => {
    const [result, security, product] = selection;
    return runStep(script, {
      GITHUB_EVENT_NAME: event, QUEUE_CHECK_RESULT: "skipped", QUEUE_VERIFIED: "",
      TEST_SELECTION_RESULT: result, SECURITY_MODE: security, PRODUCT_MODE: product,
      ...Object.fromEntries(RESULTS.map(name => [`${name}_RESULT`, "success"])), ...overrides,
    });
  };
  for (const selection of selections) {
    const label = JSON.stringify(selection.slice(0, 3));
    assert.equal(checkSelection("pull_request", selection, {}).status, 0, `actual successes pass even if the auxiliary selector failed: ${label}`);
    for (const name of TEST_RESULTS) {
      const skipped = checkSelection("pull_request", selection, { [`${name}_RESULT`]: "skipped" });
      assert.equal(skipped.status === 0, selection[3].includes(name), `${label}: only ${name}'s own successful none permits its skip`);
      for (const result of ["failure", "cancelled"]) {
        assert.notEqual(checkSelection("pull_request", selection, { [`${name}_RESULT`]: result }).status, 0, `${label}: ${name} ${result} never passes`);
      }
    }
    const bothSkipped = Object.fromEntries(TEST_RESULTS.map(name => [`${name}_RESULT`, "skipped"]));
    assert.equal(checkSelection("pull_request", selection, bothSkipped).status === 0, selection[3].length === 2, `${label}: both skips need both successful none modes`);
  }
  const noneSelection: [string, string, string, string[]] = ["success", "none", "none", TEST_RESULTS];
  for (const event of ["merge_group", "push", "schedule", "workflow_dispatch"]) {
    for (const name of TEST_RESULTS) {
      assert.notEqual(checkSelection(event, noneSelection, { [`${name}_RESULT`]: "skipped" }).status, 0, `${event}: a none selection cannot waive an actual run`);
    }
  }
  for (const name of RESULTS.filter(name => !TEST_RESULTS.includes(name))) {
    for (const result of ["failure", "cancelled", "skipped"]) {
      assert.notEqual(checkSelection("pull_request", noneSelection, {
        SECURITY_INVARIANTS_RESULT: "skipped", PRODUCT_SUBSET_RESULT: "skipped", [`${name}_RESULT`]: result,
      }).status, 0, `successful none modes never waive ${name} ${result}`);
    }
  }

  assert.match(verify, /^    needs: \[gates, health-gate-rules, architecture-boundaries, action-contracts, secret-scan, native-checks, shell-checks, security-invariants, product-subset, queue-check, test-selection\]$/m);
  assert.ok(verify.includes("          TEST_SELECTION_RESULT: ${{ needs.test-selection.result }}"), "Verify receives the selector result directly");
  for (const [name, output] of [["SECURITY_MODE", "security_mode"], ["PRODUCT_MODE", "product_mode"]]) {
    assert.ok(verify.includes(`          ${name}: \${{ needs.test-selection.outputs.${output} }}`), `${output} reaches its own Verify verdict`);
  }
});

test("RAC-1904 ci.yml: queue-check's word reaches nothing but the blocking jobs' conditions and Verify, and both read it the same way", () => {
  const readers = workflow.split("\n").filter((line) => /needs\.queue-check\./.test(line));
  assert.ok(readers.length > 0);
  assert.deepEqual([...new Set(readers.map((line) => /needs\.queue-check\.([a-z_.]+)/.exec(line)![1]))].sort(), ["outputs.run_url", "outputs.verified", "result"]);
  const outputs = [...jobBlock(QUEUE_CHECK_JOB).matchAll(/^      ([a-z_]+): \$\{\{ steps\.check\.outputs\.([a-z_]+) \}\}$/gm)].map((match) => [match[1], match[2]]);
  assert.deepEqual(outputs, [["verified", "verified"], ["run_url", "run_url"]]);
  // The jobs that read it are exactly the nine and verify.
  const jobsReading = [...workflow.slice(workflow.indexOf("\njobs:\n")).matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]!).filter((name) => /needs\.queue-check\./.test(jobBlock(name)));
  assert.deepEqual(jobsReading.sort(), [...BLOCKING, "verify"].sort());
  // Verify's three conditions are the jobs' three: the push, success, true (RAC-1901 and RAC-1903 evaluate both over the same cases).
  const verify = jobBlock("verify");
  assert.match(verify, /QUEUE_CHECK_RESULT: \$\{\{ needs\.queue-check\.result \}\}/);
  assert.match(verify, /if \[ "\$GITHUB_EVENT_NAME" = "push" \] && \[ "\$QUEUE_CHECK_RESULT" = "success" \] && \[ "\$QUEUE_VERIFIED" = "true" \]; then/);
});
