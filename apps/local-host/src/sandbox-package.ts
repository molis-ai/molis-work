import { effectsFromContract, parseSandboxUi, sandboxIntegrationManifest, sandboxPluginManifest, type SandboxUiContribution } from '@molis-ai/molis-work-plugin-sdk';
/**
 * Reads a sandbox package (the public format in `SANDBOX_PACKAGE_FILES`, described in docs/platform/PLUGIN-DEVELOPMENT.md) into what the
 * Host runs it from. The plugin studio is one author of the format; this reads the format and nothing of the studio. It writes nothing:
 * it runs after the package's signature is verified and before the first record of an install is written, and a package that does
 * not fit stops here with `plugin.declaration_invalid`.
 */
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual } from 'node:util';
import { pluginErrors, SANDBOX_PACKAGE_FILES, type PluginManifest, type SandboxAgentBody, type SandboxPackageManifest, type PluginPackagePayload, type SandboxPackagePrompt } from '@molis-ai/molis-work-contracts/platform/plugin';
import { isSandboxSourceOperation, SANDBOX_INTEGRATION_SOURCE_SLOT, SANDBOX_INTEGRATION_CONTRACT, SANDBOX_INTEGRATION_OPERATIONS, type SandboxEffects, type SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { CONNECTOR_REQUEST_SERVICES } from '@molis-ai/molis-work-contracts/services/connector-host';
import { parseContentPackage, type ContentPackage, parsePluginManifest, parsePluginPackageManifest, refuseDeclarations } from '@molis-ai/molis-work-plugin-sdk';
import { PLUGIN_ICON_NAMES } from '@molis-ai/molis-work-plugin-sdk/ui';
import { assertContract } from '@molis-ai/molis-work-plugin-sandbox';
import { sandboxUiTextRefs, usesPluginFieldWords, validatePluginComponentNodes, validatePluginComponentPlans, validatePluginPresentation,
  type PluginComponentNode, type PluginComponentPlan, type PluginPresentation } from '@molis-ai/molis-work-design-system';
import { packagedMethodBodies, readSandboxAgentBodies, sandboxAgentBodyPaths } from './sandbox-agent-bodies.js';
import { assertPluginHomeSchema, assertPluginUpgradeSteps, assertPluginLocales, pluginLocaleFilePaths, pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleReader } from '@molis-ai/molis-work-plugin-runtime';
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
  readonly ui?: SandboxUiContribution;
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

/** Include projected-permission `reason_text` refs from `contract.permission_reasons` in locale-pack verification. */
function localeManifestWithContractReasons(manifest: PluginLocaleManifest, contract: SandboxPluginContract): PluginLocaleManifest {
  const declared = new Set((manifest.permissions ?? []).map(row => row.permission));
  const extra = Object.entries(contract.permission_reasons ?? {})
    .filter(([permission]) => !declared.has(permission))
    .map(([permission, reason_text]) => ({ permission, reason: permission, required: false, reason_text }));
  return extra.length > 0 ? { ...manifest, permissions: [...(manifest.permissions ?? []), ...extra] } : manifest;
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

const MAX_MANIFEST_PATTERN_CHARS = 256;
const MAX_MANIFEST_PATTERN_DEFAULT_CHARS = 512;
const MAX_REGEX_REPEAT_COUNT = 100;

/**
 * Linear-time structural guard against catastrophic backtracking (ReDoS) before untrusted package manifests reach
 * `new RegExp(...)` during manifest parsing (`Q-cf2-04`). Rejects nested quantifiers, lookarounds, backreferences,
 * oversized patterns, and large brace repeat counts.
 */
export function assertSafeRegexPattern(source: string, label: string): void {
  if (typeof source !== 'string' || source.length === 0 || source.length > MAX_MANIFEST_PATTERN_CHARS) {
    refuse(`${label} 的正则表达式长度超过安全上限`);
  }
  const readBraceQuantifier = (index: number): { end: number; repeatsMultiple: boolean } | null => {
    if (source[index] !== '{') return null;
    const match = /^\{(\d+)(?:,(\d*))?\}/u.exec(source.slice(index));
    if (!match) return null;
    const min = Number(match[1]);
    const maxRaw = match[2];
    const max = maxRaw === undefined ? min : maxRaw === '' ? Number.POSITIVE_INFINITY : Number(maxRaw);
    if (min > MAX_REGEX_REPEAT_COUNT || (Number.isFinite(max) && max > MAX_REGEX_REPEAT_COUNT)) {
      refuse(`${label} 的正则表达式重复次数超过安全上限`);
    }
    return { end: index + match[0].length - 1, repeatsMultiple: max > 1 };
  };
  type GroupFrame = { hasQuantifier: boolean; hasAlternation: boolean };
  const stack: GroupFrame[] = [{ hasQuantifier: false, hasAlternation: false }];
  let inClass = false;
  let lastAtom: 'none' | 'char' | 'group' | 'quantifier' = 'none';
  let lastGroup: GroupFrame | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    if (ch === '\\') {
      const next = source[i + 1];
      if (!next) refuse(`${label} 的正则表达式转义不完整`);
      if (!inClass && ((next >= '1' && next <= '9') || next === 'k')) {
        refuse(`${label} 的正则表达式不能使用反向引用`);
      }
      i += 1;
      if (!inClass) lastAtom = 'char';
      continue;
    }
    if (inClass) {
      if (ch === ']') {
        inClass = false;
        lastAtom = 'char';
      }
      continue;
    }
    if (ch === '[') {
      inClass = true;
      lastGroup = null;
      continue;
    }
    if (ch === '(') {
      if (source[i + 1] === '?') {
        const marker = source[i + 2];
        if (marker === '=' || marker === '!' || (marker === '<' && (source[i + 3] === '=' || source[i + 3] === '!'))) {
          refuse(`${label} 的正则表达式不能使用环视断言`);
        }
      }
      stack.push({ hasQuantifier: false, hasAlternation: false });
      lastAtom = 'none';
      lastGroup = null;
      continue;
    }
    if (ch === ')') {
      if (stack.length <= 1) refuse(`${label} 的正则表达式括号不匹配`);
      lastGroup = stack.pop()!;
      const parent = stack[stack.length - 1]!;
      if (lastGroup.hasQuantifier) parent.hasQuantifier = true;
      if (lastGroup.hasAlternation) parent.hasAlternation = true;
      lastAtom = 'group';
      continue;
    }
    if (ch === '|') {
      stack[stack.length - 1]!.hasAlternation = true;
      lastAtom = 'none';
      lastGroup = null;
      continue;
    }
    if (ch === '*' || ch === '+' || ch === '?' || ch === '{') {
      let repeatsMultiple = ch === '*' || ch === '+';
      if (ch === '{') {
        const brace = readBraceQuantifier(i);
        if (!brace) {
          lastAtom = 'char';
          continue;
        }
        i = brace.end;
        repeatsMultiple = brace.repeatsMultiple;
      }
      // Optional lazy/possessive modifier `?` immediately after a quantifier is not a nested quantifier.
      if (lastAtom === 'quantifier' && ch === '?') { continue; }
      if (lastAtom === 'quantifier') refuse(`${label} 的正则表达式包含连续量词`);
      if (repeatsMultiple) {
        if (lastAtom === 'group' && lastGroup && (lastGroup.hasQuantifier || lastGroup.hasAlternation)) {
          refuse(`${label} 的正则表达式包含嵌套量词或重复分支，存在性能风险`);
        }
        stack[stack.length - 1]!.hasQuantifier = true;
      }
      lastAtom = 'quantifier';
      lastGroup = null;
      continue;
    }
    lastAtom = 'char';
    lastGroup = null;
  }
}

/** Inspect untrusted manifest connection_services / schema regex declarations before `parsePluginManifest` compiles them (`Q-cf2-04`). */
export function assertSafeManifestPatterns(rawManifest: unknown): void {
  if (!plain(rawManifest)) return;
  const services = Array.isArray(rawManifest.connection_services) ? rawManifest.connection_services : [];
  for (const service of services) {
    if (!plain(service)) continue;
    const auth = plain(service.auth) ? service.auth : null;
    const methods = auth && Array.isArray(auth.methods) ? auth.methods : [];
    for (const method of methods) {
      if (!plain(method)) continue;
      if (plain(method.endpoint_pattern) && typeof method.endpoint_pattern.source === 'string') {
        assertSafeRegexPattern(method.endpoint_pattern.source, 'endpoint_pattern');
      }
      const settings = Array.isArray(method.settings) ? method.settings : [];
      for (const setting of settings) {
        if (!plain(setting)) continue;
        if (typeof setting.pattern === 'string') {
          assertSafeRegexPattern(setting.pattern, `setting ${String(setting.key ?? '')}`);
          if (typeof setting.default === 'string' && setting.default.length > MAX_MANIFEST_PATTERN_DEFAULT_CHARS) {
            refuse(`setting ${String(setting.key ?? '')} 默认值超过安全上限`);
          }
        }
      }
      const contexts = Array.isArray(method.context) ? method.context : [];
      for (const entry of contexts) {
        if (!plain(entry) || !plain(entry.pick)) continue;
        if (typeof entry.pick.pattern === 'string') {
          assertSafeRegexPattern(entry.pick.pattern, `context ${String(entry.key ?? '')}`);
        }
      }
      const checkKeeps = (keeps: unknown, scope: string) => {
        if (!Array.isArray(keeps)) return;
        for (const keep of keeps) {
          if (!plain(keep) || !plain(keep.check)) continue;
          if (typeof keep.check.pattern === 'string') {
            assertSafeRegexPattern(keep.check.pattern, `${scope} ${String(keep.key ?? '')}`);
          }
        }
      };
      checkKeeps(method.token_keep, 'token_keep');
      if (plain(method.identity)) checkKeeps(method.identity.keep, 'identity.keep');
    }
  }
}

export function readSandboxPackage(payload: PluginPackagePayload): SandboxPackage {
  assertSafeManifestPatterns(payload.manifest);
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
  if (!plain(shape) || Object.keys(shape).some(key => !['parts', 'nodes', 'presentation', 'acceptance', 'ui'].includes(key))) return refuse('interface.json 只能有 parts、nodes、presentation、acceptance、ui');
  const surface: { parts?: unknown; nodes?: unknown; presentation?: unknown; acceptance?: unknown; ui?: unknown } = shape;
  const ui = validated('interface.json 的 ui', () => parseSandboxUi(surface.ui));
  const parts = validated('interface.json 的 parts', () => validatePluginComponentPlans(surface.parts, contract, ui, manifest.connections));
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
  const localePacks = signedLocalePacks(localeManifestWithContractReasons(manifest, contract), files), fallback = localePacks?.pack(localePacks.default);
  for (const ref of sandboxUiTextRefs(contract, parts, usesPluginFieldWords(contract, fallback))) if (typeof ref !== 'string' && 'key' in ref && ref.key && !ref.key.startsWith('common.') && !Object.hasOwn(fallback?.messages ?? {}, ref.key))
    refuse('界面引用缺少主人默认词：' + ref.key);
  const named = manifest.ui.views?.[0]?.icon;
  const icon = PLUGIN_ICON_NAMES.find(name => name === named);
  const expected = sandboxPluginManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher,
    presentation: presentation !== undefined, upgradeCompatibility: manifest.upgrade_compatibility, stateMachines: manifest.state_machines, runtime: manifest.runtime,
    ...(manifest.memory_scene === undefined ? {} : { memoryScene: manifest.memory_scene }),
    effects: permissions, contract,
    homeDatabase: manifest.databases?.home, projectDatabase: manifest.databases?.project, connections: manifest.connections, ownerFiles: manifest.owner_files?.entries,
    ...(icon ? { icon } : {}), textDeclarations: manifest, stageTitleText: manifest.ui.views?.[0]?.title_text });
  const { agent: wireAgent, methods: wireMethods, ...fixed } = manifest;
  const { agent: projectedAgent, methods: projectedMethods, ...expectedFixed } = expected;
  void wireAgent; void wireMethods; void projectedAgent; void projectedMethods;
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(fixed)), JSON.parse(JSON.stringify(expectedFixed)))) {
    refuseManifestShape(fixed.permissions, '清单不是沙箱插件的形状：入口、权限、路由、界面声明要与包的其他文件一致，不能自带别的');
  }
  validated('清单', () => parsePluginManifest(expected));
  if (contract.home_source) assertSignedSource(expected, contract);
  validated('升级段', () => assertPluginUpgradeSteps(expected));
  if (expected.databases?.home) validated('Home 库', () => assertPluginHomeSchema(expected.databases!.home!.schema));
  return { manifest: expected, localePacks, agentBodies, contract, parts, nodes, ...(presentation ? { presentation } : {}), ...(ui ? { ui } : {}), acceptance, prompts, entrypoint, permissions };
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
  assertSafeManifestPatterns(payload.manifest);
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
  assertSafeManifestPatterns(payload.manifest);
  const manifest = validated('清单', () => parsePluginManifest(payload.manifest));
  const wanted = [SANDBOX_PACKAGE_FILES.manifest, SANDBOX_PACKAGE_FILES.contract, SANDBOX_PACKAGE_FILES.entrypoint, ...pluginLocaleFilePaths(manifest)];
  const files = new Map(payload.files.map(file => [file.path, Buffer.from(file.content_base64, 'base64')] as const));
  if (files.size !== payload.files.length) refuse('包内文件路径重复');
  for (const path of files.keys()) if (!wanted.includes(path)) refuse('集成包有未声明的文件：' + path);
  const entrypoint = files.get(SANDBOX_PACKAGE_FILES.entrypoint) ?? refuse('缺少 ' + SANDBOX_PACKAGE_FILES.entrypoint);
  if (!entrypoint.length || entrypoint.length > MAX_ENTRYPOINT_BYTES) refuse(SANDBOX_PACKAGE_FILES.entrypoint + ' 为空或太大');

  if (!isDeepStrictEqual(jsonFile(files, SANDBOX_PACKAGE_FILES.manifest), JSON.parse(JSON.stringify(manifest)))) refuse('manifest.json 与包的清单不一致');
  const services = manifest.connection_services ?? [], integrations = manifest.integrations ?? [];
  const contract = validated('contract.json', () => { const raw = jsonFile(files, SANDBOX_PACKAGE_FILES.contract); assertContract(raw); return raw; });
  if (contract.pluginId !== manifest.plugin_id) refuse('contract.json 的 pluginId 与清单的 plugin_id 不一致');
  const expected = sandboxIntegrationManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher, contract, textDeclarations: manifest,
    upgradesFrom: manifest.upgrade_compatibility?.compatible_from_versions, stateMachines: manifest.state_machines, connection_services: services, integrations, source_presentations: manifest.source_presentations });
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(manifest)), JSON.parse(JSON.stringify(expected)))) {
    refuseManifestShape(manifest.permissions, '清单不是沙箱集成的形状：入口、权限要是平台的，运行范围是 Home，不能有路由或界面');
  }

  if (contract.pages.length || contract.entities.length) refuse('集成包的合同没有页面和实体');
  if (contract.presentation !== undefined) refuse('集成包的合同不能声明对象呈现');
  assertSignedSource(manifest, contract);
  const permissions = validated('contract.json 的权限', () => effectsFromContract(contract));
  return { manifest, localePacks: signedLocalePacks(localeManifestWithContractReasons(manifest, contract), files), contract, entrypoint, permissions };
}

function assertSignedSource(manifest: PluginManifest, contract: SandboxPluginContract): void {
  const services = manifest.connection_services ?? [], integrations = manifest.integrations ?? [];
  if (!integrations.length) refuse('集成包要在清单里声明 integrations');
  // One source and its one service: the registry binds a source to the plugin, so a package of two could not tell them apart.
  if (integrations.length > 1 || services.length > 1) refuse('集成包现在只声明一个来源和它的一个连接服务');
  const document = integrations.find(item => item.kind !== 'source');
  if (document) refuse('集成 ' + document.integration_id + '：集成包现在只做 Feed 的来源（source），外部文档导入等 W5-11（BL-694），网页搜索等第 62 批');
  for (const service of services) {
    const platform = Object.hasOwn(CONNECTOR_REQUEST_SERVICES, service.service_id);
    if (platform && service.origins) refuse('服务 ' + service.service_id + ' 在平台的请求表里，它的来源只由平台定，包里不能写 origins');
    if (!platform && !service.origins) refuse('服务 ' + service.service_id + ' 不在平台的请求表里，要写它的 origins');
  }
  const operations = manifest.kind === 'integration' ? contract.operations : contract.operations.filter(op => isSandboxSourceOperation(op.id));
  if (manifest.kind === 'app') {
    const references = [
      ...contract.pages.flatMap(page => page.regions.flatMap(region => region.operationIds)),
      ...(contract.read_groups ?? []).flatMap(group => group.operations),
      ...contract.operations.flatMap(op => op.effects.background ?? []),
    ];
    if (references.some(isSandboxSourceOperation)) refuse('个人来源的专用操作只能由 Home 的来源调用');
    if (contract.operations.some(op => !isSandboxSourceOperation(op.id) && op.effects.connections?.includes(SANDBOX_INTEGRATION_SOURCE_SLOT))) refuse('个人来源的账号只在来源拉取时可用');
  }
  const ids = Object.entries(SANDBOX_INTEGRATION_OPERATIONS);
  for (const operation of operations) {
    if (operation.read_protocol !== undefined || operation.action_protocol !== undefined || operation.external !== undefined) refuse('集成包的操作不能声明平台协议或外发标记');
    const entry = ids.find(([, id]) => id === operation.id) ?? refuse('合同里有平台之外的操作：' + operation.id);
    const fixed = SANDBOX_INTEGRATION_CONTRACT[entry[0] as keyof typeof SANDBOX_INTEGRATION_OPERATIONS];
    for (const field of ['kind', 'input', 'output', 'effects'] as const) {
      if (!isDeepStrictEqual(JSON.parse(JSON.stringify(operation[field])), JSON.parse(JSON.stringify(fixed[field])))) refuse('操作 ' + operation.id + ' 的 ' + field + ' 要与平台给的一样');
    }
  }
  for (const id of [SANDBOX_INTEGRATION_OPERATIONS.health, SANDBOX_INTEGRATION_OPERATIONS.poll]) if (!operations.some(item => item.id === id)) refuse('合同缺少操作 ' + id);
  if (Boolean(manifest.source_presentations?.length) !== operations.some(item => item.id === SANDBOX_INTEGRATION_OPERATIONS.presentation)) refuse('来源展示声明与 integration.presentation 操作必须一同兑现');
}
