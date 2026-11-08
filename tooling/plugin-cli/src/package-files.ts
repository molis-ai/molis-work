import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertPluginLocales, assertPluginPackagePath, parsePluginPackage, pluginLocaleFilePaths } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginPackageManifest } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";

const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

export async function readPluginPackageFile(file: string): Promise<PluginPackageBundle> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > MAX_BUNDLE_BYTES) throw pluginErrors.package_invalid("Plugin bundle 必须为不超过 64 MiB 的普通文件");
  return parsePluginPackage(JSON.parse(await readFile(file, "utf8")) as unknown);
}

export async function writePluginPackageFile(file: string, bundle: PluginPackageBundle): Promise<void> {
  const encoded = JSON.stringify(bundle, null, 2) + "\n";
  if (Buffer.byteLength(encoded) > MAX_BUNDLE_BYTES) throw pluginErrors.package_invalid("Plugin bundle 超过 64 MiB");
  await writeFile(file, encoded, { flag: "wx" });
}

/** Reads only explicitly named regular files below one package root. */
export async function packageFileReader(directory: string): Promise<(name: string, limit?: number) => Promise<Buffer>> {
  const root = await realpath(directory);
  let bytesRead = 0;
  return async (name: string, limit = MAX_BUNDLE_BYTES): Promise<Buffer> => {
    assertPluginPackagePath(name);
    const parts = name.split("/");
    let location = root;
    for (const [index, part] of parts.entries()) {
      location = join(location, part);
      const stat = await lstat(location);
      if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
        throw pluginErrors.package_invalid("打包不接受 symlink 或非普通文件");
      }
      if (index === parts.length - 1) {
        if (stat.size > limit) throw pluginErrors.package_invalid("Plugin 文件超过大小限制：" + name);
      }
    }
    const handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > limit || bytesRead + stat.size > MAX_BUNDLE_BYTES) throw pluginErrors.package_invalid("Plugin 文件或总量超过大小限制");
      const buffer = Buffer.alloc(stat.size + 1), { bytesRead: length } = await handle.read(buffer, 0, buffer.length, 0);
      if (length !== stat.size) throw pluginErrors.package_invalid("Plugin 文件在读取时改变");
      bytesRead += length;
      return buffer.subarray(0, length);
    } finally { await handle.close(); }
  };
}

/** A declared language's file, or `null` when it is not there: the rules in `locale-packs.ts` say what that means. A link or anything else that is no plain file is still refused. */
export async function readLocaleFileOrNull(read: Awaited<ReturnType<typeof packageFileReader>>, name: string): Promise<Buffer | null> {
  try {
    return await read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function packPluginProject(directory: string, output: string): Promise<PluginPackageBundle> {
  const read = await packageFileReader(directory);
  const packageBytes = await read("package.json");
  const packageJson = JSON.parse(packageBytes.toString("utf8")) as { files?: unknown };
  if (!Array.isArray(packageJson.files) || !packageJson.files.every(file => typeof file === "string")) {
    throw pluginErrors.package_invalid("package.json 必须用 files 明确列出分发文件，不执行 glob 或 lifecycle script");
  }
  const files = [{ path: "package.json", content_base64: packageBytes.toString("base64") }];
  for (const file of [...new Set(["manifest.json", ...packageJson.files as string[]])].filter(file => file !== "package.json").sort()) {
    files.push({ path: file, content_base64: (await read(file)).toString("base64") });
  }
  const manifest = JSON.parse(Buffer.from(files.find(file => file.path === "manifest.json")!.content_base64, "base64").toString("utf8")) as unknown;
  // The Manifest already says which language files ship, so `files` does not have to say it again; one that is missing is `parsePluginPackage`'s to refuse.
  for (const file of pluginLocaleFilePaths(parsePluginPackageManifest(manifest))) {
    const bytes = files.some(({ path }) => path === file) ? null : await readLocaleFileOrNull(read, file);
    if (bytes !== null) files.push({ path: file, content_base64: bytes.toString("base64") });
  }
  const bundle = parsePluginPackage({ payload: { schema_version: /* @version format.plugin.package */ 1, manifest, files }, signature: null, publisher_key: null });
  const packed = new Map(bundle.payload.files.map(({ path, content_base64 }) => [path, content_base64]));
  assertPluginLocales(bundle.payload.manifest, (path) => {
    const content = packed.get(path);
    return content === undefined ? null : Buffer.from(content, "base64").toString("utf8");
  });
  await writePluginPackageFile(output, bundle);
  return bundle;
}
