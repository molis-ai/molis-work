/**
 * Reads a sandbox package (the public format in `SANDBOX_PACKAGE_FILES`, described in docs/platform/PLUGIN-DEVELOPMENT.md) into what the
 * Host runs it from. The plugin studio is one author of the format; this reads the format and nothing of the studio. It writes nothing:
 * it runs after the package's signature is verified and before the first record of an install is written, and a package that does
 * not fit stops here with `plugin.declaration_invalid`.
 */
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { pluginErrors, SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginPackagePayload, type SandboxPackagePrompt } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { assertContract, effectsFromContract } from '@molis-ai/molis-work-plugin-sandbox';
import { validatePluginComponentNodes, validatePluginComponentPlans, validatePluginPresentation,
  type PluginComponentNode, type PluginComponentPlan, type PluginPresentation } from '@molis-ai/molis-work-design-system';
import { sandboxPluginManifest } from './sandbox-plugin-manifest.js';

/** The longest plugin code the Host takes, as the studio's own publish does. */
const MAX_ENTRYPOINT_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PROMPTS = 64;
const PROMPT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_PROMPT_BODY = 8000;

export interface SandboxPackage {
  readonly manifest: PluginManifest;
  readonly contract: SandboxPluginContract;
  readonly parts: PluginComponentPlan[];
  readonly nodes: PluginComponentNode[];
  readonly presentation?: PluginPresentation;
  readonly acceptance: unknown[];
  readonly prompts: SandboxPackagePrompt[];
  /** The plugin's code, as the package ships it. */
  readonly entrypoint: Uint8Array;
  /** What the contract's operations ask for in all: the person approves exactly this at install. */
  readonly permissions: SandboxEffects;
}

const refuse = (detail: string): never => { throw pluginErrors.declaration_invalid('沙箱包：' + detail); };
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function jsonFile(files: ReadonlyMap<string, Uint8Array>, name: string): unknown {
  const bytes = files.get(name) ?? refuse('缺少 ' + name);
  if (bytes.length > MAX_FILE_BYTES) refuse(name + ' 太大');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { return refuse(name + ' 不是有效的 JSON'); }
}

/** A step of the reading that the Host's validators fail: the package, not the person's input, is wrong. */
function validated<T>(what: string, check: () => T): T {
  try { return check(); } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'plugin.declaration_invalid') throw error;
    return refuse(what + '：' + (error instanceof Error ? error.message : String(error)));
  }
}

function promptsOf(value: unknown): SandboxPackagePrompt[] {
  if (!Array.isArray(value) || value.length > MAX_PROMPTS) refuse('prompts.json 要是不超过 ' + MAX_PROMPTS + ' 项的数组');
  const seen = new Set<string>();
  return (value as unknown[]).map(item => {
    if (!plain(item) || Object.keys(item).some(key => !['id', 'title', 'purpose', 'body'].includes(key))
      || ['id', 'title', 'purpose', 'body'].some(key => typeof item[key] !== 'string')) return refuse('每个 prompt 是 { id, title, purpose, body }，都是文字');
    const prompt: SandboxPackagePrompt = { id: item.id as string, title: item.title as string, purpose: item.purpose as string, body: item.body as string };
    if (!PROMPT_ID.test(prompt.id) || seen.has(prompt.id)) refuse('prompt 标识不合法或重复：' + prompt.id);
    if (!prompt.title.trim() || !prompt.purpose.trim() || !prompt.body.trim() || prompt.body.length > MAX_PROMPT_BODY) refuse('prompt ' + prompt.id + ' 需要标题、用途和不超过 ' + MAX_PROMPT_BODY + ' 字的正文');
    seen.add(prompt.id);
    return { id: prompt.id, title: prompt.title.trim(), purpose: prompt.purpose.trim(), body: prompt.body.trim() };
  });
}

export function readSandboxPackage(payload: PluginPackagePayload): SandboxPackage {
  const wanted = Object.values(SANDBOX_PACKAGE_FILES) as string[];
  const files = new Map(payload.files.map(file => [file.path, Buffer.from(file.content_base64, 'base64')] as const));
  for (const path of files.keys()) if (!wanted.includes(path)) refuse('包里有格式之外的文件：' + path);
  const entrypoint = files.get(SANDBOX_PACKAGE_FILES.entrypoint) ?? refuse('缺少 ' + SANDBOX_PACKAGE_FILES.entrypoint);
  if (!entrypoint.length || entrypoint.length > MAX_ENTRYPOINT_BYTES) refuse(SANDBOX_PACKAGE_FILES.entrypoint + ' 为空或太大');

  const { manifest } = payload;
  if (!isDeepStrictEqual(jsonFile(files, SANDBOX_PACKAGE_FILES.manifest), JSON.parse(JSON.stringify(manifest)))) refuse('manifest.json 与包的清单不一致');
  const contract = validated('contract.json', () => { const raw = jsonFile(files, SANDBOX_PACKAGE_FILES.contract); assertContract(raw); return raw; });
  if (contract.pluginId !== manifest.plugin_id) refuse('contract.json 的 pluginId 与清单的 plugin_id 不一致');

  const shape = jsonFile(files, SANDBOX_PACKAGE_FILES.interface);
  if (!plain(shape) || Object.keys(shape).some(key => !['parts', 'nodes', 'presentation', 'acceptance'].includes(key))) return refuse('interface.json 只能有 parts、nodes、presentation、acceptance');
  const surface: { parts?: unknown; nodes?: unknown; presentation?: unknown; acceptance?: unknown } = shape;
  const parts = validated('interface.json 的 parts', () => validatePluginComponentPlans(surface.parts, contract));
  const nodes = validated('interface.json 的 nodes', () => {
    if (!Array.isArray(surface.nodes)) throw new Error('nodes 要是数组');
    const assembled: PluginComponentNode[] = surface.nodes;
    validatePluginComponentNodes(assembled, parts, contract);
    return assembled;
  });
  const presentation = surface.presentation === undefined ? undefined
    : validated('interface.json 的 presentation', () => validatePluginPresentation(surface.presentation, parts, contract));
  const acceptance: unknown[] = surface.acceptance === undefined ? [] : Array.isArray(surface.acceptance) ? surface.acceptance : refuse('interface.json 的 acceptance 要是数组');

  const prompts = promptsOf(jsonFile(files, SANDBOX_PACKAGE_FILES.prompts));
  const permissions = validated('contract.json 的权限', () => effectsFromContract(contract));

  // The Manifest of a sandbox plugin has one shape; what the package may choose is who it is, its version, its name, and what it upgrades from.
  const expected = sandboxPluginManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher,
    presentation: presentation !== undefined, upgradesFrom: manifest.upgrade_compatibility?.compatible_from_versions });
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(manifest)), JSON.parse(JSON.stringify(expected)))) refuse('清单不是沙箱插件的形状：入口、权限、路由、界面声明要与包的其他文件一致，不能自带别的');
  return { manifest, contract, parts, nodes, ...(presentation ? { presentation } : {}), acceptance, prompts, entrypoint, permissions };
}
