import { effectsFromContract, sandboxIntegrationManifest, sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
/**
 * Reads a sandbox package (the public format in `SANDBOX_PACKAGE_FILES`, described in docs/platform/PLUGIN-DEVELOPMENT.md) into what the
 * Host runs it from. The plugin studio is one author of the format; this reads the format and nothing of the studio. It writes nothing:
 * it runs after the package's signature is verified and before the first record of an install is written, and a package that does
 * not fit stops here with `plugin.declaration_invalid`.
 */
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { pluginErrors, SANDBOX_PACKAGE_FILES, type PluginManifest, type SandboxAgentBody, type SandboxPackageManifest, type PluginPackagePayload, type SandboxPackagePrompt } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SANDBOX_INTEGRATION_CONTRACT, SANDBOX_INTEGRATION_OPERATIONS, type SandboxEffects, type SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { CONNECTOR_REQUEST_SERVICES } from '@molis-ai/molis-work-contracts/services/connector-host';
import { parseContentPackage, type ContentPackage, parsePluginManifest, parsePluginPackageManifest, refuseDeclarations } from '@molis-ai/molis-work-plugin-sdk';
import { PLUGIN_ICON_NAMES } from '@molis-ai/molis-work-plugin-sdk/ui';
import { assertContract } from '@molis-ai/molis-work-plugin-sandbox';
import { sandboxUiTextRefs, usesPluginFieldWords, validatePluginComponentNodes, validatePluginComponentPlans, validatePluginPresentation,
  type PluginComponentNode, type PluginComponentPlan, type PluginPresentation } from '@molis-ai/molis-work-design-system';
import { packagedMethodBodies, readSandboxAgentBodies, sandboxAgentBodyPaths } from './sandbox-agent-bodies.js';
import { assertPluginHomeSchema, assertPluginLocales, pluginLocaleFilePaths, pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleReader } from '@molis-ai/molis-work-plugin-runtime';
import { UI_FILE_LIMITS } from '@molis-ai/molis-work-contracts/platform/ui';


/** The longest plugin code the Host takes, as the studio's own publish does. */
const MAX_ENTRYPOINT_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PROMPTS = 64;
const PROMPT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_PROMPT_BODY = 8000;

export interface SandboxPackage {
  readonly manifest: PluginManifest;
  readonly localePacks: PluginLocaleReader | null;
  readonly contract: SandboxPluginContract;
  readonly parts: PluginComponentPlan[];
  readonly nodes: PluginComponentNode[];
  readonly presentation?: PluginPresentation;
  readonly acceptance: unknown[];
  readonly prompts: SandboxPackagePrompt[];
  readonly agentBodies: SandboxAgentBody[];
  /** The plugin's code, as the package ships it. */
  readonly entrypoint: Uint8Array;
  /** What the contract's operations ask for in all: the person approves exactly this at install. */
  readonly permissions: SandboxEffects;
}

const refuse = (detail: string): never => { throw pluginErrors.declaration_invalid('沙箱包：' + detail); };

function refuseManifestShape(permissions: PluginManifest['permissions'], detail: string): never {
  if (permissions.some(item => item.permission === 'terminal:run')) {
    throw pluginErrors.declaration_invalid('沙箱插件不能打开终端，因为终端会在沙箱外以你的系统权限运行。');
  }
  return refuse(detail);
}

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

/** Words come from the signed payload, never the extracted code directory or a caller. The running reader parses a language on first use. */
function signedLocalePacks(manifest: PluginLocaleManifest, files: ReadonlyMap<string, Uint8Array>): PluginLocaleReader | null {
  const sources = new Map<string, string>();
  for (const path of pluginLocaleFilePaths(manifest)) {
    const bytes = files.get(path);
    if (bytes === undefined) continue;
    if (bytes.length > UI_FILE_LIMITS.locale) refuse(path + ' 太大');
    sources.set(path, validated(path, () => new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  }
  const read = (path: string) => sources.get(path) ?? null;
  validated('语言文件', () => assertPluginLocales(manifest, read));
  return pluginLocaleReader(manifest, read);
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
  const wire = validated('manifest', () => parsePluginPackageManifest(payload.manifest));
  if (wire.kind !== 'app' || (wire.agent !== undefined && !Array.isArray(wire.agent))) refuse('文字正文只用于 app 包');
  const manifest = wire as SandboxPackageManifest;
  const wanted = [...Object.values(SANDBOX_PACKAGE_FILES), ...sandboxAgentBodyPaths(manifest), ...pluginLocaleFilePaths(manifest)];
  const files = new Map(payload.files.map(file => [file.path, Buffer.from(file.content_base64, 'base64')] as const));
  if (files.size !== payload.files.length) refuse('包内文件路径重复');
  // A path is the publisher's text: each one is named, quoted and cut short, as every package refusal names a file.
  const outside = [...files.keys()].filter(path => !wanted.includes(path));
  if (outside.length) refuseDeclarations(outside.map(path => ({ path, reason: '沙箱包的格式里没有这个文件' })));
  const entrypoint = files.get(SANDBOX_PACKAGE_FILES.entrypoint) ?? refuse('缺少 ' + SANDBOX_PACKAGE_FILES.entrypoint);
  if (!entrypoint.length || entrypoint.length > MAX_ENTRYPOINT_BYTES) refuse(SANDBOX_PACKAGE_FILES.entrypoint + ' 为空或太大');


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

  // The Manifest of a sandbox plugin has one shape; what the package may choose is who it is, its version, its name, what it upgrades from, where it runs,
  // and the icon of its page, a name of the platform's set. This reads the Manifest itself (the install path has, but this is exported and takes any payload),
  // so a name outside the set is refused here and `icon` below is one of the set.
  const agentBodies = readSandboxAgentBodies(manifest, files);
  const localePacks = signedLocalePacks(manifest, files), fallback = localePacks?.pack(localePacks.default);
  for (const ref of sandboxUiTextRefs(contract, parts, usesPluginFieldWords(contract, fallback))) if (typeof ref !== 'string' && 'key' in ref && ref.key && !ref.key.startsWith('common.') && !Object.hasOwn(fallback?.messages ?? {}, ref.key))
    refuse('界面引用缺少主人默认词：' + ref.key);
  const named = manifest.ui.views?.[0]?.icon;
  const icon = PLUGIN_ICON_NAMES.find(name => name === named);
  const expected = sandboxPluginManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher,
    presentation: presentation !== undefined, upgradesFrom: manifest.upgrade_compatibility?.compatible_from_versions, runtime: manifest.runtime, effects: permissions, contract,
    homeDatabase: manifest.databases?.home, connections: manifest.connections, ownerFiles: manifest.owner_files?.entries,
    ...(icon ? { icon } : {}), textDeclarations: manifest, stageTitleText: manifest.ui.views?.[0]?.title_text });
  const { agent: wireAgent, methods: wireMethods, ...fixed } = manifest;
  const { agent: projectedAgent, methods: projectedMethods, ...expectedFixed } = expected;
  void wireAgent; void wireMethods; void projectedAgent; void projectedMethods;
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(fixed)), JSON.parse(JSON.stringify(expectedFixed)))) {
    refuseManifestShape(fixed.permissions, '清单不是沙箱插件的形状：入口、权限、路由、界面声明要与包的其他文件一致，不能自带别的');
  }
  validated('清单', () => parsePluginManifest(expected));
  if (expected.databases?.home) validated('Home 库', () => assertPluginHomeSchema(expected.databases!.home!.schema));
  return { manifest: expected, localePacks, agentBodies, contract, parts, nodes, ...(presentation ? { presentation } : {}), acceptance, prompts, entrypoint, permissions };
}

/** A package the Host keeps and runs: an app's (`readSandboxPackage`) or an integration's (`readSandboxIntegrationPackage`), by its Manifest's kind. */
export type KeptSandboxPackage = SandboxPackage | SandboxIntegrationPackage;
export const isIntegrationPackage = (pkg: KeptSandboxPackage): pkg is SandboxIntegrationPackage => pkg.manifest.kind === 'integration';
export function readKeptSandboxPackage(payload: PluginPackagePayload): KeptSandboxPackage {
  return payload.manifest.kind === 'integration' ? readSandboxIntegrationPackage(payload) : readSandboxPackage(payload);
}

/**
 * A content package as the Host keeps it (specs/skill-packs/contract-design.md §3): the Manifest of a plugin with only declarations and
 * each declared Skill with the body its package ships. No code, contract, interface or prompts, and it asks for nothing.
 */
export interface ContentKeptPackage {
  readonly manifest: PluginManifest;
  readonly blueprint?: ContentPackage["blueprint"];
  readonly localePacks: PluginLocaleReader | null;
  readonly agentBodies: SandboxAgentBody[];
  readonly permissions: SandboxEffects;
}

/** Every package the Host keeps and installs: a sandbox package, or a content package. */
export type KeptPackage = KeptSandboxPackage | ContentKeptPackage;
export const isContentPackage = (pkg: KeptPackage): pkg is ContentKeptPackage => pkg.manifest.kind === 'content';

/**
 * Reads a verified package by its Manifest's kind: a content package through the SDK's `parseContentPackage` (every declared file there,
 * nothing else, each path inside the package, each resource's size and digest as declared), any other as a sandbox package. One install
 * path for both: the same signature check before, the same preview and confirmation after.
 */
export function readKeptPackage(payload: PluginPackagePayload): KeptPackage {
  if (payload.manifest?.kind !== 'content') return readKeptSandboxPackage(payload);
  const { manifest, skills, blueprint, locale_files } = parseContentPackage(payload);
  const localePacks = pluginLocaleReader(manifest, path => locale_files?.[path] ?? null);
  return { manifest, localePacks, agentBodies: packagedMethodBodies(manifest.methods ?? [], skills), permissions: {}, ...(blueprint ? { blueprint } : {}) };
}

/** A sandboxed integration as the Host runs it (BL-530): its Manifest, its contract of the platform's operations and its code. */
export interface SandboxIntegrationPackage {
  readonly manifest: PluginManifest;
  readonly localePacks: PluginLocaleReader | null;
  readonly contract: SandboxPluginContract;
  readonly entrypoint: Uint8Array;
  /** What the operations ask for in all (the source's account, S-95): the person approves exactly this at install. */
  readonly permissions: SandboxEffects;
}

/**
 * Reads a sandboxed integration (BL-530): the manifest, the contract and the code, no interface and no prompts. The Manifest is an
 * Integration Plugin's with only what it may choose (who it is, its version, name, what it upgrades from, its services and integrations);
 * the contract has exactly the platform's operations (`SANDBOX_INTEGRATION_CONTRACT`; `integration.account` may be left out), no pages
 * and no entities. First version: only `source` integrations. A service the platform's request table has is the table's and declares no
 * origins; any other declares its own (S-95), checked by the SDK's Manifest rules. Nothing here is written anywhere.
 */
export function readSandboxIntegrationPackage(payload: PluginPackagePayload): SandboxIntegrationPackage {
  const manifest = validated('清单', () => parsePluginManifest(payload.manifest));
  const wanted = [SANDBOX_PACKAGE_FILES.manifest, SANDBOX_PACKAGE_FILES.contract, SANDBOX_PACKAGE_FILES.entrypoint, ...pluginLocaleFilePaths(manifest)];
  const files = new Map(payload.files.map(file => [file.path, Buffer.from(file.content_base64, 'base64')] as const));
  if (files.size !== payload.files.length) refuse('包内文件路径重复');
  for (const path of files.keys()) if (!wanted.includes(path)) refuse('集成包有未声明的文件：' + path);
  const entrypoint = files.get(SANDBOX_PACKAGE_FILES.entrypoint) ?? refuse('缺少 ' + SANDBOX_PACKAGE_FILES.entrypoint);
  if (!entrypoint.length || entrypoint.length > MAX_ENTRYPOINT_BYTES) refuse(SANDBOX_PACKAGE_FILES.entrypoint + ' 为空或太大');

  if (!isDeepStrictEqual(jsonFile(files, SANDBOX_PACKAGE_FILES.manifest), JSON.parse(JSON.stringify(manifest)))) refuse('manifest.json 与包的清单不一致');
  const services = manifest.connection_services ?? [], integrations = manifest.integrations ?? [];
  if (!integrations.length) refuse('集成包要在清单里声明 integrations');
  // One source and its one service: the registry binds a source to the plugin, so a package of two could not tell them apart.
  if (integrations.length > 1 || services.length > 1) refuse('集成包现在只声明一个来源和它的一个连接服务');
  const document = integrations.find(item => item.kind !== 'source');
  if (document) refuse('集成 ' + document.integration_id + '：集成包现在只做 Feed 的来源（source），外部文档导入等 W5-11（BL-694）');
  for (const service of services) {
    const platform = Object.hasOwn(CONNECTOR_REQUEST_SERVICES, service.service_id);
    if (platform && service.origins) refuse('服务 ' + service.service_id + ' 在平台的请求表里，它的来源只由平台定，包里不能写 origins');
    if (!platform && !service.origins) refuse('服务 ' + service.service_id + ' 不在平台的请求表里，要写它的 origins');
  }
  const contract = validated('contract.json', () => { const raw = jsonFile(files, SANDBOX_PACKAGE_FILES.contract); assertContract(raw); return raw; });
  if (contract.pluginId !== manifest.plugin_id) refuse('contract.json 的 pluginId 与清单的 plugin_id 不一致');
  const expected = sandboxIntegrationManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher, contract, textDeclarations: manifest,
    upgradesFrom: manifest.upgrade_compatibility?.compatible_from_versions, connection_services: services, integrations, source_presentations: manifest.source_presentations });
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(manifest)), JSON.parse(JSON.stringify(expected)))) {
    refuseManifestShape(manifest.permissions, '清单不是沙箱集成的形状：入口、权限要是平台的，运行范围是 Home，不能有路由或界面');
  }

  if (contract.pages.length || contract.entities.length) refuse('集成包的合同没有页面和实体');
  const ids = Object.entries(SANDBOX_INTEGRATION_OPERATIONS);
  for (const operation of contract.operations) {
    const entry = ids.find(([, id]) => id === operation.id) ?? refuse('合同里有平台之外的操作：' + operation.id);
    const fixed = SANDBOX_INTEGRATION_CONTRACT[entry[0] as keyof typeof SANDBOX_INTEGRATION_OPERATIONS];
    for (const field of ['kind', 'input', 'output', 'effects'] as const) {
      if (!isDeepStrictEqual(JSON.parse(JSON.stringify(operation[field])), JSON.parse(JSON.stringify(fixed[field])))) refuse('操作 ' + operation.id + ' 的 ' + field + ' 要与平台给的一样');
    }
  }
  for (const id of [SANDBOX_INTEGRATION_OPERATIONS.health, SANDBOX_INTEGRATION_OPERATIONS.poll]) if (!contract.operations.some(item => item.id === id)) refuse('合同缺少操作 ' + id);
  if (Boolean(manifest.source_presentations?.length) !== contract.operations.some(item => item.id === SANDBOX_INTEGRATION_OPERATIONS.presentation)) refuse('来源展示声明与 integration.presentation 操作必须一同兑现');
  const permissions = validated('contract.json 的权限', () => effectsFromContract(contract));
  return { manifest, localePacks: signedLocalePacks(manifest, files), contract, entrypoint, permissions };
}
