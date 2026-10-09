import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { runFile } from "../scripts/ci-linux-probe/run.mjs";
import { failing, FAILING, STATUSES, summaryMarkdown, totals } from "../scripts/ci-product-subset/report.mjs";

// specs/repository-anti-corruption §4.7 (W2-16, decision #14): the runner of the CI product subset (scripts/ci-product-subset.mjs)
// and the job that calls it. Each rule is mutation-verified here on scratch repositories of small fake test files: what counts and
// what only runs, every result (pass, flaky, fail, skipped-everything, timeout, not reached) and what each does to the exit code, the
// two time budgets, the quarantine and its end date, the order the phases run in, a run that CI cancels, and the refusals. The rules
// of the two files themselves (list, quarantine) are in tests/ci-product-subset-plan.test.ts.
//
// The words the Linux probe marks files by are spelled in pieces, so that this file does not carry the marks of the fixtures it writes.
const w = (...parts: string[]) => parts.join("");
const DARWIN = w("dar", "win");
const TEST_CHROME = w("MOLIS_WORK_TEST", "_CHROME");
const script = fileURLToPath(new URL("../scripts/ci-product-subset.mjs", import.meta.url));
const repoModules = fileURLToPath(new URL("../node_modules", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const directories: string[] = [];
let state = "";
before(() => { state = mkdtempSync(path.join(tmpdir(), "molis-subset-state-")); directories.push(state); });
after(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); });

const spec = (body: string) => `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { existsSync, writeFileSync } from "node:fs";\n${body}\n`;
const passing = spec('test("ok", () => assert.equal(1, 1));');
const failingTest = spec('test("breaks", () => assert.equal("left side", "right side"));');
const skipping = spec('test("a", { skip: "no Chrome here" }, () => {});\ntest("b", { skip: true }, () => {});');
const sleeping = (seconds: number) => spec(`test("takes ${seconds} s", async () => { await new Promise((resolve) => setTimeout(resolve, ${seconds * 1000})); });`);
// Fails on its first attempt only: the marker file is in the state directory the runs share.
const flakyOnce = (name: string) => spec(`test("fails once", () => {\n  const marker = \`\${process.env.SUBSET_STATE}/${name}-seen\`;\n  if (!existsSync(marker)) { writeFileSync(marker, "1"); assert.fail("first attempt"); }\n});`);

// Fails on its first attempt, and on the next ones every test is skipped: a retry that verifies nothing.
const failThenSkip = (name: string) => spec(`const marker = \`\${process.env.SUBSET_STATE}/${name}-seen\`;\nconst seen = existsSync(marker);\nif (!seen) writeFileSync(marker, "1");\ntest("fails, then skips", { skip: seen }, () => assert.fail("first attempt"));`);

const CODEOWNERS = "# fixture\n* @alice\n/plugins/ @alice @bob\n";
const entry = (file: string, over: Record<string, string> = {}) => ({ file, owner: "@alice", since: "2026-10-01", expires: "2026-10-20", reason: "fails one run in five on Linux, seen in run 123", ...over });

type Scenario = { files?: Record<string, string>; list: string[]; quarantine?: Array<ReturnType<typeof entry>> };
/** A scratch repository: the files, the list, the quarantine file and a CODEOWNERS file, with the repository's modules linked in for tsx. */
function scratch({ files = {}, list, quarantine = [] }: Scenario): string {
  const root = mkdtempSync(path.join(tmpdir(), "molis-subset-run-"));
  directories.push(root);
  symlinkSync(repoModules, path.join(root, "node_modules"));
  const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  for (const [file, text] of Object.entries(files)) put(file, text);
  put("tests/ci-product-subset.txt", `# fixture\n${list.join("\n")}\n`);
  put("tests/quarantine.json", `${JSON.stringify({ entries: quarantine }, null, 2)}\n`);
  put(".github/CODEOWNERS", CODEOWNERS);
  return root;
}
const SMOKES = ["tests/smoke-a.e2e.test.ts", "tests/smoke-b.e2e.test.ts", "tests/smoke-c.e2e.test.ts"];
/** The files every scenario needs: the i18n test and three passing smokes. */
const basics = (): Record<string, string> => ({ "tests/i18n.test.ts": passing, ...Object.fromEntries(SMOKES.map((file) => [file, passing])) });
const BASIC_LIST = ["tests/i18n.test.ts", ...SMOKES];

type Report = { endedBy: string; today: string; totals: Record<string, number>; phases: Record<string, number>; files: Array<{ file: string; kind: string; status: string; counted: boolean; attempts?: number; pass?: number; skipped?: number; seconds?: number; detail?: string; quarantine?: { owner: string }; expiredQuarantine?: { owner: string } }> };
const subset = (root: string, args: string[], env: Record<string, string> = {}) => {
  const out = path.join(root, "out");
  const run = spawnSync(process.execPath, [script, "--root", root, "--out", out, ...args], { encoding: "utf8", env: { ...process.env, SUBSET_STATE: state, GITHUB_STEP_SUMMARY: "", ...env } });
  const read = (file: string) => (existsSync(path.join(out, file)) ? readFileSync(path.join(out, file), "utf8") : null);
  const reportText = read("report.json");
  return { code: run.status, text: `${run.stdout}${run.stderr}`, out, report: reportText ? JSON.parse(reportText) as Report : null, summary: read("summary.md") };
};
const byFile = (report: Report | null, name: string) => { const found = report?.files.find((item) => item.file === `tests/${name}`); assert.ok(found, `${name} is in the report`); return found; };
const section = (summary: string | null, title: string) => (summary ?? "").split("### ").find((part) => part.startsWith(title)) ?? "";

// ---- one run with every kind of result -----------------------------------------------------------------------------------------
let mixed: ReturnType<typeof subset>;
let mixedSummaryFile = "";
before(() => {
  const files = {
    ...basics(),
    "tests/ok-a.test.ts": passing, "tests/ok-b.test.ts": passing,
    "tests/broken.test.ts": failingTest, "tests/flaky.test.ts": flakyOnce("mixed-flaky"), "tests/allskip.test.ts": skipping, "tests/slow.test.ts": sleeping(30),
    "tests/held-fail.test.ts": failingTest, "tests/held-pass.test.ts": passing, "tests/ended.test.ts": failingTest,
  };
  const root = scratch({
    files, list: [...BASIC_LIST, ...["ok-a", "ok-b", "broken", "flaky", "allskip", "slow", "held-fail", "held-pass", "ended"].map((name) => `tests/${name}.test.ts`)],
    quarantine: [
      entry("tests/held-fail.test.ts", { owner: "@bob", since: "2026-10-10", expires: "2026-10-31" }),
      entry("tests/held-pass.test.ts", { since: "2026-10-10", expires: "2026-10-31" }),
      entry("tests/ended.test.ts", { since: "2026-10-01", expires: "2026-10-15" }),
    ],
  });
  mixedSummaryFile = path.join(root, "job-summary.md");
  writeFileSync(mixedSummaryFile, "earlier job summary\n");
  mixed = subset(root, ["--jobs", "2", "--timeout-seconds", "10", "--retries", "1", "--today", "2026-10-20"], { GITHUB_STEP_SUMMARY: mixedSummaryFile });
});

test("a counted file that fails, times out or ran nothing fails the run with exit 1, and the run still finishes and says what it did", () => {
  assert.equal(mixed.code, 1, mixed.text);
  assert.match(mixed.text, /\d+ files in tests\/ci-product-subset\.txt: 3 browser smokes and \d+ other files count, 2 quarantined, 1 whose quarantine ended \(they count again\)/);
  assert.match(mixed.text, /counted files did not pass:\n- tests\/broken\.test\.ts \(fail\)\n- tests\/allskip\.test\.ts \(skipped\)\n- tests\/slow\.test\.ts \(timeout\)\n- tests\/ended\.test\.ts \(fail\)/);
  assert.equal(mixed.report?.endedBy, "finished");
  assert.equal(mixed.report?.today, "2026-10-20");
  assert.equal(mixed.report?.totals.failing, 4);
});

test("each result is recorded as what it is", () => {
  const { report } = mixed;
  assert.equal(byFile(report, "ok-a.test.ts").status, "pass");
  assert.equal(byFile(report, "broken.test.ts").status, "fail");
  assert.equal(byFile(report, "broken.test.ts").attempts, 2, "a failure is retried once");
  assert.match(byFile(report, "broken.test.ts").detail ?? "", /right side/);
  assert.equal(byFile(report, "flaky.test.ts").status, "flaky", "a failure that passes on the retry is flaky, and flaky is not a failure");
  assert.equal(byFile(report, "allskip.test.ts").status, "skipped", "a file whose tests all skip verified nothing");
  assert.equal(byFile(report, "slow.test.ts").status, "timeout");
  assert.equal(byFile(report, "slow.test.ts").attempts, 1, "a timeout is not retried");
  assert.ok((byFile(report, "slow.test.ts").seconds ?? 99) < 20, "stopped at the limit, not waited for (it sleeps 30 s)");
  assert.equal(byFile(report, "smoke-a.e2e.test.ts").kind, "browser");
  assert.equal(byFile(report, "ok-a.test.ts").kind, "other");
  assert.deepEqual(report?.totals, { files: 13, counted: 11, quarantined: 2, pass: 6, flaky: 1, skipped: 1, fail: 2, timeout: 1, "not-run": 0, failing: 4 });
});

test("a quarantined file runs and is shown, and never counts; once its end date has passed it counts again", () => {
  const { report } = mixed;
  const heldFail = byFile(report, "held-fail.test.ts");
  assert.equal(heldFail.status, "fail", "it was run");
  assert.equal(heldFail.counted, false);
  assert.equal(heldFail.quarantine?.owner, "@bob");
  assert.equal(heldFail.attempts, 1, "no retry for a file that does not count");
  assert.equal(byFile(report, "held-pass.test.ts").status, "pass");
  assert.equal(byFile(report, "held-pass.test.ts").counted, false);
  const ended = byFile(report, "ended.test.ts");
  assert.equal(ended.counted, true, "the quarantine ran out on 2026-10-15; today is 2026-10-20");
  assert.equal(ended.status, "fail");
  assert.equal(ended.expiredQuarantine?.owner, "@alice");
  const summary = mixed.summary ?? "";
  assert.match(section(summary, "Quarantined: watched, not counted"), /tests\/held-fail\.test\.ts[^\n]*@bob[^\n]*2026-10-31[^\n]*fail/);
  assert.match(section(summary, "Quarantined: watched, not counted"), /tests\/held-pass\.test\.ts/);
  assert.match(section(summary, "Quarantine ended: counted again"), /tests\/ended\.test\.ts[^\n]*@alice[^\n]*2026-10-15/);
  assert.ok(!section(summary, "Failed").includes("held-fail"), "a quarantined failure is not listed among the failures");
  assert.match(section(summary, "Failed"), /tests\/broken\.test\.ts/);
  assert.match(section(summary, "Failed"), /tests\/ended\.test\.ts/);
});

test("the summary names the problem files, offers a quarantine entry for a flaky one, and is appended to the job summary once", () => {
  const summary = mixed.summary ?? "";
  assert.match(summary, /\*\*Did not pass: 4 of 11 counted files\.\*\*/);
  assert.match(section(summary, "Timed out"), /tests\/slow\.test\.ts/);
  assert.match(section(summary, "Skipped everything"), /tests\/allskip\.test\.ts/);
  assert.match(section(summary, "Flaky"), /tests\/flaky\.test\.ts/);
  assert.match(summary, /"file": "tests\/(?:broken|slow|flaky)\.test\.ts"[\s\S]*"since": "2026-10-20"/, "a ready entry, dated today");
  assert.match(section(summary, "Slowest files"), /tests\//);
  assert.equal(readFileSync(mixedSummaryFile, "utf8"), `earlier job summary\n${summary}\n`);
});

test("the browser smokes run first, then the other files, then the quarantined ones", () => {
  const lines = mixed.text.split("\n").filter((line) => /^\[\d+\/\d+\]/.test(line));
  assert.equal(lines.length, 13);
  const position = (name: string) => lines.findIndex((line) => line.includes(`tests/${name}`));
  const smokes = SMOKES.map((file) => position(file.replace("tests/", "")));
  const others = ["ok-a.test.ts", "ok-b.test.ts", "broken.test.ts", "i18n.test.ts"].map(position);
  const held = ["held-fail.test.ts", "held-pass.test.ts"].map(position);
  assert.ok(Math.max(...smokes) < Math.min(...others), "every smoke is done before the first other file");
  assert.ok(Math.max(...others, position("slow.test.ts"), position("allskip.test.ts")) < Math.min(...held), "the quarantined files come last");
  assert.match(lines[position("held-fail.test.ts")]!, /\(quarantined, not counted\)/);
  // and the report lists the files in the same order: smokes, counted files in list order, then the quarantined ones
  const listed = (mixed.report?.files ?? []).map((item) => item.file.replace("tests/", ""));
  assert.deepEqual(listed.slice(0, 3), SMOKES.map((file) => file.replace("tests/", "")));
  assert.deepEqual(listed.slice(-2), ["held-fail.test.ts", "held-pass.test.ts"]);
});

// ---- a run that is green ---------------------------------------------------------------------------------------------------------
test("a flaky pass and a failing quarantined file or smoke leave the run green with exit 0", () => {
  const root = scratch({
    files: { ...basics(), "tests/flaky.test.ts": flakyOnce("green-flaky"), "tests/held-fail.test.ts": failingTest, "tests/smoke-d.e2e.test.ts": failingTest },
    list: [...BASIC_LIST, "tests/flaky.test.ts", "tests/held-fail.test.ts", "tests/smoke-d.e2e.test.ts"],
    quarantine: [entry("tests/held-fail.test.ts", { expires: "2026-10-20" }), entry("tests/smoke-d.e2e.test.ts", { expires: "2026-10-20" })],
  });
  const run = subset(root, ["--today", "2026-10-20", "--timeout-seconds", "20"]);
  assert.equal(run.code, 0, run.text);
  assert.equal(byFile(run.report, "flaky.test.ts").status, "flaky");
  assert.equal(byFile(run.report, "held-fail.test.ts").status, "fail", "the quarantined failure is there to see");
  assert.equal(byFile(run.report, "held-fail.test.ts").attempts, 1);
  assert.equal(byFile(run.report, "smoke-d.e2e.test.ts").status, "fail", "so is a quarantined smoke's");
  assert.equal(byFile(run.report, "smoke-d.e2e.test.ts").kind, "browser");
  assert.equal(byFile(run.report, "smoke-d.e2e.test.ts").counted, false);
  assert.equal(byFile(run.report, "smoke-d.e2e.test.ts").attempts, 1, "no retry for a smoke that does not count");
  assert.equal(run.report?.totals.failing, 0);
  assert.match(run.summary ?? "", /\*\*Passed: all 5 counted files\.\*\*/);
  assert.doesNotMatch(run.text, /did not pass/);
});

// ---- the time budgets ------------------------------------------------------------------------------------------------------------
test("the time budget stops new files from starting, and a file that was never reached fails the run", () => {
  const files = { ...basics(), "tests/a-sleep.test.ts": sleeping(2), "tests/b-after.test.ts": passing, "tests/held-late.test.ts": passing, "tests/held-smoke.e2e.test.ts": passing };
  // a-sleep is the first of the other files; it takes longer than the whole budget (0.6 s), so nothing after it is started
  const root = scratch({
    files, list: ["tests/a-sleep.test.ts", "tests/b-after.test.ts", ...BASIC_LIST, "tests/held-late.test.ts", "tests/held-smoke.e2e.test.ts"],
    quarantine: [entry("tests/held-late.test.ts", { expires: "2026-10-20" }), entry("tests/held-smoke.e2e.test.ts", { expires: "2026-10-20" })],
  });
  const run = subset(root, ["--jobs", "1", "--budget-minutes", "0.01", "--timeout-seconds", "30", "--today", "2026-10-09"]);
  assert.equal(run.code, 1, run.text);
  assert.equal(byFile(run.report, "a-sleep.test.ts").status, "pass");
  for (const name of ["b-after.test.ts", "i18n.test.ts"]) {
    assert.equal(byFile(run.report, name).status, "not-run", `${name} was not reached`);
    assert.equal(byFile(run.report, name).counted, true);
    assert.match(byFile(run.report, name).detail ?? "", /time budget was used up before this file started/);
  }
  assert.equal(byFile(run.report, "held-late.test.ts").status, "not-run", "a quarantined file gets only what is left");
  assert.equal(byFile(run.report, "held-late.test.ts").counted, false);
  assert.equal(byFile(run.report, "held-smoke.e2e.test.ts").status, "not-run", "a quarantined smoke gets only what is left of the other files' budget too, not the smokes' (which has no end here)");
  assert.equal(byFile(run.report, "held-smoke.e2e.test.ts").counted, false);
  assert.match(run.text, /2 counted files did not pass:\n- tests\/b-after\.test\.ts \(not-run\)\n- tests\/i18n\.test\.ts \(not-run\)/, "a file never reached fails the run, a quarantined one does not");
  assert.match(section(run.summary, "Not run"), /tests\/b-after\.test\.ts/);
  assert.match(section(run.summary, "Not run"), /time budget of the phase was used up/);
  for (const name of SMOKES) assert.equal(byFile(run.report, name.replace("tests/", "")).status, "pass", "the smokes have their own budget, and none was given");
});

test("the smokes have their own budget and their own time limit, and run one at a time", () => {
  // Timing, with room on both sides for a loaded machine: smoke-a is only a start-up (one to a few seconds) and has to end before the
  // smoke budget (6 s) so that smoke-b starts; smoke-b then runs until its own limit (8 s), which is past that budget however fast smoke-a was.
  const files = { ...basics(), "tests/smoke-b.e2e.test.ts": sleeping(30), "tests/ok.test.ts": sleeping(3) };
  const root = scratch({ files, list: [...BASIC_LIST, "tests/ok.test.ts"] });
  const run = subset(root, ["--browser-timeout-seconds", "8", "--timeout-seconds", "60", "--browser-budget-minutes", "0.1", "--jobs", "2"]);
  assert.equal(run.code, 1, run.text);
  assert.equal(byFile(run.report, "smoke-a.e2e.test.ts").status, "pass");
  assert.equal(byFile(run.report, "smoke-b.e2e.test.ts").status, "timeout", "a smoke is stopped at the smoke limit (8 s), not the 60 s of the other files");
  assert.ok((byFile(run.report, "smoke-b.e2e.test.ts").seconds ?? 99) < 20);
  assert.equal(byFile(run.report, "smoke-c.e2e.test.ts").status, "not-run", "the smoke budget (6 s) was used up by then");
  assert.equal(byFile(run.report, "ok.test.ts").status, "pass", "the other files are under their own limit and budget");
  assert.ok(run.report!.phases.browser > 0 && run.report!.phases.other > 0);
});

test("a smoke whose tests all skip (no Chrome on the machine) fails the run like a failure", () => {
  const root = scratch({ files: { ...basics(), "tests/smoke-c.e2e.test.ts": skipping }, list: BASIC_LIST });
  const run = subset(root, []);
  assert.equal(run.code, 1, run.text);
  assert.equal(byFile(run.report, "smoke-c.e2e.test.ts").status, "skipped");
  assert.match(section(run.summary, "Skipped everything"), /tests\/smoke-c\.e2e\.test\.ts/);
});

test("a retry that runs no test does not turn a failure into a pass, and no retry starts once the time budget is used up", async () => {
  process.env.SUBSET_STATE = state;
  const root = scratch({
    files: { ...basics(), "tests/fail-skip.test.ts": failThenSkip("retry-skip"), "tests/fail.test.ts": failingTest, "tests/flaky-a.test.ts": flakyOnce("retry-a"), "tests/flaky-b.test.ts": flakyOnce("retry-b") },
    list: BASIC_LIST,
  });
  const run = (name: string, deadline: number) => runFile(root, { file: `tests/${name}`, marks: [] }, { timeoutMs: 60_000, retries: 1, deadline });
  const skipped = await run("fail-skip.test.ts", Infinity);
  assert.equal(skipped.status, "fail", "the retry skipped everything, which confirms nothing: the first failure stands");
  assert.equal(skipped.attempts, 2);
  assert.match(skipped.detail ?? "", /first attempt[\s\S]*the retry ran no test/);
  const flaky = await run("flaky-a.test.ts", Date.now() + 120_000);
  assert.equal(flaky.status, "flaky", "a retry that passes is flaky while there is budget");
  assert.equal(flaky.attempts, 2);
  // The same file, the budget already used up when its first attempt fails: no second attempt, so it fails (it would have passed on the retry).
  const spent = await run("flaky-b.test.ts", Date.now() - 1);
  assert.equal(spent.status, "fail");
  assert.equal(spent.attempts, 1, "no attempt starts after the budget");
  assert.match(spent.detail ?? "", /first attempt[\s\S]*not retried again: the time budget was used up/);
  const nothing = await run("fail.test.ts", Date.now() - 1);
  assert.equal(nothing.attempts, 1);
});

// ---- a run that CI cancels -------------------------------------------------------------------------------------------------------
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (done: () => boolean, ms: number, what: string) => {
  for (let waited = 0; !done(); waited += 50) { assert.ok(waited < ms, `gave up waiting for ${what}`); await new Promise((resolve) => setTimeout(resolve, 50)); }
};

async function cutOff(signal: NodeJS.Signals) {
  const hang = path.join(state, `hang-${signal}`);
  const files = {
    ...basics(),
    "tests/smoke-b.e2e.test.ts": spec(`test("never finishes", async () => {\n  writeFileSync("${hang.replace(/\\/g, "/")}", String(process.pid));\n  await new Promise((resolve) => setTimeout(resolve, 60_000));\n});`),
  };
  const root = scratch({ files, list: BASIC_LIST });
  const jobSummary = path.join(root, "job-summary.md");
  const out = path.join(root, "out");
  const child = spawn(process.execPath, [script, "--root", root, "--out", out, "--retries", "0", "--timeout-seconds", "120", "--browser-timeout-seconds", "120"], { env: { ...process.env, SUBSET_STATE: state, GITHUB_STEP_SUMMARY: jobSummary } });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const ended = new Promise<number | null>((resolve) => child.once("close", (code) => resolve(code)));
  let group = 0;
  try {
    await until(() => existsSync(hang), 60_000, "the second smoke to start");
    const pid = Number(readFileSync(hang, "utf8"));
    group = Number(execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim());
    const before = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report;
    child.kill(signal);
    const code = await Promise.race([ended, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`the runner did not exit after ${signal}\n${output}`)), 20_000))]);
    for (let waited = 0; alive(pid) && waited < 3000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
    return { code, output, before, testStillRunning: alive(pid), report: JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report, summary: readFileSync(path.join(out, "summary.md"), "utf8"), jobSummary: existsSync(jobSummary) ? readFileSync(jobSummary, "utf8") : "" };
  } finally {
    child.kill("SIGKILL");
    if (group) { try { process.kill(-group, "SIGKILL"); } catch { /* already gone */ } }
  }
}

test("a run that CI cancels stops the test running, leaves a partial report that fails nothing it did not see, and exits 128 + the signal", async () => {
  for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130]] as const) {
    const cut = await cutOff(signal);
    assert.equal(cut.before.endedBy, "running", `${signal}: a report is on disk after the first file, written by no handler`);
    assert.equal(byFile(cut.before, "smoke-a.e2e.test.ts").status, "pass");
    assert.equal(cut.code, code, `${signal}: ${cut.output}`);
    assert.equal(cut.testStillRunning, false, `${signal}: the file that was running is still running`);
    assert.equal(cut.report.endedBy, signal);
    assert.equal(byFile(cut.report, "smoke-a.e2e.test.ts").status, "pass");
    assert.equal(byFile(cut.report, "smoke-b.e2e.test.ts").status, "not-run");
    assert.match(byFile(cut.report, "smoke-b.e2e.test.ts").detail ?? "", new RegExp(`was running when the run was cut off by ${signal}`));
    assert.match(byFile(cut.report, "i18n.test.ts").detail ?? "", new RegExp(`cut off by ${signal} before this file started`));
    assert.match(cut.summary, new RegExp(`Incomplete: the run was cut off by ${signal} .* after 1 of 4 files`));
    assert.match(cut.summary, /\*\*Not finished\.\*\*/);
    assert.equal(cut.jobSummary.split("## Product subset").length - 1, 1, `${signal}: the summary was appended to the job summary once`);
  }
});

test("a report exists from the start: a run killed while its first file is running still leaves one", async () => {
  const hang = path.join(state, "hang-first");
  const files = { ...basics(), "tests/smoke-a.e2e.test.ts": spec(`test("never finishes", async () => {\n  writeFileSync("${hang.replace(/\\/g, "/")}", String(process.pid));\n  await new Promise((resolve) => setTimeout(resolve, 60_000));\n});`) };
  const root = scratch({ files, list: BASIC_LIST });
  const out = path.join(root, "out");
  const child = spawn(process.execPath, [script, "--root", root, "--out", out, "--retries", "0", "--timeout-seconds", "120", "--browser-timeout-seconds", "120"], { env: { ...process.env, SUBSET_STATE: state, GITHUB_STEP_SUMMARY: "" } });
  let group = 0;
  try {
    await until(() => existsSync(hang), 60_000, "the first smoke to start");
    group = Number(execFileSync("ps", ["-o", "pgid=", "-p", readFileSync(hang, "utf8")], { encoding: "utf8" }).trim());
    const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8")) as Report;
    assert.equal(report.endedBy, "running");
    assert.equal(report.files.length, 4);
    assert.ok(report.files.every((item) => item.status === "not-run"), "nothing has finished yet");
    for (const name of ["smoke-a.e2e.test.ts", "i18n.test.ts"]) assert.match(byFile(report, name).detail ?? "", /not started when this report was written/, "the report is written when the run starts and after each file, not when a file starts");
    assert.match(readFileSync(path.join(out, "summary.md"), "utf8"), /Incomplete: this is the last report the run wrote/);
  } finally {
    child.kill("SIGKILL");
    if (group) { try { process.kill(-group, "SIGKILL"); } catch { /* already gone */ } }
  }
});

// ---- refusals and listing --------------------------------------------------------------------------------------------------------
test("the runner refuses to run when it cannot say what it measured, and writes nothing", () => {
  const good = scratch({ files: basics(), list: BASIC_LIST });
  const refused = (args: string[], pattern: RegExp, root = good) => {
    const run = subset(root, args);
    assert.equal(run.code, 2, `${args.join(" ")}: ${run.text}`);
    assert.match(run.text, pattern);
    assert.equal(existsSync(run.out), false, `${args.join(" ")}: wrote a report`);
  };
  refused(["--expect-platform", process.platform === "linux" ? "win32" : "linux"], /nothing was run/);
  refused(["--bogus=1"], /unknown argument/);
  refused(["--jobs", "0"], /--jobs needs a whole number of at least 1/);
  refused(["--budget-minutes", "soon"], /--budget-minutes needs a number/);
  refused(["--only"], /--only needs a value/);
  refused(["--today", "yesterday"], /--today needs a real date/);
  refused(["--only", "no-such-file-anywhere"], /no file of tests\/ci-product-subset\.txt matches/);
  refused(["--only", "("], /--only needs a regular expression/);
  const missing = scratch({ files: basics(), list: [...BASIC_LIST, "tests/gone.test.ts"] });
  refused([], /break a rule, nothing was run:\n- tests\/ci-product-subset\.txt:\d+: tests\/gone\.test\.ts does not exist/, missing);
  const tooFew = scratch({ files: basics(), list: ["tests/i18n.test.ts", SMOKES[0]!] });
  refused([], /1 browser smokes listed/, tooFew);
  const noList = mkdtempSync(path.join(tmpdir(), "molis-subset-nolist-"));
  directories.push(noList);
  refused([], /there is no product subset to run/, noList);
});

test("a quarantine entry that begins in the future is refused, by the run and by --list, so the 30 days cannot be stretched by dating ahead", () => {
  // Valid for every static rule (29 days from its `since`), and the file would be held for a year: the way round that review found.
  const ahead = scratch({ files: { ...basics(), "tests/held.test.ts": passing }, list: [...BASIC_LIST, "tests/held.test.ts"], quarantine: [entry("tests/held.test.ts", { since: "2027-09-01", expires: "2027-09-30" })] });
  for (const args of [["--today", "2026-10-09"], ["--list", "--today", "2026-10-09"], ["--only", "i18n", "--today", "2026-10-09"]]) {
    const run = subset(ahead, args);
    assert.equal(run.code, 2, `${args.join(" ")}: ${run.text}`);
    assert.match(run.text, /has an entry that begins in the future, nothing was run:\n- tests\/quarantine\.json \(tests\/held\.test\.ts\): "since" 2027-09-01 is \d+ days after today \(2026-10-09\)/, args.join(" "));
    assert.equal(existsSync(run.out), false, `${args.join(" ")}: wrote a report`);
  }
  // On the day it begins it is an ordinary entry; so is one dated the next day (someone east of UTC writes their own date).
  const listed = subset(ahead, ["--list", "--today", "2027-09-01"]);
  assert.equal(listed.code, 0, listed.text);
  assert.match(listed.text, /^held {5}tests\/held\.test\.ts {2}\[quarantined until 2027-09-30, @alice: /m);
  const tomorrow = scratch({ files: { ...basics(), "tests/held.test.ts": passing }, list: [...BASIC_LIST, "tests/held.test.ts"], quarantine: [entry("tests/held.test.ts", { since: "2026-10-10", expires: "2026-10-31" })] });
  assert.equal(subset(tomorrow, ["--list", "--today", "2026-10-09"]).code, 0);
  const afterTomorrow = subset(tomorrow, ["--list", "--today", "2026-10-08"]);
  assert.equal(afterTomorrow.code, 2, afterTomorrow.text);
  assert.match(afterTomorrow.text, /"since" 2026-10-10 is 2 days after today \(2026-10-08\)/);
});

test("--list shows what runs, what is held and what has ended, and runs nothing", () => {
  const files = { ...basics(), "tests/held.test.ts": passing, "tests/ended.test.ts": passing, "tests/ok.test.ts": passing };
  const root = scratch({
    files, list: [...BASIC_LIST, "tests/held.test.ts", "tests/ended.test.ts", "tests/ok.test.ts"],
    quarantine: [entry("tests/held.test.ts", { expires: "2026-10-31", owner: "@bob" }), entry("tests/ended.test.ts", { expires: "2026-10-05" })],
  });
  const run = subset(root, ["--list", "--today", "2026-10-09"]);
  assert.equal(run.code, 0, run.text);
  assert.match(run.text, /^smoke {4}tests\/smoke-a\.e2e\.test\.ts$/m);
  assert.match(run.text, /^run {6}tests\/ok\.test\.ts$/m);
  assert.match(run.text, /^held {5}tests\/held\.test\.ts {2}\[quarantined until 2026-10-31, @bob: fails one run in five on Linux, seen in run 123\]$/m);
  assert.match(run.text, /^run {6}tests\/ended\.test\.ts {2}\[quarantine ended 2026-10-05, @alice: counts again\]$/m);
  assert.match(run.text, /7 files in tests\/ci-product-subset\.txt: 3 browser smokes and 3 other files count, 1 quarantined, 1 whose quarantine ended/);
  assert.equal(existsSync(run.out), false, "--list wrote a report");
  const only = subset(root, ["--list", "--only", "e2e"]);
  assert.match(only.text, /3 files in tests\/ci-product-subset\.txt: 3 browser smokes and 0 other files count/);
});

// ---- the report's own pieces -----------------------------------------------------------------------------------------------------
test("only a counted file with a failing result fails the subset; a quarantined one never does", () => {
  const item = (status: string, counted: boolean) => ({ file: `tests/${status}-${counted}.test.ts`, status, counted, kind: "other", marks: [] as string[] });
  assert.deepEqual(FAILING, ["fail", "timeout", "skipped", "not-run"]);
  assert.deepEqual(STATUSES, ["pass", "flaky", "skipped", "fail", "timeout", "not-run"]);
  const results = STATUSES.flatMap((status) => [item(status, true), item(status, false)]);
  assert.deepEqual(failing(results).map((result) => result.status).sort(), ["fail", "not-run", "skipped", "timeout"]);
  assert.ok(failing(results).every((result) => result.counted));
  assert.deepEqual(totals(results), { files: 12, counted: 6, quarantined: 6, pass: 1, flaky: 1, skipped: 1, fail: 1, timeout: 1, "not-run": 1, failing: 4 });
  const meta = { platform: DARWIN, arch: "arm64", node: "v24", commit: "abc", today: "2026-10-09", jobs: 2, timeoutSeconds: 180, browserTimeoutSeconds: 240, retries: 1, budgetMinutes: 15, browserBudgetMinutes: 8, minutes: 1, phases: { browser: 0.2, other: 0.5, quarantined: 0 }, endedBy: "finished" };
  const text = summaryMarkdown({ results: [item("pass", true)], meta });
  assert.match(text, /not Linux: its results say nothing about Linux/);
  assert.match(text, /browser smokes 0\.2 min \(budget 8 min\), other files 0\.5 min \(budget 15 min\)/);
  assert.match(summaryMarkdown({ results: [item("pass", true)], meta: { ...meta, platform: "linux", budgetMinutes: null as never } }), /\(no budget\)/);
});

// ---- the job in ci.yml -----------------------------------------------------------------------------------------------------------
// Decision #14: for about two weeks the product subset informs and does not block; then it joins Verify by being one of its needs,
// which leaves the required check as it is. Until then these lines of .github/workflows/ci.yml must stay as they are; carrying the
// decision out means changing the first of the two tests below in the same pull request (the second, the blocking job running the
// subset's own rules, stays true after the join).
const workflow = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
const jobBlock = (name: string) => {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `ci.yml has a job ${name}`);
  const length = lines.slice(start + 1).findIndex((line) => /^  [A-Za-z0-9_-]+:\s*$/.test(line));
  return lines.slice(start, length === -1 ? undefined : start + 1 + length).join("\n");
};

test("ci.yml: the product subset is an ubuntu job that cannot fail the workflow, that Verify does not wait for yet, and that is stopped by its own time limit", () => {
  const job = jobBlock("product-subset");
  assert.match(job, /^    runs-on: ubuntu-latest$/m);
  assert.match(job, /^    continue-on-error: true$/m, "a red subset must not turn the workflow red (decision #14: not blocking at first)");
  assert.match(job, /^    name: Product subset \(not required yet\)$/m);
  assert.match(job, /run: exec node scripts\/ci-product-subset\.mjs --expect-platform linux /, "the runner is the step's own process, so a cancel's signal reaches it, and it refuses to record another platform");
  assert.match(job, /- name: Keep the report\n\s+if: \$\{\{ always\(\) \}\}\n\s+uses: actions\/upload-artifact@/, "the report is kept when the job is cancelled or stopped");
  assert.match(job, /run: pnpm build$/m, "the tests import the built packages");
  assert.ok(job.includes(`${TEST_CHROME}=`), "the browser smokes are told which Chrome to use");
  const timeout = Number(/^    timeout-minutes: (\d+)$/m.exec(job)?.[1]);
  const budget = Number(/--budget-minutes (\d+(?:\.\d+)?)/.exec(job)?.[1]);
  const browserBudget = Number(/--browser-budget-minutes (\d+(?:\.\d+)?)/.exec(job)?.[1]);
  assert.ok(budget > 0 && browserBudget > 0, "both time budgets are given");
  assert.ok(timeout >= budget + browserBudget + 5, `the job limit (${timeout}) leaves room for install, build and both budgets (${budget} + ${browserBudget})`);
  // No attempt starts after its phase's budget, so each phase ends at most one attempt after it: the smokes' budget plus one smoke attempt, then the
  // other files' budget plus the longest attempt (the quarantined phase shares that budget and may end on a smoke). Install and build are about 2 minutes.
  const seconds = (flag: string) => Number(new RegExp(`(?<![\\w-])${flag} (\\d+(?:\\.\\d+)?)`).exec(job)?.[1]);
  const attempt = seconds("--timeout-seconds") / 60;
  const smokeAttempt = seconds("--browser-timeout-seconds") / 60;
  assert.ok(attempt > 0 && smokeAttempt > 0, "both per-file time limits are given");
  const worst = 2 + (browserBudget + smokeAttempt) + (budget + Math.max(attempt, smokeAttempt));
  assert.ok(timeout >= worst, `the job limit (${timeout} min) holds the worst case: 2 for install and build, the smokes' budget and a last smoke attempt, the other files' budget and a last attempt = ${worst} min`);
  assert.ok(budget + browserBudget <= 25, "the job stays about as long as the blocking one (about 20 minutes), so joining Verify does not lengthen the check");
  const needs = workflow.split("\n").filter((line) => /^\s*needs:/.test(line));
  assert.ok(needs.every((line) => !line.includes("product-subset")), `no job needs product-subset yet: ${needs.join(" | ")}`);
  assert.match(jobBlock("verify"), /^    name: Verify$/m, "the required check keeps its name");
});

test("ci.yml: the blocking job runs the subset's own rules", () => {
  assert.match(jobBlock("architecture-boundaries"), /run: node scripts\/run-tests\.mjs tests\/ci-product-subset\.test\.ts tests\/ci-product-subset-plan\.test\.ts$/m);
});
