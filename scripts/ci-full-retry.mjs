import { execFileSync } from "node:child_process";
import { isMainScript } from "./script-paths.mjs";

// A partial retry can reuse successful jobs. Check that the full matrix finished on the
// build that produced the artifact consumed by the shard jobs.
export function verifyFullRetry(jobs, { runId, artifact, count }) {
  if (!/^\d+$/.test(runId) || !Number.isSafeInteger(count) || count < 1) throw new Error("Invalid Full suite plan");
  const latest = new Map();
  for (const job of jobs) {
    if (job.name !== "Build workspace" && !job.name.startsWith("Full suite (") && !(count > 1 && job.name === "Sync Worker integration")) continue;
    if (String(job.run_id) !== runId || !Number.isSafeInteger(job.run_attempt) || job.run_attempt < 1) throw new Error("Invalid Full suite job identity");
    const previous = latest.get(job.name);
    if (!previous || previous.run_attempt < job.run_attempt) latest.set(job.name, job);
    else if (previous.run_attempt === job.run_attempt) throw new Error(`Ambiguous job: ${job.name}`);
  }
  const build = latest.get("Build workspace");
  // GitHub can copy a passed job into later attempts with a new ID and run_attempt,
  // while retaining its execution timestamps and outputs. The pack step names its actual attempt.
  const producer = jobs.find(job => job.name === "Build workspace" && artifact === `full-suite-dist-${runId}-${job.run_attempt}`);
  const buildEnd = Date.parse(producer?.completed_at);
  if (producer?.conclusion !== "success" || build?.conclusion !== "success" || !(Date.parse(producer.started_at) <= buildEnd)
    || build.started_at !== producer.started_at || build.completed_at !== producer.completed_at) {
    throw new Error("The current successful build does not match the shard artifact");
  }
  latest.delete("Build workspace");
  const incomplete = [];
  const expected = Array.from({ length: count }, (_, index) => `Full suite (${index + 1}/${count})`);
  if (count > 1) expected.push("Sync Worker integration");
  for (const name of expected) {
    const shard = latest.get(name);
    const start = Date.parse(shard?.started_at);
    if (shard?.conclusion !== "success" || shard.run_attempt < producer.run_attempt
      || !(start >= buildEnd && Date.parse(shard.completed_at) >= start)) {
      incomplete.push(name);
    }
    latest.delete(name);
  }
  if (incomplete.length || latest.size) throw new Error(`Incomplete or different Full suite plan: ${[...incomplete, ...latest.keys()].join(", ")}`);
}

export function verifyBuildArtifact(response, expected) {
  const [artifact] = response.artifacts;
  if (response.total_count !== 1 || artifact?.name !== expected || artifact.expired !== false) {
    throw new Error("The original Full suite build is missing or expired. Start a complete run.");
  }
}

if (isMainScript(import.meta.url)) {
  const runId = process.env.GITHUB_RUN_ID;
  const endpoint = `repos/{owner}/{repo}/actions/runs/${runId}`;
  const output = execFileSync("gh", ["api", "--paginate", `${endpoint}/jobs?filter=all&per_page=30`, "--jq", ".jobs[] | {name, run_id, run_attempt, conclusion, started_at, completed_at} | @json"], { encoding: "utf8" });
  const jobs = output.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const artifact = process.env.BUILD_ARTIFACT;
  verifyFullRetry(jobs, { runId, artifact, count: Number(process.env.EXPECTED_SHARDS) });
  const artifacts = execFileSync("gh", ["api", `${endpoint}/artifacts?name=${encodeURIComponent(artifact)}&per_page=1`], { encoding: "utf8" });
  verifyBuildArtifact(JSON.parse(artifacts), artifact);
  console.log(`All ${process.env.EXPECTED_SHARDS} shards passed using ${artifact}.`);
}
