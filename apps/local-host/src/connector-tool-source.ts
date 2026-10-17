import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { toolInstallErrors } from "./connector-tool-process.js";

export interface NativeToolSource { kind: "native"; package: string; version: string; bin: string; url: string; sha256: string; entry?: string }
export interface PowerShellToolSource { kind: "powershell"; package: "Microsoft.Graph.Authentication"; version: string; bin: "pwsh"; runtime: NativeToolSource }
const safeEntry = (value: string) => value.split("/").every(part => /^[A-Za-z0-9_.-]+$/u.test(part) && part !== "." && part !== "..");

export type ManagedToolSource =
  | NativeToolSource
  | PowerShellToolSource
  | { kind: "npm"; package: string; version: string; bin: string; node_version: string; registry?: string; entrypoint?: string }
  | { kind: "python"; package: string; version: string; bin: string; python_version: string; registry?: string };
export const exactToolVersion = (value: string) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value);

/** A package coordinate, never a shell snippet, URL dependency, version range or mutable tag. */
export function validateManagedToolSource(source: ManagedToolSource): ManagedToolSource {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u.test(source.bin)) throw toolInstallErrors.invalid("请选择包正式提供的命令名");
  if (source.kind === "powershell") {
    if (source.package !== "Microsoft.Graph.Authentication" || source.bin !== "pwsh" || !exactToolVersion(source.version) || source.runtime.kind !== "native"
      || source.runtime.bin !== "pwsh" || !source.runtime.url.startsWith(`https://github.com/PowerShell/PowerShell/releases/download/v${source.runtime.version}/`)) throw toolInstallErrors.invalid("Microsoft Graph 安装方案无效");
    validateManagedToolSource(source.runtime); return source;
  }
  if (source.kind === "native") {
    let url: URL;
    try { url = new URL(source.url); } catch { throw toolInstallErrors.invalid("原生客户端来源地址无效"); }
    if (!exactToolVersion(source.version) || !/^[0-9a-f]{64}$/u.test(source.sha256) || source.entry !== undefined && !safeEntry(source.entry)
      || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !["github.com", "gitlab.com", "acli.atlassian.com", "api.hubapi.com"].includes(url.hostname)) throw toolInstallErrors.invalid("原生客户端来源、固定版本、校验和或包内路径无效");
    return source;
  }
  if (source.kind === "npm") {
    if (source.entrypoint && !safeEntry(source.entrypoint)) throw toolInstallErrors.invalid("包内启动路径无效");
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(source.package) || source.package.length > 214 || !exactToolVersion(source.version) || !exactToolVersion(source.node_version)) throw toolInstallErrors.invalid("npm 包名、固定版本或 Node 版本无效；不接受 latest、版本范围和 URL 依赖");
  } else if (source.kind === "python") {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u.test(source.package) || !/^[0-9][0-9A-Za-z.!+_-]{0,63}$/u.test(source.version) || !/^3\.\d+\.\d+$/u.test(source.python_version)) throw toolInstallErrors.invalid("Python 包名、固定包版本或解释器版本无效");
  } else throw toolInstallErrors.invalid("安装来源必须是 npm 或 Python 包");
  let registry: URL;
  try { registry = new URL(source.registry ?? (source.kind === "npm" ? "https://registry.npmjs.org/" : "https://pypi.org/simple/")); }
  catch { throw toolInstallErrors.invalid("包源地址无效"); }
  if (registry.username || registry.password || registry.search || registry.hash || registry.protocol !== "https:" && !isLoopbackHttpUrl(registry)) throw toolInstallErrors.invalid("包源必须是无凭据的 HTTPS 地址，或明确选择的本机包源");
  return { ...source, registry: registry.href };
}
