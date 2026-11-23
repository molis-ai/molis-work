/**
 * The packages this release ships uninstalled (「随包带上、还没装」, specs/skill-packs/contract-design.md §3, §9): signed content packages
 * — the official Skill packs, later batch 20's scene sets — lying in one folder of the release's own build output, beside the Host's code.
 * Where they lie gives them nothing: each is verified as any package is (the same `verifyPluginPackageSignature` and `readKeptPackage`),
 * installing one is the same preview and confirmation, its publisher is not pinned in advance, and none goes through a built-in
 * `registration` or gets the build's trust. Reading them installs nothing, registers no Skill and keeps no setting.
 */
import { constants, readdirSync } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { HOST_PLUGIN_ID_PREFIX, pluginErrors, type PluginManifest, type PluginPackageBundle } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { LocalPackageSignInput } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import { completeContentPackagePayload } from '@molis-ai/molis-work-plugin-sdk';
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

/**
 * The plugin ids under the Host's prefix that a release folder carries, read from its file names (`<plugin_id>.json`, `<plugin_id>.draft.json`)
 * without opening them (S-reserved-host-prefix). A package is still verified in full when it is listed or previewed; this only says which
 * ids the release may install without the build's trust. A folder that is not there carries none.
 */
export function releasePackageIds(directory: string): ReadonlySet<string> {
  let names: string[];
  try { names = readdirSync(directory); } catch { return new Set(); }
  return new Set(names.map(name => name.endsWith(DRAFT_SUFFIX) ? name.slice(0, -DRAFT_SUFFIX.length) : name.endsWith('.json') ? name.slice(0, -'.json'.length) : '')
    .filter(id => id.startsWith(HOST_PLUGIN_ID_PREFIX)));
}

/** One bundled package that verified: its file in the folder, the signed bundle as it lies there, its Manifest as read, and the key that signed it. */
export interface BundledPackage {
  file: string;
  bundle: PluginPackageBundle;
  manifest: PluginManifest;
  key_id: string;
  localePacks: KeptPackage["localePacks"];
}

/**
 * One bundled package the release ships unsigned (`<plugin_id>.draft.json`): its declaration and files as `pack-bundled --draft` wrote
 * them, with no publisher. Until Molis Work's own publisher key exists (batch 26, 26-1) the official packs ship this way, and this
 * Home signs one with its own publisher identity when the person installs it — the trust of a Skill folder imported from this
 * machine, no more (用户 2026-11-14 定). Lying here still installs nothing and registers nothing.
 */
export interface BundledDraft {
  file: string;
  draft: LocalPackageSignInput;
  manifest: PluginManifest;
  localePacks: KeptPackage["localePacks"];
}

/** The publisher a draft's Manifest is read under before this Home signs it; the signature in the installed package is the Home's. */
const UNSIGNED = { publisher_id: 'molis-home', signature: 'ed25519:sha256:' + '0'.repeat(64) };
const DRAFT_SUFFIX = '.draft.json';

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
export async function readBundledPackages(directory: string): Promise<{ packages: BundledPackage[]; drafts: BundledDraft[]; refused: BundledRefusal[] }> {
  const packages: BundledPackage[] = [], drafts: BundledDraft[] = [], refused: BundledRefusal[] = [];
  const folder = await lstat(directory).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (!folder) return { packages, drafts, refused };
  if (!folder.isDirectory()) return { packages, drafts, refused: [{ file: '.', error: pluginErrors.package_invalid('随包插件的位置不是一个目录') }] };
  const files = (await readdir(directory)).sort();
  // Signed packages first: a draft of a package that also lies here signed is refused, so one id is never offered under two publishers.
  for (const file of [...files.filter(name => !name.endsWith(DRAFT_SUFFIX)), ...files.filter(name => name.endsWith(DRAFT_SUFFIX))]) {
    try {
      if (file.endsWith(DRAFT_SUFFIX)) {
        const draft = draftOf(JSON.parse(await readRegularFile(path.join(directory, file))) as unknown);
        const { manifest, localePacks } = readKeptPackage(completeContentPackagePayload(draft, UNSIGNED));
        if (manifest.kind !== 'content') throw pluginErrors.declaration_invalid('随安装包带上的只能是只有声明的插件（kind: "content"）');
        if (file !== `${manifest.plugin_id}${DRAFT_SUFFIX}`) throw pluginErrors.package_invalid(`随包插件的待签文件要叫 ${manifest.plugin_id}${DRAFT_SUFFIX}`);
        if (packages.some(item => item.manifest.plugin_id === manifest.plugin_id)) throw pluginErrors.package_invalid(`${manifest.plugin_id} 已经有签名的随包插件，不再认它的待签文件`);
        drafts.push({ file, draft, manifest, localePacks });
        continue;
      }
      const { bundle, key_id } = verifyPluginPackageSignature(JSON.parse(await readRegularFile(path.join(directory, file))) as unknown);
      const { manifest, localePacks } = readKeptPackage(bundle.payload);
      if (manifest.kind !== 'content') throw pluginErrors.declaration_invalid('随安装包带上的只能是只有声明的插件（kind: "content"）');
      if (file !== `${manifest.plugin_id}.json`) throw pluginErrors.package_invalid(`随包插件的文件要叫 ${manifest.plugin_id}.json`);
      packages.push({ file, bundle, manifest, key_id, localePacks });
    } catch (error) { refused.push({ file, error: refusal(error) }); }
  }
  return { packages, drafts, refused };
}

/** A draft file's two parts and nothing else: the declaration without a publisher, and the files without a Manifest (the signer writes both). */
function draftOf(value: unknown): LocalPackageSignInput {
  const fields = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const manifest = fields?.manifest, files = fields?.files;
  if (!fields || Object.keys(fields).some(key => key !== 'manifest' && key !== 'files') || !manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(files)
    || !files.every(file => file && typeof file === 'object' && typeof (file as { path?: unknown }).path === 'string' && typeof (file as { content_base64?: unknown }).content_base64 === 'string')) {
    throw pluginErrors.package_invalid('待签的随包插件要是 { manifest, files }，文件各有 path 与 content_base64');
  }
  return { manifest: manifest as Record<string, unknown>, files: files as LocalPackageSignInput['files'] };
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
