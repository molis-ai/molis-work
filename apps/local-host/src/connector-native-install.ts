import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nativeReleaseBytes } from "./connector-native-release.js";
import { runToolInstallProcess, toolInstallErrors, type ToolInstallControl } from "./connector-tool-process.js";
import type { NativeToolSource } from "./connector-tool-source.js";

/** Only the selected regular file is extracted. A checksum is checked before any archive tool or downloaded code runs. */
export async function checkedNativeRelease(source: Pick<NativeToolSource, "url" | "sha256">, control: ToolInstallControl) {
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const bytes = await nativeReleaseBytes(source.url, 200 * 1024 * 1024, control.signal);
  if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw toolInstallErrors.failed("客户端文件校验失败，未解压或执行；请重新核对官方发布");
  return bytes;
}

export async function installNativeConnectorTool(source: NativeToolSource, directory: string, control: ToolInstallControl) {
  const bytes = await checkedNativeRelease(source, control);
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const executable = source.entry ? join(directory, "release", source.entry) : join(directory, source.bin);
  if (source.entry) {
    const archive = join(directory, "release.archive"), extracted = join(directory, "release");
    writeFileSync(archive, bytes, { mode: 0o600, flag: "wx" }); mkdirSync(extracted, { mode: 0o700 });
    const options = { ...control, cwd: directory, env: { PATH: "/usr/bin:/bin", LANG: "C" }, stage: "检查客户端归档" };
    const entries = (await runToolInstallProcess("/usr/bin/tar", ["-tvf", archive, "--", source.entry], options)).trim().split("\n");
    if (entries.length !== 1 || !entries[0]!.startsWith("-")) throw toolInstallErrors.failed("客户端归档中的所选命令不是唯一普通文件");
    await runToolInstallProcess("/usr/bin/tar", ["-xf", archive, "-C", extracted, "--", source.entry], { ...options, stage: "提取客户端文件" });
    rmSync(archive);
  } else writeFileSync(executable, bytes, { mode: 0o700, flag: "wx" });
  await control.beforeEffect(); control.signal?.throwIfAborted(); chmodSync(executable, 0o700);
  return { executable, runtime_path: [dirname(executable)] };
}
