import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/** The desktop reads this file too (`apps/desktop/adapters/tauri/src/web_service.rs`, `read_build_time`): a new version of it changes both. */
export interface MolisWorkBuildManifest {
  schema_version: /* @version format.build.manifest */ 1;
  source_digest: string;
  created_at: string;
}

const BUILD_INPUTS = ["package.json", "tsconfig.json"] as const;
// These are the package levels declared by pnpm-workspace.yaml. Never walk node_modules or build output.
const WORKSPACE_MANIFESTS = [
  "apps/*/package.json",
  "server/package.json",
  "packages/*/package.json",
  "modules/*/package.json",
  "horizontal/*/package.json",
  "plugins/native/*/package.json",
  "plugins/official-integrations/*/package.json",
  "tooling/plugin-cli/package.json",
];

const ROOT_BUILD_INPUTS = [
  "src",
  "apps/desktop/launchers",
  "packages/system-skills",
  "plugins/content",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "tsconfig.base.json",
  "tsconfig.package.json",
  "scripts",
] as const;

const PACKAGE_BUILD_INPUTS = [
  "src",
  "tooling",
  "bin",
  "tsconfig.json",
  "tsconfig.browser.json",
  "tsconfig.editor.json",
  "resources",
  "prompts",
  "locales",
  "methods",
  "manifest.json",
  "fonts",
  "providers",
  "public",
  "native/materials/THIRD-PARTY-NOTICES.md",
  "native/materials/licenses",
] as const;

export async function computeBuildSourceDigest(packageRoot: string): Promise<string> {
  const inputs: string[] = [...BUILD_INPUTS];
  for (const file of ROOT_BUILD_INPUTS) {
    if (await exists(path.join(packageRoot, file))) inputs.push(file);
  }
  for await (const manifest of fs.glob(WORKSPACE_MANIFESTS, { cwd: packageRoot })) {
    const directory = path.dirname(manifest);
    inputs.push(manifest);
    for (const entry of PACKAGE_BUILD_INPUTS) {
      const relative = path.join(directory, entry);
      if (await exists(path.join(packageRoot, relative))) inputs.push(relative);
    }
    // Native Host tools are compiled inputs too; SwiftPM caches and generated binaries are not.
    for await (const native of fs.glob(["native/**/*.swift", "native/**/*.sh", "native/**/*.mjs", "native/**/Package.resolved"], {
      cwd: path.join(packageRoot, directory), exclude: ["**/.build/**", "**/.swiftpm/**", "**/bin/**"],
    })) inputs.push(path.join(directory, native));
  }
  return digestPaths(packageRoot, [...new Set(inputs)]);
}

async function exists(file: string): Promise<boolean> {
  try { await fs.lstat(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

export async function writeMolisWorkBuildManifest(packageRoot: string): Promise<MolisWorkBuildManifest> {
  const manifest: MolisWorkBuildManifest = {
    schema_version: /* @version format.build.manifest */ 1,
    source_digest: await computeBuildSourceDigest(packageRoot),
    created_at: new Date().toISOString(),
  };
  const target = path.join(packageRoot, "dist", ".molis-work-build.json");
  await fs.writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function digestPaths(root: string, entries: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort()) {
    await appendPath(hash, root, path.join(root, entry));
  }
  return hash.digest("hex");
}

async function appendPath(hash: ReturnType<typeof createHash>, root: string, target: string): Promise<void> {
  const relative = path.relative(root, target).split(path.sep).join("/");
  const state = await fs.lstat(target);
  if (state.isDirectory()) {
    hash.update(`directory\0${relative}\0`);
    const children = (await fs.readdir(target)).sort();
    for (const child of children) await appendPath(hash, root, path.join(target, child));
    return;
  }
  if (state.isSymbolicLink()) {
    hash.update(`symlink\0${relative}\0${await fs.readlink(target)}\0`);
    return;
  }
  if (!state.isFile()) return;
  hash.update(`file\0${relative}\0${state.mode & 0o777}\0`);
  hash.update(await fs.readFile(target));
  hash.update("\0");
}
