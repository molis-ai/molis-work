import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

const script = readFileSync(new URL("../scripts/linux-repro/run.sh", import.meta.url));
const testArgs = ["tests/source.test.ts", "--test-name-pattern=checked out"];
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: gitEnv, encoding: "utf8" }).trim();
}

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "linux-repro-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin");
  const source = join(root, "source with spaces");
  const volume = join(root, "volume");
  const repo = join(volume, "repo");
  const bin = join(root, "bin");
  const commands = join(root, "commands");
  mkdirSync(join(origin, "scripts"), { recursive: true });
  mkdirSync(volume);
  mkdirSync(bin);
  git(origin, "init", "-q", "-b", "main");
  git(origin, "config", "user.name", "Repro fixture");
  git(origin, "config", "user.email", "repro@example.invalid");
  writeFileSync(join(origin, "package.json"), '{"packageManager":"pnpm@11.9.0"}\n');
  writeFileSync(join(origin, "scripts", "run-tests.mjs"), `import { appendFileSync, readFileSync } from "node:fs";
const version = readFileSync("version", "utf8").trim();
appendFileSync(process.env.REPRO_COMMANDS, "test " + version + " " + JSON.stringify(process.argv.slice(2)) + "\\n");
`);
  writeFileSync(join(origin, "version"), "old\n");
  git(origin, "add", ".");
  git(origin, "commit", "-qm", "Cached source");
  const old = git(origin, "rev-parse", "HEAD");
  writeFileSync(join(origin, "version"), "wanted\n");
  git(origin, "commit", "-qam", "Requested source");
  const wanted = git(origin, "rev-parse", "HEAD");
  git(origin, "worktree", "add", "-q", "--detach", source, wanted);

  // Run the exact Bash script sent to Docker, with a temp directory for the mounted volume and no package downloads.
  writeFileSync(join(bin, "npm"), '#!/bin/sh\nprintf "npm %s\\n" "$1" >> "$REPRO_COMMANDS"\n', { mode: 0o700 });
  writeFileSync(join(bin, "pnpm"), `#!/bin/sh
printf "pnpm %s\\n" "$1" >> "$REPRO_COMMANDS"
if [ "$1" = build ] && [ -n "$REPRO_REPOINT_HEAD" ]; then
  git checkout -q --detach "$REPRO_REPOINT_HEAD"
fi
`, { mode: 0o700 });

  function cache(head: string) {
    rmSync(repo, { recursive: true, force: true });
    mkdirSync(repo);
    git(repo, "init", "-q", "-b", "main");
    git(repo, "fetch", "-q", "--depth=1", "--no-tags", origin, head);
    git(repo, "checkout", "-q", "--detach", head);
  }

  function run({ checkout = source, rebuild = false, repoint = "" } = {}) {
    if (existsSync(commands)) rmSync(commands);
    const result = spawnSync("bash", ["-s", "--", checkout, wanted, ...testArgs], {
      cwd: volume,
      encoding: "utf8",
      input: script,
      timeout: 20_000,
      env: {
        ...gitEnv,
        HOME: volume,
        PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
        REBUILD: rebuild ? "1" : "",
        REPRO_COMMANDS: commands,
        REPRO_REPOINT_HEAD: repoint,
      },
    });
    assert.ifError(result.error);
    const phases = existsSync(commands) ? readFileSync(commands, "utf8").trim().split("\n") : [];
    return { ...result, phases };
  }

  return { root, repo, old, wanted, cache, run };
}

const buildPhases = ["npm config", "npm install", "pnpm install", "pnpm build"];
const wantedTest = `test wanted ${JSON.stringify(["--jobs", "1", ...testArgs])}`;

test("TFLH-02 a fresh volume builds and runs tests at the requested linked-worktree commit", t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(f.repo, "rev-parse", "HEAD"), f.wanted);
  assert.equal(result.stdout, `linux-repro: build HEAD ${f.wanted}\nlinux-repro: test HEAD ${f.wanted}\n`);
  assert.deepEqual(result.phases, [...buildPhases, wantedTest]);
  t.diagnostic(result.stdout.trim());
});

test("TFLH-03 an unreadable source stops both a fresh run and runs with cached code", t => {
  const f = fixture(t);
  const checkout = join(f.root, "unreadable worktree");
  mkdirSync(checkout);
  writeFileSync(join(checkout, ".git"), `gitdir: ${join(f.root, "unmounted-gitdir")}\n`);
  for (const cached of [undefined, f.old, f.wanted]) {
    if (cached) f.cache(cached);
    const result = f.run({ checkout, rebuild: true });
    assert.equal(result.status, 128, result.stderr);
    assert.ok(result.stderr.includes(checkout), result.stderr);
    assert.deepEqual(result.phases, []);
    assert.equal(result.stdout, "");
    if (cached) assert.equal(git(f.repo, "rev-parse", "HEAD"), cached);
    t.diagnostic(`unreadable worktree, volume HEAD ${cached ?? "(empty)"}, exit ${result.status}`);
  }
});

test("TFLH-03 checkout failure stops a run even when the cached HEAD already matches", t => {
  const f = fixture(t);
  f.cache(f.wanted);
  writeFileSync(join(f.repo, ".git", "index.lock"), "");
  const result = f.run({ rebuild: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /index\.lock/);
  assert.deepEqual(result.phases, []);
  assert.equal(result.stdout, "");
  t.diagnostic(`checkout refused at cached HEAD ${git(f.repo, "rev-parse", "HEAD")}, exit ${result.status}`);
});

test("TFLH-04 a reused volume runs the target revision after updating an older checkout", t => {
  const f = fixture(t);
  f.cache(f.old);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(f.repo, "rev-parse", "HEAD"), f.wanted);
  assert.equal(result.stdout, `linux-repro: test HEAD ${f.wanted}\n`);
  assert.deepEqual(result.phases, [wantedTest]);
  t.diagnostic(`old volume HEAD ${f.old}\n${result.stdout.trim()}`);
});

test("TFLH-04 the pre-test check rejects a HEAD changed by the build", t => {
  const f = fixture(t);
  const result = f.run({ repoint: f.old });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, `linux-repro: build HEAD ${f.wanted}\n`);
  assert.equal(result.stderr, `linux-repro: cannot test: expected HEAD ${f.wanted}, found ${f.old}\n`);
  assert.deepEqual(result.phases, buildPhases);
  t.diagnostic((result.stdout + result.stderr).trim());
});
