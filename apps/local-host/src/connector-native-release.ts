import { builtinCliReleaseHosts, type CliReleasePort } from "./builtin-drivers.js";
import { runtimeReleaseBytes } from "./connector-tool-download.js";
import { toolInstallErrors } from "./connector-tool-process.js";

/** An official client's release files, downloaded only from the hosts the CLI drivers declare (D3 A, M11). */
const hosts = new Set(builtinCliReleaseHosts());
export const nativeReleaseBytes = (url: string, limit: number, signal?: AbortSignal) => runtimeReleaseBytes(url, limit, signal, hosts);
export function nativeTarget() {
  if (!["darwin", "linux"].includes(process.platform) || !["arm64", "x64"].includes(process.arch)) throw toolInstallErrors.invalid("此平台尚无该客户端的受管理安装路径");
  return { platform: process.platform, arch: process.arch };
}
/** What a driver's release resolver is given: the download above, this machine, and the install refusal. */
export const cliReleasePort: CliReleasePort = { bytes: nativeReleaseBytes, target: nativeTarget, failed: message => toolInstallErrors.failed(message) };
