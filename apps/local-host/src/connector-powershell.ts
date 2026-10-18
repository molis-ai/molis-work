import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { githubCliDistribution, nativeTarget } from "./connector-native-release.js";
import { checkedNativeRelease } from "./connector-native-install.js";
import { managedToolDirectory } from "./connector-tool-download.js";
import { matchingToolRuntime } from "./connector-tool-runtime.js";
import { runToolInstallProcess, toolInstallErrors, type ToolInstallControl } from "./connector-tool-process.js";
import { exactToolVersion, type NativeToolSource, type PowerShellToolSource } from "./connector-tool-source.js";

export interface PowerShellCliDistribution { kind: "powershell"; resolve(version: string, runtimeVersion: string, signal?: AbortSignal): Promise<PowerShellToolSource> }
export const graphCliDistribution: PowerShellCliDistribution = { kind: "powershell", resolve: async (version, runtimeVersion, signal) => {
  if (!exactToolVersion(runtimeVersion)) throw toolInstallErrors.invalid("请为 Microsoft Graph 选择固定的 PowerShell 版本");
  const runtime = await githubCliDistribution("PowerShell/PowerShell", "pwsh", (v, p, a) => `powershell-${v}-${p === "darwin" ? "osx" : p}-${a}.tar.gz`, () => "pwsh").resolve(runtimeVersion, signal);
  return { kind: "powershell", package: "Microsoft.Graph.Authentication", version, bin: "pwsh", runtime };
} };

export const powerShellEnvironment = (directory: string, executable: string) => ({
  PSModulePath: [join(directory, "modules"), join(dirname(executable), "Modules")].join(delimiter),
  POWERSHELL_TELEMETRY_OPTOUT: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1",
});
async function extractPowerShell(source: NativeToolSource, directory: string, control: ToolInstallControl) {
  const archive = join(directory, "powershell.tar.gz"), extracted = join(directory, "contents");
  const bytes = await checkedNativeRelease(source, control);
  await control.beforeEffect(); control.signal?.throwIfAborted();
  writeFileSync(archive, bytes, { mode: 0o600, flag: "wx" }); mkdirSync(extracted, { mode: 0o700 });
  const options = { ...control, cwd: directory, env: { PATH: "/usr/bin:/bin", LANG: "C" }, stage: "检查 PowerShell 归档" };
  const paths = (await runToolInstallProcess("/usr/bin/tar", ["-tf", archive], options)).split("\n").filter(Boolean);
  if (paths.some(path => path.startsWith("/") || path.split("/").includes(".."))) throw toolInstallErrors.failed("PowerShell 归档包含安装目录之外的路径");
  const entries = (await runToolInstallProcess("/usr/bin/tar", ["-tvf", archive], options)).split("\n").filter(Boolean);
  if (entries.some(line => !/^[-d]/u.test(line))) throw toolInstallErrors.failed("PowerShell 归档包含不支持的链接或特殊文件");
  await runToolInstallProcess("/usr/bin/tar", ["-xf", archive, "-C", extracted], { ...options, stage: "解压 PowerShell" });
  chmodSync(join(extracted, "pwsh"), 0o700);
  return extracted;
}
async function ensurePowerShell(home: string, source: NativeToolSource, control: ToolInstallControl) {
  const existing = await matchingToolRuntime(home, "pwsh", `PowerShell ${source.version}`, control);
  if (existing) return existing;
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const { platform, arch } = nativeTarget(), root = managedToolDirectory(home, "runtimes"), target = join(root, `powershell-${source.version}-${platform}-${arch}`);
  if (!existsSync(target)) {
    const stage = mkdtempSync(join(root, ".powershell-"));
    try {
      const extracted = await extractPowerShell(source, stage, control), executable = join(extracted, "pwsh");
      const version = await runToolInstallProcess(executable, ["--version"], { ...control, cwd: stage, env: { PATH: "/usr/bin:/bin", HOME: stage, ...powerShellEnvironment(stage, executable) }, stage: "验证 PowerShell", timeout: 15_000 });
      if (version.trim() !== `PowerShell ${source.version}`) throw toolInstallErrors.failed("PowerShell 版本与原安装方案不符");
      await control.beforeEffect(); control.signal?.throwIfAborted();
      if (!existsSync(target)) { try { renameSync(extracted, target); } catch (error) { if (!existsSync(target)) throw error; } }
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  const executable = realpathSync(join(target, "pwsh"));
  if (!executable.startsWith(`${realpathSync(root)}/`)) throw toolInstallErrors.failed("受管理 PowerShell 路径无效");
  return executable;
}

/** Save the fixed authentication module into the connection's own module path using PowerShell's package manager. */
export async function installGraphConnectorTool(home: string, source: PowerShellToolSource, directory: string, environment: Record<string, string>, control: ToolInstallControl) {
  const executable = await ensurePowerShell(home, source.runtime, control), modules = join(directory, "modules");
  mkdirSync(modules, { mode: 0o700 });
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  await runToolInstallProcess(executable, ["-NoProfile", "-NonInteractive", "-Command",
    `Save-Module -Name Microsoft.Graph.Authentication -RequiredVersion ${quote(source.version)} -LiteralPath ${quote(modules)} -Repository PSGallery -AcceptLicense -Force -ErrorAction Stop`],
    { ...control, cwd: directory, env: { ...environment, ...powerShellEnvironment(directory, executable) }, stage: "安装 Microsoft Graph 认证模块" });
  return { executable, runtime_path: [dirname(executable)] };
}
