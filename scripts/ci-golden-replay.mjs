#!/usr/bin/env node
// The golden replay as CI runs it (specs/upgrade-continuity/golden-replay-design.md §5): the same script a person runs, with what a green job did not check said where
// people look. On Linux the samples that need the macOS sandbox did not run; the job is green and that is not a pass, so the result says so in the job's summary and as a
// notice on the run, and never only in a log nobody opens.
//
//   node scripts/ci-golden-replay.mjs [any arguments of scripts/replay-golden-homes.mjs]    exit: the replay's own
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMainScript } from "./script-paths.mjs";

const NOT_A_PASS = /not run on [^,)]+, not a pass/u;

/** What a run of the replay leaves in the job's summary, and the notice when part of it did not run. */
export function reported(stdout, status) {
  const notRun = stdout.split("\n").filter(line => NOT_A_PASS.test(line));
  return {
    summary: ["## Golden Home replay", "", status === 0 ? (notRun.length ? "Everything that ran passed. The signed samples did not run here: not a pass for them." : "Everything passed, the signed samples included.") : "Failed.", "", "```text", stdout.trimEnd(), "```", ""].join("\n"),
    notices: notRun.map(line => `::notice title=Golden replay: not run on this runner::${line.trim()}`),
  };
}

if (isMainScript(import.meta.url)) {
  const script = fileURLToPath(new URL("./replay-golden-homes.mjs", import.meta.url));
  const replay = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", script, ...process.argv.slice(2)], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 });
  const status = replay.status ?? 1, { summary, notices } = reported(replay.stdout ?? "", status);
  process.stdout.write(replay.stdout ?? "");
  for (const notice of notices) process.stdout.write(`${notice}\n`);
  if (status !== 0) {
    // A failed replay reports where and which code, not the error's own message (UPG2-03 leaves the data out; the message is what a person
    // fixing it needs). Run the same replay once more with --debug so the log carries the message and stack; the verdict stays the first run's.
    process.stdout.write("\nthe failing replay again, with --debug:\n");
    const debug = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", script, ...process.argv.slice(2), "--debug"], { encoding: "utf8", stdio: ["ignore", "ignore", "inherit"], maxBuffer: 16 * 1024 * 1024 });
    if (debug.error) process.stderr.write(`ci-golden-replay: the debug replay did not start: ${debug.error.message}\n`);
  }
  // The summary is only for people: failing to write it does not change the verdict.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary); } catch (error) { process.stderr.write(`ci-golden-replay: the job summary could not be written: ${error instanceof Error ? error.message : String(error)}\n`); }
  }
  process.exit(status);
}
