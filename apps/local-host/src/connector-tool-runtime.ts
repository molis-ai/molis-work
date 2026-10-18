import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { existsSync, mkdtempSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { cliExecutable } from "./connector-tool-executable.js";
import { exactToolVersion } from "./connector-tool-source.js";
import { extractRuntimeArchive, managedToolDirectory, runtimeReleaseBytes } from "./connector-tool-download.js";
import { runToolInstallProcess, toolInstallErrors, type ToolInstallControl } from "./connector-tool-process.js";

const UV_BOOTSTRAP_VERSION = "0.12.19";
const supportedTarget = () => {
  if (!["darwin", "linux"].includes(process.platform) || !["arm64", "x64"].includes(process.arch)) throw toolInstallErrors.invalid("此平台尚无受管理运行时安装路径；已有可执行 MCP 仍可使用");
  return { platform: process.platform, arch: process.arch };
};
const baseEnvironment = { PATH: "/usr/bin:/bin", LANG: "C" };

async function commitRuntime(directory: string, extracted: string, target: string, control: ToolInstallControl): Promise<void> {
  await control.beforeEffect(); control.signal?.throwIfAborted();
  if (!existsSync(target)) {
    try { renameSync(join(directory, extracted), target); }
    catch (error) { if (!existsSync(target)) throw error; } // Another authorized install may have completed this same shared version.
  }
}
function npmForNode(node: string): string | undefined {
  const candidate = join(dirname(node), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
  return existsSync(candidate) ? realpathSync(candidate) : undefined;
}

/** Probe only a discovered executable; a failed version probe permits the official managed fallback. */
export async function matchingToolRuntime(home: string, binary: string, expected: string, control: ToolInstallControl): Promise<string | undefined> {
  const installed = cliExecutable(binary);
  if (!installed) return undefined;
  try {
    const version = await runToolInstallProcess(installed, ["--version"], { ...control, cwd: home, env: baseEnvironment, stage: "检查已有运行时", timeout: 10_000 });
    return version.trim() === expected ? realpathSync(installed) : undefined;
  } catch (error) {
    control.signal?.throwIfAborted();
    if (!(error instanceof ActionError) || error.code !== "connector.install.failed") throw error;
    return undefined;
  }
}

export async function ensureManagedNode(home: string, version: string, control: ToolInstallControl): Promise<{ node: string; npm: string }> {
  if (!exactToolVersion(version)) throw toolInstallErrors.invalid("请指定准确的 Node 版本");
  const existing = process.versions.node === version ? npmForNode(process.execPath) : undefined;
  if (existing) return { node: realpathSync(process.execPath), npm: existing };
  const discovered = await matchingToolRuntime(home, "node", `v${version}`, control);
  const discoveredNpm = discovered && npmForNode(discovered);
  if (discovered && discoveredNpm) return { node: discovered, npm: discoveredNpm };
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const { platform, arch } = supportedTarget(), top = `node-v${version}-${platform}-${arch}`, archive = `${top}.tar.gz`;
  const root = managedToolDirectory(home, "runtimes"), target = join(root, top);
  if (!existsSync(target)) {
    const stage = mkdtempSync(join(root, ".node-"));
    try {
      const url = `https://nodejs.org/dist/v${version}`;
      const sums = (await runtimeReleaseBytes(`${url}/SHASUMS256.txt`, 1024 * 1024, control.signal)).toString("utf8");
      const checksum = sums.split("\n").map(line => line.trim().split(/\s+/u)).find(row => row[1] === archive)?.[0];
      if (!checksum) throw toolInstallErrors.failed("Node 官方发布中没有此平台和版本的下载");
      await extractRuntimeArchive({ url: `${url}/${archive}`, checksum, directory: stage, top }, control);
      const node = join(stage, top, "bin", "node");
      const actual = await runToolInstallProcess(node, ["--version"], { ...control, cwd: stage, env: baseEnvironment, stage: "验证 Node 运行时", timeout: 10_000 });
      if (actual.trim() !== `v${version}` || !npmForNode(node)) throw toolInstallErrors.failed("Node 运行时版本或 npm 安装不完整");
      await commitRuntime(stage, top, target, control);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  const node = realpathSync(join(target, "bin", "node")), npm = npmForNode(node);
  if (!npm || !node.startsWith(`${realpathSync(root)}/`)) throw toolInstallErrors.failed("受管理 Node 运行时不完整，请重新安装该版本");
  return { node, npm };
}

export async function ensureManagedUv(home: string, control: ToolInstallControl): Promise<string> {
  const installed = cliExecutable("uv");
  if (installed) {
    const version = await runToolInstallProcess(installed, ["--version"], { ...control, cwd: home, env: baseEnvironment, stage: "检查 uv", timeout: 10_000 });
    const match = /^uv (\d+)\.(\d+)\.(\d+)/u.exec(version);
    if (match && (Number(match[1]) > 0 || Number(match[2]) > 12 || Number(match[2]) === 12 && Number(match[3]) >= 19)) return realpathSync(installed);
  }
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const { platform, arch } = supportedTarget();
  const targetName = `${arch === "arm64" ? "aarch64" : "x86_64"}-${platform === "darwin" ? "apple-darwin" : "unknown-linux-gnu"}`;
  const top = `uv-${targetName}`, root = managedToolDirectory(home, "runtimes"), target = join(root, `uv-${UV_BOOTSTRAP_VERSION}-${targetName}`);
  if (!existsSync(target)) {
    const stage = mkdtempSync(join(root, ".uv-"));
    try {
      const url = `https://github.com/astral-sh/uv/releases/download/${UV_BOOTSTRAP_VERSION}/${top}.tar.gz`;
      const checksum = (await runtimeReleaseBytes(`${url}.sha256`, 1024, control.signal)).toString("utf8").trim().split(/\s+/u)[0]!;
      await extractRuntimeArchive({ url, checksum, directory: stage, top }, control);
      const version = await runToolInstallProcess(join(stage, top, "uv"), ["--version"], { ...control, cwd: stage, env: baseEnvironment, stage: "验证 uv", timeout: 10_000 });
      if (!version.startsWith(`uv ${UV_BOOTSTRAP_VERSION} `) && version.trim() !== `uv ${UV_BOOTSTRAP_VERSION}`) throw toolInstallErrors.failed("uv 运行时版本不符");
      await commitRuntime(stage, top, target, control);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  const binary = realpathSync(join(target, "uv"));
  if (!binary.startsWith(`${realpathSync(root)}/`)) throw toolInstallErrors.failed("受管理 uv 路径无效");
  return binary;
}
