import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginErrors, type PluginPackageBundle, type PluginPackagePayload, type PluginTranslationsDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SKILL_LIMITS } from '@molis-ai/molis-work-contracts/platform/plugin-agent';
import { contentPackagePayload, skillFromFolder } from '@molis-ai/molis-work-plugin-sdk';
import { parsePluginPackage } from '@molis-ai/molis-work-plugin-runtime';
import { writePluginPackageFile } from './package-files.js';

// `pack-content`: a folder of Skill folders (each `<skill_id>/SKILL.md` with its `references/`, `scripts/`, `assets/`) packed into the
// unsigned content package of a plugin with only declarations (specs/skill-packs/contract-design.md §3, §4.1). The same packer as the
// Host's Skills import (`skillFromFolder`, `contentPackagePayload`); sign it with `sign`, as any package.

export interface PackContentOptions {
  pluginId: string;
  name: string;
  version: string;
  publisherId: string;
  publisherKeyId: string;
  scope?: 'project' | 'home';
  upgradesFrom?: string[];
  /** The package's English name, its one-line summary, and the English of its words; a bundled package's options give them (`pack-bundled`). */
  nameEn?: string;
  summary?: string;
  translations?: PluginTranslationsDeclaration;
}

const invalid = (message: string): never => { throw pluginErrors.package_invalid(message); };

/** Every regular file under one Skill folder, by its path there; a link, or anything that is neither file nor folder, is refused. */
async function folderFiles(root: string, budget: { files: number; bytes: number }): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name), relative = prefix + name, stat = await lstat(path);
      if (stat.isSymbolicLink()) invalid(`打包不接受符号链接：${relative}`);
      if (stat.isDirectory()) { await walk(path, `${relative}/`); continue; }
      if (!stat.isFile()) invalid(`不是普通文件：${relative}`);
      if (++budget.files > SKILL_LIMITS.filesPerPackage) invalid(`内容包至多 ${SKILL_LIMITS.filesPerPackage} 个文件`);
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const size = (await handle.stat()).size;
        if (size > SKILL_LIMITS.fileBytes || (budget.bytes += size) > SKILL_LIMITS.packageBytes) invalid(`文件或总量超过大小限制：${relative}`);
        files.set(relative, await handle.readFile());
      } finally { await handle.close(); }
    }
  };
  await walk(root, '');
  return files;
}

/** Packs each Skill folder under `directory`; one that is not a Skill (no SKILL.md, a file out of place, a frontmatter the reading refuses) refuses the package. */
export async function packContentProject(directory: string, output: string, options: PackContentOptions): Promise<PluginPackageBundle> {
  const bundle = parsePluginPackage({ payload: await contentPayloadFromFolder(directory, options), signature: null, publisher_key: null });
  await writePluginPackageFile(output, bundle);
  return bundle;
}

/** The unsigned payload of the content package the Skill folders under `directory` make, written by nothing yet. */
export async function contentPayloadFromFolder(directory: string, options: PackContentOptions): Promise<PluginPackagePayload> {
  const root = await realpath(directory), budget = { files: 0, bytes: 0 }, skills = [];
  for (const name of (await readdir(root)).sort()) {
    const path = join(root, name), stat = await lstat(path);
    if (stat.isSymbolicLink()) invalid(`打包不接受符号链接：${name}`);
    if (!stat.isDirectory()) continue;
    skills.push(skillFromFolder(await folderFiles(path, budget)));
  }
  if (!skills.length) invalid('目录里没有技能：每个技能是一个带 SKILL.md 的子目录');
  return contentPackagePayload({ plugin_id: options.pluginId, version: options.version, name: options.name,
    ...(options.nameEn ? { name_en: options.nameEn } : {}), ...(options.summary ? { summary: options.summary } : {}),
    ...(options.translations ? { translations: options.translations } : {}),
    publisher: { publisher_id: options.publisherId, signature: options.publisherKeyId }, scope: options.scope ?? 'project',
    ...(options.upgradesFrom ? { compatible_from: options.upgradesFrom } : {}), skills });
}

/** The publishing choices `pack-content` takes; the Manifest is written from them and from the Skills, never taken from the author. */
export function contentPackOptions(args: readonly string[]): PackContentOptions {
  const allowed = new Set(['plugin-id', 'name', 'version', 'publisher-id', 'publisher-key-id', 'scope', 'compatible-from']);
  const fields = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2), value = args[i + 1];
    if (!args[i]?.startsWith('--') || !key || !allowed.has(key) || fields.has(key) || value === undefined) invalid('pack-content 参数未知、重复或缺少值');
    fields.set(key, value!);
  }
  const need = (key: string) => fields.get(key)?.trim() || invalid('pack-content 缺少 --' + key);
  const scope = fields.get('scope') ?? 'project';
  if (scope !== 'project' && scope !== 'home') return invalid('scope 只能是 project 或 home');
  return { pluginId: need('plugin-id'), name: need('name'), version: need('version'), publisherId: need('publisher-id'), publisherKeyId: need('publisher-key-id'), scope,
    ...(fields.has('compatible-from') ? { upgradesFrom: fields.get('compatible-from')!.split(',') } : {}) };
}
