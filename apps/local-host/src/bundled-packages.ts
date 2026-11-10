/**
 * The packages this release ships uninstalled (「随包带上、还没装」, specs/skill-packs/contract-design.md §3, §9): signed content packages
 * — the official Skill packs, later batch 20's scene sets — lying in one folder of the release's own build output, beside the Host's code.
 * Where they lie gives them nothing: each is verified as any package is (the same `verifyPluginPackageSignature` and `readKeptPackage`),
 * installing one is the same preview and confirmation, its publisher is not pinned in advance, and none goes through a built-in
 * `registration` or gets the build's trust. Reading them installs nothing, registers no Skill and keeps no setting.
 */
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors, type PluginManifest, type PluginPackageBundle } from '@molis-ai/molis-work-contracts/platform/plugin';
import { verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { readKeptPackage, type KeptPackage } from './sandbox-package.js';

/** A signed package is at most this big, as the CLI and the install read one. */
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

/**
 * The release's own folder of bundled packages: `bundled-plugins/` in this package's build output, which the Home release and the
 * desktop payload copy with the rest of the code. No setting, environment variable or action input names another; only a test hands
 * the Host one (`MolisWorkLocalHostOptions.bundledPluginsDirectory`).
 */
export function bundledPackagesDirectory(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'bundled-plugins');
}

/** One bundled package that verified: its file in the folder, the signed bundle as it lies there, its Manifest as read, and the key that signed it. */
export interface BundledPackage {
  file: string;
  bundle: PluginPackageBundle;
  manifest: PluginManifest;
  key_id: string;
  localePacks: KeptPackage["localePacks"];
}

/** A file in the folder that is not a bundled package the Host takes, with the refusal reading it raised. */
export interface BundledRefusal {
  file: string;
  error: ActionError;
}

const refusal = (error: unknown): ActionError => error instanceof ActionError ? error : pluginErrors.package_invalid(error instanceof Error ? error.message : String(error));

/**
 * Reads every file in the folder as a signed content package, by name order. A link, anything that is not a regular file, a file over
 * the size limit, one that is not JSON, unsigned, altered or signed by a key its Manifest does not name, one in no package format, one
 * that is not a plugin with only declarations, or one not named `<plugin_id>.json`, is refused with its reason and taken no further. A
 * folder that is not there is no bundled package.
 */
export async function readBundledPackages(directory: string): Promise<{ packages: BundledPackage[]; refused: BundledRefusal[] }> {
  const packages: BundledPackage[] = [], refused: BundledRefusal[] = [];
  const folder = await lstat(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (!folder) return { packages, refused };
  if (!folder.isDirectory()) return { packages, refused: [{ file: '.', error: pluginErrors.package_invalid('随包插件的位置不是一个目录') }] };
  for (const file of (await readdir(directory)).sort()) {
    try {
      const { bundle, key_id } = verifyPluginPackageSignature(JSON.parse(await readRegularFile(path.join(directory, file))) as unknown);
      const { manifest, localePacks } = readKeptPackage(bundle.payload);
      if (manifest.kind !== 'content') throw pluginErrors.declaration_invalid('随安装包带上的只能是只有声明的插件（kind: "content"）');
      if (file !== `${manifest.plugin_id}.json`) throw pluginErrors.package_invalid(`随包插件的文件要叫 ${manifest.plugin_id}.json`);
      packages.push({ file, bundle, manifest, key_id, localePacks });
    } catch (error) { refused.push({ file, error: refusal(error) }); }
  }
  return { packages, refused };
}

/** A regular file's text, read without following a link and only within the package limit. */
async function readRegularFile(location: string): Promise<string> {
  const stat = await lstat(location);
  if (stat.isSymbolicLink() || !stat.isFile()) throw pluginErrors.package_invalid('随包插件只认普通文件，不认链接或目录');
  const handle = await open(location, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if ((await handle.stat()).size > MAX_PACKAGE_BYTES) throw pluginErrors.package_invalid('随包插件超过 64 MiB');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
