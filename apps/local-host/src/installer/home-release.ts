import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  MolisWorkHomeInstallError,
  SCHEMA_VERSION,
  INSTALLER_ID,
  REQUIRED_RELEASE_SKILL_FILES,
  isOwnedInstaller,
} from "./home-contract.js";
import type { InspectedSource, ReleaseManifest, PromotedRelease, RuntimeDependencyPackage } from "./home-contract.js";
import { pathState, writeAtomic, readJsonIfPresent } from "./home-files.js";
import { copyReleaseEntries, runtimeDependencyReleaseEntries } from "./package-release-files.js";
import { releaseAssetPaths } from "./release-assets.js";

export async function createRelease(
  stagingDirectory: string,
  source: InspectedSource,
  version: string,
): Promise<void> {
  await fs.mkdir(stagingDirectory, { recursive: false });
  const embeddedNodeModules = path.join(stagingDirectory, "node_modules");
  await fs.mkdir(embeddedNodeModules, { recursive: true });
  if (source.bundledNodePath) {
    await fs.mkdir(path.join(stagingDirectory, "runtime"), { recursive: true });
  }
  await Promise.all([
    ...(await releaseAssetPaths(source.directory)).map(entry => fs.cp(
      path.join(source.directory, entry), path.join(stagingDirectory, entry),
      { recursive: true, force: false, errorOnExist: true, dereference: true },
    )),
    fs.cp(path.join(source.directory, "dist"), path.join(stagingDirectory, "dist"), {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: true,
    }),
    fs.cp(path.join(source.directory, "skills"), path.join(stagingDirectory, "skills"), {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: true,
    }),
    ...(source.bundledNodePath
      ? [
          fs.cp(source.bundledNodePath, path.join(stagingDirectory, "runtime", "node"), {
            recursive: false,
            force: false,
            errorOnExist: true,
          }),
        ]
      : []),
  ]);
  if (source.bundledNodePath) {
    const bundledNode = path.join(stagingDirectory, "runtime", "node");
    await fs.chmod(bundledNode, 0o755);
    await copyLoaderLibraries(source.bundledNodePath, bundledNode);
  }
  const copyRuntimeDependency = async (dependency: RuntimeDependencyPackage, target: string): Promise<void> => {
    // Workspace packages keep their declared files. Registry packages stay
    // complete except package-manager node_modules. A second major version is
    // copied under the parent that requires it.
    const entries = await runtimeDependencyReleaseEntries(dependency.directory);
    await assertContainedDependencyLinks(dependency.directory, { onlyEntries: entries });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await copyReleaseEntries(dependency.directory, target, entries);
    for (const nested of dependency.nests ?? []) {
      await copyRuntimeDependency(nested, path.join(target, "node_modules", ...nested.name.split("/")));
    }
  };
  for (const dependency of source.runtimeDependencies) {
    await copyRuntimeDependency(dependency, path.join(embeddedNodeModules, ...dependency.name.split("/")));
  }
  const planningMethodsDirectory = path.join(
    embeddedNodeModules,
    "@molis-ai",
    "molis-work-module-goals",
    "methods",
  );
  if ((await pathState(planningMethodsDirectory))?.isDirectory()) {
    const skillMethodsDirectory = path.join(stagingDirectory, "skills", "goal-advance", "methods");
    await fs.rm(skillMethodsDirectory, { recursive: true, force: true });
    await fs.symlink(
      path.relative(path.dirname(skillMethodsDirectory), planningMethodsDirectory),
      skillMethodsDirectory,
      "dir",
    );
  }
  await assertContainedDependencyLinks(embeddedNodeModules);
  await writeAtomic(
    path.join(stagingDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "@molis-ai/molis-work-home-runtime",
        private: true,
        type: "module",
        version,
        dependencies: Object.fromEntries(
          source.runtimeDependencies.map((dependency) => [dependency.name, dependency.version]),
        ),
      },
      null,
      2,
    )}\n`,
  );
  await writeAtomic(
    path.join(stagingDirectory, "release.json"),
    `${JSON.stringify(
      {
        schema_version: SCHEMA_VERSION,
        installer: INSTALLER_ID,
        version,
        dependencies: "embedded",
        ...(source.bundledNodePath ? { node_runtime: "embedded" as const } : {}),
        content_digest: source.contentDigest,
        created_at: new Date().toISOString(),
      } satisfies ReleaseManifest,
      null,
      2,
    )}\n`,
  );
}

const execFileAsync = promisify(execFile);

/** Homebrew Node links libnode with @loader_path. A copied binary cannot start without that library. */
async function copyLoaderLibraries(binary: string, destinationBinary: string): Promise<void> {
  let listing = "";
  try {
    listing = String((await execFileAsync("otool", ["-L", binary])).stdout);
  } catch {
    return;
  }
  const origin = path.dirname(binary);
  const destination = path.dirname(destinationBinary);
  const seen = new Set<string>();
  for (const line of listing.split("\n").slice(1)) {
    const spec = line.trim().split(/\s+/u)[0] ?? "";
    if (!spec.startsWith("@rpath/") && !spec.startsWith("@loader_path/")) continue;
    const base = path.basename(spec);
    if (seen.has(base)) continue;
    seen.add(base);
    const candidates = [
      path.join(origin, base),
      path.resolve(origin, "../lib", base),
      spec.replace("@loader_path", origin).replace("@rpath", path.resolve(origin, "../lib")),
    ];
    for (const candidate of candidates) {
      if (!(await pathState(candidate))?.isFile()) continue;
      await fs.copyFile(candidate, path.join(destination, base));
      break;
    }
  }
}

export async function assertContainedDependencyLinks(
  rootDirectory: string,
  options: { ignoredTopLevelDirectories?: readonly string[]; onlyEntries?: readonly string[] } = {},
): Promise<void> {
  const ignoredTopLevelDirectories = new Set(options.ignoredTopLevelDirectories ?? []);
  const pending: string[] = [];
  const starts = options.onlyEntries
    ? options.onlyEntries.map((entry) => path.join(rootDirectory, entry))
    : [rootDirectory];
  for (const start of starts) {
    const state = await fs.lstat(start);
    if (state.isSymbolicLink()) {
      await assertLinkStaysInsideRelease(rootDirectory, start);
      continue;
    }
    if (state.isDirectory()) pending.push(start);
  }
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (directory === rootDirectory && ignoredTopLevelDirectories.has(entry.name)) continue;
        pending.push(entryPath);
        continue;
      }
      if (!entry.isSymbolicLink()) continue;
      await assertLinkStaysInsideRelease(rootDirectory, entryPath);
    }
  }
}

async function assertLinkStaysInsideRelease(rootDirectory: string, entryPath: string): Promise<void> {
  const target = await fs.readlink(entryPath);
  const resolved = path.resolve(path.dirname(entryPath), target);
  const relative = path.relative(rootDirectory, resolved);
  if (path.isAbsolute(target) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new MolisWorkHomeInstallError(
      "source.invalid",
      `Molis Work 依赖链接指向安装 release 外部，无法生成自包含安装: ${entryPath}`,
    );
  }
}

export async function inspectRelease(
  releaseDirectory: string,
  version: string,
  expectedContentDigest: string,
  expectsBundledNode: boolean,
): Promise<"missing" | "valid" | "refreshable" | "repairable"> {
  const state = await pathState(releaseDirectory);
  if (!state) return "missing";
  if (!state.isDirectory()) {
    throw new MolisWorkHomeInstallError("release.conflict", `已存在未知 Molis Work release 文件: ${releaseDirectory}`);
  }
  const manifest = await readJsonIfPresent<ReleaseManifest>(path.join(releaseDirectory, "release.json"));
  if (!manifest || !isOwnedInstaller(manifest.installer) || manifest.version !== version) {
    throw new MolisWorkHomeInstallError("release.conflict", `已存在未知 Molis Work release 目录: ${releaseDirectory}`);
  }
  if (
    manifest.schema_version !== SCHEMA_VERSION
    || manifest.dependencies !== "embedded"
    || typeof manifest.content_digest !== "string"
    || (expectsBundledNode && manifest.node_runtime !== "embedded")
  ) {
    return "repairable";
  }
  const required = [
    "dist/cli/main.js",
    "dist/mcp/server.js",
    "dist/web/server.js",
    ...REQUIRED_RELEASE_SKILL_FILES,
    "node_modules",
    "package.json",
    ...(expectsBundledNode ? ["runtime/node"] : []),
  ];
  const states = await Promise.all(required.map((item) => pathState(path.join(releaseDirectory, item))));
  if (!states.every(Boolean)) return "repairable";
  const nodeModulesState = states[required.indexOf("node_modules")];
  if (!nodeModulesState?.isDirectory() || nodeModulesState.isSymbolicLink()) return "repairable";
  if (expectsBundledNode && !states.at(-1)?.isFile()) return "repairable";
  return manifest.content_digest === expectedContentDigest ? "valid" : "refreshable";
}

export async function promoteRelease(
  stagingDirectory: string,
  releaseDirectory: string,
  repairing: boolean,
): Promise<PromotedRelease> {
  if (!repairing) {
    await fs.rename(stagingDirectory, releaseDirectory);
    return { releaseDirectory, created: true, backupDirectory: null };
  }
  const backupDirectory = `${releaseDirectory}.backup-${randomUUID()}`;
  await fs.rename(releaseDirectory, backupDirectory);
  try {
    await fs.rename(stagingDirectory, releaseDirectory);
    return { releaseDirectory, created: false, backupDirectory };
  } catch (error) {
    await fs.rename(backupDirectory, releaseDirectory);
    throw error;
  }
}

export async function rollbackPromotedRelease(promoted: PromotedRelease): Promise<void> {
  try {
    if (promoted.created) {
      await fs.rm(promoted.releaseDirectory, { recursive: true, force: true });
      return;
    }
    if (promoted.backupDirectory) {
      await fs.rm(promoted.releaseDirectory, { recursive: true, force: true });
      await fs.rename(promoted.backupDirectory, promoted.releaseDirectory);
    }
  } catch {
    // Preserve the original error. A later repair can recover this owned release.
  }
}
