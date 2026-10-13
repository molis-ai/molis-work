// What the product subset leaves behind: report.json (every file with its kind, result, quarantine and time) and summary.md (also
// appended to the job summary once, when the run ends). Both are written again after every file and once more when the run is cut
// off by a signal, so a run that CI cancels still leaves the results it had; `endedBy` says how the run ended.
// The table and file helpers are the Linux probe's (scripts/ci-linux-probe/report.mjs).
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { cell, reason, replace, section, table } from "../ci-linux-probe/report.mjs";

/** A result a file of the subset can have. `quarantined` is not one: it is `counted: false` on a file with any of these. */
export const STATUSES = ["pass", "flaky", "skipped", "fail", "timeout", "not-run"];
/** What fails the subset when the file counts: a failure, a time-out, a file that ran nothing, a file the run never got to. */
export const FAILING = ["fail", "timeout", "skipped", "not-run"];

export const failing = (results) => results.filter((entry) => entry.counted && FAILING.includes(entry.status));
export const totals = (results) => {
  const counted = results.filter((entry) => entry.counted);
  return {
    files: results.length, counted: counted.length, quarantined: results.length - counted.length,
    ...Object.fromEntries(STATUSES.map((status) => [status, counted.filter((entry) => entry.status === status).length])),
    failing: failing(results).length,
  };
};

const kind = (entry) => (entry.kind === "browser" ? "browser" : "");
const daysLeft = (entry, today) => Math.round((Date.parse(`${entry.quarantine.expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
const minutes = (value) => (value === null || value === undefined ? "-" : `${value} min`);
const budget = (value) => (Number.isFinite(value) ? `budget ${value} min` : "no budget");

export function summaryMarkdown({ results, meta }) {
  const count = totals(results);
  const counted = results.filter((entry) => entry.counted);
  const by = (status) => counted.filter((entry) => entry.status === status);
  const held = results.filter((entry) => !entry.counted);
  const returned = results.filter((entry) => entry.expiredQuarantine);
  const bad = failing(results);
  const how = meta.endedBy ?? "finished";
  const decided = results.filter((entry) => entry.status !== "not-run").length;
  const platform = meta.platform === "linux" ? "" : `\n> This run was on ${meta.platform}, not Linux: its results say nothing about Linux.\n`;
  const incomplete = how === "finished" ? ""
    : how === "running"
      ? `\n> Incomplete: this is the last report the run wrote, after ${decided} of ${results.length} files. The run was stopped without a chance to finish (killed, or the job's hard time limit), or it is still going.\n`
      : `\n> Incomplete: the run was cut off by ${how} (a newer push cancels a run, or the job reached its time limit) after ${decided} of ${results.length} files. The rest have no result (\`not-run\`).\n`;
  const verdict = how !== "finished" ? "**Not finished.**"
    : bad.length ? `**Did not pass: ${bad.length} of ${count.counted} counted files.**`
      : `**Passed: all ${count.counted} counted files.**`;
  const example = [...by("fail"), ...by("timeout"), ...by("flaky")][0];
  const FILE = ["file", (entry) => `\`${entry.file}\``];
  const KIND = ["kind", kind];
  const REASON = ["first failure", reason];
  const OWNER = ["owner", (entry) => cell((entry.quarantine ?? entry.expiredQuarantine).owner)];
  return [
    "## Product subset: user-flow test files on Linux",
    "",
    "The files of `tests/ci-product-subset.txt`, one at a time, each with its own Home; the browser smokes first. A file that fails is run once more; a pass on the second try is `flaky`. A file whose tests all skip counts as failed: it verified nothing.",
    incomplete,
    platform,
    verdict,
    "",
    `${meta.platform} ${meta.arch}, node ${meta.node}, commit \`${String(meta.commit).slice(0, 10)}\`, ${meta.jobs} at a time, ${meta.timeoutSeconds} s per file (${meta.browserTimeoutSeconds} s per browser smoke), ${meta.retries} retry.`,
    `Time: browser smokes ${minutes(meta.phases?.browser)} (${budget(meta.browserBudgetMinutes)}), other files ${minutes(meta.phases?.other)} (${budget(meta.budgetMinutes)}), quarantined files ${minutes(meta.phases?.quarantined)}, whole run ${minutes(meta.minutes)}.`,
    "",
    table([
      { result: "pass", files: count.pass }, { result: "flaky (failed, then passed on a retry)", files: count.flaky },
      { result: "fail", files: count.fail }, { result: "timeout", files: count.timeout },
      { result: "skipped (no test body ran)", files: count.skipped }, { result: "not run (time budget, or the run was cut off)", files: count["not-run"] },
      { result: "quarantined (watched, not counted)", files: count.quarantined },
    ], [["result", (row) => row.result], ["files", (row) => row.files]]),
    "",
    ...section("Failed", by("fail"), [FILE, KIND, ["tests", (e) => e.tests], ["failed", (e) => e.fail], ["tries", (e) => e.attempts], REASON]),
    ...section("Timed out", by("timeout"), [FILE, KIND, ["seconds", (e) => e.seconds]], "Stopped at the time limit of one file."),
    ...section("Skipped everything", by("skipped"), [FILE, KIND, ["skipped", (e) => e.skipped]], "Nothing ran, so nothing was checked. A browser smoke ends up here when there is no Chrome on the machine. Take the file out of the list, or fix what skips it."),
    ...section("Not run", by("not-run"), [FILE, KIND], "No result: the time budget of the phase was used up, or the run was cut off. The list is longer than its budget allows (or the machine was slow): shorten the list, or raise the budget in the workflow in a reviewed change."),
    ...section("Flaky", by("flaky"), [FILE, KIND, REASON], "Failed once and passed on the retry. Not a failure of the subset, but a quarantine candidate if it happens again."),
    ...(example ? ["To quarantine a file, add an entry like this to `tests/quarantine.json` (at most 30 days; the owner is an account in `.github/CODEOWNERS`):", "", "```json", JSON.stringify({ file: example.file, owner: "@account", since: meta.today, expires: "YYYY-MM-DD", reason: "how it fails and where it was seen" }, null, 2), "```", ""] : []),
    ...section("Quarantined: watched, not counted", held, [FILE, KIND, OWNER, ["until", (e) => e.quarantine.expires], ["days left", (e) => daysLeft(e, meta.today)], ["latest result", (e) => e.status], ["reason", (e) => cell(e.quarantine.reason)]],
      "Run after the counted files with what is left of the budget; their result never fails the subset. A `pass` here for several runs in a row is the sign to take the entry out."),
    ...section("Quarantine ended: counted again", returned, [FILE, KIND, OWNER, ["ended", (e) => e.expiredQuarantine.expires], ["result", (e) => e.status]],
      "The entry's end date passed, so the file counts again. Fix the test, or take it out of the list in a reviewed change. An end date is at most 30 days after `since`; renewing means writing a newer `since`, which is a reviewed edit of tests/quarantine.json, not something that happens by itself."),
    ...section("Slowest files", [...counted].filter((entry) => entry.seconds !== undefined).sort((a, b) => b.seconds - a.seconds).slice(0, 8), [FILE, KIND, ["seconds", (e) => e.seconds]]),
    "",
  ].join("\n");
}

/** `jobSummary` appends the summary to the job summary of the CI run: once, at the end of the run, not after every file. */
export function writeSubsetReport(outDirectory, { results, meta }, { jobSummary = false } = {}) {
  mkdirSync(outDirectory, { recursive: true });
  const report = { tool: "ci-product-subset", generatedAt: new Date().toISOString(), ...meta, totals: totals(results), files: results };
  replace(path.join(outDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const summary = summaryMarkdown({ results, meta });
  replace(path.join(outDirectory, "summary.md"), summary);
  if (jobSummary && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  return report;
}
