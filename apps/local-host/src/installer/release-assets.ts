import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathState } from "./home-files.js";

/** Source-side distribution assets, copied and fingerprinted by the same release owner. */
export async function releaseAssetPaths(sourceDirectory: string): Promise<string[]> {
  const assets = await vendorReleaseAssetPaths(sourceDirectory);
  for (const entry of ["LICENSE", "README.md", "README.zh.md"]) {
    if (await pathState(path.join(sourceDirectory, entry))) assets.push(entry);
  }
  return assets;
}

/** SDK code is bundled as a runtime dependency; its source archives are not runtime assets. */
export async function vendorReleaseAssetPaths(sourceDirectory: string): Promise<string[]> {
  if (!(await pathState(path.join(sourceDirectory, "vendor")))) return [];
  const assets: string[] = [];
  const visitPrologue = async (relative: string): Promise<void> => {
    for (const entry of await readdir(path.join(sourceDirectory, relative), { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await visitPrologue(child);
      else if (!entry.name.endsWith(".tgz")) assets.push(child);
    }
  };
  for (const entry of await readdir(path.join(sourceDirectory, "vendor"), { withFileTypes: true })) {
    const relative = path.join("vendor", entry.name);
    if (entry.name === "prologue-sdk" && entry.isDirectory()) await visitPrologue(relative);
    else assets.push(relative);
  }
  return assets.sort();
}
