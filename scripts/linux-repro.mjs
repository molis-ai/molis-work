#!/usr/bin/env node
// Runs test files in a Linux container close to the full suite's runner, on a development machine with Docker (Colima, OrbStack,
// Docker Desktop): node scripts/linux-repro.mjs tests/a.e2e.test.ts [more files] [--test-name-pattern=…] [--rebuild]
//
// For a test that is red on CI and green on the Mac (docs/system/PARALLEL-DEVELOPMENT.md §8.1). The image (scripts/linux-repro/Dockerfile)
// has the runner's fonts; what it does not match is written there. The container tests a clone of this checkout's HEAD, so commit
// first: uncommitted changes are not in it. Its clone, installed dependencies and build live in a Docker volume and are reused; a run
// fetches and checks out HEAD every time. It installs and builds again with --rebuild (after a change to a package, `src` or a lockfile;
// the first run always builds).
// Any other argument goes to scripts/run-tests.mjs, which runs one file at a time. Environment: MOLIS_WORK_TEST_CPU_THROTTLE is passed on.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE = "molis-work-linux-repro";
const VOLUME = "molis-work-linux-repro-home";
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const rebuild = args.includes("--rebuild");
const passed = args.filter((arg) => arg !== "--rebuild");
if (!passed.some((arg) => !arg.startsWith("--"))) {
  console.error("usage: node scripts/linux-repro.mjs <test files…> [--test-name-pattern=…] [--rebuild]");
  process.exit(2);
}
const git = (...args) => execFileSync("git", args, { cwd: here, encoding: "utf8" }).trim();
const top = git("rev-parse", "--show-toplevel");
const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
const head = git("rev-parse", "--verify", "HEAD");
const docker = (dockerArgs, input) => spawnSync("docker", dockerArgs, { stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"], input });
const built = spawnSync("docker", ["image", "inspect", IMAGE], { stdio: "ignore" }).status === 0;
if (!built && docker(["build", "-t", IMAGE, "-f", join(here, "linux-repro", "Dockerfile"), join(here, "linux-repro")]).status !== 0) process.exit(1);

// The checkout and its Git directory (a worktree's lives in the main checkout's) are mounted read-only at their own paths, so the
// clone inside reads this checkout's commits.
const script = readFileSync(join(here, "linux-repro", "run.sh"));
const mounts = [...new Set([top, common])].flatMap((path) => ["-v", `${path}:${path}:ro`]);
const result = docker(["run", "-i", "--rm", "--shm-size=2g", "-v", `${VOLUME}:/home/runner`, ...mounts,
  "-e", `REBUILD=${rebuild ? "1" : ""}`, "-e", `MOLIS_WORK_TEST_CPU_THROTTLE=${process.env.MOLIS_WORK_TEST_CPU_THROTTLE ?? ""}`,
  IMAGE, "bash", "-s", "--", top, head, ...passed], script);
process.exit(result.status ?? 1);
