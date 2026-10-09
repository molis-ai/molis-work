// The two checks `--run` makes before it starts a test run, and the run itself. They are the rules of
// docs/system/PARALLEL-DEVELOPMENT.md section 5: tests run against the built `dist`, so a stale build gives results for the old code;
// and one machine runs at most one build or test batch at a time, because both take all the CPU and browser tests time out under load.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { SERIAL_PROCESS_PATTERN } from "./rules.mjs";
import { packageOf } from "./repository.mjs";

/**
 * The processes in `pgrep -fl` output that are a build or a test run. A command line can span lines (a shell given a script),
 * so only lines that start with a pid count; and a shell started with `-c` is dropped: it matches when a script merely mentions
 * run-tests.mjs, while a real run always has its own node or pnpm process, which is listed too.
 */
export function parseProcessList(output, selfPid = process.pid, parentPid = process.ppid) {
  return output.split("\n").map((line) => /^\s*(\d+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), command: match[2] }))
    .filter((item) => item.pid !== selfPid && item.pid !== parentPid && !item.command.includes("affected-tests") && !/^(?:\/\S*\/)?(?:zsh|bash|sh)\s+-\w*c\b/.test(item.command));
}

/** Other builds, test runs and tsc on this machine (not this process, not its parent). `null` when the machine has no pgrep. */
export function busyProcesses(selfPid = process.pid, parentPid = process.ppid) {
  const run = spawnSync("pgrep", ["-fl", SERIAL_PROCESS_PATTERN], { encoding: "utf8" });
  if (run.error || (run.status !== 0 && run.status !== 1)) return null;
  return parseProcessList(run.stdout, selfPid, parentPid);
}

const modified = (file) => statSync(file).mtimeMs;

/**
 * Changed package sources the built `dist` does not reflect: no `dist` at all, or the built counterpart (`src/a/b.ts` is
 * `dist/a/b.js`; with no counterpart, the package entry `dist/index.js`) is older than the source.
 */
export function staleBuilds(root, packages, changes) {
  const stale = [];
  for (const change of changes) {
    const item = packageOf(packages, change.path);
    const source = path.join(root, change.path);
    const match = item && /^src\/(.+)\.(m?)ts$/.exec(change.path.slice(item.dir.length + 1));
    if (!match || change.status === "D" || /\.d\.ts$/.test(change.path) || !existsSync(source)) continue;
    const dist = path.join(root, item.dir, "dist");
    if (!existsSync(dist)) { stale.push({ file: change.path, why: `${item.dir}/dist does not exist` }); continue; }
    const counterpart = path.join(dist, `${match[1]}.${match[2]}js`), entry = path.join(dist, "index.js");
    const built = existsSync(counterpart) ? counterpart : existsSync(entry) ? entry : null;
    if (!built) stale.push({ file: change.path, why: `${item.dir}/dist has no ${path.relative(root, entry)}` });
    else if (modified(source) > modified(built)) stale.push({ file: change.path, why: `newer than ${path.relative(root, built)}` });
  }
  return stale;
}

/** `node scripts/run-tests.mjs <files>` with the terminal; the exit code. */
export function runTests(root, files) {
  const run = spawnSync(process.execPath, [path.join(root, "scripts/run-tests.mjs"), ...files], { cwd: root, stdio: "inherit" });
  return run.status ?? (run.signal ? 128 : 1);
}
