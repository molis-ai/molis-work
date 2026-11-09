// Trusted exact-commit measurement reuse; a cache miss builds the base in a disposable checkout.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWANCES, sizeMap } from "./page-assets-policy.mjs";

export const MEASURER = fileURLToPath(new URL("./page-assets-measure.mjs", import.meta.url));
export const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 << 20 }).trim();
export function allowanceFiles(root, sha) {
  const files = git(root, "ls-files", "-z", "--", ALLOWANCES).split("\0").filter(file => file && file !== `${ALLOWANCES}README.md`);
  for (const file of files) if (!/^tooling\/gates\/page-asset-allowances\/[a-z0-9][a-z0-9-]*\.json$/.test(file)) throw new Error(`invalid allowance filename ${file}`);
  const previous = git(root, "ls-tree", "-r", "--name-only", sha, "--", ALLOWANCES).split("\n").filter(file => file && file !== `${ALLOWANCES}README.md`);
  return {
    current: Object.fromEntries(files.map(file => [file, readFileSync(path.join(root, file), "utf8").trim()])),
    previous: Object.fromEntries(previous.map(file => [file, git(root, "show", `${sha}:${file}`)])),
  };
}

export function measurementKey() {
  return createHash("sha256").update(readFileSync(MEASURER)).update(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
    pnpm: execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim() })).digest("hex").slice(0, 24);
}
export function reportMatches(report, sha, key) {
  try {
    return report?.sha === sha && report?.key === key && Array.isArray(report?.misses) && report.misses.length === 0 && Boolean(sizeMap(report.measured, "cached measurement"));
  } catch { return false; }
}
export function trustedRun(run, sha) {
  return run?.head_sha === sha && run?.path === ".github/workflows/ci.yml" && run?.conclusion === "success"
    && (run.event === "merge_group" || (run.event === "push" && run.head_branch === "main"));
}
export async function cachedMeasurement({ sha, key, repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN, fetch: get = globalThis.fetch, signal }) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) return null;
  let temporary;
  try {
    const api = "https://api.github.com";
    const request = async (route, binary = false) => {
      const response = await get(`${api}/repos/${repo}/${route}`, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`cache request returned ${response.status}`);
      return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
    };
    const runs = await request(`actions/workflows/ci.yml/runs?head_sha=${sha}&status=success&per_page=20`);
    for (const run of (runs.workflow_runs ?? []).filter(run => trustedRun(run, sha))) {
      const list = await request(`actions/runs/${run.id}/artifacts?per_page=100`);
      const artifact = (list.artifacts ?? []).find(item => item.name === `page-assets-${sha}-${key}` && !item.expired && item.size_in_bytes < 1_000_000);
      if (!artifact) continue;
      temporary = mkdtempSync(path.join(tmpdir(), "molis-asset-cache-"));
      const archive = path.join(temporary, "measurement.zip");
      writeFileSync(archive, await request(`actions/artifacts/${artifact.id}/zip`, true));
      const contents = execFileSync("unzip", ["-p", archive, "measurement.json"], { encoding: "utf8", maxBuffer: 1 << 20, stdio: ["ignore", "pipe", "pipe"] });
      const report = JSON.parse(contents);
      rmSync(temporary, { recursive: true, force: true }); temporary = undefined;
      if (reportMatches(report, sha, key)) return report;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Cache access is optional. The mandatory real build below is the only fallback.
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
  return null;
}
export function command(commandName, args, { cwd, signal, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("page asset measurement cancelled")); return; }
    const child = spawn(commandName, args, { cwd, detached: process.platform !== "win32", stdio: capture ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"] });
    let stdout = "", stderr = "", killTimer;
    const kill = kind => {
      try { process.kill(process.platform === "win32" ? child.pid : -child.pid, kind); } catch (error) { if (error.code !== "ESRCH") reject(error); }
    };
    const abort = () => { kill("SIGTERM"); killTimer = setTimeout(() => kill("SIGKILL"), 2_000); };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", data => { stdout += data; }); child.stderr?.on("data", data => { stderr += data; });
    child.on("error", reject);
    child.on("close", code => {
      clearTimeout(killTimer); signal?.removeEventListener("abort", abort);
      if (signal?.aborted) { kill("SIGKILL"); reject(new Error("page asset measurement cancelled")); }
      else if (code !== 0) reject(new Error(`${commandName} ${args.join(" ")} failed (${code}): ${stderr.trim()}`));
      else resolve(stdout);
    });
  });
}
export async function measure(root, probe, signal) {
  const temporary = mkdtempSync(path.join(tmpdir(), "molis-asset-probe-"));
  try {
    const file = path.join(temporary, "paths.json"); writeFileSync(file, JSON.stringify(probe));
    return JSON.parse(await command(process.execPath, [MEASURER, root, file], { cwd: root, signal, capture: true }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
export async function withBuiltBaseline(root, sha, signal, operation, {
  run = command, build = "workspace:build", offline = false,
} = {}) {
  signal?.throwIfAborted();
  const temporary = mkdtempSync(path.join(tmpdir(), "molis-asset-base-")), checkout = path.join(temporary, "checkout");
  let added = false;
  try {
    git(root, "worktree", "add", "--detach", checkout, sha);
    added = true;
    await run("pnpm", ["install", "--frozen-lockfile", offline ? "--offline" : "--prefer-offline"], { cwd: checkout, signal });
    await run("pnpm", [build], { cwd: checkout, signal });
    return await operation(checkout);
  } finally {
    // Only this function's newly created checkout; never an existing worktree or the user's Home.
    try { if (added) git(root, "worktree", "remove", "--force", checkout); }
    finally { rmSync(temporary, { recursive: true, force: true }); }
  }
}
export async function buildBaseline(root, sha, signal, run = command) {
  return withBuiltBaseline(root, sha, signal, checkout => measure(checkout, [], signal), { run });
}
