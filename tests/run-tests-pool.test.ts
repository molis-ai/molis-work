// The parallel run of scripts/run-tests.mjs (specs/archive/repository-anti-corruption W5-12, scripts/run-tests/pool.mjs): several files at once,
// each in its own process with its own MOLIS_WORK_HOME, browser files capped on their own, the longest first, a failing file shown
// and the run red.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { plan, readDurations, runQueue, writeDurations } from "../scripts/run-tests/pool.mjs";
import { gateRuleFiles, isGateMetaTest, isVisualAuditTest, VISUAL_AUDIT_TESTS } from "../scripts/run-tests/strata.mjs";

const runner = fileURLToPath(new URL("../scripts/run-tests.mjs", import.meta.url));
const scratch: string[] = [];
const directory = () => { const made = mkdtempSync(path.join(tmpdir(), "molis-run-tests-pool-")); scratch.push(made); return made; };
after(() => { for (const made of scratch) rmSync(made, { recursive: true, force: true }); });

test("plan: the longest expected file starts first; a file with no recorded duration is guessed, longer for a browser file; ties keep the caller's order", () => {
  const entries = [
    { file: "tests/a.test.ts", browser: false },
    { file: "tests/b.e2e.test.ts", browser: true },
    { file: "tests/c.test.ts", browser: false },
    { file: "tests/e.test.ts", browser: false },
    { file: "tests/d.test.ts", browser: false },
  ];
  const order = plan(entries, { "tests/a.test.ts": 3, "tests/c.test.ts": 120 }).map((entry) => entry.file);
  assert.deepEqual(order, ["tests/c.test.ts", "tests/b.e2e.test.ts", "tests/e.test.ts", "tests/d.test.ts", "tests/a.test.ts"]);
  assert.deepEqual(Object.keys(plan(entries, {})[0]).sort(), ["browser", "expected", "file"]);
});

test("CIP-07 a new shard starts known long files first before it has a private duration cache", () => {
  const entries = [{ file: "quick", browser: false }, { file: "slow", browser: true }, { file: "medium", browser: true }];
  const weights = { quick: 10, slow: 600, medium: 120 };
  assert.deepEqual(plan(entries, {}, weights).map(entry => entry.file), ["slow", "medium", "quick"]);
  assert.deepEqual(plan(entries, { medium: 800 }, weights).map(entry => entry.file), ["medium", "slow", "quick"], "a runner can refine its own start order without changing shard ownership");
});

test("runQueue: never more than `jobs` files at once nor more than `browserJobs` browser files, and every file runs once", async () => {
  const queue = [
    ...Array.from({ length: 5 }, (_, index) => ({ file: `tests/e2e-${index}.e2e.test.ts`, browser: true })),
    ...Array.from({ length: 7 }, (_, index) => ({ file: `tests/unit-${index}.test.ts`, browser: false })),
  ];
  let running = 0, browsers = 0, most = 0, mostBrowsers = 0;
  const started: string[] = [];
  const results = await runQueue(queue, {
    jobs: 3, browserJobs: 1,
    runFile: async (entry: { file: string; browser: boolean }) => {
      started.push(entry.file);
      running += 1; if (entry.browser) browsers += 1;
      most = Math.max(most, running); mostBrowsers = Math.max(mostBrowsers, browsers);
      await new Promise((resolve) => setTimeout(resolve, entry.browser ? 15 : 5));
      running -= 1; if (entry.browser) browsers -= 1;
      return entry.file;
    },
  });
  assert.equal(most, 3);
  assert.equal(mostBrowsers, 1, "a second browser file waits while non-browser files take the free slots");
  assert.deepEqual([...started].sort(), queue.map((entry) => entry.file).sort());
  assert.equal(results.length, queue.length);
  // The first browser file starts at once; the others wait for it while the unit files fill the other slots.
  assert.deepEqual(started.slice(0, 3), ["tests/e2e-0.e2e.test.ts", "tests/unit-0.test.ts", "tests/unit-1.test.ts"]);
});

test("runQueue: an empty queue resolves at once", async () => {
  assert.deepEqual(await runQueue([], { jobs: 2, browserJobs: 1, runFile: async () => assert.fail("nothing to run") }), []);
});

test("durations: a missing or unreadable file reads as no durations, and a written one reads back", () => {
  const made = directory();
  const file = path.join(made, "cache", "durations.json");
  assert.deepEqual(readDurations(file), {});
  writeFileSync(path.join(made, "broken.json"), "{");
  assert.deepEqual(readDurations(path.join(made, "broken.json")), {});
  writeDurations(file, { "tests/a.test.ts": 2.5 });
  assert.deepEqual(readDurations(file), { "tests/a.test.ts": 2.5 });
});

test("several files: each runs in its own process with its own MOLIS_WORK_HOME; one failing file makes the run red and is shown", () => {
  const made = directory();
  const seen = path.join(made, "seen");
  const writer = (name: string, body: string) => {
    const file = path.join(made, `${name}.test.mjs`);
    writeFileSync(file, `import test from "node:test";
import { appendFileSync } from "node:fs";
test(${JSON.stringify(name)}, () => {
  appendFileSync(${JSON.stringify(seen)}, JSON.stringify({ name: ${JSON.stringify(name)}, home: process.env.MOLIS_WORK_HOME, env: process.env.NODE_ENV, backend: process.env.MOLIS_WORK_SECRET_BACKEND, pid: process.pid }) + "\\n");
  ${body}
});
`);
    return file;
  };
  const files = [writer("one", ""), writer("two", ""), writer("three", 'throw new Error("planted failure");')];
  const run = spawnSync(process.execPath, [runner, "--jobs", "3", ...files], { encoding: "utf8", env: { ...process.env, MOLIS_WORK_HOME: path.join(made, "inherited") }, timeout: 120_000 });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 1, output);
  assert.match(output, /3 files, 3 at a time/);
  assert.match(output, /FAIL\s+\S*three\.test\.mjs/);
  assert.match(output, /planted failure/, "the failing file's own output is printed");
  assert.match(output, /2 of 3 files passed/);
  assert.match(output, /again: node scripts\/run-tests\.mjs \S*three\.test\.mjs$/m);
  const records = readFileSync(seen, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { name: string; home: string; env: string; backend: string; pid: number });
  assert.equal(records.length, 3);
  assert.equal(new Set(records.map((record) => record.home)).size, 3, "one Home per file");
  assert.equal(new Set(records.map((record) => record.pid)).size, 3, "one process per file");
  for (const record of records) {
    assert.notEqual(record.home, path.join(made, "inherited"), "the caller's Home is never handed on");
    assert.equal(record.env, "test");
    assert.equal(record.backend, "file");
    assert.equal(existsSync(record.home), false, "each file's Home is removed after it");
  }
  assert.deepEqual(readdirSync(made).filter((name) => name === "inherited"), [], "nothing was written to the caller's Home");
});

test("CIP-11: the default runner starts one file locally and uses CI capacity on a runner", () => {
  const made = directory();
  const files = ["a", "b"].map(name => {
    const file = path.join(made, `${name}.test.mjs`);
    writeFileSync(file, 'import test from "node:test"; test("fixture", () => {});');
    return file;
  });
  const env = { ...process.env };
  delete env.MOLIS_WORK_TEST_JOBS;
  const ciSlots = Math.max(1, Math.min(files.length, Math.floor(availableParallelism() / 2)));
  for (const [ci, expected] of [["false", 1], ["true", ciSlots]] as const) {
    const run = spawnSync(process.execPath, [runner, ...files], { env: { ...env, CI: ci }, encoding: "utf8", timeout: 30_000 });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes(`2 files, ${expected} at a time`), run.stdout);
  }
});

test("options: a jobs count that is not a whole number of at least 1 is refused before anything runs", () => {
  for (const value of ["0", "two", "1.5"]) {
    const run = spawnSync(process.execPath, [runner, "--jobs", value, "tests/a.test.ts", "tests/b.test.ts"], { encoding: "utf8" });
    assert.equal(run.status, 2, `--jobs ${value}`);
    assert.match(run.stderr, /--jobs needs a whole number of at least 1/);
  }
  const fromEnvironment = spawnSync(process.execPath, [runner, "tests/a.test.ts", "tests/b.test.ts"], { encoding: "utf8", env: { ...process.env, MOLIS_WORK_TEST_JOBS: "none" } });
  assert.equal(fromEnvironment.status, 2);
  assert.match(fromEnvironment.stderr, /MOLIS_WORK_TEST_JOBS needs a whole number/);
});

test("--shard: the same list in n jobs gives every file to exactly one of them, and a shard with no file passes", () => {
  const made = directory();
  const seen = path.join(made, "seen");
  const files = ["a", "b", "c", "d", "e"].map((name) => {
    const file = path.join(made, `${name}.test.mjs`);
    writeFileSync(file, `import test from "node:test";\nimport { appendFileSync } from "node:fs";\ntest(${JSON.stringify(name)}, () => { appendFileSync(${JSON.stringify(seen)}, ${JSON.stringify(`${name}\n`)}); });\n`);
    return file;
  });
  const shard = (which: string, list = files) => spawnSync(process.execPath, [runner, "--shard", which, "--jobs", "2", ...list], { encoding: "utf8", timeout: 120_000 });
  const first = shard("1/2"), second = shard("2/2");
  assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
  assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
  assert.deepEqual(readFileSync(seen, "utf8").trim().split("\n").sort(), ["a", "b", "c", "d", "e"]);
  const empty = shard("3/3", files.slice(0, 2));
  assert.equal(empty.status, 0);
  assert.match(empty.stdout, /shard 3\/3 of 2 files has no file/);
  for (const wrong of ["0/2", "3/2", "two"]) {
    const refused = shard(wrong);
    assert.equal(refused.status, 2, wrong);
    assert.match(refused.stderr, /--shard needs <k>\/<n>/);
  }
});

test("TSA-04 --skip-macos-only runs mixed files, skips declared files, and keeps an empty selection empty", () => {
  const made = directory();
  const seen = path.join(made, "seen");
  const write = (name: string, note: string) => {
    const file = path.join(made, name);
    writeFileSync(file, `// ${note}\nimport test from "node:test";\nimport { appendFileSync } from "node:fs";\ntest("runs", () => appendFileSync(${JSON.stringify(seen)}, ${JSON.stringify(name + "\n")}));\n`);
    return file;
  };
  const native = write("native.test.mjs", "@requires-platform darwin");
  const mixed = write("mixed.test.mjs", "uses a fake Keychain");
  const page = write("page.e2e.test.mjs", "browser");
  const execute = (...files: string[]) => spawnSync(process.execPath, [runner, "--skip-macos-only", "--jobs", "1", ...files],
    { encoding: "utf8", timeout: 120_000, cwd: made });
  const run = execute(native, mixed, page);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /left out 1 macOS-only files of 3/);
  const ran = readFileSync(seen, "utf8").trim().split("\n").sort();
  assert.deepEqual(ran, ["mixed.test.mjs", "page.e2e.test.mjs"]);
  const empty = execute(native);
  assert.equal(empty.status, 0, empty.stdout + empty.stderr);
  assert.match(empty.stdout, /0 of 0 files/);
  assert.deepEqual(readFileSync(seen, "utf8").trim().split("\n").sort(), ran);
});

test("TSA-04 a skipped file is reported separately and an empty retry cannot erase a failure", () => {
  const made = directory(), file = path.join(made, "conditional.test.mjs"), marker = path.join(made, "attempted");
  writeFileSync(file, `import test from "node:test";
import { existsSync, writeFileSync } from "node:fs";
test("conditional", { skip: existsSync(${JSON.stringify(marker)}) }, () => {
  writeFileSync(${JSON.stringify(marker)}, ""); throw new Error("first attempt failed");
});`);
  const run = (...options: string[]) => spawnSync(process.execPath, [runner, "--jobs", "1", "--retries", "1", ...options, file],
    { encoding: "utf8", timeout: 120_000 });
  for (const options of [[], ["--bail"]]) {
    rmSync(marker, { force: true });
    const failed = run(...options);
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.match(failed.stdout, /failed \(1\):\n\s+fail/);
    assert.match(failed.stdout, /first attempt failed/);
    const skipped = run(...options);
    assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
    assert.match(skipped.stdout, /0 of 1 files passed \(1 entirely skipped\)/);
  }
});

test("--retries: a file that fails and then passes is listed as flaky and does not fail the run; one that fails every time still does", () => {
  const made = directory();
  const write = (name: string, body: string) => { const file = path.join(made, name); writeFileSync(file, `import test from "node:test";\nimport { existsSync, writeFileSync } from "node:fs";\ntest(${JSON.stringify(name)}, () => { ${body} });\n`); return file; };
  const marker = path.join(made, "tried");
  const flaky = write("flaky.test.mjs", `if (!existsSync(${JSON.stringify(marker)})) { writeFileSync(${JSON.stringify(marker)}, ""); throw new Error("first try fails"); }`);
  const steady = write("steady.test.mjs", "");
  const once = spawnSync(process.execPath, [runner, "--retries", "1", "--jobs", "2", flaky, steady], { encoding: "utf8", timeout: 120_000 });
  const output = `${once.stdout}${once.stderr}`;
  assert.equal(once.status, 0, output);
  assert.match(output, /\[retry 1\] ok\s+\S*flaky\.test\.mjs/);
  assert.match(output, /2 of 2 files passed \(1 only on a retry\)/);
  assert.match(output, /flaky, failed and then passed on a retry \(1\):\n\s+\S*flaky\.test\.mjs/);
  assert.doesNotMatch(output, /^failed \(/m);

  const broken = write("broken.test.mjs", 'throw new Error("always");');
  const twice = spawnSync(process.execPath, [runner, "--retries", "1", "--jobs", "2", broken, steady], { encoding: "utf8", timeout: 120_000 });
  const again = `${twice.stdout}${twice.stderr}`;
  assert.equal(twice.status, 1, again);
  assert.match(again, /\[retry 1\] FAIL\s+\S*broken\.test\.mjs/);
  assert.match(again, /1 of 2 files passed in/);
  assert.match(again, /failed \(1\):\n\s+fail\s+\S*broken\.test\.mjs/);
});

test("--bail: a file that still fails after its retry stops the run, so the files after it never start; a flaky one does not", () => {
  const made = directory();
  const seen = path.join(made, "seen");
  const write = (name: string, body: string) => { const file = path.join(made, name); writeFileSync(file, `import test from "node:test";\nimport { appendFileSync, existsSync, writeFileSync } from "node:fs";\ntest(${JSON.stringify(name)}, () => { appendFileSync(${JSON.stringify(seen)}, ${JSON.stringify(`${name}\n`)}); ${body} });\n`); return file; };
  const marker = path.join(made, "tried");
  const flaky = write("flaky.test.mjs", `if (!existsSync(${JSON.stringify(marker)})) { writeFileSync(${JSON.stringify(marker)}, ""); throw new Error("first try fails"); }`);
  const broken = write("broken.test.mjs", 'throw new Error("always");');
  const later = [write("later-1.test.mjs", ""), write("later-2.test.mjs", "")];
  // One at a time, in the order named (no recorded durations): the flaky file, then the broken one, then the two that never start.
  const run = spawnSync(process.execPath, [runner, "--retries", "1", "--bail", "--jobs", "1", flaky, broken, ...later], { encoding: "utf8", timeout: 120_000 });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 1, output);
  assert.match(output, /\[retry 1\] ok\s+\S*flaky\.test\.mjs/, "the flaky file is retried at once and passes");
  assert.match(output, /\[retry 1\] FAIL\s+\S*broken\.test\.mjs/);
  assert.match(output, /1 of 4 files passed \(1 only on a retry\)/);
  assert.match(output, /stopped at the first failure \(--bail\): 2 of 4 files did not run or were stopped/);
  assert.match(output, /failed \(1\):\n\s+fail\s+\S*broken\.test\.mjs/);
  assert.deepEqual(readFileSync(seen, "utf8").trim().split("\n"), ["flaky.test.mjs", "flaky.test.mjs", "broken.test.mjs", "broken.test.mjs"], "nothing after the failure started");
});

// A fixture file that logs `<name>-attempt-<n>` (n counting the runs of this file) and then fails the first `failures` attempts.
const attemptFixture = (made: string, name: string, failures: number, extra = "") => {
  const file = path.join(made, `${name}.test.mjs`);
  const counter = path.join(made, `${name}.attempts`);
  writeFileSync(file, `import test from "node:test";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
test(${JSON.stringify(name)}, async () => {
  appendFileSync(${JSON.stringify(counter)}, "x");
  const attempt = readFileSync(${JSON.stringify(counter)}, "utf8").length;
  console.log(${JSON.stringify(`${name}-attempt-`)} + attempt);
  ${extra}
  if (attempt <= ${failures}) throw new Error("failing on purpose");
});
`);
  return file;
};
const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

test("RAC-2450 --bail: a file that fails and then passes on its retry still shows the output of the failed attempt, before its retry line, and is listed as flaky", () => {
  const made = directory();
  const flaky = attemptFixture(made, "flaky", 1);
  const steady = attemptFixture(made, "steady", 0);
  const run = spawnSync(process.execPath, [runner, "--retries", "1", "--bail", "--jobs", "1", flaky, steady], { encoding: "utf8", timeout: 120_000 });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.equal(occurrences(output, "flaky-attempt-1"), 1, `the failed first attempt is shown once\n${output}`);
  assert.equal(occurrences(output, "flaky-attempt-2"), 0, "the passing retry prints nothing of its own, as before");
  assert.ok(output.indexOf("flaky-attempt-1") < output.search(/\[retry 1\] ok\s+\S*flaky\.test\.mjs/), "the failed output comes before the retry line");
  assert.match(output, /flaky, failed and then passed on a retry \(1\):\n\s+\S*flaky\.test\.mjs/);
});

test("RAC-2451 --bail: every failed attempt of a file that keeps failing shows its output exactly once", () => {
  const made = directory();
  const broken = attemptFixture(made, "broken", 3);
  const other = attemptFixture(made, "other", 0);
  const run = spawnSync(process.execPath, [runner, "--retries", "2", "--bail", "--jobs", "1", broken, other], { encoding: "utf8", timeout: 120_000 });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 1, output);
  for (const attempt of [1, 2, 3]) assert.equal(occurrences(output, `broken-attempt-${attempt}`), 1, `attempt ${attempt} is shown once\n${output}`);
  assert.match(output, /\[retry 1\] FAIL\s+\S*broken\.test\.mjs/);
  assert.match(output, /\[retry 2\] FAIL\s+\S*broken\.test\.mjs/);
  assert.equal(occurrences(output, "other-attempt"), 0, "nothing after the failing file started");
});

test("RAC-2452 --bail: the timeout note belongs to the attempt that was killed and appears once", () => {
  const made = directory();
  const slow = attemptFixture(made, "slow", 0, "if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 60_000));");
  const steady = attemptFixture(made, "steady", 0);
  const run = spawnSync(process.execPath, [runner, "--retries", "1", "--bail", "--jobs", "1", "--timeout-seconds", "10", slow, steady], { encoding: "utf8", timeout: 120_000 });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.equal(occurrences(output, "(killed after 10 s)"), 1, output);
  assert.ok(output.indexOf("(killed after 10 s)") < output.search(/\[retry 1\] ok\s+\S*slow\.test\.mjs/), "the note comes before the retry line");
});

test("CIP-06 CIP-08 a single-file shard keeps timeout, retries, failure status and timed summaries", () => {
  const made = directory();
  const slow = attemptFixture(made, "slow", 0, "if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 60_000));");
  const shard = (file: string) => spawnSync(process.execPath, [runner, "--shard", "1/1", "--retries", "1", "--jobs", "1", "--timeout-seconds", "10", file], { encoding: "utf8", timeout: 120_000 });
  const recovered = shard(slow);
  const recovery = `${recovered.stdout}${recovered.stderr}`;
  assert.equal(recovered.status, 0, recovery);
  assert.equal(occurrences(recovery, "(killed after 10 s)"), 1, recovery);
  assert.match(recovery, /\[retry 1\] ok\s+\S*slow\.test\.mjs/);
  assert.match(recovery, /1 of 1 files passed \(1 only on a retry\)/);

  const broken = shard(attemptFixture(made, "broken", 3));
  const failure = `${broken.stdout}${broken.stderr}`;
  assert.equal(broken.status, 1, failure);
  assert.match(failure, /\[retry 1\] FAIL\s+\S*broken\.test\.mjs/);
  assert.match(failure, /0 of 1 files passed/);

  const stable = shard(attemptFixture(made, "stable", 0));
  const success = `${stable.stdout}${stable.stderr}`;
  assert.equal(stable.status, 0, success);
  assert.match(success, /\[1\/1\] ok\s+\S*stable\.test\.mjs\s+\d+(?:\.\d+)?s\s+1\/1 tests/);
  assert.match(success, /1 of 1 files passed in/);
});

test("single file with explicit --retries or --timeout-seconds enters the coordinator pool while plain single-file runs stay direct", () => {
  const made = directory();
  const flaky = attemptFixture(made, "single-flaky", 1);
  const retried = spawnSync(process.execPath, [runner, "--retries", "1", flaky], { encoding: "utf8", timeout: 120_000 });
  const retriedOutput = `${retried.stdout}${retried.stderr}`;
  assert.equal(retried.status, 0, retriedOutput);
  assert.match(retriedOutput, /run-tests: 1 files, 1 at a time/);
  assert.match(retriedOutput, /\[retry 1\] ok\s+\S*single-flaky\.test\.mjs/);
  assert.match(retriedOutput, /1 of 1 files passed \(1 only on a retry\)/);

  const slow = attemptFixture(made, "single-slow", 0, "await new Promise((resolve) => setTimeout(resolve, 60_000));");
  const timedOut = spawnSync(process.execPath, [runner, "--timeout-seconds", "3", slow], { encoding: "utf8", timeout: 60_000 });
  const timedOutOutput = `${timedOut.stdout}${timedOut.stderr}`;
  assert.equal(timedOut.status, 1, timedOutOutput);
  assert.match(timedOutOutput, /run-tests: 1 files, 1 at a time/);
  assert.match(timedOutOutput, /\(killed after 3 s\)/);
  assert.match(timedOutOutput, /0 of 1 files passed/);

  const direct = spawnSync(process.execPath, [runner, attemptFixture(made, "single-direct", 0)], { encoding: "utf8", timeout: 60_000 });
  const directOutput = `${direct.stdout}${direct.stderr}`;
  assert.equal(direct.status, 0, directOutput);
  assert.doesNotMatch(directOutput, /run-tests: 1 files, 1 at a time/);
  assert.match(directOutput, /single-direct-attempt-1/);
});

test("strata: VISUAL_AUDIT_TESTS exist on disk, isGateMetaTest excludes only gate/CI self-tests, and --exclude-* flags filter before sharding", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  assert.equal(VISUAL_AUDIT_TESTS.length, 13);
  for (const file of VISUAL_AUDIT_TESTS) {
    assert.equal(existsSync(path.join(root, file)), true, `${file} exists`);
    assert.equal(isVisualAuditTest(file), true, file);
    assert.equal(isGateMetaTest(file), false, `${file} is visual audit, not gate meta`);
  }
  for (const file of ["tests/health-gates-lint.test.ts", "tests/ci-install.test.ts", "tests/ci-font-install.test.ts", "tests/run-tests-pool.test.ts", "tests/affected-tests.test.ts", "tests/studio-replay.test.ts"]) {
    assert.equal(isGateMetaTest(file), true, file);
  }
  const ciWorkflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const disk = readdirSync(path.join(root, "tests")).map(name => `tests/${name}`);
  const gateRules = gateRuleFiles(disk, "");
  for (const file of ["tests/secret-scan.test.ts", "tests/health-gates-dual-instance.test.ts"]) {
    assert.equal(gateRules.includes(file), false, `${file} runs exactly once in the invariant step`);
  }
  assert.ok(ciWorkflow.includes('run: node scripts/run-tests.mjs --gate-rules "$SELECTED_GATE_TESTS"'));
  assert.deepEqual(gateRuleFiles(disk, JSON.stringify(["tests/ci-install.test.ts", "tests/ci-install.test.ts"])), ["tests/ci-install.test.ts"]);
  for (const invalid of ["[]", "not json", '["tests/missing.test.ts"]', '["tests/ci-install.test.ts","tests/account-session.test.ts"]']) {
    assert.deepEqual(gateRuleFiles(disk, invalid), gateRules, "CIP-12 invalid selection runs every gate rule");
  }
  assert.throws(() => gateRuleFiles(disk.filter(file => file !== "tests/ci-install.test.ts"), ""), /Missing gate self-tests/);
  for (const name of readdirSync(path.join(root, "tests"))) {
    const file = `tests/${name}`;
    if (!/\.test\.(?:ts|mjs)$/.test(name) || !isGateMetaTest(file)) continue;
    const covered = ciWorkflow.includes(name) || gateRules.includes(file);
    assert.equal(covered, true, `${file} excluded by --exclude-gate-meta must be covered by .github/workflows/ci.yml`);
  }
  for (const file of ["tests/security-invariants-home-snapshot-entries.test.ts", "tests/todo.e2e.test.ts", "tests/goals-refresh.e2e.test.ts", "tests/plugin-manifest.test.ts", "tests/package-boundary-must-contain.test.mjs"]) {
    assert.equal(isGateMetaTest(file), false, `${file} is a product/security test`);
    assert.equal(isVisualAuditTest(file), false, `${file} stays in PR full-suite`);
  }
  const run = spawnSync(process.execPath, [runner, "--exclude-gate-meta", "--exclude-visual-audit", "--shard", "1/1", "tests/ci-install.test.ts", "tests/chinese-walkthrough.e2e.test.ts"], { encoding: "utf8", timeout: 60_000 });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.match(output, /left out 1 gate-meta files of 2/);
  assert.match(output, /left out 1 visual-audit files of 1/);
  assert.match(output, /shard 1\/1 of 0 files has no file/);
});
