import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors, type PluginPackageBundle, type PluginPackageSigner } from '@molis-ai/molis-work-contracts/platform/plugin';
import { signPluginPackage, verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { contentPayloadFromFolder, type PackContentOptions } from './pack-content.js';
import { writePluginPackageFile } from './package-files.js';

// `pack-bundled`: a content package the installer ships uninstalled (specs/skill-packs/contract-design.md §3, 「随包带上、还没装」),
// made from its source folder — `skills/` packed as `pack-content` packs it, with the publishing choices written down beside it in
// `pack-content.json` instead of on a command line — and signed in the same step. A bundled package is never unsigned: the Host lists
// and installs it as any signed package, so a missing key stops here. The official packages are signed with Molis Work's publisher
// key, which this step takes by reference (a signer, or a key file it is pointed at) and never holds; that key and the release step
// that calls this are batch 26's (26-1).

const bundledErrors = defineErrorCodes('plugin', { publisher_key_missing: 'invalid' });

/** The file beside `skills/` that writes the publishing choices `pack-content` takes as options. */
export const BUNDLED_PACK_OPTIONS_FILE = 'pack-content.json';
const OPTION_KEYS = new Set(['plugin_id', 'version', 'name', 'name_en', 'summary', 'publisher_id', 'scope', 'compatible_from', 'translations']);

const invalid = (message: string): never => { throw pluginErrors.package_invalid(`${BUNDLED_PACK_OPTIONS_FILE}：${message}`); };
const text = (value: unknown, key: string, required: boolean): string | undefined => {
  if (value === undefined && !required) return undefined;
  return typeof value === 'string' && value.trim() ? value : invalid(`${key} 要写成非空的文字`);
};

/** The choices `pack-content.json` writes, read strictly: a key it does not take, or a value of the wrong kind, is refused by name. */
export async function readBundledPackOptions(directory: string): Promise<Omit<PackContentOptions, 'publisherKeyId'>> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(join(directory, BUNDLED_PACK_OPTIONS_FILE), 'utf8')); } catch (error) { return invalid(`读不了：${error instanceof Error ? error.message : String(error)}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid('要是一个对象');
  const fields = raw as Record<string, unknown>;
  for (const key of Object.keys(fields)) if (!OPTION_KEYS.has(key)) invalid(`不认识的键 ${key}`);
  const scope = fields.scope ?? 'project';
  if (scope !== 'project' && scope !== 'home') invalid('scope 只能是 project 或 home');
  const from = fields.compatible_from;
  if (from !== undefined && (!Array.isArray(from) || !from.every(item => typeof item === 'string'))) invalid('compatible_from 要写成版本号的列表');
  const translations = fields.translations;
  if (translations !== undefined && (!translations || typeof translations !== 'object' || Array.isArray(translations)
    || !Object.values(translations).every(item => typeof item === 'string'))) invalid('translations 要写成「中文 → 英文」的对象');
  const nameEn = text(fields.name_en, 'name_en', false), summary = text(fields.summary, 'summary', false);
  return { pluginId: text(fields.plugin_id, 'plugin_id', true)!, version: text(fields.version, 'version', true)!, name: text(fields.name, 'name', true)!,
    publisherId: text(fields.publisher_id, 'publisher_id', true)!, scope: scope as 'project' | 'home',
    ...(nameEn ? { nameEn } : {}), ...(summary ? { summary } : {}), ...(from ? { upgradesFrom: from as string[] } : {}),
    ...(translations ? { translations: translations as Record<string, string> } : {}) };
}

/**
 * Packs the bundled package in `directory` (`skills/` and `pack-content.json`) and signs it with `signer`, whose identity becomes the
 * Manifest's publisher signature; the signed package is checked as the Host checks one before it is written to
 * `<outputDirectory>/<plugin_id>.json`, never over an existing file. Without a signer nothing is packed: `plugin.publisher_key_missing`.
 */
export async function packBundledContent(directory: string, outputDirectory: string, signer: PluginPackageSigner | undefined): Promise<{ bundle: PluginPackageBundle; file: string }> {
  if (!signer) {
    throw bundledErrors.publisher_key_missing('随安装包带上的包要用发布者密钥签名，这里没有给密钥，什么也没写。官方包用 Molis Work 的官方发布者密钥（第 26 批 26-1）；自己试的时候给一把测试密钥');
  }
  const options = await readBundledPackOptions(directory);
  const payload = await contentPayloadFromFolder(join(directory, 'skills'), { ...options, publisherKeyId: signer.publisher_identity });
  const bundle = signPluginPackage({ payload, signature: null, publisher_key: null }, signer);
  verifyPluginPackageSignature(bundle);
  const file = join(outputDirectory, `${payload.manifest.plugin_id}.json`);
  await mkdir(outputDirectory, { recursive: true });
  await writePluginPackageFile(file, bundle);
  return { bundle, file };
}
