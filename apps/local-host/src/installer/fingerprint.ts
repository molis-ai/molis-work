import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface MolisWorkBuildManifest {
  schema_version: 1;
  source_digest: string;
  created_at: string;
}

const BUILD_INPUTS = ["package.json", "tsconfig.json"] as const;
// These are the package levels declared by pnpm-workspace.yaml. Never walk node_modules or build output.
const WORKSPACE_MANIFESTS = [
  "apps/*/package.json", "packages/*/package.json", "modules/*/package.json", "horizontal/*/package.json",
  "plugins/native/*/package.json", "plugins/official-integrations/*/package.json", "tooling/plugin-cli/package.json",
];

export async function computeBuildSourceDigest(packageRoot: string): Promise<string> {
  const inputs: string[] = [...BUILD_INPUTS];
  for (const file of ["src", "apps/desktop/launchers", "apps/local-host/sdk", "tsconfig.sdk.json", "pnpm-workspace.yaml", "pnpm-lock.yaml", "tsconfig.base.json", "tsconfig.package.json", "scripts"]) {
    if (await exists(path.join(packageRoot, file))) inputs.push(file);
  }
  for await (const manifest of fs.glob(WORKSPACE_MANIFESTS, { cwd: packageRoot })) {
    const directory = path.dirname(manifest);
    inputs.push(manifest);
    for (const entry of ["src", "tooling", "bin", "tsconfig.json"]) {
      const relative = path.join(directory, entry);
      if (await exists(path.join(packageRoot, relative))) inputs.push(relative);
    }
  }
  return digestPaths(packageRoot, inputs);
}

async function exists(file: string): Promise<boolean> {
  try { await fs.lstat(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

export async function writeMolisWorkBuildManifest(packageRoot: string): Promise<MolisWorkBuildManifest> {
  const manifest: MolisWorkBuildManifest = {
    schema_version: 1,
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
