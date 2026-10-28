// The parallel run of scripts/run-tests.mjs (specs/repository-anti-corruption W5-12, scripts/run-tests/pool.mjs): several files at once,
// each in its own process with its own MOLIS_WORK_HOME, browser files capped on their own, the longest first, a failing file shown
// and the run red.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { plan, readDurations, runQueue, writeDurations } from "../scripts/run-tests/pool.mjs";

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

test("--skip-macos-only: a file the Linux probe marks darwin is left out, a browser file stays, and the rest run", () => {
  const made = directory();
  const seen = path.join(made, "seen");
  const write = (name: string, note: string) => {
    const file = path.join(made, name);
    writeFileSync(file, `import test from "node:test";\nimport { appendFileSync } from "node:fs";\n// ${note}\ntest(${JSON.stringify(name)}, () => { appendFileSync(${JSON.stringify(seen)}, ${JSON.stringify(`${name}\n`)}); });\n`);
    return file;
  };
  // The two platform words are put together at run time: written whole here they would mark this file itself macOS-only.
  const launchAgentTool = ["launch", "ctl"].join(""), mac = ["dar", "win"].join("");
  const files = [write("plain.test.mjs", "nothing platform-specific"), write("agent.test.mjs", `starts a ${launchAgentTool} job`), write("page.e2e.test.mjs", `skips unless the platform is "${mac}"`)];
  const run = spawnSync(process.execPath, [runner, "--skip-macos-only", "--jobs", "2", ...files], { encoding: "utf8", timeout: 120_000 });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.match(output, /left out 1 macOS-only files of 3/);
  assert.deepEqual(readFileSync(seen, "utf8").trim().split("\n").sort(), ["page.e2e.test.mjs", "plain.test.mjs"]);
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

  // MEM-CI-TRACE-01: the final failure must retain its own diagnosis without a verbose flag.
  const brokenMarker = path.join(made, "broken-tried");
  const broken = write("broken.test.mjs", `const retry = existsSync(${JSON.stringify(brokenMarker)}); writeFileSync(${JSON.stringify(brokenMarker)}, ""); throw new Error(retry ? "retry diagnostic sentinel" : "initial diagnostic sentinel");`);
  const twice = spawnSync(process.execPath, [runner, "--retries", "1", "--jobs", "2", broken, steady], { encoding: "utf8", timeout: 120_000 });
  const again = `${twice.stdout}${twice.stderr}`;
  assert.equal(twice.status, 1, again);
  assert.match(again, /initial diagnostic sentinel/);
  assert.match(again, /retry diagnostic sentinel/, "the actual retry failure is reported without --verbose");
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
