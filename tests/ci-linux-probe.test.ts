import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { passed, writeReport } from "../scripts/ci-linux-probe/report.mjs";
import { failureDetail, parseCounts, statusOf, testEnvironment } from "../scripts/ci-linux-probe/run.mjs";
import { selectTests } from "../scripts/ci-linux-probe/select.mjs";

// specs/repository-anti-corruption §4.7 (W1-11, decision #14): the Linux probe that CI runs as a non-blocking job. Each rule is
// mutation-verified here on a scratch repository of small fake test files: a file is excluded as a browser file by its name,
// its text or a fixture it imports; marked darwin or live by what it says; and every result (pass, partial pass, all skipped,
// fail, did-not-load, flaky, timeout, not run) is recorded as such. A run that CI cancels (a newer push, the job's time limit)
// or that is killed outright still leaves the results it had. Breaking any one rule makes one of these fail.
//
// The words the probe marks files by are spelled in pieces below, so that this file does not carry the marks of the fixtures
// it writes (it would be a browser, darwin and live file itself, and the probe would leave it out).
const w = (...parts: string[]) => parts.join("");
const CHROME = w("google", "-chrome");
const DEBUG_PORT = w("remote-debugging", "-port");
const DARWIN = w("dar", "win");
const SANDBOX = w("sandbox", "-exec");
const LAUNCHD = w("launch", "ctl");
const LIVE_ACCEPTANCE = w("MOLIS_WORK_LIVE", "_ACCEPTANCE");
const LIVE_ACCOUNTS = w("MOLIS_WORK_LIVE", "_ACCOUNTS");
const NETWORK_E2E = w("MOLIS_SANDBOX_NETWORK", "_E2E");
const DEPENDENCY_E2E = w("MOLIS_PLUGIN_DEPENDENCY", "_E2E");
const KEY_REQUIRED = w("MINIMAX_API", "_KEY is required");
const script = fileURLToPath(new URL("../scripts/ci-linux-probe.mjs", import.meta.url));
const repoModules = fileURLToPath(new URL("../node_modules", import.meta.url));
let root = "";
let state = "";
let out = "";
let summaryFile = "";
let run: { code: number | null; text: string };
type Entry = { file: string; status: string; marks: string[]; tests?: number; pass?: number; fail?: number; skipped?: number; attempts?: number; detail?: string };
let files: Map<string, Entry>;
let passList: string[];
let summary = "";

const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
const spec = (body: string) => `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { existsSync, writeFileSync } from "node:fs";\n${body}\n`;
const probe = (args: string[], env: Record<string, string> = {}) => {
  const result = spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf8", env: { ...process.env, PROBE_STATE: state, GITHUB_STEP_SUMMARY: "", ...env } });
  return { code: result.status, text: `${result.stdout}${result.stderr}` };
};

before(() => {
  root = mkdtempSync(path.join(tmpdir(), "molis-linux-probe-"));
  state = path.join(root, "state"); out = path.join(root, "out"); summaryFile = path.join(root, "step-summary.md");
  mkdirSync(state);
  symlinkSync(repoModules, path.join(root, "node_modules")); // tsx, for the runner's --import
  // Results.
  put("tests/pass.test.ts", spec(`test("one", () => assert.equal(1, 1));\ntest("two", () => assert.equal(2, 2));`));
  put("tests/partial.test.ts", spec(`test("runs", () => assert.equal(1, 1));\ntest("does not", { skip: true }, () => {});`));
  put("tests/allskip.test.ts", spec(`test("a", { skip: "not here" }, () => {});\ntest("b", { skip: true }, () => {});`));
  put("tests/fail.test.ts", spec(`test("breaks", () => assert.equal("left side", "right side"));`));
  put("tests/noload.test.ts", spec(`import "./does-not-exist-anywhere";\ntest("never", () => {});`));
  put("tests/flaky.test.ts", spec(`test("fails on the first attempt only", () => {\n  const marker = \`\${process.env.PROBE_STATE}/flaky-seen\`;\n  if (!existsSync(marker)) { writeFileSync(marker, "1"); assert.fail("first attempt"); }\n});`));
  put("tests/slow.test.ts", spec(`test("never finishes", async () => { await new Promise((resolve) => setTimeout(resolve, 30_000)); });`));
  put("tests/plain.test.mjs", `import test from "node:test";\ntest("an mjs file", () => {});\n`);
  // Browser: by name, by text, by a fixture it imports.
  put("tests/shell.e2e.test.ts", spec(`test("needs nothing special in its text", () => {});`));
  put("tests/browser-text.test.ts", spec(`const chrome = "/usr/bin/${CHROME}";\ntest("uses it", () => assert.ok(chrome));`));
  put("tests/browser-fixture.test.ts", spec(`import { launch } from "./fixtures/launcher";\ntest("uses a launcher", () => assert.ok(launch));`));
  put("tests/fixtures/launcher.ts", `import { helper } from "./deeper";\nexport const launch = helper;\n`);
  put("tests/fixtures/deeper.ts", `export const helper = ["--${DEBUG_PORT}=0"];\n`);
  put("tests/clean-fixture.test.ts", spec(`import { value } from "./fixtures/clean";\ntest("fixture without a browser", () => assert.equal(value, 1));`));
  put("tests/fixtures/clean.ts", `export const value = 1;\n`);
  // darwin: a platform guard, a macOS tool named in the text; one of them also fails, which the report keeps apart.
  put("tests/darwin-guard.test.ts", spec(`test("only on a Mac", { skip: process.platform !== "${DARWIN}" }, () => {});`));
  put("tests/darwin-tool.test.ts", spec(`// the real helper is started through /usr/bin/${SANDBOX}\ntest("fine", () => {});`));
  put("tests/darwin-fail.test.ts", spec(`const service = "${LAUNCHD}";\ntest("needs launchd", () => assert.equal(service, "systemctl"));`));
  // live: by name, by an opt-in variable, by a required key. The opt-in is set around the probe and must not reach the tests.
  put("tests/model-live.test.ts", spec(`test("calls a model", { skip: true }, () => {});`));
  put("tests/optin-env.test.ts", spec(`test("the opt-in is not handed on", () => {\n  assert.equal(process.env.${LIVE_ACCEPTANCE}, undefined);\n  assert.equal(process.env.MINIMAX_API_KEY, undefined);\n});`));
  put("tests/needs-key.test.ts", spec(`test("a model", { skip: "${KEY_REQUIRED}" }, () => {});`));
  // A live file that also has tests which are not live (the real tests/plugin-sandbox-network.test.ts is one): the live test
  // skips, the rest runs, so the file is a pass with a skip and not "skipped".
  put("tests/mixed-optin.test.ts", spec(`test("an ordinary test", () => assert.equal(1, 1));\ntest("the live one", { skip: process.env.${NETWORK_E2E} !== "1" }, () => {});`));
  // A process the test leaves running must not outlive the file.
  put("tests/leftover.test.ts", spec(`import { spawn } from "node:child_process";\ntest("starts a process and does not stop it", () => {\n  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });\n  child.unref();\n  writeFileSync(\`\${process.env.PROBE_STATE}/leftover-pid\`, String(child.pid));\n});`));
  // Used by the runs that are cut off only: the first file passes at once, the second never finishes and writes its pid, the
  // third is never reached (one file at a time).
  put("tests/cancel-1-fast.test.ts", spec(`test("done at once", () => {});`));
  put("tests/cancel-2-hang.test.ts", spec(`test("never finishes", async () => {\n  writeFileSync(\`\${process.env.PROBE_STATE}/hang-pid\`, String(process.pid));\n  await new Promise((resolve) => setTimeout(resolve, 60_000));\n});`));
  put("tests/cancel-3-later.test.ts", spec(`test("never started", () => {});`));
  // Used by the budget run only.
  put("tests/a-sleep.test.ts", spec(`test("takes a while", async () => { await new Promise((resolve) => setTimeout(resolve, 1500)); });`));
  put("tests/b-after.test.ts", spec(`test("starts too late", () => {});`));

  writeFileSync(summaryFile, "earlier job summary\n");
  run = probe(["--out", out, "--jobs", "4", "--timeout-seconds", "8", "--retries", "1", "--only", "tests/(?!a-sleep|b-after|cancel-)"],
    { GITHUB_STEP_SUMMARY: summaryFile, [LIVE_ACCEPTANCE]: "1", MINIMAX_API_KEY: "not-a-real-key" });
  const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8"));
  files = new Map((report.files as Entry[]).map((entry) => [entry.file, entry]));
  passList = readFileSync(path.join(out, "pass.txt"), "utf8").split("\n").filter(Boolean);
  summary = readFileSync(path.join(out, "summary.md"), "utf8");
});
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
after(() => {
  const pidFile = path.join(state, "leftover-pid");
  if (existsSync(pidFile)) { try { process.kill(Number(readFileSync(pidFile, "utf8")), "SIGKILL"); } catch { /* already gone */ } }
  if (root) rmSync(root, { recursive: true, force: true });
});

const entry = (name: string) => { const found = files.get(`tests/${name}`); assert.ok(found, `${name} is in the report`); return found; };
const section = (title: string) => summary.split("### ").find((part) => part.startsWith(title)) ?? "";

test("a probe with failing test files still finishes with exit 0 and says what it did", () => {
  assert.equal(run.code, 0, run.text);
  assert.match(run.text, /\d+ test files: \d+ to run, 3 excluded \(browser\)/);
  const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8"));
  assert.equal(report.platform, process.platform);
  assert.equal(report.probe, "ci-linux-probe");
  assert.equal(report.files.length, files.size);
  assert.equal(report.totals.excluded, 3);
});

test("browser files are not run and are told apart by name, by text and by a fixture they import", () => {
  for (const name of ["shell.e2e.test.ts", "browser-text.test.ts", "browser-fixture.test.ts"]) {
    assert.equal(entry(name).status, "excluded", name);
    assert.deepEqual(entry(name).marks, ["browser"], name);
    assert.equal(entry(name).tests, undefined, `${name} was run`);
  }
  assert.deepEqual(entry("clean-fixture.test.ts").marks, [], "a fixture without a browser does not exclude its test");
  assert.equal(entry("clean-fixture.test.ts").status, "pass");
});

test("darwin files are marked by a platform guard or a macOS tool, and are still run", () => {
  assert.deepEqual(entry("darwin-guard.test.ts").marks, [DARWIN]);
  assert.deepEqual(entry("darwin-tool.test.ts").marks, [DARWIN]);
  assert.deepEqual(entry("darwin-fail.test.ts").marks, [DARWIN]);
  assert.equal(entry("darwin-tool.test.ts").status, "pass");
  assert.ok(entry("darwin-fail.test.ts").attempts, "a darwin file is run");
  assert.deepEqual(entry("pass.test.ts").marks, [], "an ordinary file carries no mark");
});

test("live files are marked by name, by an opt-in variable and by a required key; the opt-ins are not handed to any test", () => {
  assert.deepEqual(entry("model-live.test.ts").marks, ["live"]);
  assert.deepEqual(entry("optin-env.test.ts").marks, ["live"]);
  assert.deepEqual(entry("needs-key.test.ts").marks, ["live"]);
  assert.equal(entry("optin-env.test.ts").status, "pass", `the probe was started with the live opt-ins set: ${entry("optin-env.test.ts").detail}`);
});

test("a live file whose other tests run is a pass with skips; a file with only live tests is skipped", () => {
  // The live switches are not handed to the tests, so the live tests skip. What the file is then depends on what else it has.
  assert.deepEqual(entry("mixed-optin.test.ts").marks, ["live"]);
  assert.equal(entry("mixed-optin.test.ts").status, "pass");
  assert.equal(entry("mixed-optin.test.ts").pass, 1);
  assert.equal(entry("mixed-optin.test.ts").skipped, 1);
  assert.ok(passList.includes("tests/mixed-optin.test.ts"));
  assert.match(section("Passed with some tests skipped"), /tests\/mixed-optin\.test\.ts/);
  for (const name of ["model-live.test.ts", "needs-key.test.ts"]) {
    assert.equal(entry(name).status, "skipped", name);
    assert.ok(!passList.includes(`tests/${name}`), `${name} is not a pass`);
    assert.match(section("Skipped everything"), new RegExp(`tests/${name.replace(/\./g, "\\.")}`));
  }
});

test("each result is recorded as what it is", () => {
  assert.equal(entry("pass.test.ts").status, "pass");
  assert.equal(entry("pass.test.ts").tests, 2);
  assert.equal(entry("plain.test.mjs").status, "pass");
  assert.equal(entry("partial.test.ts").status, "pass");
  assert.equal(entry("partial.test.ts").skipped, 1);
  assert.equal(entry("allskip.test.ts").status, "skipped", "everything skipped is not a pass");
  assert.equal(entry("allskip.test.ts").pass, 0);
  assert.equal(entry("fail.test.ts").status, "fail");
  assert.equal(entry("fail.test.ts").attempts, 2, "a failure is retried once");
  assert.match(entry("fail.test.ts").detail ?? "", /right side/);
  assert.equal(entry("noload.test.ts").status, "fail", "a file that does not load fails");
  assert.match(entry("noload.test.ts").detail ?? "", /Cannot find|ERR_MODULE_NOT_FOUND/);
  assert.equal(entry("flaky.test.ts").status, "flaky", "a failure that passes on the retry is flaky");
  assert.equal(entry("flaky.test.ts").attempts, 2);
  assert.match(entry("flaky.test.ts").detail ?? "", /first attempt/);
  assert.equal(entry("slow.test.ts").status, "timeout");
  assert.equal(entry("slow.test.ts").attempts, 1, "a timeout is not retried");
  assert.ok((entry("slow.test.ts").seconds ?? 99) < 20, "the file was stopped at the time limit, not waited for (it sleeps 30 s)");
});

test("a process a test file leaves running is stopped when the file is done", async () => {
  assert.equal(entry("leftover.test.ts").status, "pass");
  const pid = Number(readFileSync(path.join(state, "leftover-pid"), "utf8"));
  for (let waited = 0; alive(pid) && waited < 3000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(alive(pid), false, "the process the test started is still running");
});

test("pass.txt holds exactly the files that passed, sorted, one per line", () => {
  const expected = [...files.values()].filter((item) => item.status === "pass").map((item) => item.file).sort();
  assert.deepEqual(passList, expected);
  for (const name of ["pass.test.ts", "partial.test.ts", "plain.test.mjs", "darwin-tool.test.ts", "clean-fixture.test.ts", "optin-env.test.ts"]) assert.ok(passList.includes(`tests/${name}`), name);
  for (const name of ["flaky.test.ts", "allskip.test.ts", "fail.test.ts", "slow.test.ts", "shell.e2e.test.ts", "noload.test.ts"]) assert.ok(!passList.includes(`tests/${name}`), `${name} is not a pass`);
});

test("the summary puts an unexplained failure apart from a failure on a darwin or live file, and is appended to the job summary", () => {
  const unmarked = section("Failed, without a darwin or live mark");
  const marked = section("Failed, marked darwin or live");
  assert.match(unmarked, /tests\/fail\.test\.ts/);
  assert.match(unmarked, /tests\/noload\.test\.ts/);
  assert.ok(!unmarked.includes("darwin-fail"), "a failing darwin file is not an unexplained failure");
  assert.match(marked, /tests\/darwin-fail\.test\.ts/);
  assert.ok(!marked.includes("`tests/fail.test.ts`"), "an unmarked failure is not explained away as the platform");
  assert.match(section("Timed out"), /tests\/slow\.test\.ts/);
  assert.match(section("Flaky"), /tests\/flaky\.test\.ts/);
  assert.match(section("Skipped everything"), /tests\/allskip\.test\.ts/);
  assert.match(section("Passed with some tests skipped"), /tests\/partial\.test\.ts/);
  assert.equal(readFileSync(summaryFile, "utf8"), `earlier job summary\n${summary}\n`);
});

// A run that is cut off. CI cancels a run when a newer push arrives (the workflow's concurrency is cancel-in-progress) and stops a
// job at its time limit; the upload step still runs, so what the probe wrote by then is all there is. The second file hangs, so the
// run is cut off with one file done, one running and one not started.
const until = async (done: () => boolean, ms: number, what: string) => {
  for (let waited = 0; !done(); waited += 50) { assert.ok(waited < ms, `gave up waiting for ${what}`); await new Promise((resolve) => setTimeout(resolve, 50)); }
};
const readJson = (file: string) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
const fileOf = (report: { files: Entry[] }, name: string) => { const found = report.files.find((item) => item.file === `tests/${name}`); assert.ok(found, `${name} is in the report`); return found; };

async function cutOff(name: string, signal: NodeJS.Signals) {
  const dir = path.join(root, name);
  const jobSummary = path.join(root, `${name}-job-summary.md`);
  const hangPid = path.join(state, "hang-pid");
  rmSync(hangPid, { force: true });
  const child = spawn(process.execPath, [script, "--root", root, "--out", dir, "--only", "tests/cancel-", "--jobs", "1", "--timeout-seconds", "120", "--retries", "0"],
    { env: { ...process.env, PROBE_STATE: state, GITHUB_STEP_SUMMARY: jobSummary } });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.once("close", (code, by) => resolve({ code, signal: by })));
  let group = 0;
  try {
    await until(() => existsSync(hangPid), 60_000, "the second file to start");
    const pid = Number(readFileSync(hangPid, "utf8"));
    group = Number(execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).trim());
    const before = { report: readJson(path.join(dir, "report.json")), jobSummaryWritten: existsSync(jobSummary) };
    child.kill(signal);
    const exit = await Promise.race([ended, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`the probe did not exit after ${signal}\n${output}`)), 20_000))]);
    for (let waited = 0; alive(pid) && waited < 3000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
    const read = (file: string) => (existsSync(path.join(dir, file)) ? readFileSync(path.join(dir, file), "utf8") : null);
    return { ...exit, output, before, pid, testStillRunning: alive(pid), report: readJson(path.join(dir, "report.json")), pass: read("pass.txt"), summary: read("summary.md"), jobSummary: existsSync(jobSummary) ? readFileSync(jobSummary, "utf8") : null };
  } finally {
    child.kill("SIGKILL");
    if (group) { try { process.kill(-group, "SIGKILL"); } catch { /* already gone */ } }
  }
}

test("a run that CI cancels leaves a partial report: the test running is stopped, unfinished files are not-run, the exit code is 128 + the signal", async () => {
  for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130], ["SIGHUP", 129]] as const) {
    const cut = await cutOff(`cut-${signal}`, signal);
    // What was on disk before the signal: written after the first file, not by a handler.
    assert.equal(cut.before.report?.endedBy, "running", `${signal}: a report exists after the first file`);
    assert.equal(fileOf(cut.before.report, "cancel-1-fast.test.ts").status, "pass");
    assert.equal(cut.before.jobSummaryWritten, false, `${signal}: the job summary is appended once, at the end, not after every file`);
    // What the cancel leaves.
    assert.equal(cut.code, code, `${signal}: ${cut.output}`);
    assert.equal(cut.testStillRunning, false, `${signal}: the test file that was running is still running`);
    assert.ok(cut.report, `${signal}: report.json is there and is valid JSON`);
    assert.equal(cut.report.endedBy, signal);
    assert.equal(fileOf(cut.report, "cancel-1-fast.test.ts").status, "pass");
    assert.equal(fileOf(cut.report, "cancel-2-hang.test.ts").status, "not-run");
    assert.match(fileOf(cut.report, "cancel-2-hang.test.ts").detail ?? "", new RegExp(`was running when the run was cut off by ${signal}`));
    assert.equal(fileOf(cut.report, "cancel-3-later.test.ts").status, "not-run");
    assert.match(fileOf(cut.report, "cancel-3-later.test.ts").detail ?? "", new RegExp(`cut off by ${signal} before this file started`));
    assert.equal(cut.report.totals.pass, 1);
    assert.equal(cut.report.totals["not-run"], 2);
    assert.equal(cut.pass, "tests/cancel-1-fast.test.ts\n");
    assert.match(cut.summary ?? "", new RegExp(`Incomplete: the run was cut off by ${signal} .* after 1 of 3 files`));
    assert.equal((cut.jobSummary ?? "").split("## Linux probe").length - 1, 1, `${signal}: the summary was appended to the job summary once`);
    assert.match(cut.jobSummary ?? "", /Incomplete: the run was cut off by/);
  }
});

test("a run that is killed outright (SIGKILL, no handler can run) still leaves the report of its last finished file", async () => {
  const cut = await cutOff("cut-KILL", "SIGKILL");
  assert.equal(cut.signal, "SIGKILL");
  assert.equal(cut.report?.endedBy, "running", "report.json is the last per-file report and says the run did not end properly");
  assert.equal(fileOf(cut.report, "cancel-1-fast.test.ts").status, "pass");
  assert.equal(fileOf(cut.report, "cancel-2-hang.test.ts").status, "not-run");
  assert.equal(cut.pass, "tests/cancel-1-fast.test.ts\n");
  assert.match(cut.summary ?? "", /Incomplete: this is the last report the run wrote, after 1 of 3 files/);
  assert.equal(cut.jobSummary, null, "no handler ran, so nothing was appended to the job summary");
});

test("the time budget stops new files from starting, and they are recorded as not run", () => {
  const budgetOut = path.join(root, "budget-out");
  const result = probe(["--out", budgetOut, "--only", "tests/(a-sleep|b-after)", "--jobs", "1", "--budget-minutes", "0.01", "--timeout-seconds", "30"]);
  assert.equal(result.code, 0, result.text);
  const byName = new Map((JSON.parse(readFileSync(path.join(budgetOut, "report.json"), "utf8")).files as Entry[]).map((item) => [item.file, item]));
  assert.equal(byName.get("tests/a-sleep.test.ts")?.status, "pass");
  assert.equal(byName.get("tests/b-after.test.ts")?.status, "not-run");
  assert.deepEqual(readFileSync(path.join(budgetOut, "pass.txt"), "utf8").split("\n").filter(Boolean), ["tests/a-sleep.test.ts"]);
});

test("--list shows the selection and marks and runs nothing", () => {
  const listOut = path.join(root, "list-out");
  const result = probe(["--list", "--out", listOut]);
  assert.equal(result.code, 0, result.text);
  assert.match(result.text, /^excluded {2}tests\/shell\.e2e\.test\.ts {2}\[browser\]$/m);
  assert.match(result.text, /^run {7}tests\/darwin-guard\.test\.ts {2}\[darwin\]$/m);
  assert.match(result.text, /^run {7}tests\/pass\.test\.ts$/m);
  assert.match(result.text, /marks over all: browser 3, darwin 3, live 4/);
  assert.equal(existsSync(listOut), false, "--list wrote a report");
});

test("the probe refuses to run when it cannot say what it measured", () => {
  const refusedOut = path.join(root, "refused-out");
  const wrongPlatform = probe(["--out", refusedOut, "--expect-platform", process.platform === "linux" ? "win32" : "linux"]);
  assert.equal(wrongPlatform.code, 2);
  assert.match(wrongPlatform.text, /nothing was run/);
  assert.equal(existsSync(refusedOut), false);
  const nothing = probe(["--list", "--only", "no-such-test-anywhere"]);
  assert.equal(nothing.code, 2);
  assert.match(nothing.text, /no test file/);
  assert.equal(probe(["--bogus=1", "--list"]).code, 2, "an unknown option is refused even when it comes with a value");
  assert.equal(probe(["--jobs", "0", "--list"]).code, 2);
  assert.equal(probe(["--only"]).code, 2);
  const browserOnly = probe(["--list", "--only", "e2e"]);
  assert.equal(browserOnly.code, 2);
  assert.match(browserOnly.text, /needs a browser/);
});

// The pieces the runs above go through, one by one: how the totals are read, how a result becomes a status, what a failure
// shows, and what the tests are handed.
const totalsText = (counts: Record<string, number>, prefix = "ℹ") =>
  ["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"].map((name) => `${prefix} ${name} ${counts[name] ?? 0}`).join("\n") + `\n${prefix} duration_ms 12\n`;
const result = (code: number | null, output: string, timedOut = false) => ({ code, signal: null, timedOut, error: null, output, seconds: 1 });

test("the totals are read in both reporter formats, only from the start of a line, and only when complete", () => {
  const expected = { tests: 3, pass: 2, fail: 0, cancelled: 0, skipped: 1, todo: 0 };
  assert.deepEqual(parseCounts(totalsText({ tests: 3, pass: 2, skipped: 1 })), expected);
  assert.deepEqual(parseCounts(totalsText({ tests: 3, pass: 2, skipped: 1 }, "#")), expected);
  assert.deepEqual(parseCounts(`${totalsText({ tests: 3, pass: 2, skipped: 1 })}\n  ℹ pass 9\n  # fail 9\n`), expected, "output a test printed itself does not count");
  assert.equal(parseCounts("ℹ pass 1\nℹ fail 0\n"), null, "a partial summary is no summary");
  assert.equal(parseCounts("no totals at all"), null);
});

test("a run becomes a status from its exit code and its totals together", () => {
  assert.equal(statusOf(result(0, totalsText({ tests: 2, pass: 2 }))).status, "pass");
  assert.equal(statusOf(result(0, totalsText({ tests: 2, pass: 1, skipped: 1 }))).status, "pass");
  assert.equal(statusOf(result(0, totalsText({ tests: 2, skipped: 2 }))).status, "skipped");
  assert.equal(statusOf(result(0, totalsText({ tests: 0 }))).status, "skipped", "no test body ran");
  assert.equal(statusOf(result(1, totalsText({ tests: 2, pass: 1, fail: 1 }))).status, "fail");
  assert.equal(statusOf(result(1, totalsText({ tests: 1, cancelled: 1 }))).status, "fail", "a non-zero exit with nothing counted as failed is still a failure");
  assert.equal(statusOf(result(0, totalsText({ tests: 2, pass: 1, fail: 1 }))).status, "fail", "a failed test is a failure whatever the exit code says");
  assert.equal(statusOf(result(0, "the process printed no totals")).status, "fail", "never a pass without totals");
  assert.equal(statusOf(result(null, "")).status, "fail");
  assert.equal(statusOf(result(143, totalsText({ tests: 1, pass: 1 }), true)).status, "timeout");
});

test("a failure shows the error lines before the totals and the failing-tests section, without stack frames", () => {
  const output = ["Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/x/y.js'", "    at finalizeResolution (node:internal/x:1:1)", "throw new ERR_MODULE_NOT_FOUND(", totalsText({ tests: 1, fail: 1 }), "✖ failing tests:", "", "test at tests/a.test.ts:1:1", "  'test failed'"].join("\n");
  const detail = failureDetail(output);
  assert.match(detail, /^Error \[ERR_MODULE_NOT_FOUND\]: Cannot find module/);
  assert.match(detail, /failing tests:/);
  assert.doesNotMatch(detail, /finalizeResolution|throw new/);
  assert.ok(failureDetail("x".repeat(20_000)).length <= 1900, "a long output is cut");
});

test("what the tests are handed has no switch for a live test, and keeps the rest", () => {
  const given = { PATH: "/bin", MOLIS_WORK_HOME: "/h", MOLIS_WORK_TEXT_MODEL: "m", CI: "true" };
  const switches = { [LIVE_ACCOUNTS]: "1", [LIVE_ACCEPTANCE]: "1", [NETWORK_E2E]: "1", [DEPENDENCY_E2E]: "1", MINIMAX_API_KEY: "k", MOLIS_WORK_TEXT_API_KEY: "k" };
  assert.deepEqual(testEnvironment({ ...given, ...switches }), given);
});

test("pass.txt takes only the passes, whatever order the results come in", () => {
  const list = (status: string, file: string) => ({ file, status, marks: [] as string[] });
  assert.deepEqual(passed([list("pass", "tests/b.test.ts"), list("flaky", "tests/c.test.ts"), list("pass", "tests/a.test.ts"), list("skipped", "tests/d.test.ts"), list("fail", "tests/e.test.ts")]), ["tests/a.test.ts", "tests/b.test.ts"]);
});

test("a report is written under a temporary name and renamed: a write that fails leaves the previous report whole, none is left behind", () => {
  const dir = path.join(root, "atomic-out");
  const meta = { platform: "linux", arch: "x64", node: "v0", commit: "c", jobs: 1, timeoutSeconds: 1, retries: 0, budgetMinutes: null, minutes: 0, endedBy: "running" };
  const one = [{ file: "tests/a.test.ts", status: "pass", marks: [] as string[] }];
  const two = [...one, { file: "tests/b.test.ts", status: "pass", marks: [] as string[] }];
  writeReport(dir, { results: one, meta });
  const previous = readFileSync(path.join(dir, "report.json"), "utf8");
  mkdirSync(path.join(dir, "report.json.tmp")); // the temporary name cannot be written, as if the disk or the process failed there
  assert.throws(() => writeReport(dir, { results: two, meta }));
  assert.equal(readFileSync(path.join(dir, "report.json"), "utf8"), previous, "the previous report is untouched");
  rmSync(path.join(dir, "report.json.tmp"), { recursive: true });
  writeReport(dir, { results: two, meta });
  assert.deepEqual(readdirSync(dir).sort(), ["pass.txt", "report.json", "summary.md"], "no temporary file is left behind");
  assert.equal(readFileSync(path.join(dir, "pass.txt"), "utf8"), "tests/a.test.ts\ntests/b.test.ts\n");
});

test("on this repository: no browser file is run, known darwin and live files are marked, and this test is not left out", () => {
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const all = selectTests(repo);
  const marks = (file: string) => all.find((entry) => entry.file === file)?.marks;
  assert.ok(all.length > 100, "the real tests/ directory is read");
  assert.ok(all.filter((entry) => /\.e2e\.test\./.test(entry.file)).every((entry) => !entry.run), "an e2e file is a browser file");
  assert.deepEqual(marks("tests/ci-linux-probe.test.ts"), [], "the probe's own test is run by the probe");
  assert.ok(marks("tests/plugin-sandbox.test.ts")?.includes(DARWIN), "the macOS sandbox test is a darwin file");
  assert.ok(marks("tests/prologue-node-live.test.ts")?.includes("live"), "the live Prologue test is a live file");
});

// Decision #14: the probe informs and does not block, and its own rules are checked by the blocking job. Until the decision is
// carried out (about two weeks of runs, then the probe joins Verify) these lines of .github/workflows/ci.yml must stay as they are;
// carrying it out means changing this test in the same pull request.
const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");
const jobBlock = (name: string) => {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `ci.yml has a job ${name}`);
  const length = lines.slice(start + 1).findIndex((line) => /^  [A-Za-z0-9_-]+:\s*$/.test(line));
  return lines.slice(start, length === -1 ? undefined : start + 1 + length).join("\n");
};

test("ci.yml: the Linux probe is an ubuntu job that cannot fail the workflow and that Verify does not wait for", () => {
  const probeJob = jobBlock("linux-probe");
  assert.match(probeJob, /^    runs-on: ubuntu-latest$/m);
  assert.match(probeJob, /^    continue-on-error: true$/m, "a red probe must not turn the workflow red");
  assert.match(probeJob, /node scripts\/ci-linux-probe\.mjs --expect-platform linux /, "the probe refuses to record results from another platform");
  assert.match(probeJob, /run: exec node scripts\/ci-linux-probe\.mjs /, "the probe is the step's own process, so a cancel's signal reaches it and not only the shell around it");
  assert.match(probeJob, /uses: actions\/upload-artifact@/);
  // The workflow cancels a superseded run (cancel-in-progress) and the job has a time limit; the report is kept for those too.
  assert.match(probeJob, /- name: Keep the report\n\s+if: \$\{\{ always\(\) \}\}\n\s+uses: actions\/upload-artifact@/, "the upload runs when the job is cancelled or timed out");
  assert.match(probeJob, /^    timeout-minutes: \d+$/m, "a stuck run is stopped by the job, which cancels it and lets the probe write its partial report");
  const needs = workflow.split("\n").filter((line) => /^\s*needs:|^\s+- \S+\s*$/.test(line) && !/^\s+- (name|uses|run):/.test(line));
  assert.ok(needs.every((line) => !line.includes("linux-probe")), `no job needs linux-probe: ${needs.join(" | ")}`);
  assert.match(jobBlock("verify"), /^    name: Verify$/m, "the required check keeps its name");
});

test("ci.yml: the blocking job runs the probe's own rules", () => {
  assert.match(jobBlock("architecture-boundaries"), /run: node scripts\/run-tests\.mjs tests\/ci-linux-probe\.test\.ts$/m);
});
