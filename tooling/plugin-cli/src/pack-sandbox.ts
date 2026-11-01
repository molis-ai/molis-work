import { SANDBOX_PACKAGE_FILES, pluginErrors, type PluginPackageBundle, type SandboxPackageManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { effectsFromContract, parsePluginPackageManifest, sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
import { PLUGIN_ICON_NAMES, type PluginIconName } from '@molis-ai/molis-work-plugin-sdk/ui';
import { parsePluginPackage } from '@molis-ai/molis-work-plugin-runtime';
import { packageFileReader, writePluginPackageFile } from './package-files.js';

export interface PackSandboxOptions {
  name: string;
  version: string;
  publisherId: string;
  publisherKeyId: string;
  scope?: 'project' | 'home';
  icon?: PluginIconName;
  upgradesFrom?: string[];
  agent?: SandboxPackageManifest['agent'];
  methods?: SandboxPackageManifest['methods'];
}

const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = (message: string): never => { throw pluginErrors.package_invalid(message); };

/** Only the fields the packer consumes; the Host still performs full contract/interface validation before installation. */
function contractInput(raw: unknown): SandboxPluginContract {
  if (!plain(raw) || typeof raw.pluginId !== 'string' || !Array.isArray(raw.operations)) return invalid('contract.json 必须声明 pluginId 和 operations');
  for (const operation of raw.operations) {
    if (!plain(operation) || !plain(operation.effects) || Object.values(operation.effects).some(value => !Array.isArray(value) || value.some(item => typeof item !== 'string'))) {
      return invalid('每个 operation.effects 必须把效果名映射到字符串列表');
    }
  }
  return { ...raw, pluginId: raw.pluginId, operations: raw.operations } as SandboxPluginContract;
}

/** An unsigned sandbox container, ready for the existing sign/verify commands; never recursively packs a release directory. */
export async function packSandboxProject(directory: string, output: string, options: PackSandboxOptions): Promise<PluginPackageBundle> {
  if (options.scope !== undefined && options.scope !== 'home' && options.scope !== 'project') invalid('scope 只能是 project 或 home');
  if (options.icon !== undefined && !PLUGIN_ICON_NAMES.includes(options.icon)) invalid('icon 必须是 SDK 图标名');
  const read = await packageFileReader(directory), files: PluginPackageBundle['payload']['files'] = [];
  const readJson = async (name: string): Promise<unknown> => {
    const bytes = await read(name, 4 * 1024 * 1024);
    files.push({ path: name, content_base64: bytes.toString('base64') });
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return invalid(name + ' 不是有效 UTF-8 JSON'); }
  };
  const contract = contractInput(await readJson(SANDBOX_PACKAGE_FILES.contract));
  const surface = await readJson(SANDBOX_PACKAGE_FILES.interface);
  if (!plain(surface) || !Array.isArray(surface.parts) || !Array.isArray(surface.nodes)
    || Object.keys(surface).some(key => !['parts', 'nodes', 'acceptance', 'presentation'].includes(key))) return invalid('interface.json 必须声明 parts/nodes，不能加入任意字段');
  const prompts = await readJson(SANDBOX_PACKAGE_FILES.prompts);
  if (!Array.isArray(prompts)) invalid('prompts.json 必须是列表');
  const code = await read(SANDBOX_PACKAGE_FILES.entrypoint, 8 * 1024 * 1024);
  if (!code.length) invalid('plugin.mjs 不能为空');
  files.push({ path: SANDBOX_PACKAGE_FILES.entrypoint, content_base64: code.toString('base64') });
  const { agent: projectedAgent, methods: projectedMethods, ...fixed } = sandboxPluginManifest({
    pluginId: contract.pluginId, name: options.name, version: options.version,
    publisher: { publisher_id: options.publisherId, signature: options.publisherKeyId },
    presentation: surface.presentation !== undefined, effects: effectsFromContract(contract),
    ...(options.scope === 'home' ? { runtime: { scope: 'home' } } : {}),
    ...(options.icon ? { icon: options.icon } : {}), upgradesFrom: options.upgradesFrom,
  });
  void projectedAgent; void projectedMethods;
  const manifest: SandboxPackageManifest = { ...fixed, ...(options.agent !== undefined ? { agent: options.agent } : {}), ...(options.methods !== undefined ? { methods: options.methods } : {}) };
  parsePluginPackageManifest(manifest);
  for (const name of new Set([...(manifest.agent ?? []), ...(manifest.methods ?? [])].map(item => item.body))) {
    const bytes = await read(name, 32_000);
    files.push({ path: name, content_base64: bytes.toString('base64') });
  }
  files.push({ path: SANDBOX_PACKAGE_FILES.manifest, content_base64: Buffer.from(JSON.stringify(manifest)).toString('base64') });
  const bundle = parsePluginPackage({ payload: { schema_version: 1, manifest, files }, signature: null, publisher_key: null });
  await writePluginPackageFile(output, bundle);
  return bundle;
}

/** Explicit publishing choices, never a user-supplied Manifest or derived permission list. */
export function sandboxPackOptions(args: readonly string[]): PackSandboxOptions {
  const allowed = new Set(['name', 'version', 'publisher-id', 'publisher-key-id', 'scope', 'icon', 'compatible-from', 'agent', 'methods']);
  const fields = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2), value = args[i + 1];
    if (!args[i]?.startsWith('--') || !key || !allowed.has(key) || fields.has(key) || value === undefined) invalid('pack-sandbox 参数未知、重复或缺少值');
    fields.set(key, value);
  }
  const need = (key: string) => fields.get(key)?.trim() || invalid('pack-sandbox 缺少 --' + key);
  const scope = fields.get('scope') ?? 'project', icon = fields.get('icon');
  if (scope !== 'project' && scope !== 'home') return invalid('scope 只能是 project 或 home');
  if (icon && !PLUGIN_ICON_NAMES.some(value => value === icon)) invalid('icon 必须是 SDK 图标名');
  const json = (key: string): unknown => { try { return JSON.parse(fields.get(key)!); } catch { return invalid('--' + key + ' 必须是 JSON'); } };
  return { name: need('name'), version: need('version'), publisherId: need('publisher-id'), publisherKeyId: need('publisher-key-id'), scope,
    ...(icon ? { icon: icon as PluginIconName } : {}), ...(fields.has('compatible-from') ? { upgradesFrom: fields.get('compatible-from')!.split(',') } : {}),
    ...(fields.has('agent') ? { agent: json('agent') as SandboxPackageManifest['agent'] } : {}), ...(fields.has('methods') ? { methods: json('methods') as SandboxPackageManifest['methods'] } : {}) };
}
