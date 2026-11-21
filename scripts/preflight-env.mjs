import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainScript } from "./script-paths.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function versionParts(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match?.slice(1).map(Number);
}

function compareVersions(left, right) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export function checkNodeVersion(actualVersion, requiredRange) {
  const actual = versionParts(actualVersion);
  // The workspace pins a single minor version with inclusive and exclusive bounds.
  const bounds = /^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/.exec(requiredRange);
  if (!bounds) throw new Error(`无法读取项目要求的 Node 版本范围（${requiredRange}）。`);
  const minimum = versionParts(bounds[1]);
  const maximum = versionParts(bounds[2]);
  if (actual && compareVersions(actual, minimum) >= 0 && compareVersions(actual, maximum) < 0) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "node_version_mismatch",
    actual: actualVersion,
    required: requiredRange,
    message: `当前 Node 版本是 ${actualVersion}，项目要求 ${requiredRange}。请切换到 Node ${minimum[0]}.${minimum[1]}.x 后重试。`,
  };
}

function isFile(path, mode = constants.F_OK) {
  try {
    accessSync(path, mode);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function hasPathCommand(name) {
  return (process.env.PATH ?? "").split(delimiter).some(directory =>
    directory && isFile(join(directory, name), constants.X_OK));
}

export function checkNativePtyPrereqs({
  platform = process.platform,
  arch = process.arch,
  repoRoot = REPO_ROOT,
  hasCommand = hasPathCommand,
} = {}) {
  const pkg = join(repoRoot, "node_modules", "node-pty");
  if (isFile(join(pkg, "prebuilds", `${platform}-${arch}`, "pty.node")) ||
      isFile(join(pkg, "build", "Release", "pty.node"))) {
    return { ok: true, mode: "prebuilt" };
  }
  const missing = ["make", "g++", "python3"].filter(command => !hasCommand(command));
  if (!missing.length) return { ok: true, mode: "toolchain" };
  return {
    ok: false,
    code: "native_toolchain_missing",
    missing,
    message: `未找到终端所需的编译工具（${missing.join("、")}）。可安装这些工具或使用预构建安装包，也可以继续使用工作台的其他功能。`,
  };
}

export function runPreflight({
  nodeVersion = process.versions.node,
  repoRoot = REPO_ROOT,
  strictNative = false,
  report = console.error,
  ...nativeOptions
} = {}) {
  const { engines } = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const node = checkNodeVersion(nodeVersion, engines.node);
  if (!node.ok) {
    report(`[${node.code}] ${node.message}`);
    return 1;
  }
  const native = checkNativePtyPrereqs({ repoRoot, ...nativeOptions });
  if (native.ok) return 0;
  report(`[${native.code}] ${native.message}`);
  return strictNative ? 1 : 0;
}

if (isMainScript(import.meta.url)) {
  process.exitCode = runPreflight({ strictNative: process.argv.includes("--strict-native") });
}
