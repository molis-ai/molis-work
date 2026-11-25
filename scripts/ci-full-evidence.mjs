#!/usr/bin/env node
// Read-only preview for an already identified high-risk PR, or classify a clean checkout with affected-tests.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isMainScript } from "./script-paths.mjs";
import { checkFullJobs, fullDecision, fullPlan } from "./ci-full-evidence/plan.mjs";

const repo = "molis-ai/molis-work";
const workflow = ".github/workflows/full-suite.yml";
const sha = /^[0-9a-f]{40}$/;
const link = id => `https://github.com/${repo}/actions/runs/${id}`;
const options = { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 40000, stdio: ["ignore", "pipe", "pipe"] };

function github(route, mode = "json") {
  const args = ["api", "--hostname", "github.com", "--method", "GET"];
  if (mode === "pages") args.push("--paginate", "--slurp");
  for (let attempt = 1; ; attempt++) {
    try {
      const output = execFileSync("gh", [...args, `repos/${repo}/${route}`], options);
      return mode === "text" ? output : JSON.parse(output);
    } catch (error) {
      const transient = /\bEOF\b|HTTP 50[234]|connection reset|timeout/i.test(String(error.stderr));
      if (!transient || attempt === 3) throw new Error(`Could not read ${route}`);
    }
  }
}

function collection(read, route, key) {
  const pages = read(route, "pages");
  const rows = pages.flatMap(page => key ? page[key] : page);
  if (!pages.length || rows.some(row => !row) || (key && rows.length !== pages[0].total_count)) {
    throw new Error("Incomplete GitHub response");
  }
  return rows;
}

function classifyCheckout(pr, checkout) {
  if (!checkout || /^(?:integration|batch)\//.test(pr.head.ref)) return true;
  const git = (...args) => execFileSync("git", ["-C", checkout, ...args], options).trim();
  if (git("rev-parse", "HEAD") !== pr.head.sha || git("status", "--porcelain")) throw new Error("Point --checkout at the clean PR head");
  const selector = fileURLToPath(new URL("./affected-tests.mjs", import.meta.url));
  const result = JSON.parse(execFileSync(process.execPath, [selector, "--root", checkout, "--base", pr.base.sha, "--json"], options));
  if (!result.changes?.length || !Array.isArray(result.full)) throw new Error("Could not classify the PR diff");
  return result.full.length > 0;
}

function scopeOfRun(run, pr) {
  if (run.head_sha !== pr.head.sha || run.path !== workflow || run.repository?.full_name !== repo || run.head_repository?.full_name !== repo) return null;
  const sameBranch = run.head_branch === pr.head.ref;
  if (run.event === "pull_request" && sameBranch) {
    if (run.pull_requests?.length && !run.pull_requests.some(item => item.number === pr.number)) return null;
    return "pr";
  }
  if (sameBranch && (run.event === "workflow_dispatch" || (run.event === "push" && run.head_branch.startsWith("integration/")))) return "branch";
  if (["push", "workflow_dispatch"].includes(run.event) && run.head_branch?.startsWith("integration/")) return "integration";
  return null;
}

function citedRuns(documents) {
  const refs = new Set();
  for (const doc of documents) {
    for (const match of (doc.body || "").matchAll(/https:\/\/github\.com\/molis-ai\/molis-work\/actions\/runs\/(\d+)(?=$|[/?#\s)\]>.,;。，）])/g)) refs.add(match[1]);
  }
  return refs;
}

function checkedSource(run, jobs, pr, kind, read) {
  let build = jobs.find(job => job.name === "Build workspace");
  if (run.run_attempt > 1) {
    const copies = collection(read, `actions/runs/${run.id}/jobs?filter=all&per_page=30`, "jobs");
    const sameBuild = copies.filter(job => job.run_id === run.id && job.name === build.name && job.runner_id === build.runner_id
      && job.started_at === build.started_at && job.completed_at === build.completed_at && job.conclusion === "success");
    build = sameBuild.sort((a, b) => a.run_attempt - b.run_attempt)[0];
  }
  if (!build) throw new Error("Missing physical build");
  const log = read(`actions/jobs/${build.id}/logs`, "text");
  const actual = /git log -1 --format=[^\n]*\n[^\n]*?\b([0-9a-f]{40})\b/.exec(log)?.[1];
  if (!actual) throw new Error("Build log does not identify the tested checkout");
  if (kind !== "pr") {
    if (actual !== pr.head.sha) throw new Error("Integration or dispatch built another commit");
    return { actual };
  }
  const ref = new RegExp(`refs/(?:remotes/)?pull/${pr.number}/merge\\b`);
  if (!ref.test(log)) throw new Error("Build checkout does not identify this pull request");
  const merge = read(`git/commits/${actual}`);
  if (merge.parents?.length !== 2 || merge.parents[1].sha !== pr.head.sha) throw new Error("Merge checkout is for a different PR head");
  return { actual, baseParent: merge.parents[0].sha };
}

function snapshot(runs, pr) {
  return JSON.stringify(runs.filter(run => scopeOfRun(run, pr)).map(run =>
    [run.id, run.run_attempt, run.status, run.conclusion]).sort((a, b) => a[0] - b[0]));
}

export function inspectFullEvidence(number, { read = github, required = classifyCheckout, checkout } = {}) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Expected a positive PR number");
  const prRoute = `pulls/${number}`;
  const pr = read(prRoute);
  if (pr.number !== number || pr.base.repo.full_name !== repo || pr.base.ref !== "main" || pr.head.repo?.full_name !== repo
    || !sha.test(pr.head.sha) || !sha.test(pr.base.sha)) throw new Error("Unsupported PR source or target");
  const runs = [];
  const route = `actions/workflows/full-suite.yml/runs?head_sha=${pr.head.sha}&per_page=100`;
  let state = "not-required";
  if (required(pr, checkout)) {
    const candidates = collection(read, route, "workflow_runs");
    let references = citedRuns([pr]);
    let loadedComments = false;
    const inputs = new Map();
    function planInputs(ref) {
      if (!inputs.has(ref)) {
        const config = read(`contents/${workflow}?ref=${ref}`);
        const scripts = read(`contents/scripts?ref=${ref}`);
        const runner = ["run-tests.mjs", "run-tests", "ci-full-retry.mjs"].map(name => scripts.find(file => file.name === name)?.sha ?? "");
        if (!sha.test(config.sha) || !runner[0] || !runner[1] || config.encoding !== "base64") throw new Error("Unrecognized Full runner");
        inputs.set(ref, { signature: [config.sha, ...runner].join("/"), plan: fullPlan(Buffer.from(config.content, "base64").toString("utf8")) });
      }
      return inputs.get(ref);
    }
    for (const run of candidates) {
      const kind = scopeOfRun(run, pr);
      if (!kind) continue;
      let needsLink = false;
      if (kind === "integration" && !references.has(String(run.id))) {
        if (!loadedComments) {
          references = citedRuns([pr, ...collection(read, `issues/${number}/comments?per_page=100`)]);
          loadedComments = true;
        }
        needsLink = !references.has(String(run.id));
      }
      let verdict;
      try {
        const jobs = collection(read, `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=30`, "jobs");
        verdict = checkFullJobs(run, jobs);
        if (!verdict) {
          const { actual, baseParent } = checkedSource(run, jobs, pr, kind, read);
          // The API can retain the PR's earlier base even though GitHub built its merge checkout on newer main.
          if (baseParent && (!sha.test(baseParent) || (baseParent !== pr.base.sha &&
            read(`compare/${baseParent}...main?per_page=1`).merge_base_commit?.sha !== baseParent))) {
            throw new Error("Merge checkout has an unconfirmed base");
          }
          const common = read(`compare/${baseParent ?? pr.base.sha}...${pr.head.sha}?per_page=1`).merge_base_commit?.sha;
          if (!sha.test(common)) throw new Error("Missing trusted merge base");
          const trusted = planInputs(common);
          const expected = baseParent ? planInputs(baseParent) : trusted;
          if (planInputs(pr.head.sha).signature !== trusted.signature || planInputs(actual).signature !== expected.signature) {
            throw new Error("The Full workflow or runner differs from the protected baseline");
          }
          verdict = { ...checkFullJobs(run, jobs, expected.plan), checkout: actual };
          if (needsLink && verdict.state === "passed") verdict = { ...verdict, state: "unlinked", reason: "Link this completed integration Full on the PR" };
        }
      } catch (error) {
        verdict = { state: "review", reason: error.message.split("\n")[0] };
      }
      runs.push({ id: run.id, attempt: run.run_attempt, url: link(run.id), ...verdict });
    }
    state = fullDecision(runs);
    if (state === "passed" && snapshot(candidates, pr) !== snapshot(collection(read, route, "workflow_runs"), pr)) {
      throw new Error("Full changed during inspection. Read the current attempts");
    }
  }
  const latest = read(prRoute);
  if (pr.head.sha !== latest.head.sha || pr.base.sha !== latest.base.sha || (state === "passed" && pr.updated_at !== latest.updated_at)) {
    throw new Error("PR changed during inspection. Read the new head and base");
  }
  return { pr: number, head: pr.head.sha, base: pr.base.sha, state, runs };
}

if (isMainScript(import.meta.url)) {
  try {
    const [number, flag, checkout, ...extra] = process.argv.slice(2);
    if (!/^\d+$/.test(number) || extra.length || (flag !== undefined && (flag !== "--checkout" || !checkout))) {
      throw new Error("Usage: node scripts/ci-full-evidence.mjs <high-risk PR> [--checkout <clean PR worktree>]");
    }
    const report = inspectFullEvidence(Number(number), { checkout });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = ["passed", "not-required"].includes(report.state) ? 0 : 1;
  } catch (error) {
    console.error(error.message.split("\n")[0]);
    process.exitCode = 2;
  }
}
