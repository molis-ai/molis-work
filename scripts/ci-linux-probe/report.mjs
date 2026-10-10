// What the probe leaves behind: report.json (every file with its mark and result), pass.txt (the files that passed, one per
// line, the form of tests/ci-product-subset.txt, which was drawn from it in W2-16) and summary.md (also appended to the job summary once, when
// the run ends). The three are written again after every file and once more when the run is cut off by a signal, so a run that
// CI cancels (a newer push, the job's time limit) still leaves the results it had; `meta.endedBy` says how the run ended.
import { appendFileSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const STATUSES = ["pass", "flaky", "skipped", "fail", "timeout", "not-run", "excluded"];

export const totals = (results) => Object.fromEntries([["files", results.length], ...STATUSES.map((status) => [status, results.filter((entry) => entry.status === status).length])]);
export const passed = (results) => results.filter((entry) => entry.status === "pass").map((entry) => entry.file).sort();

export const cell = (text) => String(text).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const CAUSE = /(?:[A-Za-z]*Error|ERR_[A-Z_]+)\b|Cannot find|timed out|expected|assert/;
export const reason = (entry) => {
  const lines = (entry.detail ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const line = lines.find((candidate) => !/^(?:at|throw) /.test(candidate) && CAUSE.test(candidate)) ?? lines[0] ?? "";
  return cell(line.length > 150 ? `${line.slice(0, 150)}…` : line);
};
const marks = (entry) => (entry.marks.length ? entry.marks.join(", ") : "none");
export const table = (entries, columns) => [
  `| ${columns.map(([title]) => title).join(" | ")} |`,
  `| ${columns.map(() => "---").join(" | ")} |`,
  ...entries.map((entry) => `| ${columns.map(([, value]) => value(entry)).join(" | ")} |`),
].join("\n");

const FILE = ["file", (entry) => `\`${entry.file}\``];
const MARKS = ["marks", marks];
const REASON = ["first failure", reason];
export const section = (title, entries, columns, note) => entries.length ? [`### ${title} (${entries.length})`, "", ...(note ? [note, ""] : []), table(entries, columns), ""] : [];

export function summaryMarkdown({ results, meta }) {
  const count = totals(results);
  const by = (status) => results.filter((entry) => entry.status === status);
  const failed = by("fail");
  const unmarked = failed.filter((entry) => !entry.marks.some((mark) => mark === "darwin" || mark === "live"));
  const marked = failed.filter((entry) => !unmarked.includes(entry));
  const partial = by("pass").filter((entry) => entry.skipped > 0);
  const platform = meta.platform === "linux" ? "" : `\n> This run was on ${meta.platform}, not Linux: its results say nothing about Linux.\n`;
  const decided = results.filter((entry) => entry.status !== "excluded" && entry.status !== "not-run").length;
  const toRun = results.length - count.excluded;
  const how = meta.endedBy ?? "finished";
  const incomplete = how === "finished" ? ""
    : how === "running"
      ? `\n> Incomplete: this is the last report the run wrote, after ${decided} of ${toRun} files. The run was stopped without a chance to finish (killed, or the job's hard time limit), or it is still going.\n`
      : `\n> Incomplete: the run was cut off by ${how} (a newer push cancels a run, or the job reached its time limit) after ${decided} of ${toRun} files. The rest have no result (\`not-run\`).\n`;
  return [
    "## Linux probe: which test files pass on Linux",
    "",
    "Informational (specs/repository-anti-corruption decision #14): this job does not block a merge. Browser files are not run.",
    incomplete,
    platform,
    `${meta.platform} ${meta.arch}, node ${meta.node}, commit \`${String(meta.commit).slice(0, 10)}\`, ${meta.minutes} min, ${meta.jobs} at a time, ${meta.timeoutSeconds} s per file, ${meta.retries} retry.`,
    "",
    table([
      { result: "pass", files: count.pass }, { result: "flaky (failed, then passed on a retry)", files: count.flaky },
      { result: "skipped (no test body ran)", files: count.skipped }, { result: "fail", files: count.fail }, { result: "timeout", files: count.timeout },
      { result: "not run (no result: time budget, or the run was cut off)", files: count["not-run"] }, { result: "excluded (browser)", files: count.excluded },
    ], [["result", (row) => row.result], ["files", (row) => row.files]]),
    "",
    ...section("Failed, without a darwin or live mark: look at these first", unmarked, [FILE, ["tests", (e) => e.tests], ["failed", (e) => e.fail], ["tries", (e) => e.attempts], REASON]),
    ...section("Failed, marked darwin or live: most likely the platform", marked, [FILE, MARKS, REASON]),
    ...section("Timed out", by("timeout"), [FILE, MARKS, ["seconds", (e) => e.seconds]]),
    ...section("Flaky", by("flaky"), [FILE, MARKS, REASON], "Quarantine candidates: they failed once and passed on the retry. They are not in pass.txt."),
    ...section("Skipped everything", by("skipped"), [FILE, MARKS, ["skipped", (e) => e.skipped]], "A platform guard or a live opt-in left no test body to run. These are not in pass.txt."),
    ...section("Not run", by("not-run"), [FILE, MARKS], "No result: the time budget was used up or the run was cut off first. A file that was running when the run was cut off is here too; `detail` in report.json says which."),
    ...section("Passed with some tests skipped", partial, [FILE, MARKS, ["pass", (e) => e.pass], ["skipped", (e) => e.skipped]], "In pass.txt: the tests that ran passed, and only part of the file ran on Linux. For a live file the skipped tests are the live ones."),
    `Files that passed: ${count.pass}. They are listed in pass.txt of the \`linux-probe\` artifact, together with report.json (every file, its marks and result).`,
    "",
  ].join("\n");
}

// Each file is written whole under a temporary name and renamed over the old one, so a run killed in the middle of a write
// leaves the previous complete report and not half of a new one.
export const replace = (file, text) => { writeFileSync(`${file}.tmp`, text); renameSync(`${file}.tmp`, file); };

// `jobSummary` appends the summary to the job summary of the CI run: once, at the end of the run, not after every file.
export function writeReport(outDirectory, { results, meta }, { jobSummary = false } = {}) {
  mkdirSync(outDirectory, { recursive: true });
  const report = { probe: "ci-linux-probe", generatedAt: new Date().toISOString(), ...meta, totals: totals(results), files: results };
  replace(path.join(outDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  replace(path.join(outDirectory, "pass.txt"), passed(results).map((file) => `${file}\n`).join(""));
  const summary = summaryMarkdown({ results, meta });
  replace(path.join(outDirectory, "summary.md"), summary);
  if (jobSummary && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  return report;
}
