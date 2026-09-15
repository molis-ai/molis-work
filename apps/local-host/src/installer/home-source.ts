import { createHash } from "node:crypto";
import path from "node:path";
import { computeBuildSourceDigest, digestPaths, type MolisWorkBuildManifest } from "./fingerprint.js";
import { MolisWorkHomeInstallError } from "./home-contract.js";
import type { InspectedSource, RuntimeDependencyPackage } from "./home-contract.js";
import { pathState, readText, readJsonIfPresent } from "./home-files.js";
import { collectRuntimeDependencies } from "./home-dependencies.js";
import { runtimeDependencyReleaseEntries } from "./package-release-files.js";
import { releaseAssetPaths } from "./release-assets.js";

export async function inspectSource(
  sourceDirectory: string,
  requestedVersion: string | undefined,
): Promise<InspectedSource> {
  const sourceState = await pathState(sourceDirectory);
  if (!sourceState?.isDirectory()) {
    throw new MolisWorkHomeInstallError("source.invalid", `Molis Work 安装源不存在或不是目录: ${sourceDirectory}`);
  }
  const packageJson = path.join(sourceDirectory, "package.json");
  const packageText = await readText(packageJson, "source.asset_missing");
  let packageMetadata: {
    version?: unknown;
    dependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
  };
  try {
    packageMetadata = JSON.parse(packageText) as typeof packageMetadata;
  } catch {
    throw new MolisWorkHomeInstallError("source.invalid", `Molis Work 安装源 package.json 无法解析: ${packageJson}`);
  }
  const packageVersion = String(packageMetadata.version ?? "").trim();
  const version = (requestedVersion ?? packageVersion).trim();
  safeReleaseName(version);

  for (const asset of [
    "dist/cli/main.js",
    "dist/mcp/server.js",
    "dist/web/server.js",
    "skills/goal-advance/SKILL.md",
  ]) {
    const assetPath = path.join(sourceDirectory, asset);
    if (!(await pathState(assetPath))) {
      throw new MolisWorkHomeInstallError("source.asset_missing", `Molis Work 安装源缺少 ${asset}: ${assetPath}`);
    }
  }
  await assertFreshRepositoryBuild(sourceDirectory);
  const runtimeDependencies = await collectRuntimeDependencies(packageJson, packageMetadata);
  const bundledNodeCandidate = path.join(sourceDirectory, "runtime", "node");
  const bundledNodeState = await pathState(bundledNodeCandidate);
  if (bundledNodeState && !bundledNodeState.isFile()) {
    throw new MolisWorkHomeInstallError(
      "source.invalid",
      `Molis Work bundled Node 不是文件: ${bundledNodeCandidate}`,
    );
  }
  const bundledNodePath = bundledNodeState ? bundledNodeCandidate : null;
  const contentDigest = await computeSourceContentDigest(
    sourceDirectory,
    runtimeDependencies,
    bundledNodePath != null,
  );
  return { directory: sourceDirectory, version, runtimeDependencies, bundledNodePath, contentDigest };
}

export async function assertFreshRepositoryBuild(sourceDirectory: string): Promise<void> {
  const srcState = await pathState(path.join(sourceDirectory, "src"));
  const launchersState = await pathState(path.join(sourceDirectory, "apps/desktop/launchers"));
  if (!srcState?.isDirectory() && !launchersState?.isDirectory()) return;
  const manifestPath = path.join(sourceDirectory, "dist", ".molis-work-build.json");
  const manifest = await readJsonIfPresent<MolisWorkBuildManifest>(manifestPath);
  const currentDigest = await computeBuildSourceDigest(sourceDirectory);
  if (manifest?.schema_version === 1 && manifest.source_digest === currentDigest) return;
  throw new MolisWorkHomeInstallError(
    "source.build_stale",
    `Molis Work 源码与 dist 不一致，已停止安装旧构建。请在仓库运行 pnpm install:local（它会先 build）后重试: ${sourceDirectory}`,
  );
}

export async function computeSourceContentDigest(
  sourceDirectory: string,
  runtimeDependencies: readonly RuntimeDependencyPackage[],
  includesBundledNode: boolean,
): Promise<string> {
  const rootDigest = await digestPaths(sourceDirectory, [
    "dist",
    "skills",
    "package.json",
    ...await releaseAssetPaths(sourceDirectory),
    ...(includesBundledNode ? ["runtime/node"] : []),
  ]);
  const dependencies = [];
  for (const dependency of runtimeDependencies) {
    dependencies.push({
      name: dependency.name,
      version: dependency.version,
      digest: await digestPaths(dependency.directory, await runtimeDependencyReleaseEntries(dependency.directory)),
    });
  }
  return createHash("sha256")
    .update(JSON.stringify({ root_digest: rootDigest, dependencies }))
    .digest("hex");
}

export function safeReleaseName(version: string): string {
  if (!version || !/^[0-9A-Za-z][0-9A-Za-z._+-]*$/.test(version)) {
    throw new MolisWorkHomeInstallError("version.invalid", `Molis Work 版本不能用于安装目录: ${version || "(empty)"}`);
  }
  return `molis-work-${version}`;
}
