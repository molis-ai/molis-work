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
