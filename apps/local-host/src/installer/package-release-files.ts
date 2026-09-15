import { promises as fs } from "node:fs";
import path from "node:path";
import { MolisWorkHomeInstallError } from "./home-contract.js";
import { pathState } from "./home-files.js";

const OPTIONAL_RELEASE_DOCS = ["LICENSE", "README.md"] as const;

/** Molis Work manifests use explicit relative files/directories, not globs. */
export function isUnsupportedReleaseFileEntry(entry: string): boolean {
  return path.isAbsolute(entry) || entry.split(/[\\/]/).includes("..") || /[*?\[\]{}]/.test(entry);
}

export async function declaredReleaseFileEntries(
  source: string,
  metadata: { name: string; files?: unknown },
): Promise<string[]> {
  if (!Array.isArray(metadata.files) || metadata.files.length === 0) {
    throw new Error(`Unsupported release files entry in ${metadata.name}: ${JSON.stringify(metadata.files ?? null)}`);
  }
  const declared: string[] = [];
  for (const entry of metadata.files) {
    if (typeof entry !== "string" || isUnsupportedReleaseFileEntry(entry)) {
      throw new Error(`Unsupported release files entry in ${metadata.name}: ${entry}`);
    }
    declared.push(entry);
  }
  const entries: string[] = [];
  for (const entry of new Set([...declared, ...OPTIONAL_RELEASE_DOCS])) {
    const from = path.join(source, entry);
    if (!(await pathState(from))) {
      if (!declared.includes(entry)) continue;
      throw new Error(`Missing release asset in ${metadata.name}: ${entry}`);
    }
    entries.push(entry);
  }
  return entries;
}

export async function copyReleaseEntries(
  source: string,
  destination: string,
  entries: readonly string[],
): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    await fs.cp(path.join(source, entry), path.join(destination, entry), {
      recursive: true,
      dereference: true,
      errorOnExist: true,
      force: false,
    });
  }
}

/** Same relative paths Home/App copy and fingerprint for one runtime dependency. */
export async function runtimeDependencyReleaseEntries(directory: string): Promise<string[]> {
  try {
    const realDirectory = await fs.realpath(directory);
    if (realDirectory.split(path.sep).includes("node_modules")) {
      return (await fs.readdir(directory)).filter((entry) => entry !== "node_modules").sort();
    }
    const metadata = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8")) as {
      name?: unknown;
      files?: unknown;
    };
    const declared = await declaredReleaseFileEntries(directory, {
      name: String(metadata.name ?? path.basename(directory)),
      files: metadata.files,
    });
    return [...new Set(["package.json", ...declared])].sort();
  } catch (error) {
    if (error instanceof MolisWorkHomeInstallError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new MolisWorkHomeInstallError(
      message.includes("Missing release asset") ? "source.asset_missing" : "source.invalid",
      message.startsWith("Missing release asset") || message.startsWith("Unsupported release files")
        ? message
        : `Molis Work 依赖发布文件范围无效: ${message}`,
    );
  }
}
