import { promises as fs } from "node:fs";
import path from "node:path";
import { collectRuntimeDependencies, removedByOverrides } from "./home-dependencies.js";
import { assertFreshRepositoryBuild } from "./home-source.js";
import { pathState } from "./home-files.js";
import { copyReleaseEntries, declaredReleaseFileEntries } from "./package-release-files.js";

interface PackageMetadata {
  name: string;
  version: string;
  files: string[];
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bundledDependencies?: string[];
}

/** A portable npm distribution: bundle local JS packages, install registry/native dependencies on the consumer. */
export async function createMolisWorkNpmPackageDirectory(options: {
  sourceDirectory: string;
  destinationDirectory: string;
  sourceRevision?: string;
}): Promise<{ directory: string; bundledPackages: string[] }> {
  const source = path.resolve(options.sourceDirectory);
  const destination = path.resolve(options.destinationDirectory);
  if (await pathState(destination)) throw new Error(`npm package 输出已存在，不会覆盖: ${destination}`);
  await assertFreshRepositoryBuild(source);
  const root = await readPackage(source);
  const dependencies = await collectRuntimeDependencies(path.join(source, "package.json"), root, await removedByOverrides(source));
  const packages = new Map(await Promise.all(dependencies.map(async item =>
    [item.name, { ...item, metadata: await readPackage(item.directory) }] as const)));
  const bundled = new Set<string>();
  for (const metadata of [root, ...[...packages.values()].map(item => item.metadata)]) {
    for (const [name, spec] of Object.entries({ ...metadata.dependencies, ...metadata.optionalDependencies })) {
      if (spec.startsWith("workspace:") || spec.startsWith("file:")) bundled.add(name);
    }
  }
  // All local packages are present at the product root. Registry dependencies
  // of those packages are declared here too; npm must not bundle host binaries.
  const registryDependencies: Record<string, string> = {};
  const optionalDependencies: Record<string, string> = {};
  for (const metadata of [root, ...[...bundled].map(name => packages.get(name)!.metadata)]) {
    for (const [field, output] of [["dependencies", registryDependencies], ["optionalDependencies", optionalDependencies]] as const) {
      for (const name of Object.keys(metadata[field] ?? {})) {
        if (!bundled.has(name)) {
          const dependency = packages.get(name);
          // A missing optional dependency is kept for other target platforms.
          output[name] = dependency?.version ?? metadata[field]![name]!;
        }
      }
    }
  }
  for (const name of Object.keys(registryDependencies)) delete optionalDependencies[name];
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(path.dirname(destination), ".molis-work-npm-"));
  try {
    const staged = path.join(temporary, "package");
    await copyPackageFiles(source, staged, root);
    await linkAuthorSourceReferences(source, staged, options.sourceRevision);
    for (const name of bundled) {
      const dependency = packages.get(name)!;
      const target = path.join(staged, "node_modules", name);
      await copyPackageFiles(dependency.directory, target, dependency.metadata);
      await writePackage(target, publishMetadata(dependency.metadata, packages));
    }
    const manifest = publishMetadata(root, packages);
    manifest.dependencies = {
      ...registryDependencies,
      ...Object.fromEntries([...bundled].map(name => [name, packages.get(name)!.version])),
    };
    manifest.optionalDependencies = optionalDependencies;
    manifest.bundledDependencies = [...bundled].sort();
    await writePackage(staged, manifest);
    await fs.rename(staged, destination);
    return { directory: destination, bundledPackages: manifest.bundledDependencies };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function readPackage(directory: string): Promise<PackageMetadata> {
  return JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
}

function publishMetadata(metadata: PackageMetadata, packages: ReadonlyMap<string, { version: string }>): PackageMetadata {
  const result = { ...metadata };
  delete result.scripts;
  delete result.devDependencies;
  for (const field of ["dependencies", "optionalDependencies"] as const) {
    if (metadata[field]) result[field] = Object.fromEntries(Object.entries(metadata[field]).map(([name, spec]) =>
      [name, spec.startsWith("workspace:") || spec.startsWith("file:") ? packages.get(name)!.version : spec]));
  }
  return result;
}

async function copyPackageFiles(source: string, destination: string, metadata: PackageMetadata): Promise<void> {
  await copyReleaseEntries(source, destination, await declaredReleaseFileEntries(source, metadata));
}

async function writePackage(directory: string, metadata: PackageMetadata): Promise<void> {
  await fs.writeFile(path.join(directory, "package.json"), `${JSON.stringify(metadata, null, 2)}\n`);
}

/** Skill-to-skill links travel with the product. References into the checkout point to the source used to pack it. */
async function linkAuthorSourceReferences(source: string, staged: string, revision?: string): Promise<void> {
  const directory = path.join(staged, "skills", "molis-plugin-dev");
  const remote = "https://github.com/molis-ai/molis-work";
  const commit = revision && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision) ? revision : undefined;
  for (const file of await fs.readdir(directory)) {
    if (!file.endsWith(".md")) continue;
    const filename = path.join(directory, file);
    const original = await fs.readFile(filename, "utf8");
    let markdown = original;
    for (const match of original.matchAll(/\[([^\]\n]+)\]\((\.\.\/[^)\s#]+)(#[^)\s]*)?\)/gu)) {
      const target = path.resolve(directory, match[2]!);
      if (await pathState(target)) continue;
      const relative = path.relative(staged, target).split(path.sep).join("/");
      const sourceTarget = await fs.stat(path.join(source, relative));
      const urlPath = relative.split("/").map(encodeURIComponent).join("/");
      const reference = commit
        ? `[${match[1]}](${remote}/${sourceTarget.isDirectory() ? "tree" : "blob"}/${commit}/${urlPath}${match[3] ?? ""})`
        : `${match[1]}（源码 \`${relative}\`）`;
      markdown = markdown.replaceAll(match[0], reference);
    }
    if (markdown !== original) await fs.writeFile(filename, markdown);
  }
}
