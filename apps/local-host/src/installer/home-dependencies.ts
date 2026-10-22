import { installerErrors } from "./errors.js";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { RuntimeDependencyPackage } from "./home-contract.js";

/**
 * The dependencies the workspace removes with a pnpm override (`parent>child: '-'` under `overrides` in pnpm-workspace.yaml), as
 * `parent>child`. pnpm never installs them, so the release does not look for them either (they are optional by the workspace's
 * own decision; the reason is beside each override). Only that exact shape counts; any other override changes a version, which
 * the installed tree already shows.
 */
export async function removedByOverrides(sourceDirectory: string): Promise<Set<string>> {
  let text: string;
  try { text = await fs.readFile(path.join(sourceDirectory, "pnpm-workspace.yaml"), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A release has no workspace file: it carries the pairs its source removed in its own package.json (home-release.ts).
    const release = JSON.parse(await fs.readFile(path.join(sourceDirectory, "package.json"), "utf8")) as { "molis-work"?: { removed_dependencies?: unknown } };
    const listed = release["molis-work"]?.removed_dependencies;
    return new Set(Array.isArray(listed) ? listed.filter((pair): pair is string => typeof pair === "string" && /^[^>\s]+>[^>\s]+$/u.test(pair)) : []);
  }
  const removed = new Set<string>();
  let inOverrides = false;
  for (const line of text.split("\n")) {
    if (/^\S/u.test(line)) inOverrides = line.trimEnd() === "overrides:";
    const pair = inOverrides ? line.match(/^\s+['"]?([^'"\s>]+)>([^'"\s:]+)['"]?:\s*['"]-['"]\s*$/u) : null;
    if (pair) removed.add(`${pair[1]}>${pair[2]}`);
  }
  return removed;
}

export async function collectRuntimeDependencies(
  rootPackageJson: string,
  rootMetadata: {
    name?: unknown;
    dependencies?: Record<string, unknown>;
    optionalDependencies?: Record<string, unknown>;
  },
  removed: ReadonlySet<string> = new Set(),
): Promise<RuntimeDependencyPackage[]> {
  const packages = new Map<string, RuntimeDependencyPackage>();
  const byDirectory = new Map<string, RuntimeDependencyPackage>();
  const pending: Array<{ name: string; fromPackageJson: string; optional: boolean }> = [];
  const enqueue = (
    metadata: { name?: unknown; dependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown> },
    fromPackageJson: string,
  ) => {
    for (const name of Object.keys(metadata.dependencies ?? {})) {
      if (removed.has(`${String(metadata.name)}>${name}`)) continue;
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
      throw installerErrors["installer.source.asset_missing"](`Molis Work 安装源缺少运行时依赖 ${candidate.name}: ${error instanceof Error ? error.message : String(error)}`);
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
      throw installerErrors["installer.source.invalid"](`运行时依赖 package.json 无法解析: ${resolvedPackageJson}`);
    }
    const name = String(metadata.name ?? candidate.name);
    const version = String(metadata.version ?? "").trim();
    if (name !== candidate.name || !version) {
      throw installerErrors["installer.source.invalid"](`运行时依赖身份无效: ${candidate.name} (${resolvedPackageJson})`);
    }
    const directory = path.dirname(resolvedPackageJson);
    const existing = packages.get(name);
    if (existing) {
      if (existing.version !== version) {
        const parent = byDirectory.get(path.dirname(candidate.fromPackageJson));
        if (!parent) {
          throw installerErrors["installer.source.invalid"](`运行时依赖存在无法平铺的版本冲突: ${name}@${existing.version} / ${name}@${version}`);
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

async function resolveDependencyPackageJson(name: string, fromPackageJson: string): Promise<string> {
  const resolver = createRequire(fromPackageJson);
  let metadataPath: string;
  try {
    metadataPath = await fs.realpath(resolver.resolve(`${name}/package.json`));
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
    const owner = await nearestNamedPackageJson(path.dirname(resolvedEntry), name);
    if (owner) return owner;
    throw packageJsonError;
  }
  // A wildcard `exports` entry ("./*": { require: "./dist/cjs/*" }) maps
  // `<name>/package.json` to a nested file such as `dist/cjs/package.json`
  // that only declares a module type. Identity comes from the package's own manifest.
  return await nearestNamedPackageJson(path.dirname(metadataPath), name) ?? metadataPath;
}

async function nearestNamedPackageJson(start: string, name: string): Promise<string | null> {
  let directory = start;
  while (true) {
    const candidate = path.join(directory, "package.json");
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

async function findDependencyPackageJson(name: string, fromPackageJson: string): Promise<string | null> {
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
