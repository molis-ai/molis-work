import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { MolisWorkHomeInstallError } from "./home-contract.js";
import type { RuntimeDependencyPackage } from "./home-contract.js";

export async function collectRuntimeDependencies(
  rootPackageJson: string,
  rootMetadata: {
    dependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
  },
): Promise<RuntimeDependencyPackage[]> {
  const packages = new Map<string, RuntimeDependencyPackage>();
  const byDirectory = new Map<string, RuntimeDependencyPackage>();
  const pending: Array<{ name: string; fromPackageJson: string; optional: boolean }> = [];
  const enqueue = (
    metadata: { dependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown> },
    fromPackageJson: string,
  ) => {
    for (const name of Object.keys(metadata.dependencies ?? {})) {
      pending.push({ name, fromPackageJson, optional: false });
    }
    for (const name of Object.keys(metadata.optionalDependencies ?? {})) {
      if (!(name in (metadata.dependencies ?? {}))) {
        pending.push({ name, fromPackageJson, optional: true });
      }
    }
  };
  enqueue(rootMetadata, rootPackageJson);

  while (pending.length > 0) {
    const candidate = pending.shift()!;
    let resolvedPackageJson: string;
    try {
      // ESM-only package metadata may be found through a workspace symlink.
      // Resolve it before traversing children so pnpm's sibling dependencies remain reachable.
      resolvedPackageJson = await fs.realpath(await resolveDependencyPackageJson(candidate.name, candidate.fromPackageJson));
    } catch (error) {
      if (candidate.optional) continue;
      throw new MolisWorkHomeInstallError(
        "source.asset_missing",
        `Molis Work 安装源缺少运行时依赖 ${candidate.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    let metadata: {
      name?: unknown;
      version?: unknown;
      dependencies?: Record<string, unknown>;
      optionalDependencies?: Record<string, unknown>;
    };
    try {
      metadata = JSON.parse(await fs.readFile(resolvedPackageJson, "utf8")) as typeof metadata;
    } catch {
      throw new MolisWorkHomeInstallError(
        "source.invalid",
        `运行时依赖 package.json 无法解析: ${resolvedPackageJson}`,
      );
    }
    const name = String(metadata.name ?? candidate.name);
    const version = String(metadata.version ?? "").trim();
    if (name !== candidate.name || !version) {
      throw new MolisWorkHomeInstallError(
        "source.invalid",
        `运行时依赖身份无效: ${candidate.name} (${resolvedPackageJson})`,
      );
    }
    const directory = path.dirname(resolvedPackageJson);
    const existing = packages.get(name);
    if (existing) {
      if (existing.version !== version) {
        const parent = byDirectory.get(path.dirname(candidate.fromPackageJson));
        if (!parent) {
          throw new MolisWorkHomeInstallError(
            "source.invalid",
            `运行时依赖存在无法平铺的版本冲突: ${name}@${existing.version} / ${name}@${version}`,
          );
        }
        const nests = parent.nests ?? [];
        if (!nests.some((item) => item.name === name && item.version === version)) {
          const shared = byDirectory.get(directory) ?? {
            name,
            version,
            directory,
            nests: [],
          };
          parent.nests = [...nests, shared];
          if (!byDirectory.has(directory)) {
            byDirectory.set(directory, shared);
            enqueue(metadata, resolvedPackageJson);
          }
        }
      }
      continue;
    }
    const record = { name, version, directory, nests: [] as RuntimeDependencyPackage[] };
    packages.set(name, record);
    byDirectory.set(directory, record);
    enqueue(metadata, resolvedPackageJson);
  }

  return [...packages.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolveDependencyPackageJson(name: string, fromPackageJson: string): Promise<string> {
  const resolver = createRequire(fromPackageJson);
  try {
    return await fs.realpath(resolver.resolve(`${name}/package.json`));
  } catch (packageJsonError) {
    // A package may deliberately omit `./package.json` and a CommonJS
    // condition from `exports` while still being a valid ESM runtime
    // dependency. Walk the same ancestor node_modules locations Node uses so
    // installation can inspect identity without requiring a public metadata
    // subpath from the dependency.
    const discoveredPackageJson = await findDependencyPackageJson(name, fromPackageJson);
    if (discoveredPackageJson) return discoveredPackageJson;
    let resolvedEntry: string;
    try {
      resolvedEntry = resolver.resolve(name);
    } catch {
      throw packageJsonError;
    }
    let directory = path.dirname(resolvedEntry);
    while (true) {
      const candidate = path.join(directory, "package.json");
      try {
        const metadata = JSON.parse(await fs.readFile(candidate, "utf8")) as { name?: unknown };
        if (metadata.name === name) return await fs.realpath(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
      }
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    throw packageJsonError;
  }
}

export async function findDependencyPackageJson(name: string, fromPackageJson: string): Promise<string | null> {
  const packageSegments = name.split("/");
  let directory = path.dirname(fromPackageJson);
  while (true) {
    const candidate = path.join(directory, "node_modules", ...packageSegments, "package.json");
    try {
      const metadata = JSON.parse(await fs.readFile(candidate, "utf8")) as { name?: unknown };
      if (metadata.name === name) return await fs.realpath(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
