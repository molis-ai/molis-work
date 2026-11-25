// Evaluate the Full plan published by the trusted workflow. Job names alone also occur on skipped runs.
export function fullPlan(workflow) {
  const match = /inputs\.only_files != '' && '\[1\]' \|\| '(\[[\d, ]+\])'/.exec(workflow);
  const indices = match && JSON.parse(match[1]);
  if (!indices || indices.length < 2 || !indices.every((n, i) => n === i + 1)) throw new Error("Unknown Full matrix");
  const needs = /^  result:\s*\n\s+name: Full suite\s*\n\s+needs: \[([^\]]+)\]/m.exec(workflow);
  if (!["build, shard", "build, shard, sync-worker"].includes(needs?.[1])) throw new Error("Unknown Full result dependencies");
  return { count: indices.length, worker: needs[1].endsWith("sync-worker") };
}

const physicallyRan = (job) => job?.status === "completed" && job.runner_id > 0
  && Number.isFinite(Date.parse(job.started_at)) && Date.parse(job.completed_at) >= Date.parse(job.started_at);
const stepPassed = (job, name) => job.steps?.some(step => step.name === name && step.conclusion === "success");

export function checkFullJobs(run, jobs, plan) {
  const result = (state, reason) => ({ state, reason });
  const byName = new Map(jobs.map(job => [job.name, job]));
  if (byName.size !== jobs.length || jobs.some(job => job.run_id !== run.id || job.run_attempt !== run.run_attempt)) {
    return result("review", "Ambiguous job or attempt identity");
  }
  const build = byName.get("Build workspace");
  const aggregate = byName.get("Full suite");
  if (build?.conclusion === "skipped" && aggregate?.conclusion === "skipped") return result("irrelevant", "Full was not selected");
  const shards = jobs.filter(job => job.name.startsWith("Full suite ("));
  if (run.event === "workflow_dispatch" && shards.length === 1 && shards[0].name === "Full suite (1/1)") {
    return result("targeted", "Only the requested files were scheduled");
  }
  const failed = [build, ...shards, byName.get("Sync Worker integration")].filter(job => job?.conclusion === "failure");
  if (run.status !== "completed") return failed.length
    ? result("review", `Full is still running with ${failed.length} failed jobs`) : result("pending", "Full is still running");
  if (run.conclusion === "cancelled" && !failed.length) {
    return result("incomplete", "Run was cancelled before a complete result");
  }
  if (run.conclusion !== "success") return result("review", "Full did not pass. Inspect the failure or documented main exception");
  if (!build || !aggregate) return result("review", "Missing build or aggregate");
  // A successful full-size run must be checked against an independently identified checkout and trusted plan.
  if (!plan) return null;
  if (shards.length !== plan.count || plan.worker !== byName.has("Sync Worker integration")
    || !physicallyRan(build) || build.conclusion !== "success" || !stepPassed(build, "Build")
    || !physicallyRan(aggregate) || aggregate.conclusion !== "success" || !stepPassed(aggregate, "Every shard passed")) {
    return result("review", "Incomplete matrix, build or aggregate");
  }
  const required = Array.from({length: plan.count}, (_, i) => [`Full suite (${i + 1}/${plan.count})`, "Run this shard"]);
  if (plan.worker) required.push(["Sync Worker integration", "Run Worker against ephemeral D1 and R2"]);
  for (const [name, step] of required) {
    const job = byName.get(name);
    if (!physicallyRan(job) || job.conclusion !== "success" || !stepPassed(job, step)
      || Date.parse(job.started_at) < Date.parse(build.completed_at) || Date.parse(job.completed_at) > Date.parse(aggregate.completed_at)) {
      return result("review", `Missing execution on the accepted build: ${name}`);
    }
  }
  if (run.run_attempt > 1 && !stepPassed(aggregate, "Verify every shard on a retry")) {
    return result("review", "Retry has no successful build-artifact and shard provenance check");
  }
  return result("passed", `Build, ${plan.count} shards${plan.worker ? " and Sync Worker" : ""} passed`);
}

// Only decide on this source. A genuine outstanding failure in another complete plan is visible for a human to resolve.
export function fullDecision(runs) {
  const has = state => runs.some(run => run.state === state);
  if (has("review")) return "review";
  if (has("passed")) return "passed";
  if (has("pending")) return "pending";
  return has("unlinked") ? "needs-link" : "missing";
}
