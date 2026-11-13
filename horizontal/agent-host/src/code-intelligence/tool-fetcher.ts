/**
 * Fetching a code-analysis tool on demand (Coding A4 的 Q5，用户 2026-11-28 定：缺少时自动下载到平台管理的隔离目录).
 *
 * What this deliberately does **not** do: run package install scripts (`--ignore-scripts`), write into the project, the
 * global npm prefix or the person's environment, or reuse a half-installed directory. Every download goes into one
 * directory per `package@version` under the Home's own tools root, is verified by a marker written last, and is renamed
 * into place only when it is complete — a restart either finds a complete tool or starts over.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where a language server comes from when it is not installed: an npm package at an exact version, and the bin it ships. */
export interface ToolInstallSpec {
  readonly package: string;
  readonly version: string;
  readonly bin: string;
}

export interface ToolFetcherOptions {
  /** The Home's own tools root, e.g. `<Home>/tools/language-servers`; never the project and never a global prefix. */
  readonly toolsRoot: string;
  /** Whether the person has allowed downloads at all; the platform's own network rules stay in force around it. */
  readonly allow: () => boolean | Promise<boolean>;
  readonly registry?: string;
  /** The install itself, injected so the decision, caching and cleanup can be tested without a network. */
  readonly install?: (input: { readonly package: string; readonly version: string; readonly registry: string; readonly destination: string }) => Promise<void>;
  /** A download is bounded: a hung registry is a failure with a retry, not a wedged round. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

const DEFAULT_REGISTRY = "https://registry.npmjs.org";
const DEFAULT_TIMEOUT_MS = 120_000;
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

/** A resolved tool: the absolute executable to start. */
export interface ResolvedTool {
  readonly command: string;
  readonly source: "installed" | "downloaded";
}

const inFlight = new Map<string, Promise<ResolvedTool>>();

function directoryFor(options: ToolFetcherOptions, spec: ToolInstallSpec): string {
  if (!SAFE_NAME.test(spec.package.replace("/", "__")) || !SAFE_NAME.test(spec.version) || !SAFE_NAME.test(spec.bin)) {
    throw new Error(`"${spec.package}@${spec.version}" is not a shape this Host installs: package, version and bin must be plain names`);
  }
  return path.join(options.toolsRoot, spec.package.replace("/", "__"), spec.version);
}

const binPath = (directory: string, bin: string) => path.join(directory, "node_modules", ".bin", bin);

async function installedAlready(directory: string, spec: ToolInstallSpec): Promise<boolean> {
  try {
    const marker = JSON.parse(await readFile(path.join(directory, "installed.json"), "utf8")) as { readonly package?: unknown; readonly version?: unknown; readonly bin?: unknown };
    if (marker.package !== spec.package || marker.version !== spec.version || marker.bin !== spec.bin) return false;
    await readFile(binPath(directory, spec.bin));
    return true;
  } catch { return false; }
}

/**
 * The tool at `spec`, from the isolated tools root, downloading it once if it is not there yet.
 *
 * The same `package@version` is fetched once at a time per process; a second caller waits for the first instead of
 * racing it into the same directory.
 */
export async function ensureTool(spec: ToolInstallSpec, options: ToolFetcherOptions): Promise<ResolvedTool> {
  const directory = directoryFor(options, spec);
  if (await installedAlready(directory, spec)) return { command: binPath(directory, spec.bin), source: "installed" };
  const key = `${directory}\u0000${spec.bin}`;
  const held = inFlight.get(key);
  if (held !== undefined) return held;
  const work = download(spec, options, directory).finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

async function download(spec: ToolInstallSpec, options: ToolFetcherOptions, directory: string): Promise<ResolvedTool> {
  if (!(await options.allow())) {
    throw new Error(`no ${spec.package} is installed and downloads are off; allow them in language-servers.json to fetch ${spec.package}@${spec.version}`);
  }
  const registry = options.registry ?? DEFAULT_REGISTRY;
  const temporary = `${directory}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await mkdir(path.dirname(directory), { recursive: true });
    await rm(temporary, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    await (options.install ?? npmInstall)({ package: spec.package, version: spec.version, registry, destination: temporary });
    // The marker is written **last**, so a directory that has one is complete; anything else is rebuilt.
    await writeFile(path.join(temporary, "installed.json"), JSON.stringify({ package: spec.package, version: spec.version, bin: spec.bin, registry }) + "\n", "utf8");
    await rm(directory, { recursive: true, force: true });
    await rename(temporary, directory);
    return { command: binPath(directory, spec.bin), source: "downloaded" };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(`could not install ${spec.package}@${spec.version}: ${(error as Error).message}; remove ${directory} and retry`);
  }
}

/**
 * `npm install` into the isolated directory only: **no scripts**, no audit, no fund, exact version, explicit registry.
 * The Home's own `MOLIS_WORK_*` environment never reaches the package manager either.
 */
async function npmInstall(input: { readonly package: string; readonly version: string; readonly registry: string; readonly destination: string }): Promise<void> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("MOLIS_WORK_")));
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["install", "--prefix", input.destination, "--no-save", "--ignore-scripts", "--no-audit", "--no-fund",
      "--registry", input.registry, `${input.package}@${input.version}`], {
      cwd: input.destination, stdio: ["ignore", "ignore", "pipe"], env, shell: false,
    });
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("the download did not finish in time")); }, DEFAULT_TIMEOUT_MS);
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-2_000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(); else reject(new Error(`npm install exited ${String(code)}${stderr ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`));
    });
  });
}
