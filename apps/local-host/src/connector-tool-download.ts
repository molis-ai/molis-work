import { createHash } from "node:crypto";
import { mkdirSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toolInstallErrors, runToolInstallProcess, type ToolInstallControl } from "./connector-tool-process.js";

export const CONNECTOR_TOOLS_HOME_STORE = { path: "runtime" } as const;

const releaseHosts = new Set(["nodejs.org", "github.com", "api.github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"]);
export function managedToolDirectory(home: string, ...parts: string[]): string {
  let directory = realpathSync(home);
  for (const part of ["runtime", "connectors", ...parts]) {
    if (!/^[A-Za-z0-9_.-]+$/u.test(part) || part === "." || part === "..") throw toolInstallErrors.invalid("受管理安装目录无效");
    directory = join(directory, part);
    try { if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) throw toolInstallErrors.invalid("受管理安装目录不能是链接或普通文件"); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") mkdirSync(directory, { mode: 0o700 }); else throw error; }
  }
  return directory;
}

/** Network failures and the download's own timeout are install refusals; the caller's cancellation passes through unchanged. */
function downloadFailed(signal?: AbortSignal): never {
  signal?.throwIfAborted();
  throw toolInstallErrors.failed("运行时下载失败，请检查官方发布源与网络");
}

/** Downloads only official runtime releases; redirect destinations stay in the release-provider allowlist. */
export async function runtimeReleaseBytes(raw: string, limit: number, signal?: AbortSignal, allowedHosts: ReadonlySet<string> = releaseHosts): Promise<Buffer> {
  let url = new URL(raw);
  for (let redirects = 0; redirects < 6; redirects++) {
    signal?.throwIfAborted();
    if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.hostname)) throw toolInstallErrors.invalid("运行时下载地址不属于已支持的官方发布源");
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.any([AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]), headers: { "user-agent": "Molis-Work" } }).catch(() => downloadFailed(signal));
    signal?.throwIfAborted();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location"); await response.body?.cancel();
      if (!location) throw toolInstallErrors.failed("运行时下载缺少重定向地址");
      url = new URL(location, url); continue;
    }
    if (!response.ok || !response.body) throw toolInstallErrors.failed("运行时下载失败，请检查官方发布源与网络");
    const chunks: Buffer[] = []; let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const result = await reader.read().catch(() => downloadFailed(signal)); signal?.throwIfAborted(); if (result.done) break;
        size += result.value.length;
        if (size > limit) { await reader.cancel(); throw toolInstallErrors.failed("运行时下载超过允许的大小"); }
        chunks.push(Buffer.from(result.value));
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  throw toolInstallErrors.failed("运行时下载重定向次数过多");
}

export async function extractRuntimeArchive(input: { url: string; checksum: string; directory: string; top: string }, control: ToolInstallControl): Promise<void> {
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const bytes = await runtimeReleaseBytes(input.url, 200 * 1024 * 1024, control.signal);
  if (!/^[0-9a-f]{64}$/u.test(input.checksum) || createHash("sha256").update(bytes).digest("hex") !== input.checksum) throw toolInstallErrors.failed("运行时下载校验失败，未解压或执行");
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const archive = join(input.directory, "runtime.tar.gz"); writeFileSync(archive, bytes, { mode: 0o600, flag: "wx" });
  const options = { ...control, cwd: input.directory, env: { PATH: "/usr/bin:/bin", LANG: "C" }, stage: "检查运行时归档" };
  const entries = await runToolInstallProcess("/usr/bin/tar", ["-tzf", archive], options);
  if (entries.split("\n").filter(Boolean).some(name => !name.startsWith(`${input.top}/`) || name.split("/").includes(".."))) throw toolInstallErrors.failed("运行时归档包含安装目录之外的路径");
  await runToolInstallProcess("/usr/bin/tar", ["-xzf", archive, "-C", input.directory], { ...options, stage: "解压运行时" });
}
