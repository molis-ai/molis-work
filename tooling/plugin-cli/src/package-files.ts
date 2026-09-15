import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertPluginPackagePath, parsePluginPackage, PluginPackageError } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";

const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

export async function readPluginPackageFile(file: string): Promise<PluginPackageBundle> {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.size > MAX_BUNDLE_BYTES) throw new PluginPackageError("plugin_package_invalid", "Plugin bundle 必须为不超过 64 MiB 的普通文件");
  return parsePluginPackage(JSON.parse(await readFile(file, "utf8")) as unknown);
}

export async function writePluginPackageFile(file: string, bundle: PluginPackageBundle): Promise<void> {
  const encoded = JSON.stringify(bundle, null, 2) + "\n";
  if (Buffer.byteLength(encoded) > MAX_BUNDLE_BYTES) throw new PluginPackageError("plugin_package_invalid", "Plugin bundle 超过 64 MiB");
  await writeFile(file, encoded, { flag: "wx" });
}

export async function packPluginProject(directory: string, output: string): Promise<PluginPackageBundle> {
  const root = await realpath(directory);
  let bytesRead = 0;
  const read = async (name: string): Promise<Buffer> => {
    assertPluginPackagePath(name);
    const parts = name.split("/");
    let location = root;
    for (const [index, part] of parts.entries()) {
      location = join(location, part);
      const stat = await lstat(location);
      if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
        throw new PluginPackageError("plugin_package_invalid", "打包不接受 symlink 或非普通文件");
      }
      if (index === parts.length - 1) {
        bytesRead += stat.size;
        if (bytesRead > MAX_BUNDLE_BYTES) throw new PluginPackageError("plugin_package_invalid", "Plugin 文件总量超过 64 MiB");
      }
    }
    return readFile(location);
  };
  const packageBytes = await read("package.json");
  const packageJson = JSON.parse(packageBytes.toString("utf8")) as { files?: unknown };
  if (!Array.isArray(packageJson.files) || !packageJson.files.every(file => typeof file === "string")) {
    throw new PluginPackageError("plugin_package_invalid", "package.json 必须用 files 明确列出分发文件，不执行 glob 或 lifecycle script");
  }
  const files = [{ path: "package.json", content_base64: packageBytes.toString("base64") }];
  for (const file of [...new Set(["manifest.json", ...packageJson.files as string[]])].filter(file => file !== "package.json").sort()) {
    files.push({ path: file, content_base64: (await read(file)).toString("base64") });
  }
  const manifest = JSON.parse(Buffer.from(files.find(file => file.path === "manifest.json")!.content_base64, "base64").toString("utf8")) as unknown;
  const bundle = parsePluginPackage({ payload: { schema_version: 1, manifest, files }, signature: null });
  await writePluginPackageFile(output, bundle);
  return bundle;
}
